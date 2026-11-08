package trader

import (
	"context"
	"errors"
	"fmt"
	"github.com/adshao/go-binance/v2/common"
	"net/url"
	"strings"
	"testing"
)

func TestReadErrorsExplainFailureWithoutSignedURLs(t *testing.T) {
	err := &url.Error{Op: "Get", URL: "https://fapi.binance.com/account?signature=secret", Err: context.DeadlineExceeded}
	if got := BinanceReadErrorMessage(err); got != "币安请求超时" || strings.Contains(got, "secret") {
		t.Fatal(got)
	}
	for _, err := range []error{&common.APIError{Code: -2015}, fmt.Errorf("wrapped: %w", context.DeadlineExceeded), errors.New("signature=secret")} {
		if message := BinanceReadErrorMessage(err); message == "" || strings.Contains(message, "secret") {
			t.Fatal(message)
		}
	}
}
