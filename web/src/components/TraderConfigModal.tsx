import { uiText } from '../i18n/uiText'
import { UiCard } from './design/Controls'
import {
  UiDialog,
  UiButton,
  UiInput,
  UiSelect,
  UiTextarea,
  UiAlert,
} from './design/Controls'
import { Settings2, SlidersHorizontal, MessageSquare } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import {
  BinanceSignalSettings,
  defaultSignalConfig,
  type SignalConfig,
} from './BinanceSignalSettings'
import { FuturesSymbolSelector } from './FuturesSymbolSelector'
import type { AIModel, Exchange, CreateTraderRequest } from '../types'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'

// 提取下划线后面的名称部分
function getShortName(fullName: string): string {
  const parts = fullName.split('_')
  return parts.length > 1 ? parts[parts.length - 1] : fullName
}

interface TraderConfigData {
  signal_config?: SignalConfig
  trader_id?: string
  trader_name: string
  ai_model: string
  exchange_id: string
  btc_eth_leverage: number
  altcoin_leverage: number
  trading_symbols: string
  custom_prompt: string
  override_base_prompt: boolean
  system_prompt_template: string
  is_cross_margin: boolean
  use_coin_pool: boolean
  use_oi_top: boolean
  initial_balance: number
  scan_interval_minutes: number
}

interface TraderConfigModalProps {
  isOpen: boolean
  onClose: () => void
  traderData?: TraderConfigData | null
  isEditMode?: boolean
  availableModels?: AIModel[]
  availableExchanges?: Exchange[]
  onSave?: (data: CreateTraderRequest) => Promise<void>
}

export function TraderConfigModal({
  isOpen,
  onClose,
  traderData,
  isEditMode = false,
  availableModels = [],
  availableExchanges = [],
  onSave,
}: TraderConfigModalProps) {
  const { language } = useLanguage()
  const [formData, setFormData] = useState<TraderConfigData>({
    signal_config: { ...defaultSignalConfig },
    trader_name: '',
    ai_model: '',
    exchange_id: '',
    btc_eth_leverage: 5,
    altcoin_leverage: 3,
    trading_symbols: '',
    custom_prompt: '',
    override_base_prompt: false,
    system_prompt_template: 'default',
    is_cross_margin: true,
    use_coin_pool: false,
    use_oi_top: false,
    initial_balance: 1000,
    scan_interval_minutes: 3,
  })
  const initialized = useRef<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const selectedCoins = formData.trading_symbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const [showCoinSelector, setShowCoinSelector] = useState(false)
  const [promptTemplates, setPromptTemplates] = useState<{ name: string }[]>([])
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)
  const [balanceFetchError, setBalanceFetchError] = useState<string>('')

  useEffect(() => {
    if (!isOpen) {
      initialized.current = null
      return
    }
    const key = isEditMode ? traderData?.trader_id || 'edit' : 'create'
    if (initialized.current === key) return
    initialized.current = key
    setSaveError('')
    if (traderData) {
      setFormData(traderData)
    } else if (!isEditMode) {
      setFormData({
        signal_config: { ...defaultSignalConfig },
        trader_name: '',
        ai_model: availableModels[0]?.id || '',
        exchange_id: availableExchanges[0]?.id || '',
        btc_eth_leverage: 5,
        altcoin_leverage: 3,
        trading_symbols: '',
        custom_prompt: '',
        override_base_prompt: false,
        system_prompt_template: 'default',
        is_cross_margin: true,
        use_coin_pool: false,
        use_oi_top: false,
        initial_balance: 1000,
        scan_interval_minutes: 3,
      })
    }
    // 确保旧数据也有默认的 system_prompt_template
    if (traderData && traderData.system_prompt_template === undefined) {
      setFormData((prev) => ({
        ...prev,
        system_prompt_template: 'default',
      }))
    }
  }, [isOpen, traderData, isEditMode, availableModels, availableExchanges])

  // 获取系统提示词模板列表
  useEffect(() => {
    const fetchPromptTemplates = async () => {
      try {
        const response = await fetch('/api/prompt-templates')
        const data = await response.json()
        if (data.templates) {
          setPromptTemplates(data.templates)
        }
      } catch (error) {
        console.error('Failed to fetch prompt templates:', error)
        // 使用默认模板列表
        setPromptTemplates([{ name: 'default' }])
      }
    }
    fetchPromptTemplates()
  }, [])

  if (!isOpen) return null

  const handleInputChange = (field: keyof TraderConfigData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleCoinToggle = (coin: string) => {
    setFormData((prev) => {
      const coins = prev.trading_symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
      return {
        ...prev,
        trading_symbols: (coins.includes(coin)
          ? coins.filter((c) => c !== coin)
          : [...coins, coin]
        ).join(','),
      }
    })
  }

  const handleFetchCurrentBalance = async () => {
    if (!isEditMode || !traderData?.trader_id) {
      setBalanceFetchError(uiText('只有在编辑模式下才能获取当前余额', language))
      return
    }

    setIsFetchingBalance(true)
    setBalanceFetchError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        `/api/account?trader_id=${traderData.trader_id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(uiText('获取账户余额失败', language))
      }

      const data = await response.json()

      // total_equity = 当前账户净值（包含未实现盈亏）
      // 这应该作为新的初始余额
      const currentBalance = data.total_equity || data.balance || 0

      setFormData((prev) => ({ ...prev, initial_balance: currentBalance }))

      // 显示成功提示
      console.log(uiText('已获取当前余额:', language), currentBalance)
    } catch (error) {
      console.error(uiText('获取余额失败:', language), error)
      setBalanceFetchError(uiText('获取余额失败，请检查网络连接', language))
    } finally {
      setIsFetchingBalance(false)
    }
  }

  const handleSave = async () => {
    if (!onSave) return

    setSaveError('')
    setIsSaving(true)
    try {
      if (!formData.trader_name.trim())
        throw new Error(uiText('请输入交易员名称', language))
      const saveData: CreateTraderRequest = {
        name: formData.trader_name.trim(),
        ai_model_id: formData.ai_model,
        exchange_id: formData.exchange_id,
        btc_eth_leverage: formData.btc_eth_leverage,
        altcoin_leverage: formData.altcoin_leverage,
        trading_symbols: formData.trading_symbols
          .split(/[,，;；\s]+/)
          .filter(Boolean)
          .map((s) => s.toUpperCase())
          .join(','),
        custom_prompt: formData.custom_prompt,
        override_base_prompt: formData.override_base_prompt,
        system_prompt_template: formData.system_prompt_template,
        is_cross_margin: formData.is_cross_margin,
        use_coin_pool: false,
        signal_config: formData.signal_config || defaultSignalConfig,
        use_oi_top: false,
        initial_balance: formData.initial_balance,
        scan_interval_minutes: formData.scan_interval_minutes,
      }
      await onSave(saveData)
      onClose()
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : uiText('保存失败，请重试', language)
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <UiDialog onClose={isSaving ? undefined : onClose} width={880}>
      <div
        aria-labelledby="trader-config-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="desk-dialog-header">
          <div className="flex items-center gap-3">
            <div className="desk-icon">
              <Settings2 size={20} />
            </div>
            <div>
              <h2
                id="trader-config-title"
                className="text-xl font-bold text-[var(--foreground)]"
              >
                {isEditMode
                  ? uiText('修改交易员', language)
                  : uiText('创建交易员', language)}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {isEditMode
                  ? uiText('修改交易员配置参数', language)
                  : uiText('配置新的AI交易员', language)}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="desk-dialog-body space-y-6">
          {/* Basic Info */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-5 flex items-center gap-2">
              <Settings2 size={18} className="text-[var(--binance-yellow)]" />{' '}
              {uiText('基础配置', language)}{' '}
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="trader-field-1"
                  className="text-sm text-[var(--foreground)] block mb-2"
                >
                  {uiText('交易员名称', language)}{' '}
                </label>
                <UiInput
                  id="trader-field-1"
                  type="text"
                  value={formData.trader_name}
                  onChange={(e) =>
                    handleInputChange('trader_name', e.target.value)
                  }
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                  placeholder={uiText('请输入交易员名称', language)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="trader-field-2"
                    className="text-sm text-[var(--foreground)] block mb-2"
                  >
                    {uiText('AI模型', language)}{' '}
                  </label>
                  <UiSelect
                    id="trader-field-2"
                    value={formData.ai_model}
                    onChange={(e) =>
                      handleInputChange('ai_model', e.target.value)
                    }
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                  >
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {getShortName(model.name || model.id).toUpperCase()}
                      </option>
                    ))}
                  </UiSelect>
                </div>
                <div>
                  <label
                    htmlFor="trader-field-3"
                    className="text-sm text-[var(--foreground)] block mb-2"
                  >
                    {uiText('交易所', language)}{' '}
                  </label>
                  <UiSelect
                    id="trader-field-3"
                    value={formData.exchange_id}
                    onChange={(e) =>
                      handleInputChange('exchange_id', e.target.value)
                    }
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                  >
                    {availableExchanges.map((exchange) => (
                      <option key={exchange.id} value={exchange.id}>
                        {getShortName(
                          exchange.name || exchange.id
                        ).toUpperCase()}
                      </option>
                    ))}
                  </UiSelect>
                </div>
              </div>
            </div>
          </UiCard>

          {/* Trading Configuration */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-5 flex items-center gap-2">
              <SlidersHorizontal
                size={18}
                className="text-[var(--binance-yellow)]"
              />{' '}
              {uiText('交易配置', language)}{' '}
            </h3>
            <div className="space-y-4">
              {/* 第一行：保证金模式和初始余额 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[var(--foreground)] block mb-2">
                    {uiText('保证金模式', language)}{' '}
                  </label>
                  <div className="flex gap-2">
                    <UiButton
                      type="button"
                      onClick={() => handleInputChange('is_cross_margin', true)}
                      className={`flex-1 px-3 py-2 rounded text-sm ${
                        formData.is_cross_margin
                          ? 'bg-[var(--binance-yellow)] text-black'
                          : 'bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--panel-border)]'
                      }`}
                    >
                      {uiText('全仓', language)}{' '}
                    </UiButton>
                    <UiButton
                      type="button"
                      onClick={() =>
                        handleInputChange('is_cross_margin', false)
                      }
                      className={`flex-1 px-3 py-2 rounded text-sm ${
                        !formData.is_cross_margin
                          ? 'bg-[var(--binance-yellow)] text-black'
                          : 'bg-[var(--background)] text-[var(--text-secondary)] border border-[var(--panel-border)]'
                      }`}
                    >
                      {uiText('逐仓', language)}{' '}
                    </UiButton>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-[var(--foreground)]">
                      {uiText('初始余额 ($)', language)}{' '}
                      {!isEditMode && (
                        <span className="text-[var(--binance-yellow)] ml-1">
                          *
                        </span>
                      )}
                    </label>
                    {isEditMode && (
                      <UiButton
                        type="button"
                        onClick={handleFetchCurrentBalance}
                        disabled={isFetchingBalance}
                        className="px-3 py-1 text-xs bg-[var(--binance-yellow)] text-black rounded hover:bg-[#10b981] transition-colors disabled:bg-[var(--text-secondary)] disabled:cursor-not-allowed"
                      >
                        {isFetchingBalance
                          ? uiText('获取中...', language)
                          : uiText('获取当前余额', language)}
                      </UiButton>
                    )}
                  </div>
                  <UiInput
                    type="number"
                    value={formData.initial_balance}
                    onChange={(e) =>
                      handleInputChange(
                        'initial_balance',
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                    min="100"
                    step="0.01"
                  />
                  {!isEditMode && (
                    <p className="text-xs text-[var(--binance-yellow)] mt-1 flex items-center gap-1">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        <line x1="12" x2="12" y1="9" y2="13" />
                        <line x1="12" x2="12.01" y1="17" y2="17" />
                      </svg>
                      {uiText(
                        '请输入您交易所账户的当前实际余额。如果输入不准确，P&L统计将会错误。',
                        language
                      )}{' '}
                    </p>
                  )}
                  {isEditMode && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {uiText(
                        '点击"获取当前余额"按钮可自动获取您交易所账户的当前净值',
                        language
                      )}{' '}
                    </p>
                  )}
                  {balanceFetchError && (
                    <p className="text-xs text-red-500 mt-1">
                      {balanceFetchError}
                    </p>
                  )}
                </div>
              </div>

              {/* 第二行：AI 扫描决策间隔 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="trader-field-4"
                    className="text-sm text-[var(--foreground)] block mb-2"
                  >
                    {t('aiScanInterval', language)}
                  </label>
                  <UiInput
                    id="trader-field-4"
                    type="number"
                    value={formData.scan_interval_minutes}
                    onChange={(e) => {
                      const parsedValue = Number(e.target.value)
                      const safeValue = Number.isFinite(parsedValue)
                        ? Math.min(60, Math.max(1, Math.trunc(parsedValue)))
                        : 3
                      handleInputChange('scan_interval_minutes', safeValue)
                    }}
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                    min="1"
                    max="60"
                    step="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('scanIntervalRecommend', language)}
                  </p>
                </div>
                <div></div>
              </div>

              {/* 第三行：杠杆设置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="trader-field-5"
                    className="text-sm text-[var(--foreground)] block mb-2"
                  >
                    {uiText('BTC/ETH 杠杆', language)}{' '}
                  </label>
                  <UiInput
                    id="trader-field-5"
                    type="number"
                    value={formData.btc_eth_leverage}
                    onChange={(e) =>
                      handleInputChange(
                        'btc_eth_leverage',
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                    min="1"
                    max="125"
                  />
                </div>
                <div>
                  <label
                    htmlFor="trader-field-6"
                    className="text-sm text-[var(--foreground)] block mb-2"
                  >
                    {uiText('山寨币杠杆', language)}{' '}
                  </label>
                  <UiInput
                    id="trader-field-6"
                    type="number"
                    value={formData.altcoin_leverage}
                    onChange={(e) =>
                      handleInputChange(
                        'altcoin_leverage',
                        Number(e.target.value)
                      )
                    }
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                    min="1"
                    max="75"
                  />
                </div>
              </div>

              {/* 第三行：交易币种 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-[var(--foreground)]">
                    {uiText(
                      '交易币种 (用逗号分隔，留空使用默认)',
                      language
                    )}{' '}
                  </label>
                  <UiButton
                    type="button"
                    onClick={() => setShowCoinSelector(!showCoinSelector)}
                    className="px-3 py-1 text-xs bg-[var(--binance-yellow)] text-black rounded hover:bg-[#10b981] transition-colors"
                  >
                    {showCoinSelector
                      ? uiText('收起选择', language)
                      : uiText('快速选择', language)}
                  </UiButton>
                </div>
                <UiInput
                  type="text"
                  value={formData.trading_symbols}
                  onChange={(e) =>
                    handleInputChange('trading_symbols', e.target.value)
                  }
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                  placeholder={uiText(
                    '例如: BTCUSDT,ETHUSDT,ADAUSDT',
                    language
                  )}
                />

                {/* 币种选择器 */}
                {showCoinSelector && (
                  <FuturesSymbolSelector
                    selected={selectedCoins}
                    onToggle={handleCoinToggle}
                  />
                )}
              </div>
            </div>
          </UiCard>

          <BinanceSignalSettings
            value={formData.signal_config}
            symbols={formData.trading_symbols}
            exchange={formData.exchange_id}
            onChange={(value) => handleInputChange('signal_config', value)}
          />

          {/* Trading Prompt */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-5 flex items-center gap-2">
              <MessageSquare
                size={18}
                className="text-[var(--binance-yellow)]"
              />{' '}
              {uiText('交易策略提示词', language)}{' '}
            </h3>
            <div className="space-y-4">
              {/* 系统提示词模板选择 */}
              <div>
                <label
                  htmlFor="trader-field-7"
                  className="text-sm text-[var(--foreground)] block mb-2"
                >
                  {uiText('系统提示词模板', language)}{' '}
                </label>
                <UiSelect
                  id="trader-field-7"
                  value={formData.system_prompt_template}
                  onChange={(e) =>
                    handleInputChange('system_prompt_template', e.target.value)
                  }
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
                >
                  {promptTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name === 'default'
                        ? uiText('观澜永续 · 趋势与风控（默认）', language)
                        : template.name === 'aggressive'
                          ? uiText('Aggressive (激进)', language)
                          : template.name.charAt(0).toUpperCase() +
                            template.name.slice(1)}
                    </option>
                  ))}
                </UiSelect>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {uiText(
                    '默认策略：趋势确认与量价验证，单笔风险预算 0.5%，杠杆上限 3 倍。不满足条件时观望；策略尚需模拟验证。',
                    language
                  )}{' '}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <UiInput
                  id="override-base-prompt"
                  type="checkbox"
                  checked={formData.override_base_prompt}
                  onChange={(e) =>
                    handleInputChange('override_base_prompt', e.target.checked)
                  }
                  className="w-4 h-4"
                />
                <label
                  htmlFor="override-base-prompt"
                  className="text-sm text-[var(--foreground)]"
                >
                  {uiText('覆盖默认提示词', language)}{' '}
                </label>
                <span className="text-xs text-[var(--binance-yellow)] inline-flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    <line x1="12" x2="12" y1="9" y2="13" />
                    <line x1="12" x2="12.01" y1="17" y2="17" />
                  </svg>{' '}
                  {uiText('启用后将完全替换默认策略', language)}{' '}
                </span>
              </div>
              <div>
                <label
                  htmlFor="trader-field-8"
                  className="text-sm text-[var(--foreground)] block mb-2"
                >
                  {formData.override_base_prompt
                    ? uiText('自定义提示词', language)
                    : uiText('附加提示词', language)}
                </label>
                <UiTextarea
                  id="trader-field-8"
                  value={formData.custom_prompt}
                  onChange={(e) =>
                    handleInputChange('custom_prompt', e.target.value)
                  }
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--panel-border)] rounded text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none h-24 resize-none"
                  placeholder={
                    formData.override_base_prompt
                      ? uiText('输入完整的交易策略提示词...', language)
                      : uiText('输入额外的交易策略提示...', language)
                  }
                />
              </div>
            </div>
          </UiCard>
        </div>

        {saveError && (
          <UiAlert
            role="alert"
            className="mx-6 mb-3 p-3 rounded border border-red-500 text-red-400 text-sm"
          >
            {saveError}
          </UiAlert>
        )}
        {/* Footer */}
        <div className="desk-dialog-footer">
          <UiButton
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-3 bg-[var(--panel-border)] text-[var(--foreground)] rounded-lg hover:bg-[#404750] transition-all duration-200 border border-[#404750]"
          >
            {uiText('取消', language)}{' '}
          </UiButton>
          {onSave && (
            <UiButton
              onClick={handleSave}
              disabled={
                isSaving ||
                !formData.trader_name ||
                !formData.ai_model ||
                !formData.exchange_id
              }
              className="px-8 py-3 bg-[var(--binance-yellow)] text-black rounded-lg hover:bg-[var(--binance-yellow-light)] transition-all duration-200 disabled:bg-[var(--text-secondary)] disabled:cursor-not-allowed font-medium shadow-lg"
            >
              {isSaving
                ? uiText('保存中...', language)
                : isEditMode
                  ? uiText('保存修改', language)
                  : uiText('创建交易员', language)}
            </UiButton>
          )}
        </div>
      </div>
    </UiDialog>
  )
}
