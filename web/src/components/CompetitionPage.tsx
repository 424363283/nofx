import { uiText } from '../i18n/uiText'
import { useLanguage } from '../contexts/LanguageContext'
import { useState } from 'react'
import { Alert, App, Badge, Button, Card, Empty, Skeleton, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import useSWR from 'swr'
import { api } from '../lib/api'
import type {
  CompetitionData,
  CompetitionTraderData,
  TraderConfigData,
} from '../types'
import { ComparisonChart } from './ComparisonChart'
import { TraderConfigViewModal } from './TraderConfigViewModal'
import { getTraderColor } from '../utils/traderColors'
import './design/competition.css'
const amount = (n?: number) =>
  n == null
    ? '—'
    : n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
const percentage = (n?: number) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
const tone = (n: number) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '')
export function CompetitionPage() {
  const { language } = useLanguage()
  const [selectedTrader, setSelectedTrader] = useState<TraderConfigData | null>(
    null
  )
  const { message } = App.useApp()
  const { data, error, isValidating, mutate } = useSWR<CompetitionData>(
    'competition',
    api.getCompetition,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
      dedupingInterval: 10000,
    }
  )
  const traders = [...(data?.traders || [])].sort(
    (a, b) => b.total_pnl_pct - a.total_pnl_pct
  )
  const leader = traders[0]
  async function view(id: string) {
    try {
      setSelectedTrader(await api.getTraderConfig(id))
    } catch {
      message.info(uiText('请登录所属账户后查看交易员详细配置', language))
    }
  }
  return (
    <section className="competition-overview">
      <header className="competition-heading">
        <div>
          <div className="competition-eyebrow">
            {uiText('策略表现', language)}
          </div>
          <h1>{uiText('实时总览', language)}</h1>
          <p>{uiText('跟踪账户表现，比较策略收益与运行状态。', language)}</p>
        </div>
        <div className="competition-refresh">
          <span>{uiText('每 15 秒更新', language)}</span>
          <Button
            icon={<ReloadOutlined />}
            loading={isValidating}
            onClick={() => void mutate()}
          >
            {uiText('刷新数据', language)}{' '}
          </Button>
        </div>
      </header>
      {error && (
        <Alert
          showIcon
          type="warning"
          title={uiText('数据更新失败', language)}
          description={
            data
              ? uiText('暂时展示上次结果，请稍后重试。', language)
              : uiText('暂时无法加载总览，请重试。', language)
          }
          style={{ marginBottom: 20 }}
        />
      )}
      {!data && !error ? (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : (
        <>
          <div className="competition-summary">
            <div>
              <span>{uiText('交易员', language)}</span>
              <strong>
                {data ? traders.length : '—'}
                <small>{uiText('个策略', language)}</small>
              </strong>
              <p>
                {traders.filter((t) => t.is_running).length}{' '}
                {uiText('个运行中', language)}
              </p>
            </div>
            <div>
              <span>{uiText('合计账户权益', language)}</span>
              <strong>
                {data
                  ? amount(traders.reduce((sum, t) => sum + t.total_equity, 0))
                  : '—'}
                <small>USDT</small>
              </strong>
              <p>{uiText('各交易员上报权益的汇总', language)}</p>
            </div>
            <div>
              <span>{uiText('收益率领先', language)}</span>
              <strong className={leader ? tone(leader.total_pnl_pct) : ''}>
                {percentage(leader?.total_pnl_pct)}
              </strong>
              <p>{leader?.trader_name || '暂无交易员'}</p>
            </div>
          </div>
          <Card
            className="competition-chart"
            title={uiText('收益率走势', language)}
            extra={
              <span className="competition-caption">
                {traders.length > 5
                  ? uiText('按当前收益率展示前 5 名', language)
                  : uiText('当前交易员表现', language)}{' '}
                · %
              </span>
            }
          >
            {traders.length ? (
              <ComparisonChart traders={traders.slice(0, 5)} />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={uiText('暂无策略数据', language)}
              />
            )}
          </Card>
          <Card
            className="competition-ranking"
            title={uiText('策略排行', language)}
            extra={
              <span className="competition-caption">
                {uiText('按累计收益率排序', language)}
              </span>
            }
          >
            <Table<CompetitionTraderData>
              rowKey="trader_id"
              dataSource={traders}
              scroll={{ x: 850 }}
              pagination={
                traders.length > 10
                  ? { pageSize: 10, showSizeChanger: false }
                  : false
              }
              locale={{ emptyText: uiText('暂无交易员', language) }}
              columns={[
                {
                  title: uiText('排名', language),
                  key: 'rank',
                  width: 70,
                  render: (_, row) => (
                    <span className="competition-rank">
                      {String(traders.indexOf(row) + 1).padStart(2, '0')}
                    </span>
                  ),
                },
                {
                  title: uiText('交易员', language),
                  dataIndex: 'trader_name',
                  width: 210,
                  render: (name, row) => (
                    <div className="competition-identity">
                      <i
                        style={{
                          background: getTraderColor(traders, row.trader_id),
                        }}
                      />
                      <div>
                        <Button
                          type="link"
                          onClick={() => void view(row.trader_id)}
                        >
                          {name}
                        </Button>
                        <small>
                          {row.ai_model.toUpperCase()} ·{' '}
                          {row.exchange.toUpperCase()}
                        </small>
                      </div>
                    </div>
                  ),
                },
                {
                  title: uiText('账户权益 / USDT', language),
                  dataIndex: 'total_equity',
                  align: 'right',
                  render: amount,
                },
                {
                  title: uiText('累计收益率', language),
                  dataIndex: 'total_pnl_pct',
                  align: 'right',
                  render: (v) => (
                    <span className={tone(v)}>{percentage(v)}</span>
                  ),
                },
                {
                  title: uiText('累计盈亏 / USDT', language),
                  dataIndex: 'total_pnl',
                  align: 'right',
                  render: (v) => (
                    <span className={tone(v)}>
                      {v > 0 ? '+' : ''}
                      {amount(v)}
                    </span>
                  ),
                },
                {
                  title: uiText('持仓', language),
                  dataIndex: 'position_count',
                  align: 'right',
                },
                {
                  title: uiText('保证金使用', language),
                  dataIndex: 'margin_used_pct',
                  align: 'right',
                  render: (v) => percentage(v).replace(/^\+/, ''),
                },
                {
                  title: uiText('状态', language),
                  dataIndex: 'is_running',
                  width: 110,
                  render: (v) => (
                    <Badge
                      status={v ? 'processing' : 'default'}
                      text={
                        v
                          ? uiText('运行中', language)
                          : uiText('已停止', language)
                      }
                    />
                  ),
                },
              ]}
            />
            {traders.length === 2 && (
              <p className="competition-footnote">
                {uiText('两位交易员当前收益率相差', language)}{' '}
                {Math.abs(
                  traders[0].total_pnl_pct - traders[1].total_pnl_pct
                ).toFixed(2)}{' '}
                {uiText('个百分点。', language)}{' '}
              </p>
            )}
          </Card>
          <p className="competition-footnote">
            {uiText(
              '收益率来自账户统计；曲线保留历史记录，资金与初始余额变化可能影响收益率口径。',
              language
            )}{' '}
          </p>
        </>
      )}
      <TraderConfigViewModal
        isOpen={!!selectedTrader}
        onClose={() => setSelectedTrader(null)}
        traderData={selectedTrader}
      />
    </section>
  )
}
