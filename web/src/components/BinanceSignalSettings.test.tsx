// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  BinanceSignalSettings,
  defaultSignalConfig,
} from './BinanceSignalSettings'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('previews selected equity scope without saving or placing orders', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          symbol: 'TSLAUSDT',
          quote_volume: 100,
          reasons: ['24小时成交额排名'],
        },
      ],
      warnings: [],
      scanned: 1,
      as_of: new Date().toISOString(),
    }),
  })
  vi.stubGlobal('fetch', fetcher)
  const change = vi.fn()
  const value = { ...defaultSignalConfig, enabled: true, category: 'equity' }
  const { rerender } = render(
    <BinanceSignalSettings
      value={value}
      onChange={change}
      exchange="binance"
      symbols="TSLAUSDT"
    />
  )
  fireEvent.click(screen.getByRole('button', { name: '预览信号（不下单）' }))
  await screen.findByText('TSLAUSDT')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][0]).toBe('/api/market/signals/preview')
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    config: { category: 'equity' },
    symbols: 'TSLAUSDT',
  })
  expect(change).not.toHaveBeenCalled()
  rerender(
    <BinanceSignalSettings
      value={value}
      onChange={change}
      exchange="binance"
      symbols="BTCUSDT"
    />
  )
  expect(screen.queryByText('TSLAUSDT')).toBeNull()
})
it('does not enable Binance signals on other exchanges', () => {
  render(
    <BinanceSignalSettings onChange={vi.fn()} exchange="aster" symbols="" />
  )
  expect(
    (
      screen.getByRole('checkbox', {
        name: '启用币安行情筛选',
      }) as HTMLInputElement
    ).disabled
  ).toBe(true)
})

it('enables the radar pool without changing existing filters', () => {
  const change = vi.fn()
  render(
    <BinanceSignalSettings
      onChange={change}
      exchange="binance"
      symbols="BTCUSDT"
    />
  )
  fireEvent.click(
    screen.getByRole('checkbox', { name: '异动合约自动纳入候选池' })
  )
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({ radar_enabled: true, enabled: false })
  )
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
