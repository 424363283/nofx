package trader

import (
	"context"
	"errors"
	"github.com/adshao/go-binance/v2/common"
	"io"
	"net"
)

// Do not expose signed request URLs, API keys or listenKeys in browser errors.
func BinanceReadErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "币安请求超时"
	}
	var network net.Error
	if errors.As(err, &network) {
		if network.Timeout() {
			return "币安请求超时"
		}
		return "连接币安失败，请检查网络连接"
	}
	var api *common.APIError
	if errors.As(err, &api) {
		if isBinanceLocationRestricted(err) {
			return "币安拒绝当前连接的访问地区"
		}
		switch api.Code {
		case -2015, -2014:
			return "币安拒绝访问，请检查 API 密钥、IP 白名单和账户读取权限"
		case -1021:
			return "币安时间校准失败"
		case -1003, -1015:
			return "币安请求频率受限，稍后自动重试"
		}
		return "币安接口返回错误，稍后重试"
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return "币安连接被中断"
	}
	return "币安数据读取失败"
}
