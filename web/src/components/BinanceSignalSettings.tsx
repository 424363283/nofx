import { useLanguage } from '../contexts/LanguageContext'
import { uiText, marketText, localizedError } from '../i18n/uiText'
import { UiCard } from './design/Controls'
import { UiCheckLabel } from './design/Controls'
import { UiInput, UiSelect, UiButton, UiCollapse } from './design/Controls'
import { useEffect, useRef, useState } from 'react'

export interface SignalConfig {
  radar_enabled?: boolean
  enabled: boolean
  category: string
  limit: number
  volume: boolean
  oi: boolean
  funding: boolean
  breakout: boolean
  oi_min: number
  funding_min: number
}
export const defaultSignalConfig: SignalConfig = {
  radar_enabled: false,
  enabled: false,
  category: 'all',
  limit: 10,
  volume: true,
  oi: false,
  funding: false,
  breakout: false,
  oi_min: 3,
  funding_min: 0.03,
}
interface Preview {
  items: {
    symbol: string
    quote_volume: number
    oi_change?: number
    funding_rate?: number
    breakout?: string
    reasons: string[]
  }[]
  warnings: string[]
  scanned: number
  as_of: string
}
export function BinanceSignalSettings({
  value,
  onChange,
  symbols,
  exchange,
}: {
  value?: Partial<SignalConfig>
  onChange: (config: SignalConfig) => void
  symbols: string
  exchange: string
}) {
  const { language } = useLanguage()
  const config = { ...defaultSignalConfig, ...value }
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  const key = JSON.stringify(config) + symbols + exchange
  useEffect(() => {
    request.current?.abort()
    setPreview(null)
    setError('')
    setLoading(false)
    return () => request.current?.abort()
  }, [key])
  const change = (patch: Partial<SignalConfig>) =>
    onChange({ ...config, ...patch })
  const loadPreview = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const response = await fetch('/api/market/signals/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, symbols }),
        signal: controller.signal,
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || uiText('信号预览失败', language))
      if (!controller.signal.aborted) setPreview(result)
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : uiText('信号预览失败', language)
        )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  const inputClass =
    'bg-[var(--background)] border border-[var(--panel-border)] rounded px-2 py-2 text-[var(--foreground)] w-full'
  return (
    <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5 space-y-4">
      <h3 className="text-lg font-semibold text-[var(--foreground)]">
        {uiText('币安原生信号源', language)}{' '}
      </h3>
      <UiCheckLabel className="flex gap-3 items-center text-[var(--foreground)]">
        <UiInput
          type="checkbox"
          checked={!!config.radar_enabled}
          disabled={exchange !== 'binance'}
          onChange={(e) => change({ radar_enabled: e.target.checked })}
        />
        {uiText('异动合约自动纳入候选池', language)}{' '}
      </UiCheckLabel>
      <p className="text-xs text-[var(--text-secondary)]">
        {uiText(
          '开启后以市场雷达的全部有效异动作为候选（含美股／ETF），替代手动币种与下方行情筛选。每轮轮换分析 15–30 个，模型和风控通过后才可下单。数据过期时暂停新增候选，已有持仓继续管理。',
          language
        )}{' '}
      </p>
      <UiCheckLabel className="flex gap-3 items-center text-[var(--foreground)]">
        <UiInput
          type="checkbox"
          checked={config.enabled}
          disabled={exchange !== 'binance' || config.radar_enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        {uiText('启用币安行情筛选', language)}{' '}
      </UiCheckLabel>
      <p className="text-xs text-[var(--text-secondary)]">
        {uiText(
          '直接读取币安公开行情，无需 API 密钥或 MCP 授权。仅支持币安交易账户。关闭时沿用上方手动选择的交易对。',
          language
        )}{' '}
      </p>
      {config.enabled && !config.radar_enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[var(--foreground)]">
            <label>
              {uiText('资产范围', language)}{' '}
              <UiSelect
                aria-label={uiText('信号资产范围', language)}
                className={inputClass}
                value={config.category}
                onChange={(e) => change({ category: e.target.value })}
              >
                <option value="all">
                  {uiText('全部 USDT 永续', language)}
                </option>
                <option value="crypto">{uiText('加密货币', language)}</option>
                <option value="equity">{uiText('美股 / ETF', language)}</option>
                <option value="commodity">
                  {uiText('大宗商品', language)}
                </option>
              </UiSelect>
            </label>
            <label>
              {uiText('最多候选数（1–20）', language)}{' '}
              <UiInput
                aria-label={uiText('最多候选数', language)}
                className={inputClass}
                type="number"
                min={1}
                max={20}
                value={config.limit}
                onChange={(e) => change({ limit: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[var(--foreground)]">
            {(
              [
                ['volume', uiText('24小时成交额排行', language)],
                ['oi', uiText('1小时持仓量增长', language)],
                ['funding', uiText('资金费率偏离', language)],
                ['breakout', uiText('突破前20小时高低点', language)],
              ] as const
            ).map(([field, label]) => (
              <UiCheckLabel
                key={field}
                className="desk-signal-option"
                data-selected={config[field]}
              >
                <UiInput
                  type="checkbox"
                  checked={config[field]}
                  onChange={(e) => change({ [field]: e.target.checked })}
                />
                {label}
              </UiCheckLabel>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[var(--foreground)]">
            {config.oi && (
              <label>
                {uiText('持仓量增长至少（%）', language)}{' '}
                <UiInput
                  className={inputClass}
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={config.oi_min}
                  onChange={(e) => change({ oi_min: Number(e.target.value) })}
                />
              </label>
            )}
            {config.funding && (
              <label>
                {uiText('资金费率绝对值至少（%）', language)}{' '}
                <UiInput
                  className={inputClass}
                  type="number"
                  min={0}
                  max={10}
                  step={0.01}
                  value={config.funding_min}
                  onChange={(e) =>
                    change({ funding_min: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {uiText(
              '在资产范围与上方已选交易对的交集中，分析成交额前30名；未选交易对时按整个资产范围筛选。命中任一信号即可入选，优先按命中数量、再按成交额排序。成交额排行开启时，其他信号用于提高排名。行情缓存1分钟；缺失数据跳过，无命中则不新增开仓标的。',
              language
            )}{' '}
          </p>
          <UiButton
            type="button"
            disabled={loading || exchange !== 'binance'}
            onClick={loadPreview}
            className="px-4 py-2 rounded bg-[var(--binance-yellow)] text-black disabled:opacity-50"
          >
            {loading
              ? uiText('正在读取行情…', language)
              : uiText('预览信号（不下单）', language)}
          </UiButton>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {localizedError(error, language)}
            </p>
          )}
          {preview && (
            <div
              className="text-xs text-[var(--text-secondary)] space-y-2"
              aria-label={uiText('信号预览结果', language)}
            >
              <p>
                {uiText('读取时间：', language)}
                {new Date(preview.as_of).toLocaleString(
                  language === 'zh' ? 'zh-CN' : 'en-US'
                )}{' '}
                {uiText('· 扫描', language)} {preview.scanned}{' '}
                {uiText('个 · 命中', language)} {preview.items.length}{' '}
                {uiText('个', language)}{' '}
              </p>
              {!preview.items.length && (
                <p>
                  {uiText(
                    '当前没有符合条件的标的。请调整范围或阈值。',
                    language
                  )}
                </p>
              )}
              {preview.items.map((item) => (
                <div
                  key={item.symbol}
                  className="p-3 border border-[var(--panel-border)] rounded"
                >
                  <strong className="text-[var(--foreground)]">
                    {item.symbol}
                  </strong>
                  <p>
                    {uiText('24小时成交额：', language)}{' '}
                    {item.quote_volume.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}{' '}
                    USDT
                    {item.oi_change !== undefined
                      ? ` · OI ${item.oi_change.toFixed(2)}%`
                      : ''}
                    {item.funding_rate !== undefined
                      ? ` · ${language === 'zh' ? '资金费率' : 'Funding rate'} ${item.funding_rate.toFixed(4)}%`
                      : ''}
                  </p>
                  <p>
                    {item.reasons
                      .map((r) => marketText(r, language))
                      .join('; ')}
                  </p>
                </div>
              ))}
              {preview.warnings.length > 0 && (
                <UiCollapse>
                  <summary className="text-[var(--binance-yellow)] cursor-pointer">
                    {preview.warnings.length}{' '}
                    {uiText('项数据不可用', language)}{' '}
                  </summary>
                  {preview.warnings.map((warning, i) => (
                    <p key={i}>{localizedError(warning, language)}</p>
                  ))}
                </UiCollapse>
              )}
            </div>
          )}
        </>
      )}
    </UiCard>
  )
}
