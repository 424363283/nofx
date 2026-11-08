import { useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api } from '../lib/api'
import type { HistoryIncome, HistoryOrder, TradingHistory } from '../types'
import type { Language } from '../i18n/translations'

const number = (value?: number | null, digits = 4) =>
  value == null
    ? '—'
    : value.toLocaleString('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: 2,
      })
const timestamp = (value: number, language: Language) =>
  new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-GB', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
const signed = (value?: number | null) =>
  value == null ? '—' : `${value > 0 ? '+' : ''}${number(value, 8)}`
const amount = (value?: number | null) => (
  <span
    className={
      value == null || value === 0
        ? ''
        : value > 0
          ? 'is-positive'
          : 'is-negative'
    }
  >
    {signed(value)}
  </span>
)

export function TradingHistoryPanel({
  traderId,
  exchange,
  language,
  active = true,
}: {
  traderId: string
  exchange?: string
  language: Language
  active?: boolean
}) {
  const [days, setDays] = useState(7)
  const [symbol, setSymbol] = useState('')
  const forceRefresh = useRef(false)
  const zh = language === 'zh'
  const { data, error, isValidating, mutate } = useSWR<TradingHistory>(
    active && exchange === 'binance'
      ? ['trading-history', traderId, days]
      : null,
    () => {
      const refresh = forceRefresh.current
      forceRefresh.current = false
      return api.getTradingHistory(traderId, days, refresh)
    },
    {
      refreshInterval: 30000,
      dedupingInterval: 5000,
      revalidateOnFocus: true,
      keepPreviousData: false,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  )
  const orders = useMemo(
    () =>
      data?.orders.filter(
        (order) =>
          (order.action === 'close_long' ||
            order.action === 'close_short' ||
            ((order.action === 'buy' || order.action === 'sell') &&
              order.realized_pnl !== 0)) &&
          order.symbol.includes(symbol.trim().toUpperCase())
      ),
    [data, symbol]
  )
  const actions: Record<string, string> = zh
    ? {
        open_long: '开多 / 加仓',
        close_long: '平多 / 减仓',
        open_short: '开空 / 加仓',
        close_short: '平空 / 减仓',
        buy: '买入（单向）',
        sell: '卖出（单向）',
      }
    : {
        open_long: 'Open / add long',
        close_long: 'Close / reduce long',
        open_short: 'Open / add short',
        close_short: 'Close / reduce short',
        buy: 'Buy (one-way)',
        sell: 'Sell (one-way)',
      }
  const types: Record<string, string> = zh
    ? {
        REALIZED_PNL: '已实现盈亏',
        COMMISSION: '手续费',
        FUNDING_FEE: '资金费',
        TRANSFER: '资金转入 / 转出',
        COMMISSION_REBATE: '手续费返还',
        INSURANCE_CLEAR: '保险清算',
      }
    : {
        REALIZED_PNL: 'Realized PnL',
        COMMISSION: 'Commission',
        FUNDING_FEE: 'Funding fee',
        TRANSFER: 'Transfers',
      }
  if (exchange !== 'binance')
    return (
      <Empty
        description={
          zh
            ? '历史订单目前仅支持币安 U 本位账户'
            : 'Order history currently supports Binance USDⓈ-M accounts'
        }
      />
    )
  const summary = data?.summary
  return (
    <div style={{ paddingTop: 12 }}>
      <Space
        wrap
        style={{
          marginBottom: 16,
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        <Space wrap>
          <Select
            aria-label={zh ? '历史查询区间' : 'History period'}
            value={days}
            onChange={setDays}
            options={[
              { value: 1, label: zh ? '最近24小时' : 'Last 24 hours' },
              { value: 7, label: zh ? '最近7天' : 'Last 7 days' },
              { value: 30, label: zh ? '最近30天' : 'Last 30 days' },
            ]}
            style={{ width: 150 }}
          />
          <Input
            aria-label={zh ? '筛选历史合约' : 'Filter historical contracts'}
            placeholder={
              zh ? '筛选合约，如 JCTUSDT' : 'Filter symbol, e.g. JCTUSDT'
            }
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            allowClear
            style={{ width: 230 }}
          />
        </Space>
        <Button
          aria-label={zh ? '刷新记录' : 'Refresh history'}
          icon={<ReloadOutlined />}
          loading={isValidating}
          onClick={() => {
            forceRefresh.current = true
            void mutate()
          }}
        >
          {zh ? '刷新记录' : 'Refresh history'}
        </Button>
      </Space>
      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          description={
            data
              ? zh
                ? '当前保留上次成功查询的数据，请核对同步时间。'
                : 'Showing the last successful result. Check its timestamp.'
              : zh
                ? '历史数据未加载成功，不代表没有成交或收益为零。'
                : 'History is unavailable; this does not mean there were no trades or zero profit.'
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {data?.warnings.map((warning, index) => (
        <Alert
          key={index}
          type="warning"
          showIcon
          title={
            zh
              ? warning
              : 'Some records are incomplete. Try a shorter period or refresh.'
          }
          style={{ marginBottom: 12 }}
        />
      ))}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          {
            label: zh ? '交易净收益（已实现）' : 'Net realized trading income',
            value: summary?.trading_net,
            note: zh
              ? '已实现盈亏 + 手续费账变 + 资金费'
              : 'Realized PnL + commission ledger + funding',
          },
          {
            label: zh ? '已实现盈亏' : 'Realized PnL',
            value: summary?.realized_pnl,
            note: zh ? '不含未平仓浮盈' : 'Excludes unrealized PnL',
          },
          {
            label: zh ? '手续费账变' : 'Commission ledger',
            value: summary?.commission,
            note: zh ? '扣费通常为负数' : 'Fees are usually negative',
          },
          {
            label: zh ? '资金费收支' : 'Funding income / cost',
            value: summary?.funding,
            note: zh ? '正数收入，负数支出' : 'Positive income, negative cost',
          },
        ].map((metric) => (
          <Col key={metric.label} xs={24} sm={12} xl={6}>
            <Card size="small">
              <Statistic
                title={metric.label}
                value={metric.value ?? '—'}
                formatter={() => (
                  <>
                    {amount(metric.value)} <small>USDT</small>
                  </>
                )}
              />
              <Typography.Text type="secondary">{metric.note}</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>
      {data && (
        <Typography.Paragraph type="secondary">
          {!data.income_complete && (
            <Tag color="warning">
              {zh ? '部分账变，汇总未完整' : 'Partial ledger totals'}
            </Tag>
          )}
          {zh ? '期间资金转入/转出' : 'Transfers in period'}{' '}
          {amount(summary?.transfers)} USDT ·{' '}
          {zh ? '其他账变' : 'Other ledger changes'} {amount(summary?.other)}{' '}
          USDT · {zh ? 'USDT账变合计' : 'USDT ledger total'}{' '}
          {amount(summary?.ledger_net)} USDT
          <br />
          {timestamp(data.start, language)} — {timestamp(data.end, language)} ·{' '}
          {zh ? '北京时间；同步于' : 'UTC+8; synced'}{' '}
          {timestamp(Date.parse(data.fetched_at), language)}
          {summary?.other_assets.length ? (
            <>
              <br />
              {zh
                ? '其他币种账变，未折算进USDT汇总：'
                : 'Other assets, not converted into USDT: '}
              {summary.other_assets
                .map((a) => `${signed(a.amount)} ${a.asset}`)
                .join(' · ')}
            </>
          ) : null}
        </Typography.Paragraph>
      )}
      <Alert
        type="info"
        showIcon
        title={
          zh
            ? '交易净收益用于查看已结算的收益；充值、转账和未实现浮盈单独处理。'
            : 'Net trading income includes settled results. Transfers and unrealized PnL are separate.'
        }
        description={
          zh
            ? '仅展示平仓 / 减仓成交，包含手动成交；单向持仓按非零已实现盈亏识别平仓。同一订单的多次成交合并；成交净收益不分摊资金费，账户汇总不受列表筛选影响。'
            : 'Shows closing / reducing orders, including manual trades. One-way closes are identified by non-zero realized PnL. Fills are grouped by order. Per-order net PnL excludes funding; list filters do not change account totals.'
        }
        style={{ marginBottom: 16 }}
      />
      <Tabs
        items={[
          {
            key: 'orders',
            label: `${zh ? '已平仓订单' : 'Closed orders'}${orders ? ` · ${orders.length}` : ''}`,
            children: (
              <Table<HistoryOrder>
                rowKey="id"
                dataSource={orders}
                loading={!data && !error}
                scroll={{ x: 1300 }}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                locale={{
                  emptyText:
                    error && !data
                      ? zh
                        ? '历史订单读取失败'
                        : 'Unable to load history'
                      : zh
                        ? '所选区间没有已返回的平仓记录'
                        : 'No returned closing orders in this period',
                }}
                columns={[
                  {
                    title: zh ? '成交时间' : 'Fill time',
                    dataIndex: 'last_time',
                    width: 175,
                    render: (v) => timestamp(v, language),
                  },
                  {
                    title: zh ? '合约' : 'Symbol',
                    dataIndex: 'symbol',
                    width: 125,
                  },
                  {
                    title: zh ? '操作' : 'Action',
                    dataIndex: 'action',
                    width: 140,
                    render: (v) => (
                      <Tag
                        color={
                          v.includes('short')
                            ? 'red'
                            : v.includes('long')
                              ? 'green'
                              : 'default'
                        }
                      >
                        {actions[v] || v}
                      </Tag>
                    ),
                  },
                  {
                    title: zh ? '成交均价' : 'Average fill',
                    dataIndex: 'price',
                    align: 'right',
                    render: (v) => number(v, 8),
                  },
                  {
                    title: zh ? '成交数量' : 'Filled quantity',
                    dataIndex: 'quantity',
                    align: 'right',
                    render: (v) => number(v, 8),
                  },
                  {
                    title: zh ? '成交额 / USDT' : 'Notional / USDT',
                    dataIndex: 'notional',
                    align: 'right',
                    render: (v) => number(v),
                  },
                  {
                    title: zh ? '已实现盈亏 / USDT' : 'Realized PnL / USDT',
                    dataIndex: 'realized_pnl',
                    align: 'right',
                    render: (v) => amount(v),
                  },
                  {
                    title: zh ? '手续费' : 'Fees',
                    dataIndex: 'commissions',
                    align: 'right',
                    render: (fees: HistoryOrder['commissions']) =>
                      fees
                        .map((fee) => `${number(fee.amount, 8)} ${fee.asset}`)
                        .join(' · ') || '—',
                  },
                  {
                    title: zh ? '成交净收益 / USDT' : 'Net fill PnL / USDT',
                    dataIndex: 'net_pnl',
                    align: 'right',
                    render: (v) => amount(v),
                  },
                  {
                    title: zh ? '订单号 / 成交笔数' : 'Order / fills',
                    key: 'order',
                    render: (_, row) => (
                      <span>
                        {row.order_id}
                        <br />
                        <small>
                          {row.fills} {zh ? '笔成交' : 'fills'}
                        </small>
                      </span>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'ledger',
            label: zh ? '资金账变明细' : 'Income ledger',
            children: (
              <Table<HistoryIncome>
                rowKey="id"
                dataSource={data?.income}
                loading={!data && !error}
                pagination={{ pageSize: 10, showSizeChanger: true }}
                scroll={{ x: 700 }}
                columns={[
                  {
                    title: zh ? '时间' : 'Time',
                    dataIndex: 'time',
                    render: (v) => timestamp(v, language),
                  },
                  {
                    title: zh ? '类型' : 'Type',
                    dataIndex: 'type',
                    render: (v) => types[v] || v,
                  },
                  {
                    title: zh ? '合约' : 'Symbol',
                    dataIndex: 'symbol',
                    render: (v) => v || '—',
                  },
                  {
                    title: zh ? '金额' : 'Amount',
                    dataIndex: 'amount',
                    align: 'right',
                    render: (v) => amount(v),
                  },
                  { title: zh ? '币种' : 'Asset', dataIndex: 'asset' },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
