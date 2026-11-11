import { uiText } from '../i18n/uiText'
import { formatPrice } from '../lib/priceFormatting'
import { useLanguage } from '../contexts/LanguageContext'
import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Empty,
  Select,
  Skeleton,
  Table,
  Tabs,
  Typography,
} from 'antd'
import {
  ArrowRightOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { EquityChart } from './EquityChart'
import { RadarTradingPanel } from './RadarTradingPanel'
import AILearning from './AILearning'
import { TradingHistoryPanel } from './TradingHistoryPanel'
import type {
  AccountInfo,
  DecisionRecord,
  Position,
  Statistics,
  SystemStatus,
  TraderInfo,
} from '../types'
import type { Language } from '../i18n/translations'
import './design/dashboard.css'
import { decisionErrorSummary } from '../lib/decisionError'
import type { PositionStreamUpdate } from '../hooks/usePositionStream'
interface Props {
  selectedTrader?: TraderInfo
  traders?: TraderInfo[]
  selectedTraderId?: string
  onTraderSelect: (id: string) => void
  status?: SystemStatus
  account?: AccountInfo
  positions?: Position[]
  positionsAsOf?: number
  positionsConfirmed?: boolean
  positionsError?: string
  positionStream?: Partial<PositionStreamUpdate>
  decisions?: DecisionRecord[]
  stats?: Statistics
  lastUpdate: string
  language: Language
}
const money = (n?: number, digits = 2) =>
  n == null
    ? '—'
    : n.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
function DecisionHistory({ records }: { records: DecisionRecord[] }) {
  const { language } = useLanguage()
  const actionNames: Record<string, string> = {
    open_long: uiText('开多', language),
    open_short: uiText('开空', language),
    close_long: uiText('平多', language),
    close_short: uiText('平空', language),
    hold: uiText('持有', language),
    wait: uiText('观望', language),
  }

  if (!records.length)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={uiText('暂无决策记录，交易员运行后会显示在这里', language)}
      />
    )
  return (
    <Collapse
      className="dashboard-history"
      items={[...records].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).map((r) => ({
        key: `${r.timestamp}-${r.cycle_number}`,
        label: (
          <div className="decision-heading">
            <strong>
              {new Date(r.timestamp).toLocaleString(
                language === 'zh' ? 'zh-CN' : 'en-GB',
                { timeZone: 'Asia/Shanghai', hour12: false }
              )}
            </strong>
            <span>
              {language === 'zh' ? '北京时间' : 'UTC+8'}
            </span>
            <Badge
              status={r.success ? 'success' : 'error'}
              text={
                r.success
                  ? uiText('已完成', language)
                  : uiText('执行失败', language)
              }
            />
          </div>
        ),
        children: (
          <div className="decision-detail">
            <Typography.Text type="secondary">
              {language === 'zh'
                ? `运行内周期 #${r.cycle_number}；服务重启或重新加载交易员后从1计数，列表按决策时间倒序排列。`
                : `Run cycle #${r.cycle_number}; resets when the service restarts or the trader reloads. Records are ordered newest first.`}
            </Typography.Text>
            {r.decision_source === 'indicator_fallback' && (
              <Alert type="warning" showIcon title="指标备用模式（非 AI 决策）" description={decisionErrorSummary(r.fallback_reason || 'AI 不可用，本轮由指标规则判断；原有执行风控继续生效。')} />
            )}
            {(r.decision_source === 'system_only' || r.decision_source === 'hybrid') && (
              <Alert type={r.decision_source === 'hybrid' ? 'info' : 'warning'} showIcon
                title={r.decision_source === 'hybrid' ? '系统自主判断 + AI 复核' : '系统自主判断（AI 不可用）'}
                description={r.fallback_reason ? decisionErrorSummary(r.fallback_reason) : '系统先判断行情和多空机会，AI参与复核，最终执行仍须通过风控。'} />
            )}
            {!!r.system_analysis?.length && (
              <Table size="small" rowKey="symbol" pagination={false} scroll={{ x: 1000 }}
                dataSource={r.system_analysis}
                columns={[
                  { title: '系统分析', dataIndex: 'symbol' },
                  { title: '行情 / 周期', render: (_, a) => `${a.regime} / ${a.timeframe || '—'}` },
                  { title: '多 / 空规则分（非胜率）', render: (_, a) => `${a.long_score} / ${a.short_score}` },
                  { title: '形态', dataIndex: 'setup' },
                  { title: '参考价', render: (_, a) => a.entry_reference > 0 ? formatPrice(a.entry_reference) : '—' },
                  { title: '止损 / 目标', render: (_, a) => `${a.decision.stop_loss ? formatPrice(a.decision.stop_loss) : '—'} / ${a.decision.take_profit ? formatPrice(a.decision.take_profit) : '—'}` },
                  { title: '系统结论 / 原因', render: (_, a) => `${actionNames[a.decision.action] || a.decision.action}：${a.decision.reasoning}` },
                ]} />
            )}
            {!!r.ai_decisions?.length && (
              <Table size="small" rowKey={(_, i) => String(i)} pagination={false} dataSource={r.ai_decisions}
                columns={[
                  { title: 'AI复核标的', dataIndex: 'symbol' },
                  { title: 'AI意见', dataIndex: 'action', render: (v) => actionNames[v] || v },
                  { title: '依据', dataIndex: 'reasoning' },
                ]} />
            )}
            {r.error_message && (
              <Alert type="error" showIcon title={decisionErrorSummary(r.error_message)} />
            )}
            <Table
              size="small"
              rowKey={(_, index) => String(index)}
              pagination={false}
              scroll={{ x: 1000 }}
              dataSource={r.decisions || []}
              locale={{ emptyText: uiText('本轮没有执行交易', language) }}
              columns={[
                { title: uiText('合约', language), dataIndex: 'symbol' },
                {
                  title: uiText('操作', language),
                  dataIndex: 'action',
                  render: (v) => actionNames[v] || v,
                },
                {
                  title: uiText('杠杆', language),
                  dataIndex: 'leverage',
                  render: (v) => (v ? `${v}×` : '—'),
                },
                {
                  title: uiText('价格', language),
                  dataIndex: 'price',
                  render: (v) => v > 0 ? formatPrice(v) : '—',
                },
                {
                  title: language === 'zh' ? '止损 / 止盈' : 'Stop loss / take profit',
                  key: 'protection_prices',
                  render: (_, row) => row.stop_loss && row.take_profit
                    ? `${formatPrice(row.stop_loss)} / ${formatPrice(row.take_profit)}` : '—',
                },
                {
                  title: language === 'zh' ? '保护单状态' : 'Protection',
                  dataIndex: 'protection_status',
                  render: (value) => (({
                    confirmed: language === 'zh' ? '止盈止损已同步' : 'Protection confirmed',
                    pending: language === 'zh' ? '同步中' : 'Pending',
                    rolled_back: language === 'zh' ? '保护失败，已平仓' : 'Protection failed; position closed',
                    failed: language === 'zh' ? '保护失败，平仓未确认' : 'Protection failed; close unconfirmed',
                  } as Record<string, string>)[value as string] || '—'),
                },
                {
                  title: uiText('结果', language),
                  dataIndex: 'success',
                  render: (v, row) => (
                    <Badge
                      status={v ? 'success' : 'error'}
                      text={
                        v
                          ? uiText('成功', language)
                          : (row.action === 'open_long' || row.action === 'open_short') ? (language === 'zh' ? '开仓失败' : 'Entry failed') : uiText('未执行', language)
                      }
                    />
                  ),
                },
                { title: uiText('说明', language), key: 'reason', render: (_, row) => row.error || row.reasoning || '—' },
              ]}
            />
            <Typography.Text type="secondary">
              {uiText('候选合约：', language)}
              {r.candidate_coins?.join('、') || '本轮无候选'}{' '}
              {uiText('· 账户净值', language)}{' '}
              {money(r.account_state?.total_balance)} USDT
            </Typography.Text>
            <Collapse
              ghost
              items={[
                ...(r.raw_response || (r.error_message && decisionErrorSummary(r.error_message) !== r.error_message)
                  ? [{ key: 'raw-response', label: language === 'zh' ? '原始响应 / 错误详情' : 'Raw response / error details',
                      children: <pre>{r.raw_response || r.error_message}</pre> }]
                  : []),
                ...(r.input_prompt
                  ? [
                      {
                        key: 'input',
                        label: uiText('模型输入', language),
                        children: <pre>{r.input_prompt}</pre>,
                      },
                    ]
                  : []),
                ...(r.cot_trace
                  ? [
                      {
                        key: 'analysis',
                        label: uiText('模型分析记录', language),
                        children: <pre>{r.cot_trace}</pre>,
                      },
                    ]
                  : []),
                ...(r.execution_log?.length
                  ? [
                      {
                        key: 'logs',
                        label: uiText('执行日志', language),
                        children: <pre>{r.execution_log.join('\n')}</pre>,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ),
      }))}
    />
  )
}
export function TradingDashboard({
  selectedTrader,
  traders,
  selectedTraderId,
  onTraderSelect,
  status,
  account,
  positions,
  positionsConfirmed,
  positionsAsOf,
  positionsError,
  positionStream,
  decisions,
  lastUpdate,
  language,
}: Props) {
  const [activeTab, setActiveTab] = useState('positions')
  const confirmedPositions = positionsConfirmed ?? (positions != null)
  if (!selectedTrader)
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    )
  // Do not infer a loss from an empty or unavailable account.
  const showCapitalChange = account != null &&
    Number.isFinite(account.total_equity) && account.total_equity !== 0 &&
    Number.isFinite(account.initial_balance) && account.initial_balance > 0 &&
    Number.isFinite(account.total_pnl) && Number.isFinite(account.total_pnl_pct)
  const pnl = showCapitalChange ? account.total_pnl : undefined
  const positive = pnl != null && pnl > 0
  const pnlClass =
    pnl == null || pnl === 0 ? '' : positive ? 'is-positive' : 'is-negative'
  const metrics = [
    {
      label: uiText('账户总权益', language),
      value: money(account?.total_equity),
      unit: 'USDT',
      note: uiText('钱包余额 + 未实现盈亏', language),
      primary: true,
    },
    {
      label: uiText('可用余额', language),
      value: money(account?.available_balance),
      unit: 'USDT',
      note: account && account.total_equity > 0
        ? `${language === 'zh' ? '可用占比' : 'Available share'} ${((account.available_balance / account.total_equity) * 100).toFixed(1)}%`
        : account
          ? (language === 'zh' ? '账户权益为 0' : 'Account equity is zero')
          : uiText('等待账户数据', language),
    },
    {
      label: language === 'zh' ? '相对初始资金变化' : 'Change from initial capital',
      value: `${positive ? '+' : ''}${money(pnl)}`,
      unit: 'USDT',
      note: showCapitalChange
        ? `${language === 'zh' ? '变化' : 'Change'} ${account.total_pnl_pct > 0 ? '+' : ''}${money(account.total_pnl_pct)}% · ${language === 'zh' ? '初始资金' : 'Baseline'} ${money(account.initial_balance)} USDT`
        : (language === 'zh' ? '变化 — · 暂无可展示的资产变化' : 'Change — · Capital change unavailable'),
      tone: pnlClass,
    },
    {
      label: uiText('当前持仓', language),
      value: confirmedPositions ? positions?.length ?? account?.position_count ?? '—' : '—',
      unit: uiText('笔', language),
      note: account
        ? `${language === 'zh' ? '保证金使用' : 'Margin usage'} ${money(account.margin_used_pct, 1)}%`
        : uiText('等待账户数据', language),
    },
  ]
  return (
    <section className="trading-dashboard">
      <header className="dashboard-heading">
        <div>
          <div className="dashboard-eyebrow">
            {uiText('交易工作台', language)}
          </div>
          <h1>
            {selectedTrader.trader_name}
            <Badge
              status={status?.is_running ? 'processing' : 'default'}
              text={
                status?.is_running
                  ? uiText('运行中', language)
                  : status
                    ? uiText('已停止', language)
                    : uiText('同步中', language)
              }
            />
          </h1>
          <p>{uiText('账户表现、交易机会与执行记录，集中查看。', language)}</p>
        </div>
        <div className="dashboard-heading-actions">
          <Select
            aria-label={uiText('切换交易员', language)}
            value={selectedTraderId || selectedTrader.trader_id}
            onChange={onTraderSelect}
            suffixIcon={<SwapOutlined />}
            options={traders?.map((t) => ({
              value: t.trader_id,
              label: t.trader_name,
            }))}
          />
          <Button icon={<SettingOutlined />} href="/traders">
            {uiText('交易配置', language)}{' '}
          </Button>
        </div>
      </header>
      <div className="dashboard-metrics">
        {metrics.map((m) => (
          <div
            className={`dashboard-metric ${m.primary ? 'metric-primary' : ''}`}
            key={m.label}
          >
            <span className="metric-label">{m.label}</span>
            <div className={`metric-value ${m.tone || ''}`}>
              {m.value}
              <small>{m.unit}</small>
            </div>
            <span className="metric-note">{m.note}</span>
          </div>
        ))}
      </div>
      {account && (
        <Alert
          type={account.total_equity === 0 ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 24 }}
          title={language === 'zh' ? '资金变化统计口径' : 'How capital change is calculated'}
          description={language === 'zh'
            ? `${account.total_equity === 0 ? '交易所返回的合约账户权益为 0 USDT，请核对所绑定的合约账户及资金。' : ''}资金变化 = 当前权益 − 配置的初始资金；充值、转出和初始资金设置都会影响此数值，不能直接视为交易盈亏。`
            : `${account.total_equity === 0 ? 'The exchange reports futures account equity of 0 USDT. Check the linked futures account and its funds. ' : ''}Capital change = current equity − configured initial capital. Deposits, withdrawals and the baseline setting affect this value; it is not a measure of trading profit alone.`}
        />
      )}
      <div className="dashboard-analysis-grid">
        <div className="dashboard-equity">
          <EquityChart traderId={selectedTrader.trader_id} compact />
        </div>
        <Card
          className="dashboard-runtime"
          title={uiText('运行概况', language)}
          extra={<span className="dashboard-live-dot" />}
        >
          <dl>
            <div>
              <dt>{uiText('交易所', language)}</dt>
              <dd>{selectedTrader.exchange_id?.toUpperCase() || '—'}</dd>
            </div>
            <div>
              <dt>{uiText('AI 模型', language)}</dt>
              <dd>{selectedTrader.ai_model.split('_').pop()?.toUpperCase()}</dd>
            </div>
            <div>
              <dt>{uiText('累计决策', language)}</dt>
              <dd>
                {status?.call_count ?? '—'}{' '}
                <small>{uiText('轮', language)}</small>
              </dd>
            </div>
            <div>
              <dt>{uiText('运行时长', language)}</dt>
              <dd>
                {status?.runtime_minutes ?? '—'}{' '}
                <small>{uiText('分钟', language)}</small>
              </dd>
            </div>
            <div>
              <dt>{uiText('扫描间隔', language)}</dt>
              <dd>{status?.scan_interval || '—'}</dd>
            </div>
          </dl>
          <div className="dashboard-sync">
            <span>{uiText('最近同步', language)}</span>
            <strong>{lastUpdate || '等待同步'}</strong>
          </div>
          <Button
            type="text"
            block
            icon={<ArrowRightOutlined />}
            onClick={() => setActiveTab('decisions')}
          >
            {uiText('查看决策记录', language)}{' '}
          </Button>
        </Card>
      </div>
      <div className="dashboard-workspace">
        {status?.entry_protection_blocked && <Alert type="error" showIcon
          title={language === 'zh' ? '保护单异常，新开仓已暂停' : 'Protection error: new entries paused'}
          description={language === 'zh' ? '请核对币安持仓和止盈止损委托；已有持仓仍会继续管理。处理后重新加载交易员。' : 'Check Binance positions and protective orders. Existing positions remain managed.'}
          style={{ marginBottom: 16 }} />}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'positions',
              label: `${language === 'zh' ? '持仓明细' : 'Position details'}${positions?.length ? ` · ${positions.length}` : ''}`,
              children: (
                <>
                {positionStream && <div style={{ padding: '12px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <Badge status={positionStream.state === 'live' ? 'success' : 'warning'}
                    text={positionStream.state === 'live'
                      ? (language === 'zh' ? '持仓变动推送已连接' : 'Position event stream connected')
                      : positionStream.state === 'syncing'
                        ? (language === 'zh' ? '持仓变动校准中' : 'Reconciling position changes')
                        : (language === 'zh' ? '推送连接中 · 定时更新兜底' : 'Reconnecting · polling fallback')} />
                  <Typography.Text type="secondary">
                    {language === 'zh' ? '标记价和未实现盈亏取自币安账户快照，定时同步；不含平仓手续费及资金费结算' : 'Mark price and unrealized PnL use Binance account snapshots; refreshed periodically. Closing fees and funding settlements excluded.'}
                    {positionsAsOf ? ` · ${language === 'zh' ? '账户快照' : 'Account snapshot'} ${new Date(positionsAsOf).toLocaleTimeString()}` : ''}
                  </Typography.Text>
                </div>}
                {positionStream?.warning && <Alert type="warning" showIcon title={language === 'zh' ? positionStream.warning : 'Live positions are unavailable. Showing the latest known snapshot and retrying.'} style={{ marginBottom: 12 }} />}
                {!positionStream?.warning && positionsError && <Alert type="warning" showIcon title={positionsError} style={{ marginBottom: 12 }} />}
                <Table<Position>
                  rowKey={(p) => `${p.symbol}-${p.side}`}
                  dataSource={positions || []}
                  loading={!positions && !positionsError && !positionStream?.warning}
                  pagination={false}
                  scroll={{ x: 1000 }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={confirmedPositions ? uiText('当前暂无持仓', language) : (language === 'zh' ? '持仓状态暂无法确认' : 'Position status is currently unavailable')}
                      />
                    ),
                  }}
                  columns={[
                    {
                      title: uiText('交易合约', language),
                      dataIndex: 'symbol',
                      fixed: 'left',
                      width: 150,
                      render: (v) => <strong>{v}</strong>,
                    },
                    {
                      title: uiText('方向', language),
                      dataIndex: 'side',
                      width: 90,
                      render: (v) => (
                        <span
                          className={
                            v === 'long' ? 'is-positive' : 'is-negative'
                          }
                        >
                          {v === 'long'
                            ? uiText('做多', language)
                            : uiText('做空', language)}
                        </span>
                      ),
                    },
                    {
                      title: uiText('开仓价', language),
                      dataIndex: 'entry_price',
                      align: 'right',
                      render: (v) => formatPrice(v),
                    },
                    {
                      title: uiText('标记价', language),
                      dataIndex: 'mark_price',
                      align: 'right',
                      render: (v) => formatPrice(v),
                    },
                    {
                      title: uiText('持仓数量', language),
                      dataIndex: 'quantity',
                      align: 'right',
                      render: (v) => money(v, 4),
                    },
                    {
                      title: uiText('仓位价值 / USDT', language),
                      key: 'value',
                      align: 'right',
                      render: (_, p) => money(p.quantity * p.mark_price),
                    },
                    {
                      title: uiText('杠杆', language),
                      dataIndex: 'leverage',
                      align: 'right',
                      render: (v) => `${v}×`,
                    },
                    {
                      title: uiText('未实现盈亏', language),
                      dataIndex: 'unrealized_pnl',
                      align: 'right',
                      render: (v) => (
                        <span
                          className={
                            v > 0 ? 'is-positive' : v < 0 ? 'is-negative' : ''
                          }
                        >
                          {v > 0 ? '+' : ''}
                          {money(v)}
                        </span>
                      ),
                    },
                    {
                      title: uiText('强平价', language),
                      dataIndex: 'liquidation_price',
                      align: 'right',
                      render: (v) => formatPrice(v),
                    },
                  ]}
                />
                </>
              ),
            },
            {
              key: 'radar',
              label: uiText('异动候选', language),
              children: (
                <RadarTradingPanel
                  key={selectedTrader.trader_id}
                  traderId={selectedTrader.trader_id}
                />
              ),
            },
            {
              key: 'decisions',
              label: language === 'zh' ? `决策记录 · 最新 ${decisions?.length ?? 0} 条` : `Decisions · Latest ${decisions?.length ?? 0}`,
              children: <DecisionHistory records={decisions || []} />,
            },
            {
              key: 'history',
              label: language === 'zh' ? '历史订单 / 已实现收益' : 'Order history / realized income',
              children: <TradingHistoryPanel key={selectedTrader.trader_id} traderId={selectedTrader.trader_id} exchange={selectedTrader.exchange_id} language={language} active={activeTab === 'history'} />,
            },
            {
              key: 'learning',
              label: uiText('策略复盘', language),
              children: <AILearning traderId={selectedTrader.trader_id} />,
            },
          ]}
        />
      </div>
    </section>
  )
}
