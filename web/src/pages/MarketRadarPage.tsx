import { uiText, marketText, localizedError } from '../i18n/uiText'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Select,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  RadarChartOutlined,
  ReloadOutlined,
  SearchOutlined,
  RightOutlined,
} from '@ant-design/icons'
import type { TableColumnsType } from 'antd'
import HeaderBar from '../components/landing/HeaderBar'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'

export interface RadarItem {
  category: 'crypto' | 'equity'
  symbol: string
  price: number
  change_24h: number
  quote_volume: number
  price_as_of: string
  candle_at?: string
  change?: number
  volume_ratio?: number
  oi_change?: number
  oi_at?: string
  dif?: number
  dea?: number
  histogram?: number
  macd: string
  bias: string
  signals: { kind: string; label: string; direction: string }[]
  notes: string[]
  bull: number
  bear: number
}
interface RadarResponse {
  result?: {
    items: RadarItem[]
    as_of: string
    eligible: number
    scanned: number
    analyzed: number
    warnings: string[]
  } | null
  scanning: boolean
  error?: string
  next_scan: string
  last_attempt: string
}
const percent = (n?: number) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
const time = (s: string | undefined, language: 'zh' | 'en') =>
  !s || s.startsWith('0001')
    ? '—'
    : new Date(s).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
const compact = (n: number, language: 'zh' | 'en') =>
  new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n)

const biasColor: Record<string, string> = {
  bull: 'success',
  bear: 'red',
  mixed: 'gold',
  neutral: 'default',
  unavailable: 'default',
}
function RadarDetails({ item }: { item: RadarItem }) {
  const { language } = useLanguage()
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          {
            key: 'dif',
            label: uiText('DIF / DEA / 柱值', language),
            children: `${item.dif?.toPrecision(5) ?? '—'} / ${item.dea?.toPrecision(5) ?? '—'} / ${item.histogram?.toPrecision(5) ?? '—'}`,
          },
          {
            key: 'score',
            label: uiText('方向线索权重', language),
            children:
              language === 'zh'
                ? `向上 ${item.bull} 分 / 向下 ${item.bear} 分（不是胜率）`
                : `Bull ${item.bull} / Bear ${item.bear} points (not win probability)`,
          },
          {
            key: 'volume',
            label: uiText('24h 成交额', language),
            children: `${compact(item.quote_volume, language)} USDT`,
          },
          {
            key: 'price-time',
            label: uiText('行情时间', language),
            children: time(item.price_as_of, language),
          },
          {
            key: 'candle-time',
            label: uiText('K线收盘', language),
            children: time(item.candle_at, language),
          },
          {
            key: 'oi-time',
            label: uiText('持仓快照', language),
            children: time(item.oi_at, language),
          },
        ]}
      />
      {item.notes.map((n, i) => (
        <Typography.Paragraph key={i} type="secondary" style={{ margin: 0 }}>
          {marketText(n, language)}
        </Typography.Paragraph>
      ))}
    </Space>
  )
}
export function RadarCard({ item }: { item: RadarItem }) {
  const { language } = useLanguage()
  const biasNames: Record<string, string> = {
    bull: uiText('偏多线索', language),
    bear: uiText('偏空线索', language),
    mixed: uiText('多空分歧', language),
    neutral: uiText('方向未明', language),
    unavailable: uiText('数据不足', language),
  }

  return (
    <Card
      title={item.symbol}
      extra={<Tag color={biasColor[item.bias]}>{biasNames[item.bias]}</Tag>}
    >
      <Space orientation="vertical" size={20} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          {item.category === 'equity'
            ? uiText('美股／ETF 永续', language)
            : uiText('加密货币永续', language)}{' '}
          · {item.price.toLocaleString('en-US', { maximumFractionDigits: 8 })}{' '}
          USDT
        </Typography.Text>
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'price',
              label: uiText('15m 价格', language),
              children: percent(item.change),
            },
            {
              key: 'volume',
              label: uiText('成交额 / 前20根均值', language),
              children:
                item.volume_ratio == null
                  ? '—'
                  : `${item.volume_ratio.toFixed(2)}×`,
            },
            {
              key: 'oi',
              label: uiText('15m 持仓量变化', language),
              children: percent(item.oi_change),
            },
          ]}
        />
        <Space wrap>
          {item.signals.map((s) => (
            <Tag
              key={s.kind}
              color={
                s.direction === 'bull'
                  ? 'success'
                  : s.direction === 'bear'
                    ? 'red'
                    : 'default'
              }
            >
              {marketText(s.label, language)}
            </Tag>
          ))}
        </Space>
        <Collapse
          size="small"
          items={[
            {
              key: 'detail',
              label: `${language === 'zh' ? '指标与判断依据' : 'Indicators and evidence'} · MACD ${marketText(item.macd || '不可用', language)}`,
              children: <RadarDetails item={item} />,
            },
          ]}
        />
      </Space>
    </Card>
  )
}
export function MarketRadarPage() {
  const { language, setLanguage } = useLanguage()
  const biasNames: Record<string, string> = {
    bull: uiText('偏多线索', language),
    bear: uiText('偏空线索', language),
    mixed: uiText('多空分歧', language),
    neutral: uiText('方向未明', language),
    unavailable: uiText('数据不足', language),
  }
  const methodology = (
    <div className="grid md:grid-cols-2 gap-6 text-sm leading-7 text-[var(--text-secondary)]">
      <div>
        <p>
          {uiText(
            '扫描范围：加密货币、美股／ETF USDT 永续各自按24h成交额取前60个，最多120个。美股分类来自币安 EQUITY 元数据，属于合约，不是股票现货。',
            language
          )}{' '}
        </p>
        <p>
          {uiText(
            'MACD：EMA(12,26,9)，以最近两根已收盘15分钟K线交叉判定金叉／死叉，200根预热，最低100根。',
            language
          )}{' '}
        </p>
        <p>
          {uiText(
            '放量：当前已收盘K线成交额达到前20根均值2倍。价格异动：同期涨跌绝对值达到1.5%。',
            language
          )}{' '}
        </p>
      </div>
      <div>
        <p>
          {uiText(
            '持仓量：同一15分钟区间变化绝对值≥3%。突破：收盘价突破此前20根高／低点。',
            language
          )}{' '}
        </p>
        <p>
          {uiText(
            '规则权重：交叉2分、突破2分、放量且同向涨跌1分；增仓≥3%且价格变动≥0.3%加对应1分。双向均有分标记分歧，不是涨跌概率。',
            language
          )}{' '}
        </p>
        <p>
          {uiText(
            '缺失指标显示“—”，不当作0。仅供观察，不保证未来涨跌，不触发下单。',
            language
          )}
        </p>
      </div>
    </div>
  )

  const { user, logout } = useAuth()
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [direction, setDirection] = useState('all'),
    [kind, setKind] = useState('all'),
    [onlyEvents, setOnlyEvents] = useState(true),
    [view, setView] = useState('table')
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<RadarResponse>(
      '/api/market/radar',
      async (url: string) => {
        const response = await fetch(url)
        if (!response.ok)
          throw new Error(uiText('暂时无法连接扫描服务', language))
        return response.json()
      },
      {
        refreshInterval: 10000,
        revalidateOnFocus: true,
        dedupingInterval: 5000,
      }
    )
  const result = data?.result,
    items = result?.items ?? []
  const scoped = items.filter(
    (i) => category === 'all' || i.category === category
  )
  const shown = scoped.filter(
    (i) =>
      (!onlyEvents || i.signals.length > 0) &&
      i.symbol.includes(query.trim().toUpperCase()) &&
      (direction === 'all' || i.bias === direction) &&
      (kind === 'all' || i.signals.some((s) => s.kind === kind))
  )
  const stale =
    !!result && Date.now() - new Date(result.as_of).getTime() > 300000
  const columns: TableColumnsType<RadarItem> = [
    {
      title: uiText('合约', language),
      dataIndex: 'symbol',
      key: 'symbol',
      fixed: 'left',
      width: 170,
      render: (s, i) => (
        <Space orientation="vertical" size={2}>
          <Typography.Text strong>{s}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {i.category === 'equity'
              ? uiText('美股／ETF', language)
              : uiText('加密货币', language)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: uiText('方向', language),
      dataIndex: 'bias',
      width: 115,
      render: (b) => (
        <span className={`radar-bias radar-tone-${b}`}>
          <span className="radar-status-dot" />
          {biasNames[b]}
        </span>
      ),
    },
    {
      title: uiText('价格 · USDT', language),
      dataIndex: 'price',
      align: 'right',
      width: 145,
      render: (n) => n.toLocaleString('en-US', { maximumFractionDigits: 8 }),
    },
    {
      title: uiText('15m 涨跌', language),
      dataIndex: 'change',
      align: 'right',
      width: 115,
      sorter: (a, b) => (a.change ?? -Infinity) - (b.change ?? -Infinity),
      render: (n) => (
        <Typography.Text
          type={n == null ? 'secondary' : n < 0 ? 'danger' : 'success'}
        >
          {percent(n)}
        </Typography.Text>
      ),
    },
    {
      title: uiText('放量倍数', language),
      dataIndex: 'volume_ratio',
      align: 'right',
      width: 110,
      sorter: (a, b) =>
        (a.volume_ratio ?? -Infinity) - (b.volume_ratio ?? -Infinity),
      render: (n) => (n == null ? '—' : `${n.toFixed(2)}×`),
    },
    {
      title: uiText('持仓量变化', language),
      dataIndex: 'oi_change',
      align: 'right',
      width: 125,
      sorter: (a, b) => (a.oi_change ?? -Infinity) - (b.oi_change ?? -Infinity),
      render: (n) => percent(n),
    },
    {
      title: 'MACD',
      dataIndex: 'macd',
      width: 160,
      render: (n) => (
        <span
          className={`radar-macd ${n === '金叉' ? 'radar-tone-bull' : n === '死叉' ? 'radar-tone-bear' : ''}`}
        >
          {marketText(n || '不可用', language)}
        </span>
      ),
    },
    {
      title: uiText('触发信号', language),
      key: 'signals',
      width: 290,
      render: (_, i) =>
        i.signals.length ? (
          <Space size={[6, 6]} wrap>
            {i.signals.map((s) => (
              <Tag
                key={s.kind}
                className={`radar-signal radar-tone-${s.direction}`}
                style={{
                  color:
                    s.direction === 'bull'
                      ? 'var(--color-positive)'
                      : s.direction === 'bear'
                        ? '#e8aab3'
                        : '#adbdc3',
                  background:
                    s.direction === 'bull'
                      ? 'var(--color-positive-bg)'
                      : s.direction === 'bear'
                        ? '#fda4af0c'
                        : '#ffffff06',
                  border: 0,
                }}
              >
                {marketText(s.label, language)}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">
            {uiText('暂无异动', language)}
          </Typography.Text>
        ),
    },
  ]
  return (
    <>
      <HeaderBar
        currentPage="radar"
        isLoggedIn={!!user}
        user={user}
        onLogout={logout}
        language={language}
        onLanguageChange={setLanguage}
      />
      <main id="main-content" className="desk-shell radar-workspace">
        <div className="ant-desk-page-title">
          <div>
            <Typography.Title level={2}>
              <RadarChartOutlined
                style={{ color: '#34d399', marginRight: 12 }}
              />
              {uiText('市场异动雷达', language)}{' '}
            </Typography.Title>
            <p className="ant-desk-description">
              {uiText(
                '币安合约异动监测 · 15分钟指标 · 加密货币与美股／ETF',
                language
              )}{' '}
            </p>
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={isValidating}
            onClick={() => void mutate()}
          >
            {uiText('刷新结果', language)}{' '}
          </Button>
        </div>
        <Space wrap size={24}>
          <Badge
            status={
              error || data?.error || stale
                ? 'warning'
                : data?.scanning
                  ? 'processing'
                  : 'success'
            }
            text={
              error
                ? uiText('连接失败', language)
                : data?.error
                  ? uiText('扫描失败', language)
                  : data?.scanning
                    ? uiText('正在扫描', language)
                    : result
                      ? uiText('自动扫描运行中', language)
                      : uiText('等待首次扫描', language)
            }
          />
          <Typography.Text type="secondary">
            {uiText('上次结果：', language)}
            {time(result?.as_of, language)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {uiText('下轮扫描：', language)}
            {time(data?.next_scan, language)}
          </Typography.Text>
        </Space>
        {(error || data?.error || stale) && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 20 }}
            title={localizedError(
              error?.message || data?.error || '结果已超过5分钟',
              language
            )}
            description={
              result
                ? uiText('保留上次结果供查看，请注意数据时间。', language)
                : undefined
            }
          />
        )}
        <div className="ant-desk-stats">
          {[
            {
              label: uiText('分析 / 扫描', language),
              value: result
                ? `${scoped.filter((i) => i.candle_at).length} / ${scoped.length}`
                : '—',
            },
            {
              label: uiText('偏多线索', language),
              value: result
                ? scoped.filter((i) => i.bias === 'bull').length
                : '—',
              color: '#34d399',
            },
            {
              label: uiText('偏空线索', language),
              value: result
                ? scoped.filter((i) => i.bias === 'bear').length
                : '—',
              color: '#ff8492',
            },
            {
              label: uiText('异动合约', language),
              value: result
                ? scoped.filter((i) => i.signals.length > 0).length
                : '—',
            },
          ].map((s) => (
            <Card key={marketText(s.label, language)}>
              <Statistic
                title={marketText(s.label, language)}
                value={s.value}
                styles={{ content: { color: s.color, fontSize: 28 } }}
              />
            </Card>
          ))}
        </div>
        <Card
          title={uiText('异动列表', language)}
          extra={
            <Segmented
              aria-label={uiText('显示方式', language)}
              options={[
                { label: uiText('表格', language), value: 'table' },
                { label: uiText('卡片', language), value: 'cards' },
              ]}
              value={view}
              onChange={setView}
            />
          }
        >
          {' '}
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <div className="ant-desk-filters">
              <Select
                aria-label={uiText('资产分类', language)}
                value={category}
                onChange={setCategory}
                options={[
                  {
                    value: 'all',
                    label:
                      language === 'zh'
                        ? `全部资产（${items.length}）`
                        : `All assets (${items.length})`,
                  },
                  {
                    value: 'crypto',
                    label:
                      language === 'zh'
                        ? `加密货币（${items.filter((i) => i.category === 'crypto').length}）`
                        : `Crypto (${items.filter((i) => i.category === 'crypto').length})`,
                  },
                  {
                    value: 'equity',
                    label:
                      language === 'zh'
                        ? `美股／ETF（${items.filter((i) => i.category === 'equity').length}）`
                        : `Equities / ETFs (${items.filter((i) => i.category === 'equity').length})`,
                  },
                ]}
              />
              <Input
                prefix={<SearchOutlined />}
                allowClear
                aria-label={uiText('搜索合约', language)}
                placeholder={uiText('搜索 BTC、TSLA、AAPL…', language)}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Select
                aria-label={uiText('方向筛选', language)}
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'all', label: uiText('全部方向', language) },
                  ...Object.entries(biasNames).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
              <Select
                aria-label={uiText('信号筛选', language)}
                value={kind}
                onChange={setKind}
                options={[
                  ['all', uiText('全部信号', language)],
                  ['volume', uiText('成交额放大', language)],
                  ['oi', uiText('持仓量异动', language)],
                  ['macd', uiText('MACD 金叉／死叉', language)],
                  ['breakout', uiText('突破／跌破', language)],
                  ['price', uiText('价格急涨／急跌', language)],
                ].map(([value, label]) => ({ value, label }))}
              />
              <Checkbox
                checked={onlyEvents}
                onChange={(e) => setOnlyEvents(e.target.checked)}
              >
                {uiText('仅看异动', language)}{' '}
              </Checkbox>
            </div>
            <Typography.Text type="secondary">
              {shown.length} {uiText('个结果 · 同周期持仓量已同步', language)}{' '}
              {scoped.filter((i) => i.oi_change != null).length} /{' '}
              {scoped.length}{' '}
              {uiText('个 · “—”表示缺失，不计入判断', language)}{' '}
            </Typography.Text>
            {isLoading || (!result && !error && !data?.error) ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : view === 'table' ? (
              <Table
                className="ant-desk-radar-table"
                rowKey="symbol"
                dataSource={shown}
                columns={columns}
                scroll={{ x: 1274 }}
                tableLayout="fixed"
                pagination={{
                  defaultPageSize: 10,
                  showSizeChanger: true,
                  pageSizeOptions: [10, 20, 60],
                  showTotal: (n) =>
                    language === 'zh' ? `共 ${n} 个合约` : `${n} contracts`,
                }}
                expandable={{
                  expandedRowRender: (i) => <RadarDetails item={i} />,
                  columnTitle: '',
                  columnWidth: 44,
                  expandIcon: ({ expanded, onExpand, record }) => (
                    <Button
                      type="text"
                      size="small"
                      className="radar-expand"
                      aria-label={
                        expanded
                          ? uiText('收起详情', language)
                          : uiText('展开详情', language)
                      }
                      aria-expanded={expanded}
                      icon={<RightOutlined rotate={expanded ? 90 : 0} />}
                      onClick={(event) => onExpand(record, event)}
                    />
                  ),
                }}
                locale={{
                  emptyText: (
                    <Empty
                      description={uiText(
                        '当前筛选下没有匹配结果，可取消“仅看异动”或调整条件。',
                        language
                      )}
                    />
                  ),
                }}
              />
            ) : shown.length ? (
              <div className="radar-grid">
                {shown.map((i) => (
                  <RadarCard key={i.symbol} item={i} />
                ))}
              </div>
            ) : (
              <Empty description={uiText('当前筛选下没有匹配结果', language)} />
            )}
          </Space>
        </Card>
        {!!result?.warnings.length && (
          <Alert
            style={{ marginTop: 20 }}
            type="warning"
            showIcon
            title={result.warnings
              .map((w) => localizedError(w, language))
              .join('; ')}
          />
        )}
        <Collapse
          style={{ marginTop: 24 }}
          items={[
            {
              key: 'method',
              label: uiText('数据来源与判断方法', language),
              children: methodology,
            },
          ]}
        />
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginTop: 16 }}
        >
          {uiText(
            '数据源：币安官方公开 API。两类资产各取成交额前60，每轮完成2分钟后重扫。本页只读，不触发交易。',
            language
          )}{' '}
        </Typography.Paragraph>
      </main>
    </>
  )
}
