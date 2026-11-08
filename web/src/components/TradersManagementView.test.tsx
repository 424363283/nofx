// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { TradersManagementView } from './TradersManagementView'
afterEach(cleanup)
function props() {
  return {
    traders: [
      {
        trader_id: 'demo',
        trader_name: '稳健策略',
        ai_model: 'deepseek',
        exchange_id: 'binance',
        is_running: false,
      },
    ],
    models: [
      { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', enabled: true },
    ],
    exchanges: [{ id: 'binance', name: 'Binance', type: 'cex', enabled: true }],
    modelInUse: () => false,
    exchangeInUse: () => false,
    onModel: vi.fn(),
    onExchange: vi.fn(),
    onAddModel: vi.fn(),
    onAddExchange: vi.fn(),
    onLegacy: vi.fn(),
    onCreate: vi.fn(),
    onView: vi.fn(),
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    legacyWarning: false,
  }
}
it('filters traders without triggering trading actions', () => {
  const p = props()
  render(<TradersManagementView {...p} />)
  fireEvent.click(screen.getByRole('radio', { name: '运行中' }))
  expect(screen.getByText('没有匹配的交易员')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: '全部策略' }))
  fireEvent.change(screen.getByRole('textbox', { name: '搜索交易员' }), {
    target: { value: '不存在' },
  })
  expect(screen.getByText('没有匹配的交易员')).toBeTruthy()
  expect(p.onToggle).not.toHaveBeenCalled()
  expect(p.onDelete).not.toHaveBeenCalled()
})
it('preserves edit and workspace callbacks while blocking creation without prerequisites', () => {
  const p = props()
  const { rerender } = render(<TradersManagementView {...p} />)
  fireEvent.click(screen.getByRole('button', { name: /编辑/ }))
  expect(p.onEdit).toHaveBeenCalledWith('demo')
  fireEvent.click(screen.getByRole('button', { name: '工作台' }))
  expect(p.onView).toHaveBeenCalledWith('demo')
  rerender(<TradersManagementView {...p} models={[]} />)
  expect(
    (screen.getByRole('button', { name: /创建交易员/ }) as HTMLButtonElement)
      .disabled
  ).toBe(true)
})

vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'zh', setLanguage: vi.fn() }) }))
