import { uiText, marketText, localizedError } from '../i18n/uiText'
import { useLanguage } from '../contexts/LanguageContext'
import useSWR from 'swr'
import {
  Alert,
  Card,
  Descriptions,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'

export type PaperTrial = {
  status: string
  version?: string
  reason?: string
  error?: string
  entry_at?: string
  exit_at?: string
  entry_price?: number
  exit_price?: number
  stop_price?: number
  target_price?: number
  gross_pct?: number | null
  net_pct?: number | null
  fees_pct?: number | null
  ambiguous?: boolean
}
export type PaperStats = {
  total: number
  completed: number
  positive: number
  pending: number
  unavailable: number
  skipped: number
  mean_pct: number | null
}
export type PaperRules = {
  version: string
  minutes: number
  stop_pct: number
  target_pct: number
  fee_pct: number
  slip_pct: number
}
const pct = (n?: number | null) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
const when = (s: string | undefined, language: 'zh' | 'en') =>
  s
    ? new Date(s).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
        hour12: false,
      })
    : '—'
const price = (n?: number) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumSignificantDigits: 9 })
export function PaperValue({ trial }: { trial?: PaperTrial }) {
  const { language } = useLanguage()

  const reasons: Record<string, string> = {
    stop: uiText('触发止损', language),
    stop_gap: uiText('跳空止损', language),
    target: uiText('触发止盈', language),
    timeout: uiText('持有期结束', language),
  }

  if (!trial || trial.status === 'not_recorded')
    return (
      <span className="archive-muted">{uiText('未参与模拟', language)}</span>
    )
  if (trial.status === 'skipped') return <Tag>{uiText('已跳过', language)}</Tag>
  if (trial.status === 'unavailable')
    return <Tag color="warning">{uiText('行情待补齐', language)}</Tag>
  if (trial.status !== 'complete')
    return <span className="archive-muted">{uiText('等待结算', language)}</span>
  return (
    <Space orientation="vertical" size={0}>
      <Typography.Text
        style={{
          color:
            (trial.net_pct ?? 0) > 0
              ? 'var(--color-positive)'
              : (trial.net_pct ?? 0) < 0
                ? 'var(--binance-red)'
                : undefined,
        }}
      >
        {pct(trial.net_pct)}
      </Typography.Text>
      <span className="archive-muted">
        {reasons[trial.reason || ''] || uiText('已结算', language)}
      </span>
    </Space>
  )
}
export function PaperSummary({
  stats,
  rules,
}: {
  stats?: PaperStats
  rules?: PaperRules
}) {
  const { language } = useLanguage()

  return (
    <Card
      title={uiText('固定规则模拟 · 逐条信号验证', language)}
      className="archive-paper-summary"
      extra={<Tag>{rules?.version || uiText('加载中', language)}</Tag>}
    >
      <p>
        {uiText(
          '新信号先检查方向、报价时效与成交额；通过后按下一完整分钟开盘价模拟入场。每个合约每 60 分钟最多一个样本，完整窗口结束后结算。',
          language
        )}{' '}
      </p>
      <div className="archive-stats">
        <Statistic
          title={uiText('已结算 / 已纳入模拟', language)}
          value={stats?.completed ?? '—'}
          suffix={stats ? `/ ${stats.total - stats.skipped}` : undefined}
        />
        <Statistic
          title={uiText('成本后盈利样本比例', language)}
          value={
            stats?.completed ? (stats.positive / stats.completed) * 100 : '—'
          }
          precision={1}
          suffix={stats?.completed ? '%' : undefined}
        />
        <Statistic
          title={uiText('平均模拟收益 · 未计资金费', language)}
          value={stats?.mean_pct ?? '—'}
          precision={2}
          suffix={stats?.mean_pct != null ? '%' : undefined}
        />
        <Statistic
          title={uiText('规则跳过', language)}
          value={stats?.skipped ?? '—'}
        />
      </div>
      {rules && (
        <Space wrap>
          <Tag>
            {uiText('止损', language)} {rules.stop_pct}%
          </Tag>
          <Tag>
            {uiText('止盈', language)} {rules.target_pct}%
          </Tag>
          <Tag>
            {uiText('最长', language)} {rules.minutes}{' '}
            {uiText('分钟', language)}
          </Tag>
          <Tag>
            {uiText('单边手续费假设', language)} {rules.fee_pct}%
          </Tag>
          <Tag>
            {uiText('单边滑点假设', language)} {rules.slip_pct}%
          </Tag>
        </Space>
      )}
      <p className="archive-muted">
        {uiText('等待结算', language)} {stats?.pending ?? '—'}{' '}
        {uiText('· 行情待补齐', language)} {stats?.unavailable ?? '—'}
        {uiText(
          '。报价须不超过 90 秒、24h 成交额至少 500 万 USDT；中性及多空冲突信号跳过。止盈止损同分钟触发按止损优先，跳空止损使用更差的开盘价。未计资金费、杠杆、实际点差及成交深度，默认规则用于验证流程，并未证明盈利；模拟样本均值不是账户收益。',
          language
        )}{' '}
      </p>
    </Card>
  )
}
export function PaperDetails({ trial }: { trial?: PaperTrial }) {
  const { language } = useLanguage()

  const reasons: Record<string, string> = {
    stop: uiText('触发止损', language),
    stop_gap: uiText('跳空止损', language),
    target: uiText('触发止盈', language),
    timeout: uiText('持有期结束', language),
  }

  return (
    <Card
      size="small"
      title={uiText('本次模拟交易', language)}
      extra={<PaperValue trial={trial} />}
    >
      {!trial || trial.status === 'not_recorded' ? (
        <Typography.Text type="secondary">
          {uiText('模拟验证启用前的档案，不补造模拟记录。', language)}{' '}
        </Typography.Text>
      ) : trial.status === 'skipped' ? (
        <Alert
          type="info"
          title={uiText('未模拟入场', language)}
          description={marketText(trial.reason || '', language)}
        />
      ) : trial.status === 'complete' ? (
        <>
          <Descriptions
            column={1}
            items={[
              {
                key: 'version',
                label: uiText('固定规则版本', language),
                children: trial.version,
              },
              {
                key: 'entry',
                label: uiText('模拟入场时间', language),
                children: when(trial.entry_at, language),
              },
              {
                key: 'entryprice',
                label: uiText('入场价 · 含不利滑点', language),
                children: price(trial.entry_price),
              },
              {
                key: 'stop',
                label: uiText('止损 / 止盈触发价', language),
                children: `${price(trial.stop_price)} / ${price(trial.target_price)}`,
              },
              {
                key: 'exit',
                label: uiText('退出所在分钟 / 开盘时间', language),
                children: when(trial.exit_at, language),
              },
              {
                key: 'exitprice',
                label: uiText('退出价 · 含不利滑点', language),
                children: price(trial.exit_price),
              },
              {
                key: 'reason',
                label: uiText('退出原因', language),
                children: reasons[trial.reason || ''],
              },
              {
                key: 'gross',
                label: uiText('滑点后、手续费前收益', language),
                children: pct(trial.gross_pct),
              },
              {
                key: 'fees',
                label: uiText('模拟手续费 / 入场名义金额', language),
                children: pct(trial.fees_pct),
              },
              {
                key: 'net',
                label: uiText('模拟收益 · 未计资金费', language),
                children: pct(trial.net_pct),
              },
            ]}
          />
          {trial.ambiguous && (
            <Alert
              type="warning"
              title={uiText(
                '同一分钟触及止盈和止损，按止损先发生计算。',
                language
              )}
            />
          )}
          <p className="archive-muted">
            {uiText(
              '分钟 K 线无法确定分钟内的真实成交顺序与时间。此处为价格路径模拟，不是交易所成交记录。',
              language
            )}{' '}
          </p>
        </>
      ) : (
        <Typography.Text type="secondary">
          {trial.status === 'unavailable'
            ? `${language === 'zh' ? '行情未完整，自动重试：' : 'Incomplete market data; retrying: '}${localizedError(trial.error, language)}`
            : uiText(
                '等待完整 60 分钟行情后结算。尚未产生模拟收益，不计入盈利样本比例。',
                language
              )}
        </Typography.Text>
      )}
    </Card>
  )
}
type Similar = {
  as_of: string
  matched: number
  symbols: number
  signature: string
  stats: {
    minutes: number
    completed: number
    positive: number
    mean_pct: number | null
  }[]
  paper: PaperStats
}
export function SimilarSignals({ id }: { id: number }) {
  const { language } = useLanguage()

  const { data, error, isLoading } = useSWR<Similar>(
    `/api/market/radar/archive/${id}/research`,
    async (url) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(uiText('相似信号读取失败', language))
      return r.json()
    },
    { refreshInterval: 30000 }
  )
  return (
    <Card
      size="small"
      title={uiText('出现时可用的相似信号证据', language)}
      loading={isLoading}
    >
      {error ? (
        <Alert
          type="warning"
          title={uiText('相似信号读取失败', language)}
          description={uiText('暂不提供历史判断依据，请稍后重试。', language)}
        />
      ) : (
        data && (
          <>
            <p>
              {uiText('截至', language)} {when(data.as_of, language)}
              {uiText(
                '，同资产类别、同方向、同规则版本、同信号种类及方向组合，共',
                language
              )}{' '}
              {data.matched} {uiText('条先前记录，涉及', language)}{' '}
              {data.symbols}{' '}
              {uiText('个合约。跨合约匹配，不保证风险相同。', language)}{' '}
            </p>
            <Table
              size="small"
              pagination={false}
              scroll={{ x: 440 }}
              rowKey="minutes"
              dataSource={data.stats}
              columns={[
                {
                  title: uiText('观察期', language),
                  dataIndex: 'minutes',
                  render: (m: number) =>
                    m === 15
                      ? uiText('15 分钟', language)
                      : m === 60
                        ? uiText('1 小时', language)
                        : uiText('4 小时', language),
                },
                { title: uiText('已知结果', language), dataIndex: 'completed' },
                {
                  title: uiText('方向符合率', language),
                  render: (_, r) =>
                    r.completed
                      ? `${((r.positive / r.completed) * 100).toFixed(1)}%`
                      : '—',
                },
                {
                  title: uiText('平均方向毛收益', language),
                  dataIndex: 'mean_pct',
                  render: pct,
                },
              ]}
            />
            <Descriptions
              column={1}
              style={{ marginTop: 16 }}
              items={[
                {
                  key: 'n',
                  label: uiText('此前已结算相似模拟', language),
                  children:
                    language === 'zh'
                      ? `${data.paper.completed} 条`
                      : `${data.paper.completed} samples`,
                },
                {
                  key: 'win',
                  label: uiText('成本后盈利样本比例', language),
                  children: data.paper.completed
                    ? `${((data.paper.positive / data.paper.completed) * 100).toFixed(1)}%`
                    : '—',
                },
                {
                  key: 'mean',
                  label: uiText('平均模拟收益 · 未计资金费', language),
                  children: pct(data.paper.mean_pct),
                },
              ]}
            />
            <Alert
              showIcon
              type="info"
              title={
                data.paper.completed < 30
                  ? uiText('样本不足，不能据此判断交易优势', language)
                  : uiText('已有历史样本，仍需分市场与时间段验证', language)
              }
              description={uiText(
                '只统计本信号记录前已经结算并保存的结果，排除自身及未来信息。30 条仅为最低展示提醒，不代表统计有效性或盈利保证；相关信号不是独立交易，不能当作下一笔胜率。',
                language
              )}
            />
          </>
        )
      )}
    </Card>
  )
}
