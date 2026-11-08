import { TradingDashboard as TraderDetailsPage } from './components/TradingDashboard'

import { DesignProvider } from './components/design/DesignProvider'
import { useEffect, useState, lazy, Suspense } from 'react'
import { Spin } from 'antd'
import useSWR from 'swr'
import { api } from './lib/api'
const AITradersPage = lazy(() =>
  import('./components/AITradersPage').then((m) => ({
    default: m.AITradersPage,
  }))
)
const LoginPage = lazy(() =>
  import('./components/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const RegisterPage = lazy(() =>
  import('./components/RegisterPage').then((m) => ({ default: m.RegisterPage }))
)
const ResetPasswordPage = lazy(() =>
  import('./components/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  }))
)
const CompetitionPage = lazy(() =>
  import('./components/CompetitionPage').then((m) => ({
    default: m.CompetitionPage,
  }))
)
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
)
import HeaderBar from './components/landing/HeaderBar'
import { LanguageProvider, useLanguage } from './contexts/LanguageContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { t } from './i18n/translations'
import { useSystemConfig } from './hooks/useSystemConfig'
import { usePositionStream } from './hooks/usePositionStream'
import { selectPositionRows } from './lib/positionSnapshot'
import type {
  SystemStatus,
  AccountInfo,
  PositionSnapshot,
  DecisionRecord,
  Statistics,
  TraderInfo,
} from './types'

const SignalArchivePage = lazy(() => import('./pages/SignalArchivePage'))
const MarketRadarPage = lazy(() =>
  import('./pages/MarketRadarPage').then((m) => ({
    default: m.MarketRadarPage,
  }))
)

type Page = 'competition' | 'traders' | 'trader'

function App() {
  const { language, setLanguage } = useLanguage()
  const { user, token, logout, isLoading } = useAuth()
  const { loading: configLoading } = useSystemConfig()
  const [route, setRoute] = useState(window.location.pathname)

  // 从URL路径读取初始页面状态（支持刷新保持页面）
  const getInitialPage = (): Page => {
    const path = window.location.pathname
    const hash = window.location.hash.slice(1) // 去掉 #

    if (path === '/traders' || hash === 'traders') return 'traders'
    if (path === '/dashboard' || hash === 'trader' || hash === 'details')
      return 'trader'
    return 'competition' // 默认为竞赛页面
  }

  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage())
  const [selectedTraderId, setSelectedTraderId] = useState<string | undefined>()
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--')

  // 监听URL变化，同步页面状态
  useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname
      const hash = window.location.hash.slice(1)

      if (path === '/traders' || hash === 'traders') {
        setCurrentPage('traders')
      } else if (
        path === '/dashboard' ||
        hash === 'trader' ||
        hash === 'details'
      ) {
        setCurrentPage('trader')
      } else if (
        path === '/competition' ||
        hash === 'competition' ||
        hash === ''
      ) {
        setCurrentPage('competition')
      }
      setRoute(path)
    }

    window.addEventListener('hashchange', handleRouteChange)
    window.addEventListener('popstate', handleRouteChange)
    return () => {
      window.removeEventListener('hashchange', handleRouteChange)
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  // 切换页面时更新URL hash (当前通过按钮直接调用setCurrentPage，这个函数暂时保留用于未来扩展)
  // const navigateToPage = (page: Page) => {
  //   setCurrentPage(page);
  //   window.location.hash = page === 'competition' ? '' : 'trader';
  // };

  // 获取trader列表（仅在用户登录时）
  const { data: traders } = useSWR<TraderInfo[]>(
    user && token ? ['traders', user.id] : null,
    api.getTraders,
    {
      refreshInterval: 10000,
    }
  )

  // 当获取到traders后，设置默认选中第一个
  useEffect(() => {
    if (traders && traders.length > 0 && !selectedTraderId) {
      setSelectedTraderId(traders[0].trader_id)
    }
  }, [traders, selectedTraderId])

  // 如果在trader页面，获取该trader的数据
  const { data: status } = useSWR<SystemStatus>(
    currentPage === 'trader' && selectedTraderId
      ? `status-${selectedTraderId}`
      : null,
    () => api.getStatus(selectedTraderId),
    {
      refreshInterval: 15000, // 15秒刷新（配合后端15秒缓存）
      revalidateOnFocus: false, // 禁用聚焦时重新验证，减少请求
      dedupingInterval: 10000, // 10秒去重，防止短时间内重复请求
    }
  )

  const { data: account } = useSWR<AccountInfo>(
    currentPage === 'trader' && selectedTraderId
      ? `account-${selectedTraderId}`
      : null,
    () => api.getAccount(selectedTraderId),
    {
      refreshInterval: 15000, // 15秒刷新（配合后端15秒缓存）
      revalidateOnFocus: false, // 禁用聚焦时重新验证，减少请求
      dedupingInterval: 10000, // 10秒去重，防止短时间内重复请求
    }
  )

  const selectedTrader = traders?.find((t) => t.trader_id === selectedTraderId)
  const positionStream = usePositionStream(
    currentPage === 'trader' && selectedTrader?.exchange_id === 'binance' ? selectedTraderId : undefined,
    token || undefined,
  )
  const { data: polledPositions, error: positionsError } = useSWR<PositionSnapshot>(
    currentPage === 'trader' && selectedTraderId
      ? `position-snapshot-${selectedTraderId}`
      : null,
    () => api.getPositionsSnapshot(selectedTraderId),
    {
      refreshInterval: 5000,
      revalidateOnFocus: false, // 禁用聚焦时重新验证，减少请求
      dedupingInterval: 1000, // 去重间隔须小于5秒同步周期
    }
  )
  const positions = selectPositionRows(polledPositions, positionStream.update, positionStream.connected)
  const positionsAsOf = polledPositions?.asOf || 0

  const { data: decisions } = useSWR<DecisionRecord[]>(
    currentPage === 'trader' && selectedTraderId
      ? `decisions/latest-${selectedTraderId}`
      : null,
    () => api.getLatestDecisions(selectedTraderId),
    {
      refreshInterval: 15000, // 滚动刷新最新5条，返回页面时立即更新
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  const { data: stats } = useSWR<Statistics>(
    currentPage === 'trader' && selectedTraderId
      ? `statistics-${selectedTraderId}`
      : null,
    () => api.getStatistics(selectedTraderId),
    {
      refreshInterval: 30000, // 30秒刷新（统计数据更新频率较低）
      revalidateOnFocus: false,
      dedupingInterval: 20000,
    }
  )

  useEffect(() => {
    if (account) {
      const now = new Date().toLocaleTimeString()
      setLastUpdate(now)
    }
  }, [account])


  // Handle routing
  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Set current page based on route for consistent navigation state
  useEffect(() => {
    if (route === '/competition') {
      setCurrentPage('competition')
    } else if (route === '/traders') {
      setCurrentPage('traders')
    } else if (route === '/dashboard') {
      setCurrentPage('trader')
    }
  }, [route])

  // Show loading spinner while checking auth or config
  if (isLoading || configLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <div className="text-center">
          <img
            src="/icons/trading-desk.svg"
            alt="观澜 Logo"
            className="w-16 h-16 mx-auto mb-4 animate-pulse"
          />
          <p style={{ color: 'var(--foreground)' }}>{t('loading', language)}</p>
        </div>
      </div>
    )
  }

  // Handle specific routes regardless of authentication
  if (route === '/login') {
    return <LoginPage />
  }
  if (route === '/register') {
    return <RegisterPage />
  }
  if (route === '/radar') return <MarketRadarPage />
  if (route === '/signals') return <SignalArchivePage />
  if (route === '/reset-password') {
    return <ResetPasswordPage />
  }
  if (route === '/competition') {
    return (
      <div
        className="min-h-screen"
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      >
        <HeaderBar
          isLoggedIn={!!user}
          currentPage="competition"
          language={language}
          onLanguageChange={setLanguage}
          user={user}
          onLogout={logout}
          onPageChange={(page) => {
            console.log('Competition page onPageChange called with:', page)
            console.log('Current route:', route, 'Current page:', currentPage)

            if (page === 'competition') {
              console.log('Navigating to competition')
              window.history.pushState({}, '', '/competition')
              setRoute('/competition')
              setCurrentPage('competition')
            } else if (page === 'traders') {
              console.log('Navigating to traders')
              window.history.pushState({}, '', '/traders')
              setRoute('/traders')
              setCurrentPage('traders')
            } else if (page === 'trader') {
              console.log('Navigating to trader/dashboard')
              window.history.pushState({}, '', '/dashboard')
              setRoute('/dashboard')
              setCurrentPage('trader')
            }

            console.log(
              'After navigation - route:',
              route,
              'currentPage:',
              currentPage
            )
          }}
        />
        <main id="main-content" className="desk-shell">
          <CompetitionPage />
        </main>
      </div>
    )
  }

  // Show landing page for root route
  if (route === '/' || route === '') {
    return <LandingPage />
  }

  // Show main app for authenticated users on other routes
  if (!user || !token) {
    // Default to landing page when not authenticated and no specific route
    return <LandingPage />
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      <HeaderBar
        isLoggedIn={!!user}
        currentPage={currentPage}
        language={language}
        onLanguageChange={setLanguage}
        user={user}
        onLogout={logout}
        onPageChange={(page) => {
          console.log('Main app onPageChange called with:', page)

          if (page === 'competition') {
            window.history.pushState({}, '', '/competition')
            setRoute('/competition')
            setCurrentPage('competition')
          } else if (page === 'traders') {
            window.history.pushState({}, '', '/traders')
            setRoute('/traders')
            setCurrentPage('traders')
          } else if (page === 'trader') {
            window.history.pushState({}, '', '/dashboard')
            setRoute('/dashboard')
            setCurrentPage('trader')
          }
        }}
      />

      {/* Main Content */}
      <main id="main-content" className="desk-shell">
        {currentPage === 'competition' ? (
          <CompetitionPage />
        ) : currentPage === 'traders' ? (
          <AITradersPage
            onTraderSelect={(traderId) => {
              setSelectedTraderId(traderId)
              window.history.pushState({}, '', '/dashboard')
              setRoute('/dashboard')
              setCurrentPage('trader')
            }}
          />
        ) : (
          <TraderDetailsPage
            selectedTrader={selectedTrader}
            status={status}
            account={account}
            positions={positions}
            positionsConfirmed={positions != null && Date.now() - positionsAsOf < 45000}
            positionsAsOf={positionsAsOf}
            positionsError={positionsError?.message}
            positionStream={selectedTrader?.exchange_id === 'binance' ? {
              ...positionStream.update,
              state: positionStream.connected ? positionStream.update?.state || 'connecting' : 'reconnecting',
              warning: positionStream.connected ? positionStream.update?.warning : positionStream.error,
            } : undefined}
            decisions={decisions}
            stats={stats}
            lastUpdate={lastUpdate}
            language={language}
            traders={traders}
            selectedTraderId={selectedTraderId}
            onTraderSelect={setSelectedTraderId}
          />
        )}
      </main>
    </div>
  )
}

// Trader Details Page Component
// Wrap App with providers
export default function AppWithProviders() {
  return (
    <LanguageProvider>
      <DesignProvider>
        <AuthProvider>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center">
                <Spin size="large" />
              </div>
            }
          >
            <App />
          </Suspense>
        </AuthProvider>
      </DesignProvider>
    </LanguageProvider>
  )
}
