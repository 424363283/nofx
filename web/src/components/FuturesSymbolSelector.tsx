import { useLanguage } from '../contexts/LanguageContext'
import { uiText } from '../i18n/uiText'
import { UiButton, UiInput } from './design/Controls'
import { useEffect, useState } from 'react'

export function FuturesSymbolSelector({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (symbol: string) => void
}) {
  const { language } = useLanguage()
  const [symbols, setSymbols] = useState<string[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch('/api/market/binance-futures-symbols', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(uiText('获取失败', language))
        const data = await response.json()
        if (
          !Array.isArray(data.symbols) ||
          !data.symbols.length ||
          !data.symbols.every((s: unknown) => typeof s === 'string')
        )
          throw new Error(uiText('列表为空', language))
        if (!controller.signal.aborted) {
          setSymbols(data.symbols)
          setCategories(data.categories || {})
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            uiText(
              '暂时无法获取币安合约列表，请重试，或在上方手动输入。',
              language
            )
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [attempt])

  const visible = symbols.filter(
    (symbol) =>
      symbol.includes(query.trim().toUpperCase()) &&
      (category === 'all' || categories[symbol] === category)
  )
  return (
    <div className="mt-3 p-3 bg-[var(--background)] border border-[var(--panel-border)] rounded">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-3">
        <span>
          {uiText('币安 USDT 永续合约 ·', language)} {symbols.length}{' '}
          {uiText('个 · 已选', language)} {selected.length}{' '}
          {uiText('个', language)}{' '}
        </span>
        <UiButton
          type="button"
          disabled={loading}
          onClick={() => setAttempt((n) => n + 1)}
          className="text-[var(--binance-yellow)] disabled:opacity-50"
        >
          {loading ? uiText('加载中…', language) : uiText('刷新列表', language)}
        </UiButton>
      </div>
      <div
        className="flex flex-wrap gap-2 mb-3"
        aria-label={uiText('合约分类', language)}
      >
        {Object.entries({
          all: uiText('全部', language),
          crypto: uiText('加密货币', language),
          equity: uiText('美股 / ETF', language),
          commodity: uiText('大宗商品', language),
          other: uiText('其他传统资产', language),
        }).map(([key, label]) => (
          <UiButton
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1 text-xs rounded border ${category === key ? 'border-[var(--binance-yellow)] text-[var(--binance-yellow)]' : 'border-[var(--panel-border)] text-[var(--text-secondary)]'}`}
          >
            {label} (
            {key === 'all'
              ? symbols.length
              : symbols.filter((symbol) => categories[symbol] === key).length}
            )
          </UiButton>
        ))}
      </div>
      <UiInput
        aria-label={uiText('搜索合约', language)}
        placeholder={uiText('搜索合约，例如 BTC、TSLA、NVDA、AAPL', language)}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 mb-3 bg-[var(--background)] border border-[var(--panel-border)] rounded text-sm text-[var(--foreground)] focus:border-[var(--binance-yellow)] focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400 mb-3">
          {error}
        </p>
      )}
      {!loading && !error && visible.length === 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          {uiText('没有匹配的合约', language)}
        </p>
      )}
      <div
        className="flex flex-wrap gap-2 max-h-60 overflow-y-auto"
        aria-label={uiText('币安合约列表', language)}
      >
        {visible.map((symbol) => (
          <UiButton
            key={symbol}
            type="button"
            aria-pressed={selected.includes(symbol)}
            onClick={() => onToggle(symbol)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${selected.includes(symbol) ? 'bg-[var(--binance-yellow)] text-black border-[var(--binance-yellow)]' : 'bg-[var(--panel-bg)] text-[var(--text-secondary)] border-[var(--panel-border)] hover:border-[var(--binance-yellow)]'}`}
          >
            {symbol}
          </UiButton>
        ))}
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-3">
        {uiText(
          '包含加密货币及传统资产 USDT 永续合约。美股 / ETF 为价格衍生合约，不代表持有股票；实际交易取决于账户权限。',
          language
        )}{' '}
      </p>
    </div>
  )
}
