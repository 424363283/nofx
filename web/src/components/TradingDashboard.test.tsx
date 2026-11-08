// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TradingDashboard } from './TradingDashboard'
import type { DecisionRecord } from '../types'
vi.mock('./EquityChart', () => ({ EquityChart: () => <div>收益图表</div> }))
vi.mock('./RadarTradingPanel', () => ({
  RadarTradingPanel: ({ traderId }: { traderId: string }) => (
    <div>异动面板 {traderId}</div>
  ),
}))
vi.mock('./AILearning', () => ({ default: () => <div>复盘内容</div> }))
afterEach(cleanup)

it('orders decisions by time across restarts and keeps the expanded record after refresh', () => {
  const record = (timestamp: string, cycle: number, symbol: string): DecisionRecord => ({
    timestamp, cycle_number: cycle, input_prompt: '', cot_trace: '', decision_json: '',
    account_state: { total_balance: 100, available_balance: 100, total_unrealized_profit: 0, position_count: 0, margin_used_pct: 0 },
    positions: [], candidate_coins: [symbol], decisions: [], execution_log: [], success: true,
  })
  const before = record('2026-11-08T23:31:54+08:00', 6, 'BEFOREUSDT')
  const after = record('2026-11-08T23:34:06+08:00', 1, 'AFTERUSDT')
  const next = record('2026-11-08T23:36:06+08:00', 2, 'NEXTUSDT')
  const props = { selectedTrader: { trader_id: 'demo', trader_name: 'Demo', ai_model: 'deepseek' }, onTraderSelect: vi.fn(), language: 'zh' as const, lastUpdate: '12:00' }
  const { container, rerender } = render(<TradingDashboard {...props} decisions={[before, after]} />)
  fireEvent.click(screen.getByRole('button', { name: /查看决策记录/ }))
  const headings = container.querySelectorAll('.decision-heading strong')
  expect(headings[0].textContent).toContain('23:34:06')
  expect(headings[1].textContent).toContain('23:31:54')
  fireEvent.click(headings[0])
  expect(screen.getByText(/运行内周期 #1/).textContent).toContain('从1计数')
  expect(screen.getByText(/AFTERUSDT/)).toBeTruthy()
  rerender(<TradingDashboard {...props} decisions={[next, before, after]} />)
  expect(screen.getByText(/AFTERUSDT/)).toBeTruthy()
  expect(screen.queryByText(/NEXTUSDT/)).toBeNull()
  expect(container.querySelector('.decision-heading strong')?.textContent).toContain('23:36:06')
})
it('does not show an unconfirmed empty account as no open positions', () => {
  render(<TradingDashboard selectedTrader={{ trader_id: 'demo', trader_name: 'Demo', ai_model: 'deepseek' }} onTraderSelect={vi.fn()} language="zh" lastUpdate="12:00" positionsConfirmed={false} positionStream={{ state: 'reconnecting', warning: '币安请求超时，正在自动重试' }} />)
  expect(screen.getByText('持仓状态暂无法确认')).toBeTruthy()
  expect(screen.queryByText('当前暂无持仓')).toBeNull()
  expect(screen.getByText(/币安请求超时/)).toBeTruthy()
})
it('distinguishes live position updates from a disconnected feed', () => {
  const props = { selectedTrader: { trader_id: 'demo', trader_name: 'Demo', ai_model: 'deepseek' }, onTraderSelect: vi.fn(), language: 'zh' as const, lastUpdate: '12:00', positions: [], decisions: [] }
  const { rerender } = render(<TradingDashboard {...props} positionStream={{ state: 'live', as_of: '2026-11-08T12:00:00Z', snapshot_at: '2026-11-08T11:59:30Z' }} />)
  expect(screen.getByText('持仓变动推送已连接')).toBeTruthy()
  expect(screen.getByText(/未实现盈亏取自币安账户快照/)).toBeTruthy()
  rerender(<TradingDashboard {...props} positionStream={{ state: 'reconnecting', warning: '账户连接中断' }} />)
  expect(screen.queryByText('持仓变动推送已连接')).toBeNull()
  expect(screen.getByText('推送连接中 · 定时更新兜底')).toBeTruthy()
  expect(screen.getByText('账户连接中断')).toBeTruthy()
})
it('keeps positions readable and exposes radar and decision tabs', async () => {
  render(
    <TradingDashboard
      selectedTrader={
        {
          trader_id: 'demo',
          trader_name: '测试策略',
          ai_model: 'deepseek',
        } as any
      }
      onTraderSelect={vi.fn()}
      language="zh"
      lastUpdate="12:00"
      positions={[]}
      decisions={[]}
    />
  )
  expect(screen.getByText('当前暂无持仓')).toBeTruthy()
  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('tab', { name: '异动候选' }))
  expect(await screen.findByText('异动面板 demo')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /查看决策记录/ }))
  expect(
    await screen.findByText('暂无决策记录，交易员运行后会显示在这里')
  ).toBeTruthy()
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))

it('distinguishes a confirmed zero balance from pending data and explains the baseline', () => {
  render(<TradingDashboard
    selectedTrader={{ trader_id: 'demo', trader_name: 'Demo', ai_model: 'deepseek' } as any}
    account={{ total_equity: 0, available_balance: 0, initial_balance: 100,
      total_pnl: -100, total_pnl_pct: -100, position_count: 0, margin_used_pct: 0 } as any}
    onTraderSelect={vi.fn()} language="zh" lastUpdate="12:00" positions={[]} decisions={[]}
  />)
  expect(screen.getByText('账户权益为 0')).toBeTruthy()
  expect(screen.queryByText('等待账户数据')).toBeNull()
  expect(screen.getByText('相对初始资金变化')).toBeTruthy()
  expect(screen.queryByText(/-100.00/)).toBeNull()
  expect(screen.getByText('变化 — · 暂无可展示的资产变化')).toBeTruthy()
  expect(screen.getByText('相对初始资金变化').parentElement?.querySelector('.metric-value')?.textContent).toBe('—USDT')
  expect(screen.getByText(/不能直接视为交易盈亏/)).toBeTruthy()
})

for (const equity of [80, 120]) {
  it(`preserves capital changes for a funded account with equity ${equity}`, () => {
    render(<TradingDashboard
      selectedTrader={{ trader_id: 'demo', trader_name: 'Demo', ai_model: 'deepseek' } as any}
      account={{ total_equity: equity, available_balance: equity, initial_balance: 100,
        total_pnl: equity - 100, total_pnl_pct: equity - 100, position_count: 0, margin_used_pct: 0 } as any}
      onTraderSelect={vi.fn()} language="en" lastUpdate="12:00" positions={[]} decisions={[]}
    />)
    expect(screen.getByText(`Change ${equity > 100 ? '+' : ''}${(equity - 100).toFixed(2)}% · Baseline 100.00 USDT`)).toBeTruthy()
  })
}
