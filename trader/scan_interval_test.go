package trader

import (
	"errors"
	"guanlan/logger"
	"testing"
	"testing/synctest"
	"time"
)

type unavailableAccountTrader struct{ Trader }

func (unavailableAccountTrader) GetBalance() (map[string]interface{}, error) {
	return nil, errors.New("test account unavailable")
}

func (unavailableAccountTrader) GetPositions() ([]map[string]interface{}, error) {
	return nil, nil
}

func TestScanIntervalUpdatesRunningTicker(t *testing.T) {
	logDir := t.TempDir()
	synctest.Test(t, func(t *testing.T) {
		at := &AutoTrader{
			config:              AutoTraderConfig{ScanInterval: 3 * time.Minute},
			trader:              unavailableAccountTrader{},
			decisionLogger:      logger.NewDecisionLogger(logDir),
			lastBalanceSyncTime: time.Now(), lastResetTime: time.Now(),
			stopMonitorCh: make(chan struct{}), scanIntervalChanged: make(chan struct{}, 1),
		}
		done := make(chan struct{})
		go func() { defer close(done); _ = at.Run() }()
		synctest.Wait()
		if at.callCount.Load() != 1 {
			t.Fatalf("initial cycles=%d", at.callCount.Load())
		}
		if err := at.SetScanInterval(time.Minute); err != nil {
			t.Fatal(err)
		}
		synctest.Wait()
		if got := at.GetStatus()["scan_interval"]; got != "1m0s" {
			t.Fatalf("status interval=%v", got)
		}
		time.Sleep(59 * time.Second)
		synctest.Wait()
		if at.callCount.Load() != 1 {
			t.Fatal("cycle fired early")
		}
		time.Sleep(time.Second)
		synctest.Wait()
		if at.callCount.Load() != 2 {
			t.Fatalf("one-minute timer not applied: cycles=%d", at.callCount.Load())
		}
		if err := at.SetScanInterval(5 * time.Minute); err != nil {
			t.Fatal(err)
		}
		synctest.Wait()
		time.Sleep(4 * time.Minute)
		synctest.Wait()
		if at.callCount.Load() != 2 {
			t.Fatal("old one-minute ticker still active")
		}
		time.Sleep(time.Minute)
		synctest.Wait()
		if at.callCount.Load() != 3 {
			t.Fatalf("five-minute timer not applied: cycles=%d", at.callCount.Load())
		}
		close(at.stopMonitorCh)
		<-done
		at.monitorWg.Wait()
	})
}

func TestScanIntervalRejectsInvalidUpdates(t *testing.T) {
	at := &AutoTrader{config: AutoTraderConfig{ScanInterval: 3 * time.Minute}, scanIntervalChanged: make(chan struct{}, 1)}
	for _, interval := range []time.Duration{0, -time.Minute, 59 * time.Second, 61 * time.Minute} {
		if at.SetScanInterval(interval) == nil {
			t.Fatalf("accepted %v", interval)
		}
	}
	if at.ScanInterval() != 3*time.Minute {
		t.Fatal("invalid update changed schedule")
	}
	for _, interval := range []time.Duration{time.Minute, 2 * time.Minute, time.Hour} {
		if err := at.SetScanInterval(interval); err != nil {
			t.Fatal(err)
		}
	}
	if at.ScanInterval() != time.Hour || len(at.scanIntervalChanged) != 1 {
		t.Fatal("updates not coalesced to latest interval")
	}
}
