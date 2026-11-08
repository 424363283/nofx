// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExchangeConfigModal } from './AITradersPage'
import { LanguageProvider } from '../contexts/LanguageContext'
import { DesignProvider } from './design/DesignProvider'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: {
  getServerIP: vi.fn().mockResolvedValue({ public_ip: '203.0.113.42', message: '' }),
  getExchangeCredentials: vi.fn().mockResolvedValue({ id: 'binance', apiKey: 'demo-api-key', secretKey: 'demo-secret-key', testnet: false }),
} }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows editable plain-text credentials and preserves the save contract', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<LanguageProvider><DesignProvider><ExchangeConfigModal
    allExchanges={[{ id: 'binance', name: 'Binance', type: 'cex', enabled: true }]}
    editingExchangeId="binance" language="zh" onSave={save} onDelete={vi.fn()} onClose={vi.fn()}
  /></DesignProvider></LanguageProvider>)
  const key = screen.getByRole('textbox', { name: 'API Key' }) as HTMLInputElement
  const secret = screen.getByRole('textbox', { name: 'Secret Key' }) as HTMLInputElement
  await waitFor(() => expect(secret.value).toBe('demo-secret-key'))
  expect(api.getExchangeCredentials).toHaveBeenCalledWith('binance')
  expect(key.type).toBe('text')
  expect(secret.type).toBe('text')
  expect(secret.autocomplete).toBe('off')
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(key, { target: { value: ' demo-new-api ' } })
  fireEvent.change(secret, { target: { value: ' demo-new-secret ' } })
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('binance', 'demo-new-api', 'demo-new-secret', false))
})

it('does not allow empty saved credentials to be overwritten after a loading failure', async () => {
  vi.mocked(api.getExchangeCredentials).mockRejectedValueOnce(new Error('unavailable'))
  const save = vi.fn()
  render(<LanguageProvider><DesignProvider><ExchangeConfigModal
    allExchanges={[{ id: 'binance', name: 'Binance', type: 'cex', enabled: true }]}
    editingExchangeId="binance" language="zh" onSave={save} onDelete={vi.fn()} onClose={vi.fn()}
  /></DesignProvider></LanguageProvider>)
  expect(await screen.findByText(/当前空白不代表原配置为空/)).toBeTruthy()
  expect((screen.getByRole('button', { name: '保存配置' }) as HTMLButtonElement).disabled).toBe(true)
  expect(save).not.toHaveBeenCalled()
})
