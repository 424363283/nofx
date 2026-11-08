package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLatestRecordsRollForwardByTimestamp(t *testing.T) {
	l := &DecisionLogger{logDir: t.TempDir()}
	now := time.Now()
	write := func(cycle int) {
		data, _ := json.Marshal(DecisionRecord{CycleNumber: cycle, Timestamp: now.Add(time.Duration(cycle) * time.Minute)})
		// Deliberately reverse the filename ordering.
		if err := os.WriteFile(filepath.Join(l.logDir, fmt.Sprintf("decision_%03d.json", 100-cycle)), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= 10; i++ {
		write(i)
	}
	records, err := l.GetLatestRecords(5)
	if err != nil || len(records) != 5 || records[0].CycleNumber != 6 || records[4].CycleNumber != 10 {
		t.Fatalf("unexpected latest records: %v %v", records, err)
	}
	write(11)
	records, err = l.GetLatestRecords(5)
	if err != nil || len(records) != 5 || records[0].CycleNumber != 7 || records[4].CycleNumber != 11 {
		t.Fatalf("records did not roll forward: %v %v", records, err)
	}
}
