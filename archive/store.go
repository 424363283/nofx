// Package archive stores immutable, forward-observed market signals, not trades.
package archive

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"guanlan/signals"
	"io"
	"math"
	_ "modernc.org/sqlite"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type Store struct {
	db      *sql.DB
	BaseURL string
	HTTP    *http.Client
}
type Outcome struct {
	Minutes         int      `json:"minutes"`
	Status          string   `json:"status"`
	Error           string   `json:"error,omitempty"`
	Return          *float64 `json:"return_pct"`
	DirectionReturn *float64 `json:"direction_return_pct"`
	MFE             *float64 `json:"mfe_pct"`
	MAE             *float64 `json:"mae_pct"`
	ResolvedAt      int64    `json:"resolved_at,omitempty"`
	ObservedAt      string   `json:"observed_at,omitempty"`
}
type Entry struct {
	ID         int64             `json:"id"`
	RecordedAt string            `json:"recorded_at"`
	Version    string            `json:"version"`
	Snapshot   signals.RadarItem `json:"snapshot"`
	Paper      Paper             `json:"paper"`
	Outcomes   []Outcome         `json:"outcomes"`
}

func Open(path string) (*Store, error) {
	db, e := sql.Open("sqlite", path)
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(1)
	_, e = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS signal_archive(id INTEGER PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, recorded_at INTEGER NOT NULL, symbol TEXT NOT NULL, category TEXT NOT NULL, bias TEXT NOT NULL, snapshot TEXT NOT NULL, version TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS signal_outcomes(entry_id INTEGER NOT NULL, minutes INTEGER NOT NULL, due_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '', result TEXT, PRIMARY KEY(entry_id,minutes));
 CREATE INDEX IF NOT EXISTS archive_due ON signal_outcomes(status,next_attempt);
 CREATE INDEX IF NOT EXISTS archive_recorded ON signal_archive(recorded_at);`)
	if e != nil {
		db.Close()
		return nil, e
	}
	s := &Store{db: db, BaseURL: "https://fapi.binance.com", HTTP: &http.Client{Timeout: 10 * time.Second}}
	if e = s.initResearch(); e != nil {
		db.Close()
		return nil, e
	}
	return s, nil
}
func (s *Store) Close() error { return s.db.Close() }

// Capture does not backfill pre-installation history. Identical candle evidence is recorded once.
func (s *Store) Capture(r signals.RadarResult, now time.Time) error {
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	for _, item := range r.Items {
		if len(item.Signals) == 0 || item.CandleAt == nil || item.Price <= 0 || math.IsNaN(item.Price) || math.IsInf(item.Price, 0) || item.PriceAsOf.IsZero() || now.Sub(item.PriceAsOf) > 5*time.Minute || item.PriceAsOf.After(now.Add(time.Minute)) {
			continue
		}
		kinds := []string{}
		for _, v := range item.Signals {
			kinds = append(kinds, v.Kind+":"+v.Direction)
		}
		sort.Strings(kinds)
		key := fmt.Sprintf("v1:%s:%d:%s:%s", item.Symbol, item.CandleAt.Unix(), item.Bias, strings.Join(kinds, ","))
		b, e := json.Marshal(item)
		if e != nil {
			return e
		}
		res, e := tx.Exec(`INSERT OR IGNORE INTO signal_archive(event_key,recorded_at,symbol,category,bias,snapshot,version) VALUES(?,?,?,?,?,?,?)`, key, now.UnixMilli(), item.Symbol, item.Category, item.Bias, string(b), "radar-v1")
		if e != nil {
			return e
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			continue
		}
		id, _ := res.LastInsertId()
		if e = capturePaper(tx, id, item, now); e != nil {
			return e
		}
		for _, m := range []int{15, 60, 240} {
			due := now.Add(time.Duration(m) * time.Minute).Truncate(time.Minute).Add(time.Minute).UnixMilli()
			if _, e = tx.Exec(`INSERT INTO signal_outcomes(entry_id,minutes,due_at,next_attempt) VALUES(?,?,?,?)`, id, m, due, due+5000); e != nil {
				return e
			}
		}
	}
	return tx.Commit()
}
func (s *Store) List(symbol, category, bias string, page int) (map[string]any, error) {
	where := " WHERE symbol LIKE ? AND (?='' OR category=?) AND (?='' OR bias=?)"
	args := []any{"%" + strings.ToUpper(symbol) + "%", category, category, bias, bias}
	var total int
	if e := s.db.QueryRow("SELECT COUNT(*) FROM signal_archive"+where, args...).Scan(&total); e != nil {
		return nil, e
	}
	rows, e := s.db.Query("SELECT id,recorded_at,snapshot,version FROM signal_archive"+where+" ORDER BY recorded_at DESC,id DESC LIMIT 30 OFFSET ?", append(args, (page-1)*30)...)
	if e != nil {
		return nil, e
	}
	entries := []Entry{}
	for rows.Next() {
		var v Entry
		var at int64
		var raw string
		if e = rows.Scan(&v.ID, &at, &raw, &v.Version); e != nil {
			rows.Close()
			return nil, e
		}
		if e = json.Unmarshal([]byte(raw), &v.Snapshot); e != nil {
			rows.Close()
			return nil, e
		}
		v.RecordedAt = time.UnixMilli(at).UTC().Format(time.RFC3339)
		v.Outcomes = []Outcome{}
		entries = append(entries, v)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return nil, e
	}
	for i := range entries {
		entries[i].Paper, e = s.paperFor(entries[i].ID)
		if e != nil {
			return nil, e
		}
		rs, e := s.db.Query(`SELECT minutes,status,error,result FROM signal_outcomes WHERE entry_id=? ORDER BY minutes`, entries[i].ID)
		if e != nil {
			return nil, e
		}
		for rs.Next() {
			var o Outcome
			var raw sql.NullString
			if e = rs.Scan(&o.Minutes, &o.Status, &o.Error, &raw); e != nil {
				rs.Close()
				return nil, e
			}
			if raw.Valid {
				if e = json.Unmarshal([]byte(raw.String), &o); e != nil {
					rs.Close()
					return nil, e
				}
			}
			entries[i].Outcomes = append(entries[i].Outcomes, o)
		}
		e = rs.Err()
		rs.Close()
		if e != nil {
			return nil, e
		}
	}
	// Stats use the same filters and completed directional samples only; never count pending as a loss or win.
	stats := []map[string]any{}
	for _, m := range []int{15, 60, 240} {
		var complete, positive int
		var avg sql.NullFloat64
		e = s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(CASE WHEN json_extract(o.result,'$.direction_return_pct')>0 THEN 1 ELSE 0 END),0), AVG(json_extract(o.result,'$.direction_return_pct')) FROM signal_archive a JOIN signal_outcomes o ON a.id=o.entry_id`+where+` AND o.minutes=? AND o.status='complete' AND a.bias IN ('bull','bear')`, append(args, m)...).Scan(&complete, &positive, &avg)
		if e != nil {
			return nil, e
		}
		stats = append(stats, map[string]any{"minutes": m, "completed": complete, "positive": positive, "mean_return_pct": func() any {
			if avg.Valid {
				return avg.Float64
			}
			return nil
		}()})
	}
	paperStats, e := s.paperStats(where, args, "")
	if e != nil {
		return nil, e
	}
	return map[string]any{"paper_stats": paperStats, "paper_rules": map[string]any{"version": PaperVersion, "minutes": PaperMinutes, "stop_pct": StopPct, "target_pct": TargetPct, "fee_pct": FeePct, "slip_pct": SlipPct}, "items": entries, "total": total, "page": page, "page_size": 30, "stats": stats}, nil
}

type job struct {
	id            int64
	minutes       int
	recorded, due int64
	raw           string
}

// Resolve bounded work even after restart. Failed observations remain visible and retryable.
func (s *Store) Resolve(ctx context.Context, now time.Time) error {
	rows, e := s.db.Query(`SELECT o.entry_id,o.minutes,a.recorded_at,o.due_at,a.snapshot FROM signal_outcomes o JOIN signal_archive a ON a.id=o.entry_id WHERE o.status!='complete' AND o.next_attempt<=? ORDER BY o.next_attempt LIMIT 32`, now.UnixMilli())
	if e != nil {
		return e
	}
	jobs := []job{}
	for rows.Next() {
		var j job
		if e = rows.Scan(&j.id, &j.minutes, &j.recorded, &j.due, &j.raw); e != nil {
			rows.Close()
			return e
		}
		jobs = append(jobs, j)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, j := range jobs {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		var item signals.RadarItem
		if e = json.Unmarshal([]byte(j.raw), &item); e != nil {
			return e
		}
		outcome, err := s.observe(ctx, j, item)
		if err != nil {
			_, e = s.db.Exec(`UPDATE signal_outcomes SET status='unavailable',error=?,next_attempt=? WHERE entry_id=? AND minutes=?`, err.Error(), now.Add(5*time.Minute).UnixMilli(), j.id, j.minutes)
		} else {
			outcome.ResolvedAt = time.Now().UnixMilli()
			b, _ := json.Marshal(outcome)
			_, e = s.db.Exec(`UPDATE signal_outcomes SET status='complete',error='',result=? WHERE entry_id=? AND minutes=?`, string(b), j.id, j.minutes)
		}
		if e != nil {
			return e
		}
	}
	return nil
}
func (s *Store) observe(ctx context.Context, j job, item signals.RadarItem) (Outcome, error) {
	o := Outcome{Minutes: j.minutes, Status: "complete"}
	start := time.UnixMilli(j.recorded).Truncate(time.Minute).Add(time.Minute).UnixMilli()
	q := url.Values{"symbol": {item.Symbol}, "interval": {"1m"}, "startTime": {fmt.Sprint(start)}, "endTime": {fmt.Sprint(j.due - 1)}, "limit": {"500"}}
	req, e := http.NewRequestWithContext(ctx, "GET", s.BaseURL+"/fapi/v1/klines?"+q.Encode(), nil)
	if e != nil {
		return o, e
	}
	resp, e := s.HTTP.Do(req)
	if e != nil {
		return o, e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return o, fmt.Errorf("行情接口 HTTP %d", resp.StatusCode)
	}
	var bars [][]json.RawMessage
	if e = json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&bars); e != nil {
		return o, e
	}
	if len(bars) != j.minutes {
		return o, fmt.Errorf("分钟行情不完整：%d/%d，等待补齐", len(bars), j.minutes)
	}
	high, low, last := item.Price, item.Price, 0.0
	for i, b := range bars {
		if len(b) < 7 {
			return o, fmt.Errorf("行情字段缺失")
		}
		var openAt, closeAt int64
		json.Unmarshal(b[0], &openAt)
		json.Unmarshal(b[6], &closeAt)
		if openAt != start+int64(i)*60000 || closeAt != openAt+59999 {
			return o, fmt.Errorf("行情时间不连续")
		}
		values := make([]float64, 3)
		for k, index := range []int{2, 3, 4} {
			var v string
			if e = json.Unmarshal(b[index], &v); e != nil {
				return o, e
			}
			if _, e = fmt.Sscan(v, &values[k]); e != nil || values[k] <= 0 || math.IsNaN(values[k]) || math.IsInf(values[k], 0) {
				return o, fmt.Errorf("行情数值无效")
			}
		}
		if values[0] < values[1] || values[2] > values[0] || values[2] < values[1] {
			return o, fmt.Errorf("行情价格结构无效")
		}
		high = math.Max(high, values[0])
		low = math.Min(low, values[1])
		last = values[2]
	}
	ret := (last/item.Price - 1) * 100
	o.Return = &ret
	o.ObservedAt = time.UnixMilli(j.due - 1).UTC().Format(time.RFC3339)
	if item.Bias == "bull" || item.Bias == "bear" {
		dir := ret
		mfe := (high/item.Price - 1) * 100
		mae := (low/item.Price - 1) * 100
		if item.Bias == "bear" {
			dir = -ret
			mfe = (1 - low/item.Price) * 100
			mae = (1 - high/item.Price) * 100
		}
		o.DirectionReturn = &dir
		o.MFE = &mfe
		o.MAE = &mae
	}
	return o, nil
}
