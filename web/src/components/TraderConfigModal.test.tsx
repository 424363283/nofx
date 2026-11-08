// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TraderConfigModal } from './TraderConfigModal'
import { LanguageProvider } from '../contexts/LanguageContext'
vi.mock('../lib/crypto', () => ({ CryptoService: {} }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('preserves input on model refresh and displays save errors without closing', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ templates: [{ name: 'default' }] }),
      })
  )
  const close = vi.fn()
  const save = vi
    .fn()
    .mockRejectedValue(new Error('无效的币种格式: TSLA，必须以USDT结尾'))
  const models = [
    { id: 'model', name: 'Model', provider: 'deepseek', enabled: true },
  ]
  const exchanges = [
    { id: 'binance', name: 'Binance', type: 'cex', enabled: true },
  ]
  const view = (m = models) => (
    <LanguageProvider>
      <TraderConfigModal
        isOpen
        onClose={close}
        onSave={save}
        availableModels={m}
        availableExchanges={exchanges}
      />
    </LanguageProvider>
  )
  const { rerender } = render(view())
  fireEvent.change(screen.getByPlaceholderText('请输入交易员名称'), {
    target: { value: '测试策略' },
  })
  const interval = screen.getByLabelText('AI 扫描决策间隔 (分钟)') as HTMLInputElement
  fireEvent.change(interval, { target: { value: '1' } })
  expect(interval.value).toBe('1')
  fireEvent.change(
    screen.getByPlaceholderText('例如: BTCUSDT,ETHUSDT,ADAUSDT'),
    { target: { value: 'tslausdt，nvdausdt' } }
  )
  rerender(view([...models]))
  expect(
    (screen.getByPlaceholderText('请输入交易员名称') as HTMLInputElement).value
  ).toBe('测试策略')
  fireEvent.click(screen.getByRole('button', { name: '创建交易员' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    '无效的币种格式'
  )
  expect(close).not.toHaveBeenCalled()
  expect(save.mock.calls[0][0].trading_symbols).toBe('TSLAUSDT,NVDAUSDT')
  expect(save.mock.calls[0][0].scan_interval_minutes).toBe(1)
})
it('uses an accessible Ant modal and closes with Escape', () => {
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({templates:[]})}))
 const close=vi.fn()
 render(<LanguageProvider><TraderConfigModal isOpen onClose={close}/></LanguageProvider>)
 const dialog=screen.getByRole('dialog')
 expect(dialog.getAttribute('aria-modal')).toBe('true')
 fireEvent.keyDown(dialog,{key:'Escape',keyCode:27})
 expect(close).toHaveBeenCalledOnce()
})
