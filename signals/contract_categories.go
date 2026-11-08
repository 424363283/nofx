package signals

import "context"

// Uses the shared, bounded public metadata cache; never infer equities from names.
func (c *Client) ContractCategories(ctx context.Context) (map[string]string, error) {
	var info struct {
		Symbols []struct{ Symbol, ContractType, UnderlyingType string }
	}
	if err := c.get(ctx, "/fapi/v1/exchangeInfo", &info); err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, s := range info.Symbols {
		if s.ContractType == "PERPETUAL" {
			out[s.Symbol] = "crypto"
		}
		if s.ContractType == "TRADIFI_PERPETUAL" {
			out[s.Symbol] = "other"
			if s.UnderlyingType == "EQUITY" {
				out[s.Symbol] = "equity"
			}
			if s.UnderlyingType == "COMMODITY" {
				out[s.Symbol] = "commodity"
			}
		}
	}
	return out, nil
}
