package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Cache the public exchange metadata to avoid querying Binance for every modal.
type futuresSymbolSource struct {
	mu         sync.Mutex
	client     *http.Client
	url        string
	symbols    []string
	categories map[string]string
	updatedAt  time.Time
}

var binanceSymbols = &futuresSymbolSource{
	client: &http.Client{Timeout: 12 * time.Second},
	url:    "https://fapi.binance.com/fapi/v1/exchangeInfo",
}

func (s *futuresSymbolSource) load() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.symbols) > 0 && time.Since(s.updatedAt) < 5*time.Minute {
		return s.symbols, nil
	}
	response, err := s.client.Get(s.url)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("exchange info status: %d", response.StatusCode)
	}
	var data struct {
		Symbols []struct {
			Symbol         string `json:"symbol"`
			Status         string `json:"status"`
			ContractType   string `json:"contractType"`
			QuoteAsset     string `json:"quoteAsset"`
			MarginAsset    string `json:"marginAsset"`
			UnderlyingType string `json:"underlyingType"`
		} `json:"symbols"`
	}
	if err := json.NewDecoder(response.Body).Decode(&data); err != nil {
		return nil, err
	}
	symbols := make([]string, 0, len(data.Symbols))
	seen := make(map[string]bool)
	categories := make(map[string]string)
	for _, item := range data.Symbols {
		if item.Status == "TRADING" && (item.ContractType == "PERPETUAL" || item.ContractType == "TRADIFI_PERPETUAL") && item.QuoteAsset == "USDT" && item.MarginAsset == "USDT" && strings.HasSuffix(item.Symbol, "USDT") && !seen[item.Symbol] {
			symbols = append(symbols, item.Symbol)
			seen[item.Symbol] = true
			category := "crypto"
			if item.ContractType == "TRADIFI_PERPETUAL" {
				category = "other"
				if item.UnderlyingType == "EQUITY" {
					category = "equity"
				}
				if item.UnderlyingType == "COMMODITY" {
					category = "commodity"
				}
			}
			categories[item.Symbol] = category
		}
	}
	if len(symbols) == 0 {
		return nil, fmt.Errorf("no active USDT perpetual contracts")
	}
	sort.Strings(symbols)
	s.symbols, s.updatedAt = symbols, time.Now()
	s.categories = categories
	return symbols, nil
}

func (s *Server) handleFuturesSymbols(c *gin.Context) {
	symbols, err := binanceSymbols.load()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "暂时无法获取币安合约列表，请稍后重试；也可手动输入交易对。"})
		return
	}
	binanceSymbols.mu.Lock()
	categories := binanceSymbols.categories
	binanceSymbols.mu.Unlock()
	c.JSON(http.StatusOK, gin.H{"symbols": symbols, "categories": categories})
}
