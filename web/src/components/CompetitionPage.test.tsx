// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { App } from 'antd'
import { CompetitionPage } from './CompetitionPage'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({
  api: { getCompetition: vi.fn(), getTraderConfig: vi.fn() },
}))
vi.mock('./ComparisonChart', () => ({
  ComparisonChart: () => <div>历史曲线</div>,
}))
vi.mock('./TraderConfigViewModal', () => ({
  TraderConfigViewModal: () => null,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function show() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App>
        <CompetitionPage />
      </App>
    </SWRConfig>
  )
}
it('sorts performance and retains readable stopped status', async () => {
  const base = {
    ai_model: 'deepseek',
    exchange: 'binance',
    total_equity: 100,
    total_pnl: 0,
    position_count: 0,
    margin_used_pct: 0,
    is_running: false,
  }
  vi.mocked(api.getCompetition).mockResolvedValue({
    count: 2,
    traders: [
      { ...base, trader_id: 'a', trader_name: '策略A', total_pnl_pct: 0 },
      { ...base, trader_id: 'b', trader_name: '策略B', total_pnl_pct: 2 },
    ],
  })
  show()
  await screen.findByText('历史曲线')
  const rows = within(screen.getByRole('table')).getAllByRole('row')
  expect(rows[1].textContent).toContain('策略B')
  expect(rows[2].textContent).toContain('策略A')
  expect(within(rows[2]).getAllByText('0.00%').length).toBeGreaterThan(0)
  expect(within(rows[2]).getByText('已停止')).toBeTruthy()
})
it('shows a clear error instead of an endless skeleton', async () => {
  vi.mocked(api.getCompetition).mockRejectedValue(new Error('offline'))
  show()
  expect(await screen.findByText('数据更新失败')).toBeTruthy()
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
