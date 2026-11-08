package manager

import (
	"guanlan/trader"
	"testing"
	"time"
)

func TestRemoveTraderClearsInstanceAndOverview(t *testing.T) {
	tm := NewTraderManager()
	tm.traders["deleted"] = &trader.AutoTrader{}
	tm.competitionCache.data = map[string]interface{}{"count": 1, "traders": []map[string]interface{}{{"trader_id": "deleted"}}}
	tm.competitionCache.timestamp = time.Now()
	tm.RemoveTrader("deleted")
	if _, err := tm.GetTrader("deleted"); err == nil {
		t.Fatal("deleted trader still accessible")
	}
	data, err := tm.GetCompetitionData()
	if err != nil || data["count"] != 0 || data["total_count"] != 0 {
		t.Fatalf("stale overview: %v %v", data, err)
	}
	tm.RemoveTrader("deleted") // Repeated cleanup is safe.
}
