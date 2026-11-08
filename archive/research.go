package archive

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"guanlan/signals"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Fixed, versioned experiment; never connected to an exchange account.
const PaperVersion = "paper-v1"
const PaperMinutes = 60
const StopPct = 1.0
const TargetPct = 2.0
const FeePct = 0.04
const SlipPct = 0.02

type Paper struct {
	Status      string   `json:"status"`
	Version     string   `json:"version"`
	Reason      string   `json:"reason,omitempty"`
	Error       string   `json:"error,omitempty"`
	EntryAt     string   `json:"entry_at,omitempty"`
	ExitAt      string   `json:"exit_at,omitempty"`
	EntryPrice  float64  `json:"entry_price,omitempty"`
	ExitPrice   float64  `json:"exit_price,omitempty"`
	StopPrice   float64  `json:"stop_price,omitempty"`
	TargetPrice float64  `json:"target_price,omitempty"`
	Gross       *float64 `json:"gross_pct"`
	Net         *float64 `json:"net_pct"`
	Fees        *float64 `json:"fees_pct"`
	Ambiguous   bool     `json:"ambiguous"`
}
type paperBar struct {
	At                     int64
	Open, High, Low, Close float64
}

func signature(item signals.RadarItem) string {
	keys := make([]string, 0, len(item.Signals))
	for _, v := range item.Signals {
		keys = append(keys, v.Kind+":"+v.Direction)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

func (s *Store) initResearch() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS paper_trials (
 entry_id INTEGER PRIMARY KEY, version TEXT NOT NULL, signature TEXT NOT NULL,
 status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 due_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL, resolved_at INTEGER,
 result TEXT);
 CREATE INDEX IF NOT EXISTS paper_due ON paper_trials(status,next_attempt);
 CREATE INDEX IF NOT EXISTS paper_signature ON paper_trials(signature);
 CREATE INDEX IF NOT EXISTS archive_cohort ON signal_archive(category,bias,version,recorded_at);`)
	return err
}

func capturePaper(tx *sql.Tx, id int64, item signals.RadarItem, now time.Time) error {
	status, reason := "pending", ""
	switch {
	case item.Bias != "bull" && item.Bias != "bear":
		status, reason = "skipped", "方向不明确或多空冲突"
	case now.Sub(item.PriceAsOf) > 90*time.Second || item.PriceAsOf.After(now):
		status, reason = "skipped", "报价超过90秒或时间异常"
	case item.QuoteVolume < 5_000_000 || math.IsNaN(item.QuoteVolume) || math.IsInf(item.QuoteVolume, 0):
		status, reason = "skipped", "24小时成交额不足500万USDT或缺失"
	}
	// One active experiment per symbol, even when its direction changes.
	if status == "pending" {
		var n int
		err := tx.QueryRow(`SELECT COUNT(*) FROM paper_trials p JOIN signal_archive a ON a.id=p.entry_id WHERE a.symbol=? AND p.status!='skipped' AND p.due_at>?`, item.Symbol, now.UnixMilli()).Scan(&n)
		if err != nil {
			return err
		}
		if n > 0 {
			status, reason = "skipped", "同合约60分钟观察窗口内已存在模拟样本"
		}
	}
	due := now.Truncate(time.Minute).Add((PaperMinutes + 1) * time.Minute).UnixMilli()
	_, err := tx.Exec(`INSERT INTO paper_trials(entry_id,version,signature,status,reason,due_at,next_attempt) VALUES(?,?,?,?,?,?,?)`, id, PaperVersion, signature(item), status, reason, due, due+5000)
	return err
}

func (s *Store) paperFor(id int64) (Paper, error) {
	p := Paper{Status: "not_recorded", Reason: "模拟验证启用前的档案，不补造模拟记录"}
	var raw sql.NullString
	err := s.db.QueryRow(`SELECT version,status,reason,error,result FROM paper_trials WHERE entry_id=?`, id).Scan(&p.Version, &p.Status, &p.Reason, &p.Error, &raw)
	if err == sql.ErrNoRows {
		return p, nil
	}
	if err != nil {
		return p, err
	}
	if raw.Valid {
		err = json.Unmarshal([]byte(raw.String), &p)
	}
	return p, err
}

// Independent worker: delayed historical evaluation of a rule committed at capture.
// Waiting for the full window avoids pretending these are live order fills.
func (s *Store) ResolvePaper(ctx context.Context, now time.Time) error {
	rows, err := s.db.Query(`SELECT p.entry_id,a.recorded_at,p.due_at,a.snapshot FROM paper_trials p JOIN signal_archive a ON a.id=p.entry_id WHERE p.status IN ('pending','unavailable') AND p.next_attempt<=? ORDER BY p.next_attempt LIMIT 16`, now.UnixMilli())
	if err != nil {
		return err
	}
	jobs := []job{}
	for rows.Next() {
		var j job
		if err = rows.Scan(&j.id, &j.recorded, &j.due, &j.raw); err != nil {
			rows.Close()
			return err
		}
		jobs = append(jobs, j)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, j := range jobs {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		var item signals.RadarItem
		if err = json.Unmarshal([]byte(j.raw), &item); err != nil {
			return err
		}
		start := time.UnixMilli(j.recorded).Truncate(time.Minute).Add(time.Minute).UnixMilli()
		bars, e := s.paperBars(ctx, item.Symbol, start, j.due)
		if e != nil {
			_, err = s.db.Exec(`UPDATE paper_trials SET status='unavailable',error=?,next_attempt=? WHERE entry_id=?`, e.Error(), now.Add(5*time.Minute).UnixMilli(), j.id)
		} else {
			p := simulate(bars, item.Bias)
			raw, e := json.Marshal(p)
			if e != nil {
				return e
			}
			_, err = s.db.Exec(`UPDATE paper_trials SET status='complete',error='',resolved_at=?,result=? WHERE entry_id=?`, time.Now().UnixMilli(), string(raw), j.id)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) paperBars(ctx context.Context, symbol string, start, due int64) ([]paperBar, error) {
	q := url.Values{"symbol": {symbol}, "interval": {"1m"}, "startTime": {fmt.Sprint(start)}, "endTime": {fmt.Sprint(due - 1)}, "limit": {"100"}}
	req, err := http.NewRequestWithContext(ctx, "GET", s.BaseURL+"/fapi/v1/klines?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("模拟行情 HTTP %d", resp.StatusCode)
	}
	var raw [][]json.RawMessage
	if err = json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&raw); err != nil {
		return nil, err
	}
	if len(raw) != PaperMinutes {
		return nil, fmt.Errorf("模拟行情不完整：%d/%d", len(raw), PaperMinutes)
	}
	bars := make([]paperBar, 0, len(raw))
	for i, b := range raw {
		if len(b) < 7 {
			return nil, fmt.Errorf("模拟行情字段缺失")
		}
		var at, end int64
		if json.Unmarshal(b[0], &at) != nil || json.Unmarshal(b[6], &end) != nil || at != start+int64(i)*60000 || end != at+59999 {
			return nil, fmt.Errorf("模拟行情时间不连续")
		}
		v := [4]float64{}
		for k := range v {
			var str string
			if json.Unmarshal(b[k+1], &str) != nil {
				return nil, fmt.Errorf("模拟价格字段无效")
			}
			v[k], err = strconv.ParseFloat(str, 64)
			if err != nil || v[k] <= 0 || math.IsNaN(v[k]) || math.IsInf(v[k], 0) {
				return nil, fmt.Errorf("模拟价格数值无效")
			}
		}
		if v[1] < v[2] || v[0] > v[1] || v[0] < v[2] || v[3] > v[1] || v[3] < v[2] {
			return nil, fmt.Errorf("模拟价格结构无效")
		}
		bars = append(bars, paperBar{at, v[0], v[1], v[2], v[3]})
	}
	return bars, nil
}

func simulate(bars []paperBar, bias string) Paper {
	dir := 1.0
	if bias == "bear" {
		dir = -1
	}
	p := Paper{Version: PaperVersion, Status: "complete", Reason: "timeout", EntryAt: time.UnixMilli(bars[0].At).UTC().Format(time.RFC3339)}
	p.EntryPrice = bars[0].Open * (1 + dir*SlipPct/100)
	p.StopPrice = p.EntryPrice * (1 - dir*StopPct/100)
	p.TargetPrice = p.EntryPrice * (1 + dir*TargetPct/100)
	rawExit := bars[len(bars)-1].Close
	exitAt := bars[len(bars)-1].At + 59999
	for _, b := range bars {
		stop, target := b.Low <= p.StopPrice, b.High >= p.TargetPrice
		gapStop, gapTarget := b.Open <= p.StopPrice, b.Open >= p.TargetPrice
		if dir < 0 {
			stop, target = b.High >= p.StopPrice, b.Low <= p.TargetPrice
			gapStop, gapTarget = b.Open >= p.StopPrice, b.Open <= p.TargetPrice
		}
		if gapStop {
			rawExit, p.Reason, exitAt = b.Open, "stop_gap", b.At
			break
		}
		if gapTarget {
			rawExit, p.Reason, exitAt = p.TargetPrice, "target", b.At
			break
		} // no favorable gap improvement
		if stop {
			rawExit, p.Reason, exitAt = p.StopPrice, "stop", b.At+59999
			p.Ambiguous = target
			break
		}
		if target {
			rawExit, p.Reason, exitAt = p.TargetPrice, "target", b.At+59999
			break
		}
	}
	p.ExitPrice = rawExit * (1 - dir*SlipPct/100)
	p.ExitAt = time.UnixMilli(exitAt).UTC().Format(time.RFC3339)
	gross := dir * (p.ExitPrice/p.EntryPrice - 1) * 100
	fees := FeePct * (1 + p.ExitPrice/p.EntryPrice)
	net := gross - fees
	p.Gross, p.Net, p.Fees = &gross, &net, &fees
	return p
}

type ResearchStat struct {
	Minutes   int      `json:"minutes"`
	Completed int      `json:"completed"`
	Positive  int      `json:"positive"`
	Mean      *float64 `json:"mean_pct"`
}
type PaperStats struct {
	Total       int      `json:"total"`
	Completed   int      `json:"completed"`
	Positive    int      `json:"positive"`
	Pending     int      `json:"pending"`
	Unavailable int      `json:"unavailable"`
	Skipped     int      `json:"skipped"`
	Mean        *float64 `json:"mean_pct"`
}

func (s *Store) paperStats(where string, args []any, extra string, more ...any) (PaperStats, error) {
	var v PaperStats
	var mean sql.NullFloat64
	query := `SELECT COUNT(*),COALESCE(SUM(p.status='complete'),0),COALESCE(SUM(p.status='complete' AND json_extract(p.result,'$.net_pct')>0),0),COALESCE(SUM(p.status='pending'),0),COALESCE(SUM(p.status='unavailable'),0),COALESCE(SUM(p.status='skipped'),0),AVG(CASE WHEN p.status='complete' THEN json_extract(p.result,'$.net_pct') END) FROM paper_trials p JOIN signal_archive a ON a.id=p.entry_id` + where + extra
	err := s.db.QueryRow(query, append(append([]any{}, args...), more...)...).Scan(&v.Total, &v.Completed, &v.Positive, &v.Pending, &v.Unavailable, &v.Skipped, &mean)
	if mean.Valid {
		v.Mean = &mean.Float64
	}
	return v, err
}

// Matching is exact and explainable, never an AI confidence percentage.
// Only results already persisted BEFORE this signal are eligible as evidence.
func (s *Store) Research(id int64) (map[string]any, error) {
	var at int64
	var raw, version string
	if err := s.db.QueryRow(`SELECT recorded_at,snapshot,version FROM signal_archive WHERE id=?`, id).Scan(&at, &raw, &version); err != nil {
		return nil, err
	}
	var item signals.RadarItem
	if err := json.Unmarshal([]byte(raw), &item); err != nil {
		return nil, err
	}
	// JSON evidence is sorted in SQL for old entries too; no rewriting old snapshots.
	where := ` WHERE a.recorded_at<? AND a.category=? AND a.bias=? AND a.version=? AND
 (SELECT group_concat(k,',') FROM (SELECT json_extract(value,'$.kind')||':'||json_extract(value,'$.direction') AS k FROM json_each(a.snapshot,'$.signals') ORDER BY k))=?`
	args := []any{at, item.Category, item.Bias, version, signature(item)}
	var total, symbols int
	if err := s.db.QueryRow(`SELECT COUNT(*),COUNT(DISTINCT a.symbol) FROM signal_archive a`+where, args...).Scan(&total, &symbols); err != nil {
		return nil, err
	}
	stats := []ResearchStat{}
	for _, m := range []int{15, 60, 240} {
		v := ResearchStat{Minutes: m}
		var mean sql.NullFloat64
		err := s.db.QueryRow(`SELECT COUNT(*),COALESCE(SUM(json_extract(o.result,'$.direction_return_pct')>0),0),AVG(json_extract(o.result,'$.direction_return_pct')) FROM signal_archive a JOIN signal_outcomes o ON a.id=o.entry_id`+where+` AND a.bias IN ('bull','bear') AND o.minutes=? AND o.status='complete' AND o.due_at<=? AND json_extract(o.result,'$.resolved_at')<=?`, append(append([]any{}, args...), m, at, at)...).Scan(&v.Completed, &v.Positive, &mean)
		if err != nil {
			return nil, err
		}
		if mean.Valid {
			v.Mean = &mean.Float64
		}
		stats = append(stats, v)
	}
	paper, err := s.paperStats(where, args, ` AND p.version=? AND p.resolved_at<=? AND p.status='complete'`, PaperVersion, at)
	if err != nil {
		return nil, err
	}
	return map[string]any{"entry_id": id, "as_of": time.UnixMilli(at).UTC().Format(time.RFC3339), "signature": signature(item), "category": item.Category, "bias": item.Bias, "version": version, "matched": total, "symbols": symbols, "stats": stats, "paper": paper}, nil
}
