// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { PaperDetails, SimilarSignals } from './SignalResearch'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('shows why a signal is excluded rather than implying a trade', () => {
  render(
    <PaperDetails
      trial={{ status: 'skipped', reason: '报价超过90秒或时间异常' }}
    />
  )
  expect(screen.getByText('报价超过90秒或时间异常')).toBeTruthy()
  expect(screen.queryByText('模拟收益 · 未计资金费')).toBeNull()
})
it('discloses ambiguous stop execution and the funding exclusion', () => {
  render(
    <PaperDetails
      trial={{
        status: 'complete',
        reason: 'stop',
        net_pct: -1.12,
        gross_pct: -1.02,
        fees_pct: 0.1,
        ambiguous: true,
      }}
    />
  )
  expect(
    screen.getByText('同一分钟触及止盈和止损，按止损先发生计算。')
  ).toBeTruthy()
  expect(screen.getByText('模拟收益 · 未计资金费')).toBeTruthy()
  expect(screen.getAllByText('-1.12%').length).toBeGreaterThan(0)
})
it('does not invent a win rate without prior settled samples', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          as_of: '2026-11-08T10:00:00Z',
          matched: 5,
          symbols: 2,
          stats: [{ minutes: 60, completed: 0, positive: 0, mean_pct: null }],
          paper: { completed: 0, positive: 0, mean_pct: null },
        }),
      })
  )
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SimilarSignals id={4} />
    </SWRConfig>
  )
  expect(await screen.findByText('样本不足，不能据此判断交易优势')).toBeTruthy()
  expect(screen.queryByText('0.0%')).toBeNull()
  expect(screen.getByText('0 条')).toBeTruthy()
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
