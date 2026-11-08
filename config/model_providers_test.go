package config

import (
	"path/filepath"
	"testing"
)

func TestExtendedProvidersPersist(t *testing.T) {
	d, err := NewDatabase(filepath.Join(t.TempDir(), "models.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.db.Close()
	models, err := d.GetAIModels("default")
	if err != nil {
		t.Fatal(err)
	}
	providers := map[string]bool{}
	for _, m := range models {
		providers[m.Provider] = true
	}
	for _, p := range []string{"deepseek", "qwen", "gemini", "kimi", "siliconflow", "openrouter", "custom"} {
		if !providers[p] {
			t.Fatalf("missing provider %s", p)
		}
	}
	_, err = d.db.Exec(`INSERT INTO users (id,email,password_hash,otp_secret) VALUES ('model-test','model@example.invalid','x','x')`)
	if err != nil {
		t.Fatal(err)
	}
	if err = d.UpdateAIModel("model-test", "gemini", true, "dummy-key", "https://example.invalid/v1", "chosen-model"); err != nil {
		t.Fatal(err)
	}
	saved, err := d.GetAIModels("model-test")
	if err != nil || len(saved) != 1 {
		t.Fatalf("save failed: %v", err)
	}
	if saved[0].Provider != "gemini" || saved[0].CustomModelName != "chosen-model" || saved[0].CustomAPIURL != "https://example.invalid/v1" {
		t.Fatal("model config not retained")
	}
}
