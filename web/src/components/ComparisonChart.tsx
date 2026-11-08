import { uiText } from '../i18n/uiText'
import { Alert } from 'antd'
import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import useSWR from 'swr'
import { api } from '../lib/api'
import type { CompetitionTraderData } from '../types'
import { getTraderColor } from '../utils/traderColors'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'
import { BarChart3 } from 'lucide-react'

interface ComparisonChartProps {
  traders: CompetitionTraderData[]
}

export function ComparisonChart({ traders }: ComparisonChartProps) {
  const { language } = useLanguage()
  // 获取所有trader的历史数据 - 使用单个useSWR并发请求所有trader数据
  // 生成唯一的key，当traders变化时会触发重新请求
  const tradersKey = traders
    .map((t) => t.trader_id)
    .sort()
    .join(',')

  const {
    data: allTraderHistories,
    isLoading,
    error,
  } = useSWR(
    traders.length > 0 ? `all-equity-histories-${tradersKey}` : null,
    async () => {
      // 使用批量API一次性获取所有trader的历史数据
      const traderIds = traders.map((trader) => trader.trader_id)
      const batchData = await api.getEquityHistoryBatch(traderIds)

      // 转换为原格式，保持与原有代码兼容
      return traders.map((trader) => {
        return batchData.histories[trader.trader_id] || []
      })
    },
    {
      refreshInterval: 30000, // 30秒刷新（对比图表数据更新频率较低）
      revalidateOnFocus: false,
      dedupingInterval: 20000,
    }
  )

  // 将数据转换为与原格式兼容的结构
  const traderHistories = useMemo(() => {
    if (!allTraderHistories) {
      return traders.map(() => ({ data: undefined }))
    }
    return allTraderHistories.map((data) => ({ data }))
  }, [allTraderHistories, traders.length])

  // 使用useMemo自动处理数据合并，直接使用data对象作为依赖
  const combinedData = useMemo(() => {
    // 等待所有数据加载完成
    const allLoaded = traderHistories.every((h) => h.data)
    if (!allLoaded) return []

    console.log(`[${new Date().toISOString()}] Recalculating chart data...`)

    // 新方案：按时间戳分组，不再依赖 cycle_number（因为后端会重置）
    // 收集所有时间戳
    const timestampMap = new Map<
      string,
      {
        timestamp: string
        time: string
        traders: Map<string, { pnl_pct: number; equity: number }>
      }
    >()

    traderHistories.forEach((history, index) => {
      const trader = traders[index]
      if (!history.data) return

      console.log(
        `Trader ${trader.trader_id}: ${history.data.length} data points`
      )

      history.data.forEach((point: any) => {
        const ts = point.timestamp

        if (!timestampMap.has(ts)) {
          const time = new Date(ts).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })
          timestampMap.set(ts, {
            timestamp: ts,
            time,
            traders: new Map(),
          })
        }

        // 计算盈亏百分比：从total_pnl和balance计算
        // 假设初始余额 = balance - total_pnl
        const initialBalance = point.balance - point.total_pnl
        const pnlPct =
          initialBalance > 0 ? (point.total_pnl / initialBalance) * 100 : 0

        timestampMap.get(ts)!.traders.set(trader.trader_id, {
          pnl_pct: pnlPct,
          equity: point.total_equity,
        })
      })
    })

    // 按时间戳排序，转换为数组
    const combined = Array.from(timestampMap.entries())
      .sort(([tsA], [tsB]) => new Date(tsA).getTime() - new Date(tsB).getTime())
      .map(([ts, data], index) => {
        const entry: any = {
          index: index + 1, // 使用序号代替cycle
          time: data.time,
          timestamp: ts,
        }

        traders.forEach((trader) => {
          const traderData = data.traders.get(trader.trader_id)
          if (traderData) {
            entry[`${trader.trader_id}_pnl_pct`] = traderData.pnl_pct
            entry[`${trader.trader_id}_equity`] = traderData.equity
          }
        })

        return entry
      })

    if (combined.length > 0) {
      const lastPoint = combined[combined.length - 1]
      console.log(
        `Chart: ${combined.length} data points, last time: ${lastPoint.time}, timestamp: ${lastPoint.timestamp}`
      )
    }

    return combined
  }, [allTraderHistories, traders])

  if (error && !allTraderHistories)
    return (
      <Alert
        showIcon
        type="warning"
        title={uiText('收益走势暂时无法加载', language)}
        description={uiText(
          '账户排行仍可查看，历史数据将在下次刷新时重试。',
          language
        )}
      />
    )
  if (isLoading) {
    return (
      <div
        className="text-center py-16"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div className="spinner mx-auto mb-4"></div>
        <div className="text-sm font-semibold">
          {uiText('正在加载收益走势…', language)}
        </div>
      </div>
    )
  }

  if (combinedData.length === 0) {
    return (
      <div
        className="text-center py-16"
        style={{ color: 'var(--text-secondary)' }}
      >
        <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-60" />
        <div className="text-lg font-semibold mb-2">
          {t('noHistoricalData', language)}
        </div>
        <div className="text-sm">{t('dataWillAppear', language)}</div>
      </div>
    )
  }

  // 限制显示数据点
  const MAX_DISPLAY_POINTS = 2000
  const displayData =
    combinedData.length > MAX_DISPLAY_POINTS
      ? combinedData.slice(-MAX_DISPLAY_POINTS)
      : combinedData

  // 计算Y轴范围
  const calculateYDomain = () => {
    const allValues: number[] = []
    displayData.forEach((point) => {
      traders.forEach((trader) => {
        const value = point[`${trader.trader_id}_pnl_pct`]
        if (value !== undefined) {
          allValues.push(value)
        }
      })
    })

    if (allValues.length === 0) return [-5, 5]

    const minVal = Math.min(...allValues)
    const maxVal = Math.max(...allValues)
    const range = Math.max(Math.abs(maxVal), Math.abs(minVal))
    const padding = Math.max(range * 0.2, 1) // 至少留1%余量

    return [Math.floor(minVal - padding), Math.ceil(maxVal + padding)]
  }

  // 使用统一的颜色分配逻辑（与Leaderboard保持一致）
  const traderColor = (traderId: string) => getTraderColor(traders, traderId)

  // 自定义Tooltip - Binance Style
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div
          className="rounded p-3 shadow-xl"
          style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
          }}
        >
          <div
            className="text-xs mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {data.time} - #{data.index}
          </div>
          {traders.map((trader) => {
            const pnlPct = data[`${trader.trader_id}_pnl_pct`]
            const equity = data[`${trader.trader_id}_equity`]
            if (pnlPct === undefined) return null

            return (
              <div key={trader.trader_id} className="mb-1.5 last:mb-0">
                <div
                  className="text-xs font-semibold mb-0.5"
                  style={{ color: traderColor(trader.trader_id) }}
                >
                  {trader.trader_name}
                </div>
                <div
                  className="text-sm mono font-bold"
                  style={{
                    color:
                      pnlPct >= 0
                        ? 'var(--binance-green)'
                        : 'var(--binance-red)',
                  }}
                >
                  {pnlPct >= 0 ? '+' : ''}
                  {pnlPct.toFixed(2)}%
                  <span
                    className="text-xs ml-2 font-normal"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    ({equity?.toFixed(2)} USDT)
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }

  // 计算当前差距
  const currentGap =
    displayData.length > 0 && traders.length > 1
      ? (() => {
          const lastPoint = displayData[displayData.length - 1]
          const values = traders.map(
            (t) => lastPoint[`${t.trader_id}_pnl_pct`] || 0
          )
          return Math.max(...values) - Math.min(...values)
        })()
      : 0

  return (
    <div>
      <div
        style={{
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* terminal Watermark */}

        <ResponsiveContainer width="100%" height={310}>
          <LineChart
            data={displayData}
            margin={{ top: 20, right: 16, left: 0, bottom: 8 }}
          >
            <defs>
              {traders.map((trader) => (
                <linearGradient
                  key={`gradient-${trader.trader_id}`}
                  id={`gradient-${trader.trader_id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={traderColor(trader.trader_id)}
                    stopOpacity={0.9}
                  />
                  <stop
                    offset="95%"
                    stopColor={traderColor(trader.trader_id)}
                    stopOpacity={0.2}
                  />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" />

            <XAxis
              dataKey="time"
              stroke="#5E6673"
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              tickLine={{ stroke: 'var(--panel-border)' }}
              interval="preserveStartEnd"
              minTickGap={40}
              angle={0}
              textAnchor="middle"
              height={36}
            />

            <YAxis
              stroke="#5E6673"
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              tickLine={{ stroke: 'var(--panel-border)' }}
              domain={calculateYDomain()}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
              width={60}
            />

            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              y={0}
              stroke="var(--panel-border-hover)"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: uiText('盈亏平衡', language),
                fill: 'var(--text-secondary)',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />

            {traders.map((trader) => (
              <Line
                key={trader.trader_id}
                type="monotone"
                dataKey={`${trader.trader_id}_pnl_pct`}
                stroke={traderColor(trader.trader_id)}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 6,
                  fill: traderColor(trader.trader_id),
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
                name={trader.trader_name}
                connectNulls
              />
            ))}

            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value, entry: any) => {
                const traderId = traders.find(
                  (t) => value === t.trader_name
                )?.trader_id
                const trader = traders.find((t) => t.trader_id === traderId)
                return (
                  <span
                    style={{
                      color: entry.color,
                      fontWeight: 400,
                      fontSize: '12px',
                    }}
                  >
                    {trader?.trader_name} ({trader?.ai_model.toUpperCase()})
                  </span>
                )
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="comparison-chart-caption">
        <span>
          {uiText('历史记录 ·', language)} {combinedData.length}{' '}
          {uiText('个时间点', language)}
        </span>
        <span>
          {traders.length > 1
            ? language === 'zh'
              ? `区间末收益率差 ${currentGap.toFixed(2)} 个百分点`
              : `End-of-period return gap: ${currentGap.toFixed(2)} percentage points`
            : uiText('单策略收益率走势', language)}
        </span>
      </div>
    </div>
  )
}
