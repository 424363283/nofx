package trader

import (
	"errors"
	"guanlan/decision"
	"guanlan/logger"
	"reflect"
	"testing"
)

type protectionTestTrader struct {
	Trader
	calls                      []string
	stopErr, takeErr, closeErr error
	closedQty                  float64
}

func (t *protectionTestTrader) SetStopLoss(_, _ string, _, _ float64) error {
	t.calls = append(t.calls, "stop")
	return t.stopErr
}
func (t *protectionTestTrader) SetTakeProfit(_, _ string, _, _ float64) error {
	t.calls = append(t.calls, "take")
	return t.takeErr
}
func (t *protectionTestTrader) CloseLong(_ string, q float64) (map[string]interface{}, error) {
	t.calls = append(t.calls, "close-long")
	t.closedQty = q
	return nil, t.closeErr
}
func (t *protectionTestTrader) CloseShort(_ string, q float64) (map[string]interface{}, error) {
	t.calls = append(t.calls, "close-short")
	t.closedQty = q
	return nil, t.closeErr
}

func TestProtectedEntryConfirmationAndRollback(t *testing.T) {
	fail := errors.New("exchange rejected")
	for _, tc := range []struct {
		side              string
		stop, take, close error
		want              []string
		status            string
	}{
		{"LONG", nil, nil, nil, []string{"stop", "take"}, "confirmed"},
		{"SHORT", nil, nil, nil, []string{"stop", "take"}, "confirmed"},
		{"LONG", fail, nil, nil, []string{"stop", "close-long"}, "rolled_back"},
		{"SHORT", nil, fail, nil, []string{"stop", "take", "close-short"}, "rolled_back"},
		{"LONG", nil, fail, fail, []string{"stop", "take", "close-long"}, "failed"},
	} {
		tr := &protectionTestTrader{stopErr: tc.stop, takeErr: tc.take, closeErr: tc.close}
		at := &AutoTrader{trader: tr}
		d := &decision.Decision{Symbol: "BTCUSDT", StopLoss: 90, TakeProfit: 130}
		action := &logger.DecisionAction{}
		err := at.protectNewEntry(d, tc.side, 0.123, action)
		if !reflect.DeepEqual(tr.calls, tc.want) || action.ProtectionStatus != tc.status || (err == nil) != (tc.status == "confirmed") {
			t.Fatalf("%+v calls=%v action=%+v err=%v", tc, tr.calls, action, err)
		}
		if tc.status != "confirmed" {
			if !at.entryProtectionBlocked.Load() || tr.closedQty != 0.123 {
				t.Fatal("unprotected entry did not pause or rolled back wrong quantity")
			}
			if at.executeDecisionWithRecord(&decision.Decision{Action: "open_long"}, &logger.DecisionAction{}) == nil {
				t.Fatal("new entry allowed after protection failure")
			}
			if at.executeDecisionWithRecord(&decision.Decision{Action: "wait"}, &logger.DecisionAction{}) != nil {
				t.Fatal("management must remain available")
			}
		}
	}
}
