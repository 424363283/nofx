package decision

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestReasoningTextDoesNotTriggerNumericValidation(t *testing.T) {
	reason := `成交额1,123,614，前20均值1,556,613；范围0.5~1；“不应改写”，标签[1,000]和字符}]及反斜杠\`
	raw, _ := json.Marshal([]Decision{{Symbol: "PAXGUSDT", Action: "wait", Reasoning: reason}})
	for _, response := range []string{string(raw), "<reasoning>观望</reasoning><decision>" + string(raw) + "</decision>", "<decision>```json\n" + string(raw) + "\n```</decision>"} {
		result, err := parseFullDecisionResponse(response, 0, 3, 3)
		if err != nil || len(result.Decisions) != 1 || result.Decisions[0].Reasoning != reason {
			t.Fatalf("valid text corrupted/rejected: err=%v", err)
		}
	}
}

func TestInvalidDecisionJSONStaysRejectedWithoutEchoingResponse(t *testing.T) {
	for _, raw := range []string{
		`[{"symbol":"BTCUSDT","action":"open_long","position_size_usd":1,123,614}]`,
		`[{"symbol":"BTCUSDT","action":"open_long","leverage":1~3}]`,
		`[{"symbol":"BTCUSDT","action":"wait","reasoning":"unfinished}]`,
		`[null]`, `[1,2]`, `[{"symbol":"BTCUSDT","action":"wait"}] [{"action":"open_long"}]`,
	} {
		_, err := extractDecisions("<decision>" + raw + "</decision>")
		if err == nil {
			t.Fatalf("invalid payload accepted: %s", raw)
		}
		if strings.Contains(err.Error(), "JSON内容") || strings.Contains(err.Error(), "完整响应") {
			t.Fatal("entire response leaked into error message")
		}
	}
}

func TestMissingJSONIsAnErrorNotAnInventedWait(t *testing.T) {
	if _, err := extractDecisions("<reasoning>只有说明，没有决策</reasoning>"); err == nil {
		t.Fatal("missing response fabricated a wait decision")
	}
	records, err := extractDecisions("<decision>[]</decision>")
	if err != nil || len(records) != 0 {
		t.Fatalf("valid empty decision list rejected: %v", err)
	}
}
