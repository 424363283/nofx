package api

import (
	"encoding/json"
	"errors"
	"guanlan/auth"
	"guanlan/trader"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) handlePositionStream(c *gin.Context) {
	userID, traderID := c.GetString("user_id"), c.Param("id")
	record, _, _, err := s.database.GetTraderConfig(userID, traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "交易员不存在或无权访问"})
		return
	}
	if record.ExchangeID != "binance" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "实时持仓推送仅支持币安账户"})
		return
	}
	live, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "交易员尚未加载"})
		return
	}
	// Keep the bearer token in the header, never in an SSE/WebSocket URL.
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	lastAuthCheck := time.Now()
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-store")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Connection", "keep-alive")
	_ = live.StreamPositions(c.Request.Context(), func(update trader.PositionStreamUpdate) error {
		if c.Request.Context().Err() != nil {
			return c.Request.Context().Err()
		}
		if time.Since(lastAuthCheck) > 15*time.Second {
			if _, err := auth.ValidateJWT(token); err != nil || auth.IsTokenBlacklisted(token) {
				return errors.New("authentication expired")
			}
			lastAuthCheck = time.Now()
		}
		data, err := json.Marshal(update)
		if err != nil {
			return err
		}
		_ = http.NewResponseController(c.Writer).SetWriteDeadline(time.Now().Add(10 * time.Second))
		if _, err := c.Writer.Write(append(append([]byte("data: "), data...), '\n', '\n')); err != nil {
			return err
		}
		c.Writer.Flush()
		return nil
	})
}
