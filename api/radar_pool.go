package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"guanlan/signals"
)

func (s *Server) handleRadarPool(c *gin.Context) {
	record, _, _, err := s.database.GetTraderConfig(c.GetString("user_id"), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "交易员不存在"})
		return
	}
	cfg, err := signals.Parse(record.SignalConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "信号配置无效"})
		return
	}
	items, scanErr := signals.LoadRadarCandidates(c.Request.Context())
	warning := ""
	if scanErr != nil {
		warning = scanErr.Error()
	}
	if items == nil {
		items = []signals.RadarItem{}
	}
	c.JSON(http.StatusOK, gin.H{"enabled": cfg.RadarEnabled, "supported": record.ExchangeID == "binance", "items": items, "warning": warning})
}
func (s *Server) handleSetRadarPool(c *gin.Context) {
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if c.ShouldBindJSON(&req) != nil || req.Enabled == nil {
		c.JSON(400, gin.H{"error": "请指定异动候选开关"})
		return
	}
	record, _, _, err := s.database.GetTraderConfig(c.GetString("user_id"), c.Param("id"))
	if err != nil {
		c.JSON(404, gin.H{"error": "交易员不存在"})
		return
	}
	if *req.Enabled && record.ExchangeID != "binance" {
		c.JSON(400, gin.H{"error": "异动候选仅支持币安账户"})
		return
	}
	cfg, err := signals.Parse(record.SignalConfig)
	if err != nil {
		c.JSON(400, gin.H{"error": "信号配置无效"})
		return
	}
	cfg.RadarEnabled = *req.Enabled
	record.SignalConfig = cfg.JSON()
	if err = s.database.UpdateTrader(record); err != nil {
		c.JSON(500, gin.H{"error": "保存失败"})
		return
	}
	if live, err := s.traderManager.GetTrader(record.ID); err == nil {
		live.SetRadarEnabled(*req.Enabled)
	}
	c.JSON(200, gin.H{"enabled": *req.Enabled, "message": "已保存，下一轮决策生效"})
}
