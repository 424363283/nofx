// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, it, expect, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { LanguageProvider, useLanguage } from '../contexts/LanguageContext'
import { DesignProvider } from './design/DesignProvider'
import { TradersManagementView } from './TradersManagementView'
import { TraderConfigModal } from './TraderConfigModal'
import { marketText } from '../i18n/uiText'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})
function Workspace() {
  const { language, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const noop = () => {}
  const models = [
    { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', enabled: true },
  ]
  const exchanges = [
    { id: 'binance', name: 'Binance', type: 'cex' as const, enabled: true },
  ]
  return (
    <>
      <button onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}>
        Switch language
      </button>
      <TradersManagementView
        traders={[]}
        models={models}
        exchanges={exchanges}
        modelInUse={() => false}
        exchangeInUse={() => false}
        onModel={noop}
        onExchange={noop}
        onAddModel={noop}
        onAddExchange={noop}
        onLegacy={noop}
        onCreate={() => setOpen(true)}
        onView={noop}
        onEdit={noop}
        onToggle={noop}
        onDelete={noop}
        legacyWarning={false}
      />
      <TraderConfigModal
        isOpen={open}
        onClose={() => setOpen(false)}
        availableModels={models}
        availableExchanges={exchanges}
      />
    </>
  )
}
it('switches the configuration page and create dialog, and persists the selected locale', async () => {
  localStorage.setItem('language', 'zh')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ templates: [{ name: 'default' }] }),
    })
  )
  const show = () =>
    render(
      <LanguageProvider>
        <DesignProvider>
          <Workspace />
        </DesignProvider>
      </LanguageProvider>
    )
  const first = show()
  expect(screen.getByText('策略管理')).toBeTruthy()
  fireEvent.click(screen.getByText('Switch language'))
  expect(screen.getByRole('heading', { name: 'AI traders' })).toBeTruthy()
  expect(screen.getByText('No traders yet')).toBeTruthy()
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/)
  expect(localStorage.getItem('language')).toBe('en')
  expect(document.documentElement.lang).toBe('en')
  fireEvent.click(screen.getByRole('button', { name: /Create trader$/ }))
  expect(await screen.findByText('Configure a new AI trader')).toBeTruthy()
  await waitFor(() =>
    expect(
      screen.getByText(
        'Guanlan perpetuals · Trend and risk management (default)'
      )
    ).toBeTruthy()
  )
  expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/)
  first.unmount()
  show()
  expect(screen.getByText('No traders yet')).toBeTruthy()
  fireEvent.click(screen.getByText('Switch language'))
  expect(screen.getByText('还没有交易员')).toBeTruthy()
})
it('localizes generated market evidence without changing its numeric values', () => {
  expect(marketText('放量 2.30 倍', 'en')).toBe('Volume 2.30×')
  expect(marketText('MACD 金叉', 'en')).toBe('MACD bullish crossover')
  expect(marketText('持仓量减少 -3.40%', 'en')).toBe('OI decrease -3.40%')
  expect(marketText('报价超过90秒或时间异常', 'en')).toBe(
    'Quote older than 90 seconds or invalid timestamp'
  )
})
