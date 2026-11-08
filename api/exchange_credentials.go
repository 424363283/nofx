package api

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

// Credentials are read only for the explicitly opened edit dialog, never lists.
func (s *Server) handleExchangeCredentials(c *gin.Context) {
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	exchanges, err := s.database.GetExchanges(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取交易所配置，请重试"})
		return
	}
	for _, exchange := range exchanges {
		if exchange.ID != c.Param("id") {
			continue
		}
		// The separate private-wallet flow is unchanged; this edit readback is for CEX keys.
		key, secret := "", ""
		if exchange.ID != "hyperliquid" && exchange.ID != "aster" {
			key, secret = exchange.APIKey, exchange.SecretKey
		}
		c.JSON(http.StatusOK, gin.H{"id": exchange.ID, "name": exchange.Name, "type": exchange.Type, "enabled": exchange.Enabled, "apiKey": key, "secretKey": secret, "testnet": exchange.Testnet, "hyperliquidWalletAddr": exchange.HyperliquidWalletAddr, "asterUser": exchange.AsterUser, "asterSigner": exchange.AsterSigner})
		return
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "交易所配置不存在或无权访问"})
}
