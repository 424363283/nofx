// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TradingHistoryPanel } from './TradingHistoryPanel'
import { api } from '../lib/api'
import type { TradingHistory } from '../types'
vi.mock('../lib/api', () => ({ api: { getTradingHistory: vi.fn() } }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const data: TradingHistory = {
  start: Date.parse('2026-11-01T00:00:00Z'),
  end: Date.parse('2026-11-08T00:00:00Z'),
  fetched_at: '2026-11-08T00:00:00Z',
  income_complete: true,
  orders_complete: true,
  warnings: [],
  summary: {
    realized_pnl: 10,
    commission: -0.4,
    funding: -0.5,
    trading_net: 9.1,
    transfers: 100,
    other: 0.2,
    ledger_net: 109.3,
    other_assets: [],
  },
  orders: [
    {
      id: 'JCT-1',
      order_id: '1',
      symbol: 'JCTUSDT',
      action: 'open_short',
      side: 'SELL',
      position_side: 'SHORT',
      first_time: 1,
      last_time: 1,
      price: 0.01,
      quantity: 100,
      notional: 1,
      realized_pnl: 0,
      commissions: [{ asset: 'USDT', amount: 0.1 }],
      net_pnl: -0.1,
      fills: 2,
    },
  ],
  income: [
    {
      id: 'transfer-1',
      time: 1,
      type: 'TRANSFER',
      symbol: '',
      asset: 'USDT',
      amount: 100,
    },
  ],
}
const view = () => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <TradingHistoryPanel traderId="a" exchange="binance" language="zh" />
  </SWRConfig>
)
it('shows only closing orders, including losses and explicit breakeven closes', async () => {
  const order = data.orders[0]
  vi.mocked(api.getTradingHistory).mockResolvedValue({
    ...data,
    orders: [
      order,
      { ...order, id: 'close', symbol: 'CLOSEUSDT', action: 'close_short' },
      {
        ...order,
        id: 'profit',
        symbol: 'PROFITUSDT',
        action: 'sell',
        realized_pnl: 10,
        net_pnl: 9.9,
      },
      {
        ...order,
        id: 'loss',
        symbol: 'LOSSUSDT',
        action: 'buy',
        realized_pnl: -2,
        net_pnl: -2.1,
      },
      { ...order, id: 'fee', symbol: 'FEEUSDT', action: 'buy' },
    ],
  })
  render(view())
  expect(await screen.findByText('CLOSEUSDT')).toBeTruthy()
  expect(screen.getByText('平空 / 减仓')).toBeTruthy()
  expect(screen.getByText('PROFITUSDT')).toBeTruthy()
  expect(screen.getByText('LOSSUSDT')).toBeTruthy()
  expect(screen.queryByText('JCTUSDT')).toBeNull()
  expect(screen.queryByText('FEEUSDT')).toBeNull()
  expect(screen.getByRole('tab', { name: '已平仓订单 · 3' })).toBeTruthy()
  expect(screen.getByText('+9.10')).toBeTruthy()
  expect(screen.getByText('+100.00')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: '筛选历史合约' }), {
    target: { value: 'profit' },
  })
  expect(screen.getByRole('tab', { name: '已平仓订单 · 1' })).toBeTruthy()
  expect(screen.queryByText('LOSSUSDT')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '刷新记录' }))
  await screen.findByText('PROFITUSDT')
  expect(api.getTradingHistory).toHaveBeenLastCalledWith('a', 7, true)
  fireEvent.click(screen.getByRole('tab', { name: '资金账变明细' }))
  expect(await screen.findByText('资金转入 / 转出')).toBeTruthy()
})
it('reports unavailable history without inventing zero income', async () => {
  vi.mocked(api.getTradingHistory).mockRejectedValue(new Error('币安请求超时'))
  render(view())
  expect(await screen.findByText('币安请求超时')).toBeTruthy()
  expect(
    screen.getByText('历史数据未加载成功，不代表没有成交或收益为零。')
  ).toBeTruthy()
  expect(screen.queryByText('+9.10')).toBeNull()
})
