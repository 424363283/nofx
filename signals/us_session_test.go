package signals

import (
	"testing"
	"time"
)

func TestUSEquitySessionCalendar(t *testing.T) {
	for _, tc := range []struct {
		at   string
		open bool
	}{
		{"2026-07-06T13:29:59Z", false}, // EDT: before 09:30
		{"2026-07-06T13:30:00Z", true},
		{"2026-07-06T19:59:59Z", true},
		{"2026-07-06T20:00:00Z", false},
		{"2026-11-09T14:29:59Z", false}, // EST after fall transition
		{"2026-11-09T14:30:00Z", true},
		{"2026-11-09T21:00:00Z", false},
		{"2026-11-08T23:39:03+08:00", false}, // Sunday screenshot
		{"2026-11-10T04:30:00+08:00", true},  // previous NY trading day
		{"2026-07-03T15:00:00Z", false},
		{"2026-04-03T15:00:00Z", false},
		{"2026-11-26T15:00:00Z", false},
		{"2026-11-27T17:59:59Z", true},
		{"2026-11-27T18:00:00Z", false},
		{"2026-12-24T18:00:00Z", false},
		{"2027-06-18T15:00:00Z", false},
		{"2027-12-24T15:00:00Z", false},
		{"2027-12-31T15:00:00Z", true}, // NYSE does not observe Jan 1, 2028
		{"2028-07-03T17:00:00Z", false},
		{"2029-01-02T15:00:00Z", false}, // calendar expired
	} {
		at, err := time.Parse(time.RFC3339, tc.at)
		if err != nil {
			t.Fatal(err)
		}
		if open, why := USEquitySession(at); open != tc.open {
			t.Errorf("%s: open=%v (%s)", tc.at, open, why)
		}
	}
}
