// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import SignalArchivePage from './SignalArchivePage'
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}))
vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }),
}))
vi.mock('../components/landing/HeaderBar', () => ({ default: () => null }))
vi.mock('../components/SignalResearch', async (original) => ({
  ...(await original<typeof import('../components/SignalResearch')>()),
  SimilarSignals: () => null,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('keeps incomplete outcomes distinct and exposes original evidence', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 1,
        stats: [
          { minutes: 60, completed: 0, positive: 0, mean_return_pct: null },
        ],
        items: [
          {
            id: 1,
            recorded_at: '2026-11-08T10:00:00Z',
            version: 'radar-v1',
            snapshot: {
              symbol: 'TESTUSDT',
              category: 'equity',
              price: 100,
              bias: 'bull',
              signals: [
                { kind: 'volume', label: '放量测试', direction: 'bull' },
              ],
              notes: ['OI 缺失'],
            },
            outcomes: [
              { minutes: 15, status: 'pending' },
              { minutes: 60, status: 'unavailable', error: '分钟行情不完整' },
              { minutes: 240, status: 'pending' },
            ],
          },
        ],
      }),
    })
  )
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SignalArchivePage />
    </SWRConfig>
  )
  expect(await screen.findByText('TESTUSDT')).toBeTruthy()
  expect(screen.getAllByText('待观察')).toHaveLength(2)
  expect(screen.getByText('数据待补齐')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '详情' }))
  expect(await screen.findByText('OI 缺失')).toBeTruthy()
  expect(screen.getByText(/行情待补齐，自动重试/)).toBeTruthy()
})
