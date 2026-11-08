import { uiText, marketText, localizedError } from '../i18n/uiText'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined, HistoryOutlined } from '@ant-design/icons'
import type { TableColumnsType } from 'antd'
import HeaderBar from '../components/landing/HeaderBar'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import type { RadarItem } from './MarketRadarPage'
import '../components/design/archive.css'
import {
  PaperSummary,
  PaperValue,
  PaperDetails,
  SimilarSignals,
} from '../components/SignalResearch'
import type {
  PaperTrial,
  PaperStats,
  PaperRules,
} from '../components/SignalResearch'

type Outcome = {
  minutes: number
  status: string
  error?: string
  return_pct: number | null
  direction_return_pct: number | null
  mfe_pct: number | null
  mae_pct: number | null
  observed_at?: string
}
type Entry = {
  id: number
  recorded_at: string
  version: string
  snapshot: RadarItem
  paper?: PaperTrial
  outcomes: Outcome[]
}
type Archive = {
  items: Entry[]
  total: number
  page_size: number
  stats: {
    minutes: number
    completed: number
    positive: number
    mean_return_pct: number | null
  }[]
  paper_stats?: PaperStats
  paper_rules?: PaperRules
  paper_error?: string
  recording_error?: string
  tracking_error?: string
}
const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

function OutcomeValue({ outcome }: { outcome?: Outcome }) {
  const { language } = useLanguage()
  if (!outcome || outcome.status === 'pending')
    return <span className="archive-muted">{uiText('待观察', language)}</span>
  if (outcome.status !== 'complete')
    return <Tag color="warning">{uiText('数据待补齐', language)}</Tag>
  const n = outcome.direction_return_pct
  return (
    <span
      style={{
        color:
          n == null || n === 0
            ? undefined
            : n > 0
              ? 'var(--color-positive)'
              : 'var(--binance-red)',
      }}
    >
      {pct(n)}
    </span>
  )
}
export default function SignalArchivePage() {
  const { user, logout } = useAuth()
  const { language, setLanguage } = useLanguage()
  const date = (s?: string) =>
    s
      ? new Date(s).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
          hour12: false,
        })
      : '—'
  const horizonName = (m: number) =>
    m === 15
      ? uiText('15 分钟', language)
      : m === 60
        ? uiText('1 小时', language)
        : uiText('4 小时', language)
  const biasName: Record<string, string> = {
    bull: uiText('偏多', language),
    bear: uiText('偏空', language),
    mixed: uiText('多空冲突', language),
    neutral: uiText('方向未明', language),
    unavailable: uiText('数据不足', language),
  }

  const [symbol, setSymbol] = useState('')
  const [category, setCategory] = useState('')
  const [bias, setBias] = useState('')
  const [page, setPage] = useState(1)
  const [horizon, setHorizon] = useState(60)
  const [cost, setCost] = useState(0.2)
  const [selectedID, setSelectedID] = useState<number | null>(null)
  const query = new URLSearchParams({
    symbol,
    category,
    bias,
    page: String(page),
  })
  const { data, error, isValidating, mutate } = useSWR<Archive>(
    `/api/market/radar/archive?${query}`,
    async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(uiText('无法读取信号档案', language))
      return response.json()
    },
    { refreshInterval: 30000, revalidateOnFocus: true }
  )
  const selected = data?.items.find((item) => item.id === selectedID)
  const stat = data?.stats.find((s) => s.minutes === horizon)
  const columns: TableColumnsType<Entry> = [
    {
      title: uiText('首次记录', language),
      dataIndex: 'recorded_at',
      width: 180,
      render: date,
    },
    {
      title: uiText('合约 / 方向', language),
      width: 170,
      render: (_, row) => (
        <>
          <Typography.Text strong>{row.snapshot.symbol}</Typography.Text>
          <div className="archive-muted">
            {row.snapshot.category === 'equity'
              ? uiText('美股 / ETF', language)
              : uiText('加密货币', language)}{' '}
            · {biasName[row.snapshot.bias] || row.snapshot.bias}
          </div>
        </>
      ),
    },
    {
      title: uiText('触发证据', language),
      width: 270,
      render: (_, row) => (
        <Space size={[4, 6]} wrap>
          {row.snapshot.signals.map((s) => (
            <Tag
              key={s.kind}
              color={
                s.direction === 'bull'
                  ? 'success'
                  : s.direction === 'bear'
                    ? 'error'
                    : undefined
              }
            >
              {marketText(s.label, language)}
            </Tag>
          ))}
        </Space>
      ),
    },
    ...[15, 60, 240].map((minutes) => ({
      title: horizonName(minutes),
      width: 120,
      render: (_: unknown, row: Entry) => (
        <OutcomeValue
          outcome={row.outcomes.find((o) => o.minutes === minutes)}
        />
      ),
    })),
    {
      title: uiText('固定规则模拟', language),
      width: 150,
      render: (_, row) => <PaperValue trial={row.paper} />,
    },
    {
      title: '',
      width: 85,
      render: (_, row) => (
        <Button type="link" onClick={() => setSelectedID(row.id)}>
          {uiText('详情', language)}{' '}
        </Button>
      ),
    },
  ]
  return (
    <div className="min-h-screen">
      <HeaderBar
        isLoggedIn={!!user}
        user={user}
        onLogout={logout}
        currentPage="signals"
        language={language}
        onLanguageChange={setLanguage}
      />
      <main id="main-content" className="desk-shell archive-page">
        <header className="archive-heading">
          <div>
            <div className="archive-eyebrow">
              <HistoryOutlined /> SIGNAL JOURNAL
            </div>
            <h1>{uiText('信号档案', language)}</h1>
            <p>
              {uiText('留下每一次异动的证据，跟踪后来发生了什么。', language)}
            </p>
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={isValidating}
            onClick={() => void mutate()}
          >
            {uiText('刷新档案', language)}{' '}
          </Button>
        </header>
        <Alert
          type="info"
          showIcon
          title={uiText('实时前向观察 · 不是回测或实盘收益', language)}
          description={uiText(
            '从启用后开始记录，包含失败和无方向信号。同一根 K 线、同方向、同组证据去重；样本可能相关，不代表独立交易机会。每 30 秒更新展示。',
            language
          )}
        />
        {(error ||
          data?.recording_error ||
          data?.tracking_error ||
          data?.paper_error) && (
          <Alert
            type="warning"
            showIcon
            title={uiText('档案服务异常', language)}
            description={
              error
                ? uiText(
                    '档案读取失败，请重试；已加载内容可能不是最新结果。',
                    language
                  )
                : data?.recording_error
                  ? uiText(
                      '信号写入失败，当前采集可能有缺口，请检查服务日志。',
                      language
                    )
                  : uiText(
                      '跟踪任务未完成，稍后会自动补齐，请勿将等待样本视为成功或失败。',
                      language
                    )
            }
          />
        )}
        <Card className="archive-controls">
          <Space wrap size={12}>
            <Input.Search
              aria-label={uiText('搜索档案合约', language)}
              placeholder={uiText('搜索 BTC、TSLA…', language)}
              allowClear
              onSearch={(value) => {
                setSymbol(value.trim())
                setPage(1)
                setSelectedID(null)
              }}
              style={{ width: 240 }}
            />
            <Select
              aria-label={uiText('档案资产类别', language)}
              value={category}
              onChange={(value) => {
                setCategory(value)
                setPage(1)
                setSelectedID(null)
              }}
              style={{ width: 160 }}
              options={[
                { value: '', label: uiText('全部资产', language) },
                { value: 'crypto', label: uiText('加密货币', language) },
                { value: 'equity', label: uiText('美股 / ETF', language) },
              ]}
            />
            <Select
              aria-label={uiText('档案方向', language)}
              value={bias}
              onChange={(value) => {
                setBias(value)
                setPage(1)
                setSelectedID(null)
              }}
              style={{ width: 150 }}
              options={[
                { value: '', label: uiText('全部方向', language) },
                ...Object.entries(biasName).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <Select
              aria-label={uiText('统计观察周期', language)}
              value={horizon}
              onChange={setHorizon}
              style={{ width: 150 }}
              options={[15, 60, 240].map((value) => ({
                value,
                label: `${language === 'zh' ? '统计：' : 'Horizon: '}${horizonName(value)}`,
              }))}
            />
          </Space>
        </Card>
        <div className="archive-stats">
          <Card>
            <Statistic
              title={uiText('累计信号 · 当前筛选', language)}
              value={data?.total ?? '—'}
            />
            <span>{uiText('保留全部方向及未完成样本', language)}</span>
          </Card>
          <Card>
            <Statistic
              title={`${horizonName(horizon)} · ${language === 'zh' ? '已完成方向样本' : 'Completed directional samples'}`}
              value={stat?.completed ?? '—'}
            />
            <span>{uiText('仅偏多 / 偏空且行情完整', language)}</span>
          </Card>
          <Card>
            <Statistic
              title={uiText('方向符合率 · 毛收益 > 0', language)}
              value={
                stat?.completed ? (stat.positive / stat.completed) * 100 : '—'
              }
              precision={1}
              suffix={stat?.completed ? '%' : undefined}
            />
            <span>{uiText('不是策略胜率或上涨概率', language)}</span>
          </Card>
          <Card>
            <Statistic
              title={uiText('平均方向毛收益', language)}
              value={stat?.mean_return_pct ?? '—'}
              precision={2}
              suffix={stat?.mean_return_pct != null ? '%' : undefined}
            />
            <span>{uiText('未计杠杆、手续费及资金费', language)}</span>
          </Card>
        </div>
        <PaperSummary stats={data?.paper_stats} rules={data?.paper_rules} />
        <Card
          title={uiText('信号时间线', language)}
          extra={
            <Typography.Text type="secondary">
              {uiText('按首次发现时间排序', language)}{' '}
            </Typography.Text>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data?.items || []}
            loading={!data && !error}
            scroll={{ x: 1230 }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    error
                      ? uiText('暂时无法读取档案', language)
                      : uiText(
                          '尚无信号档案。下一轮有效异动会自动记录，15 分钟后开始产生观察结果。',
                          language
                        )
                  }
                />
              ),
            }}
            pagination={{
              current: page,
              total: data?.total || 0,
              pageSize: 30,
              showSizeChanger: false,
              onChange: (value) => {
                setPage(value)
                setSelectedID(null)
              },
              showTotal: (total) =>
                language === 'zh' ? `共 ${total} 条` : `${total} records`,
            }}
          />
        </Card>
        <Card title={uiText('统计口径', language)}>
          <p>
            {uiText(
              '以首次记录时的最新报价为参考价；从记录后的下一个完整分钟开始读取币安 1 分钟 K 线，终点取目标时间向上取整到分钟后的收盘价，时间误差小于 1 分钟。首个不足一分钟的区间不计入区间极值。',
              language
            )}{' '}
          </p>
          <p>
            {uiText(
              '偏多方向收益 = 价格涨跌；偏空方向收益 = 价格涨跌的相反数。多空冲突和方向未明仅跟踪价格，不计入方向统计。最大有利 / 不利波动来自分钟高低价，不等同于可成交利润或账户回撤。',
              language
            )}{' '}
          </p>
          <Space wrap>
            <span>{uiText('往返成本情景假设', language)}</span>
            <InputNumber
              aria-label={uiText('往返成本百分比', language)}
              min={0}
              max={10}
              step={0.05}
              value={cost}
              onChange={(n) => setCost(n ?? 0)}
              suffix="%"
            />
            <span>
              {uiText('扣减后平均方向收益：', language)}{' '}
              <strong>
                {pct(
                  stat?.mean_return_pct == null
                    ? null
                    : stat.mean_return_pct - cost
                )}
              </strong>
            </span>
          </Space>
          <p className="archive-muted">
            {uiText(
              '0.20% 仅为手续费与滑点的示例预算，可自行修改；未包含实际资金费、点差变化、杠杆、止损路径或成交约束。不会据此下单，也不作为实际净收益。采集故障与停机期间可能漏掉新信号；已有记录的观察任务重启后继续补齐。',
              language
            )}{' '}
          </p>
        </Card>
        <Drawer
          title={
            selected
              ? `${selected.snapshot.symbol} · ${language === 'zh' ? '原始信号档案' : 'Original signal record'}`
              : uiText('信号详情', language)
          }
          open={selectedID !== null}
          onClose={() => setSelectedID(null)}
          size={720}
          styles={{ wrapper: { maxWidth: '100vw' } }}
        >
          {selected && (
            <Space orientation="vertical" size={24} style={{ width: '100%' }}>
              <SimilarSignals id={selected.id} />
              <PaperDetails trial={selected.paper} />
              <Descriptions
                column={1}
                items={[
                  {
                    key: 'id',
                    label: uiText('档案 / 规则版本', language),
                    children: `#${selected.id} · ${selected.version}`,
                  },
                  {
                    key: 'at',
                    label: uiText('首次记录', language),
                    children: date(selected.recorded_at),
                  },
                  {
                    key: 'priceAt',
                    label: uiText('参考报价时间', language),
                    children: date(selected.snapshot.price_as_of),
                  },
                  {
                    key: 'candle',
                    label: uiText('信号 K 线时间', language),
                    children: date(selected.snapshot.candle_at),
                  },
                  {
                    key: 'price',
                    label: uiText('参考价 / USDT', language),
                    children: selected.snapshot.price,
                  },
                  {
                    key: 'bias',
                    label: uiText('原始方向', language),
                    children: biasName[selected.snapshot.bias],
                  },
                  {
                    key: 'change',
                    label: uiText('原始 15m 涨跌', language),
                    children: pct(selected.snapshot.change),
                  },
                  {
                    key: 'volume',
                    label: uiText('原始放量倍数', language),
                    children: selected.snapshot.volume_ratio?.toFixed(2) ?? '—',
                  },
                  {
                    key: 'oi',
                    label: uiText('原始 OI 变化', language),
                    children: pct(selected.snapshot.oi_change),
                  },
                  {
                    key: 'oiat',
                    label: uiText('OI 数据时间', language),
                    children: date(selected.snapshot.oi_at),
                  },
                  {
                    key: 'macd',
                    label: 'MACD',
                    children: marketText(
                      selected.snapshot.macd || '—',
                      language
                    ),
                  },
                  {
                    key: 'difs',
                    label: uiText('DIF / DEA / 柱值', language),
                    children: [
                      selected.snapshot.dif,
                      selected.snapshot.dea,
                      selected.snapshot.histogram,
                    ]
                      .map((v) => (v == null ? '—' : Number(v.toPrecision(6))))
                      .join(' / '),
                  },
                ]}
              />
              <div>
                <Typography.Title level={5}>
                  {uiText('原始触发证据', language)}
                </Typography.Title>
                <Space wrap>
                  {selected.snapshot.signals.map((s) => (
                    <Tag key={s.kind}>{marketText(s.label, language)}</Tag>
                  ))}
                </Space>
                {selected.snapshot.notes?.map((note, i) => (
                  <p key={i} className="archive-muted">
                    {marketText(note, language)}
                  </p>
                ))}
              </div>
              {selected.outcomes.map((o) => (
                <Card
                  size="small"
                  key={o.minutes}
                  title={horizonName(o.minutes)}
                  extra={<OutcomeValue outcome={o} />}
                >
                  {o.status === 'complete' ? (
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 'time',
                          label: uiText('终点行情时间', language),
                          children: date(o.observed_at),
                        },
                        {
                          key: 'raw',
                          label: uiText('价格涨跌', language),
                          children: pct(o.return_pct),
                        },
                        {
                          key: 'dir',
                          label: uiText('方向毛收益', language),
                          children: pct(o.direction_return_pct),
                        },
                        {
                          key: 'mfe',
                          label: uiText('最大有利波动', language),
                          children: pct(o.mfe_pct),
                        },
                        {
                          key: 'mae',
                          label: uiText('最大不利波动', language),
                          children: pct(o.mae_pct),
                        },
                        {
                          key: 'net',
                          label:
                            language === 'zh'
                              ? `扣减 ${cost.toFixed(2)}% 成本假设`
                              : `After ${cost.toFixed(2)}% assumed costs`,
                          children: pct(
                            o.direction_return_pct == null
                              ? null
                              : o.direction_return_pct - cost
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Typography.Text type="secondary">
                      {o.status === 'pending'
                        ? uiText(
                            '尚未完成观察。到期后自动采集，不计入完成样本。',
                            language
                          )
                        : `${language === 'zh' ? '行情待补齐，自动重试。' : 'Awaiting data; retrying automatically. '}${localizedError(o.error, language)}`}
                    </Typography.Text>
                  )}
                </Card>
              ))}
            </Space>
          )}
        </Drawer>
      </main>
    </div>
  )
}
