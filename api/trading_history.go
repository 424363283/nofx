package api

import (
	"github.com/gin-gonic/gin"
	"guanlan/trader"
	"net/http"
	"strconv"
)

func (s *Server) handleTradingHistory(c *gin.Context) {
	userID, id := c.GetString("user_id"), c.Param("id")
	record, _, _, err := s.database.GetTraderConfig(userID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "交易员不存在或无权访问"})
		return
	}
	if record.ExchangeID != "binance" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "历史订单目前仅支持币安 U 本位账户"})
		return
	}
	days, err := strconv.Atoi(c.DefaultQuery("days", "7"))
	if err != nil || (days != 1 && days != 7 && days != 30) {
		c.JSON(400, gin.H{"error": "请选择1、7或30天"})
		return
	}
	live, err := s.traderManager.GetTrader(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "交易员尚未加载"})
		return
	}
	history, err := live.GetTradingHistory(c.Request.Context(), days, c.Query("refresh") == "1")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": trader.BinanceReadErrorMessage(err)})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, history)
}
