import ParticleGlobe from '../components/landing/ParticleGlobe'
import '../components/landing/landing-effects.css'
import { Button } from 'antd'
import { UiCard } from '../components/design/Controls'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Settings2,
  ChartNoAxesCombined,
  ShieldCheck,
  Bitcoin,
  Building2,
  Layers3,
  Activity,
} from 'lucide-react'
import HeaderBar from '../components/landing/HeaderBar'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

export function LandingPage() {
  const { user, logout } = useAuth()
  const { language, setLanguage } = useLanguage()
  const zh = language === 'zh'
  const [coverage, setCoverage] = useState<Record<string, number> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/market/binance-futures-symbols', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable')
        const data = await response.json()
        const counts: Record<string, number> = {
          crypto: 0,
          equity: 0,
          other: 0,
        }
        for (const category of Object.values(data.categories || {})) {
          const key =
            category === 'crypto' || category === 'equity' ? category : 'other'
          counts[key]++
        }
        setCoverage(counts)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [])
  const features = [
    {
      icon: Settings2,
      title: zh ? '从配置到策略，有条不紊' : 'A considered setup',
      text: zh
        ? '模型、账户、杠杆与信号源，集中配置。先预览行情，再决定如何运行。'
        : 'Configure models, accounts, leverage and signals. Preview data before running.',
    },
    {
      icon: ChartNoAxesCombined,
      title: zh ? '每一次决策，都有迹可循' : 'Understand every decision',
      text: zh
        ? '账户表现、当前持仓和历史决策，在一个工作空间中查看与复盘。'
        : 'Review performance, open positions and decision history in one workspace.',
    },
    {
      icon: ShieldCheck,
      title: zh ? '何时开始，由你决定' : 'You choose when to start',
      text: zh
        ? '配置与运行分开管理。创建交易员不会自动下单，启停状态始终清晰可见。'
        : 'Configuration and execution stay separate. Creating a trader does not start trading.',
    },
  ]
  return (
    <div className="min-h-screen guanlan-home">
      <HeaderBar
        isLoggedIn={!!user}
        user={user}
        onLogout={logout}
        language={language}
        onLanguageChange={setLanguage}
      />
      <main id="main-content" className="desk-hero">
        <div className="desk-hero-grid">
          <div className="guanlan-hero-copy">
            <div className="desk-eyebrow flex items-center gap-2">
              <Activity size={15} aria-hidden="true" />
              {zh ? '你的个人交易工作空间' : 'YOUR TRADING WORKSPACE'}
            </div>
            <h1>
              {zh ? '于波澜之中，' : 'See the market.'}
              <br />
              <span style={{ color: 'var(--binance-yellow)' }}>
                {zh ? '洞见下一步。' : 'Own your next move.'}
              </span>
            </h1>
            <p className="desk-hero-description">
              {zh
                ? '连接行情、模型与交易账户。把复杂的市场数据转化为可审阅的策略，让每一次行动都有依据。'
                : 'Connect market data, models and trading accounts. Turn complex data into strategies you can review.'}
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button
                size="large"
                type="primary"
                href={user ? '/traders' : '/login'}
              >
                {zh ? '进入工作台' : 'Open workspace'}
                <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </div>
            <p className="text-xs desk-muted mt-6">
              {zh
                ? '独立配置 · 只读信号预览 · 手动启停'
                : 'Individual configuration · Signal preview · Manual start'}
            </p>
          </div>
          <ParticleGlobe zh={zh} />
        </div>
        <UiCard
          className="desk-market-panel guanlan-coverage"
          aria-label={zh ? '可选合约范围' : 'Available markets'}
        >
          <div className="flex items-center justify-between gap-3 pb-5 border-b border-[var(--panel-border)]">
            <div>
              <p className="desk-eyebrow mb-1">
                {zh ? '市场覆盖' : 'MARKET COVERAGE'}
              </p>
              <h2 className="text-xl font-semibold">
                {zh ? '一个工作台，多类资产' : 'More markets. One desk.'}
              </h2>
            </div>
            <Layers3 size={22} className="desk-muted" aria-hidden="true" />
          </div>
          {[
            {
              key: 'crypto',
              icon: Bitcoin,
              label: zh ? '加密货币' : 'Crypto',
              sub: 'BTC · ETH · SOL',
            },
            {
              key: 'equity',
              icon: Building2,
              label: zh ? '美股 / ETF' : 'Stocks / ETFs',
              sub: 'TSLA · NVDA · AAPL',
            },
            {
              key: 'other',
              icon: Layers3,
              label: zh ? '商品与其他资产' : 'Commodities & more',
              sub: zh ? '贵金属、能源等传统资产' : 'Metals, energy and more',
            },
          ].map(({ key, icon: Icon, label, sub }) => (
            <div className="desk-market-row" key={key}>
              <span className="desk-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">{label}</h3>
                <p className="text-xs desk-muted mt-1">{sub}</p>
              </div>
              <div className="text-right">
                <strong className="text-2xl font-medium">
                  {coverage ? coverage[key] : '—'}
                </strong>
                <p className="text-xs desk-muted">
                  {zh ? '永续合约' : 'perpetuals'}
                </p>
              </div>
            </div>
          ))}
          <p
            className="text-xs desk-muted mt-4 pt-4 border-t border-[var(--panel-border)]"
            role="status"
          >
            {failed
              ? zh
                ? '行情暂时不可用，请稍后重试'
                : 'Market data temporarily unavailable'
              : coverage
                ? zh
                  ? '数据来源：币安当前可交易 USDT 合约'
                  : 'Source: active Binance USDT contracts'
                : zh
                  ? '正在读取币安合约列表…'
                  : 'Loading market coverage…'}
          </p>
        </UiCard>
        <div className="desk-features">
          {features.map(({ icon: Icon, title, text }, i) => (
            <UiCard className="desk-feature guanlan-feature" key={title}>
              <div className="flex justify-between items-center mb-6">
                <Icon
                  size={24}
                  className="text-[var(--binance-yellow)]"
                  aria-hidden="true"
                />
                <span className="mono text-xs desk-muted">0{i + 1}</span>
              </div>
              <h2 className="font-semibold text-lg">{title}</h2>
              <p>{text}</p>
            </UiCard>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8 text-xs desk-muted">
          <p>
            {zh
              ? '交易存在风险，请在了解策略与参数后自主决定是否启动。'
              : 'Trading involves risk. Review your strategy and parameters before starting.'}
          </p>
          <a className="hover:text-white" href="/competition">
            {zh ? '查看实时总览 →' : 'Explore overview →'}
          </a>
        </div>
      </main>
      <footer className="border-t border-[var(--panel-border)] px-6 py-6 text-xs desk-muted text-center">
        {zh ? '观澜 · 专注你的交易决策' : 'Guanlan · Focus on your decisions'}
      </footer>
    </div>
  )
}
