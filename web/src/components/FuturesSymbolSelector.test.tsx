// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FuturesSymbolSelector } from './FuturesSymbolSelector'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('searches the fetched contracts and toggles a selection', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ symbols: ['BTCUSDT', 'ETHUSDT'] }),
    })
  )
  const toggle = vi.fn()
  render(<FuturesSymbolSelector selected={['BTCUSDT']} onToggle={toggle} />)
  expect(
    (await screen.findByRole('button', { name: 'BTCUSDT' })).getAttribute(
      'aria-pressed'
    )
  ).toBe('true')
  fireEvent.change(screen.getByLabelText('搜索合约'), {
    target: { value: 'eth' },
  })
  expect(screen.queryByRole('button', { name: 'BTCUSDT' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'ETHUSDT' }))
  expect(toggle).toHaveBeenCalledWith('ETHUSDT')
})
it('shows a retryable error without changing existing selections', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ symbols: ['BTCUSDT'] }),
    })
  vi.stubGlobal('fetch', fetcher)
  const toggle = vi.fn()
  render(<FuturesSymbolSelector selected={['BTCUSDT']} onToggle={toggle} />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '刷新列表' }))
  expect(
    (await screen.findByRole('button', { name: 'BTCUSDT' })).getAttribute(
      'aria-pressed'
    )
  ).toBe('true')
  expect(toggle).not.toHaveBeenCalled()
})

it('filters equity contracts without confusing crypto symbols with stock indices', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        symbols: ['SPXUSDT', 'TSLAUSDT', 'NVDAUSDT'],
        categories: {
          SPXUSDT: 'crypto',
          TSLAUSDT: 'equity',
          NVDAUSDT: 'equity',
        },
      }),
    })
  )
  render(<FuturesSymbolSelector selected={[]} onToggle={vi.fn()} />)
  await screen.findByRole('button', { name: 'TSLAUSDT' })
  fireEvent.click(screen.getByRole('button', { name: '美股 / ETF (2)' }))
  expect(screen.queryByRole('button', { name: 'SPXUSDT' })).toBeNull()
  expect(screen.getByRole('button', { name: 'NVDAUSDT' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('搜索合约'), {
    target: { value: 'tsla' },
  })
  expect(screen.queryByRole('button', { name: 'NVDAUSDT' })).toBeNull()
  expect(screen.getByRole('button', { name: 'TSLAUSDT' })).toBeTruthy()
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
