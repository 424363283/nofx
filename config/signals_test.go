package config

import (
	"path/filepath"
	"testing"
)

func TestSignalConfigRoundTrip(t *testing.T) {
	d, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.db.Close()
	// Metadata fixtures only; no API keys or network requests.
	_, err = d.db.Exec(`INSERT INTO users (id,email,password_hash,otp_secret) VALUES ('signal-test','test@example.invalid','x','x')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = d.db.Exec(`INSERT INTO ai_models (id,user_id,name,provider) VALUES ('signal-model','signal-test','test','custom')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = d.db.Exec(`INSERT INTO exchanges (id,user_id,name,type) VALUES ('signal-exchange','signal-test','test','cex')`)
	if err != nil {
		t.Fatal(err)
	}
	trader := &TraderRecord{ID: "signal-trader", UserID: "signal-test", Name: "test", AIModelID: "signal-model", ExchangeID: "signal-exchange", SignalConfig: `{"enabled":true,"category":"equity"}`}
	if err = d.CreateTrader(trader); err != nil {
		t.Fatal(err)
	}
	rows, err := d.GetTraders("signal-test")
	if err != nil || len(rows) != 1 || rows[0].SignalConfig != trader.SignalConfig {
		t.Fatalf("list round trip: %v %v", rows, err)
	}
	trader.SignalConfig = `{"enabled":false,"radar_enabled":true}`
	if err = d.UpdateTrader(trader); err != nil {
		t.Fatal(err)
	}
	saved, _, _, err := d.GetTraderConfig("signal-test", trader.ID)
	if err != nil || saved.SignalConfig != trader.SignalConfig {
		t.Fatalf("config round trip: %v %v", saved, err)
	}
}
