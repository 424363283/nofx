// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { SWRConfig } from 'swr'
import { App } from 'antd'
import { RadarTradingPanel } from './RadarTradingPanel'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({
  api: { getRadarPool: vi.fn(), setRadarPool: vi.fn() },
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('shows equity anomalies and persists only the explicit pool toggle', async () => {
  const data = {
    enabled: false,
    supported: true,
    warning: '',
    items: [
      {
        symbol: 'TSLAUSDT',
        category: 'equity',
        bias: 'bull',
        signals: [{ kind: 'macd', label: 'MACD 金叉' }],
      },
    ],
  }
  vi.mocked(api.getRadarPool).mockImplementation(async () => data)
  vi.mocked(api.setRadarPool).mockImplementation(async (_id, enabled) => {
    data.enabled = enabled
    return { enabled }
  })
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App>
        <RadarTradingPanel traderId="fixture" />
      </App>
    </SWRConfig>
  )
  await screen.findByText('TSLAUSDT')
  expect(api.setRadarPool).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: '异动合约参与交易' }))
  await waitFor(() =>
    expect(api.setRadarPool).toHaveBeenCalledWith('fixture', true)
  )
  await waitFor(() =>
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
      true
    )
  )
})
it('keeps the pool unchecked when saving fails', async () => {
  vi.mocked(api.getRadarPool).mockResolvedValue({
    enabled: false,
    supported: true,
    warning: '',
    items: [],
  })
  vi.mocked(api.setRadarPool).mockRejectedValue(new Error('保存失败'))
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <App>
        <RadarTradingPanel traderId="fixture" />
      </App>
    </SWRConfig>
  )
  await waitFor(() =>
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      false
    )
  )
  fireEvent.click(screen.getByRole('checkbox'))
  await screen.findByText('保存失败')
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
