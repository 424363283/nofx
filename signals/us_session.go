package signals

import (
	"strings"
	"time"
	_ "time/tzdata"
)

// Published NYSE cash-equity core sessions, not Binance contract trading hours.
// Source: https://www.nyse.com/trade/hours-calendars (2026-2028).
// Unknown years fail closed until the published calendar is updated.
var usEquityHolidays = dateSet(`
2026-01-01 2026-01-19 2026-02-16 2026-04-03 2026-05-25
2026-06-19 2026-07-03 2026-09-07 2026-11-26 2026-12-25
2027-01-01 2027-01-18 2027-02-15 2027-03-26 2027-05-31
2027-06-18 2027-07-05 2027-09-06 2027-11-25 2027-12-24
2028-01-17 2028-02-21 2028-04-14 2028-05-29 2028-06-19
2028-07-04 2028-09-04 2028-11-23 2028-12-25`)
var usEquityEarlyClose = dateSet(`2026-11-27 2026-12-24 2027-11-26 2028-07-03 2028-11-24`)

func dateSet(raw string) map[string]bool {
	result := map[string]bool{}
	for _, date := range strings.Fields(raw) {
		result[date] = true
	}
	return result
}

func USEquitySession(now time.Time) (bool, string) {
	zone, err := time.LoadLocation("America/New_York")
	if err != nil {
		return false, "美股时区不可用"
	}
	local := now.In(zone)
	if local.Year() < 2026 || local.Year() > 2028 {
		return false, "美股交易日历未覆盖当前年份"
	}
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return false, "美股周末休市"
	}
	date := local.Format("2006-01-02")
	if usEquityHolidays[date] {
		return false, "美股节假日休市"
	}
	closeMinute := 16 * 60
	if usEquityEarlyClose[date] {
		closeMinute = 13 * 60
	}
	minute := local.Hour()*60 + local.Minute()
	if minute < 9*60+30 {
		return false, "美股常规交易时段尚未开始"
	}
	if minute >= closeMinute {
		return false, "美股常规交易时段已结束"
	}
	return true, "美股处于常规交易时段（America/New_York；已处理夏令时、节假日及提前收盘）"
}
