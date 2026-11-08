package trader

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/adshao/go-binance/v2/common"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type protectionAlgo struct {
	ID            int64  `json:"algoId"`
	ClientID      string `json:"clientAlgoId"`
	Symbol        string `json:"symbol"`
	Side          string `json:"side"`
	PositionSide  string `json:"positionSide"`
	Type          string `json:"orderType"`
	Status        string `json:"algoStatus"`
	Trigger       string `json:"triggerPrice"`
	ClosePosition bool   `json:"closePosition"`
	WorkingType   string `json:"workingType"`
}

// Never retry mutations blindly or expose signed URLs through wrapped errors.
func (t *FuturesTrader) algoRequest(method, path string, params url.Values, out any) error {
	c := t.binanceClient()
	params.Set("timestamp", strconv.FormatInt(time.Now().UnixMilli()-c.TimeOffset, 10))
	params.Set("recvWindow", "10000")
	encoded := params.Encode()
	mac := hmac.New(sha256.New, []byte(c.SecretKey))
	mac.Write([]byte(encoded))
	encoded += "&signature=" + hex.EncodeToString(mac.Sum(nil))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	endpoint := c.BaseURL + path
	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader(encoded)
	} else {
		endpoint += "?" + encoded
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return fmt.Errorf("保护单请求构建失败")
	}
	req.Header.Set("X-MBX-APIKEY", c.APIKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("保护单连接失败或超时，结果需回查")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("保护单响应读取失败")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var apiErr common.APIError
		if json.Unmarshal(data, &apiErr) == nil && apiErr.Code != 0 {
			return &apiErr
		}
		return fmt.Errorf("保护单接口HTTP %d", response.StatusCode)
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (t *FuturesTrader) protectionTrigger(symbol string, price float64) (string, error) {
	if _, ok := finiteNumber(strconv.FormatFloat(price, 'g', -1, 64)); !ok || price <= 0 {
		return "", fmt.Errorf("保护价必须为有限正数")
	}
	t.protectionRulesMu.Lock()
	defer t.protectionRulesMu.Unlock()
	if step := t.protectionSteps[symbol]; step != "" && time.Since(t.protectionRulesAt) < 5*time.Minute {
		return roundedProtectionPrice(price, step)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	info, err := t.binanceClient().NewExchangeInfoService().Do(ctx)
	if err != nil {
		return "", fmt.Errorf("保护单交易规则不可用: %w", err)
	}
	steps := map[string]string{}
	for _, s := range info.Symbols {
		filter := s.PriceFilter()
		if filter == nil {
			continue
		}
		tick, ok := finiteNumber(filter.TickSize)
		if !ok || tick <= 0 {
			continue
		}
		steps[s.Symbol] = filter.TickSize
	}
	t.protectionSteps, t.protectionRulesAt = steps, time.Now()
	if step := steps[symbol]; step != "" {
		return roundedProtectionPrice(price, step)
	}
	return "", fmt.Errorf("未找到%s保护单价格规则", symbol)
}

func roundedProtectionPrice(price float64, step string) (string, error) {
	value := common.AmountToLotSize(strconv.FormatFloat(price, 'f', -1, 64), "0", step, calculatePrecision(step))
	if v, ok := finiteNumber(value); !ok || v <= 0 {
		return "", fmt.Errorf("保护价取整后无效")
	}
	return value, nil
}

// Binance's conditional API: closePosition=true must not include quantity.
func (t *FuturesTrader) setProtection(symbol, positionSide, kind string, price float64) error {
	if positionSide != "LONG" && positionSide != "SHORT" {
		return fmt.Errorf("无效保护单方向")
	}
	trigger, err := t.protectionTrigger(symbol, price)
	if err != nil {
		return err
	}
	side := "SELL"
	if positionSide == "SHORT" {
		side = "BUY"
	}
	id := "glp-" + getBrOrderID()
	params := url.Values{"algoType": {"CONDITIONAL"}, "symbol": {symbol}, "side": {side}, "positionSide": {positionSide}, "type": {kind}, "triggerPrice": {trigger}, "closePosition": {"true"}, "workingType": {"MARK_PRICE"}, "clientAlgoId": {id}}
	var ack protectionAlgo
	createErr := t.algoRequest(http.MethodPost, "/fapi/v1/algoOrder", params, &ack)
	var confirmed protectionAlgo
	queryErr := t.algoRequest(http.MethodGet, "/fapi/v1/algoOrder", url.Values{"clientAlgoId": {id}}, &confirmed)
	if queryErr != nil {
		return fmt.Errorf("保护单未确认（提交:%v；回查:%v）", createErr, queryErr)
	}
	actual, ok := finiteNumber(confirmed.Trigger)
	expected, _ := finiteNumber(trigger)
	if confirmed.ID <= 0 || confirmed.ClientID != id || confirmed.Symbol != symbol || confirmed.Side != side || confirmed.PositionSide != positionSide || confirmed.Type != kind || confirmed.Status != "NEW" || !confirmed.ClosePosition || confirmed.WorkingType != "MARK_PRICE" || !ok || actual != expected {
		return fmt.Errorf("保护单回查内容或状态不匹配（%s %s）", symbol, kind)
	}
	return nil
}

// Remove only this application's own algos, leaving manual conditional orders.
func (t *FuturesTrader) cancelProtectionAlgos(symbol, kind string) error {
	var orders []protectionAlgo
	if err := t.algoRequest(http.MethodGet, "/fapi/v1/openAlgoOrders", url.Values{"symbol": {symbol}}, &orders); err != nil {
		return err
	}
	for _, order := range orders {
		if !strings.HasPrefix(order.ClientID, "glp-") || (kind != "" && order.Type != kind) {
			continue
		}
		if err := t.algoRequest(http.MethodDelete, "/fapi/v1/algoOrder", url.Values{"algoId": {strconv.FormatInt(order.ID, 10)}}, nil); err != nil {
			return err
		}
	}
	return nil
}
