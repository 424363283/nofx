package mcp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCustomChatCompletion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("incorrect route or authentication")
		}
		var body struct {
			Model    string              `json:"model"`
			Messages []map[string]string `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != "provider/model" || len(body.Messages) != 2 {
			t.Errorf("incorrect model/messages: %+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"test decision"}}]}`))
	}))
	defer server.Close()
	client := New()
	client.SetCustomAPI(server.URL+"/v1/", "test-key", "provider/model")
	result, err := client.CallWithMessages("system", "user")
	if err != nil || result != "test decision" {
		t.Fatalf("result=%q err=%v", result, err)
	}
}
