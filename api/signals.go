package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"guanlan/signals"
	"strings"
)

func signalConfigJSON(c *signals.Config) string {
	if c == nil {
		return "{}"
	}
	return c.JSON()
}
func decodeSignalConfig(raw string) signals.Config { c, _ := signals.Parse(raw); return c }
func (s *Server) handleSignalPreview(c *gin.Context) {
	var request struct {
		Config  signals.Config `json:"config"`
		Symbols string         `json:"symbols"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "信号配置格式错误"})
		return
	}
	if err := request.Config.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := signals.Default.Scan(c.Request.Context(), request.Config, strings.Split(request.Symbols, ","))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
