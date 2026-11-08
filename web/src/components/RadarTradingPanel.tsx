import { uiText, marketText, localizedError } from '../i18n/uiText'
import { useLanguage } from '../contexts/LanguageContext'
import { useState } from 'react'
import useSWR from 'swr'
import { Alert, App, Card, Checkbox, Space, Table, Tag, Typography } from 'antd'
import { api } from '../lib/api'
import type { RadarItem } from '../pages/MarketRadarPage'
interface Pool {
  enabled: boolean
  supported: boolean
  items: RadarItem[]
  warning: string
}
export function RadarTradingPanel({ traderId }: { traderId: string }) {
  const { language } = useLanguage()
  const { data, error, mutate } = useSWR<Pool>(
    ['radar-pool', traderId],
    () => api.getRadarPool(traderId),
    { refreshInterval: 10000 }
  )
  const [saving, setSaving] = useState(false)
  const { message } = App.useApp()
  async function toggle(enabled: boolean) {
    setSaving(true)
    try {
      await api.setRadarPool(traderId, enabled)
      await mutate()
      message.success(uiText('已保存，下一轮决策生效', language))
    } catch (e) {
      message.error(
        e instanceof Error ? e.message : uiText('保存失败', language)
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card
      title={uiText('异动候选池', language)}
      style={{ marginBottom: 24 }}
      extra={
        <Checkbox
          checked={!!data?.enabled}
          disabled={!data?.supported || saving || !!error}
          onChange={(e) => void toggle(e.target.checked)}
        >
          {uiText('异动合约参与交易', language)}{' '}
        </Checkbox>
      }
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          {data?.enabled
            ? uiText('已启用 · 下轮决策使用异动候选池', language)
            : uiText('预览模式 · 勾选后纳入该交易员的决策范围', language)}
          {uiText(
            '。包含加密货币与美股／ETF；替代手动币种及其他筛选，每轮轮换分析 15–30 个。符合策略与风控才下单，未启动的交易员不会自动启动。',
            language
          )}{' '}
        </Typography.Text>
        {error && (
          <Alert
            type="error"
            showIcon
            title={uiText('候选池加载失败，请稍后重试', language)}
          />
        )}
        {data && !data.supported && (
          <Alert
            type="info"
            title={uiText('异动交易目前仅支持币安账户', language)}
          />
        )}
        {data?.warning && (
          <Alert
            type="warning"
            showIcon
            title={localizedError(data.warning, language)}
            description={uiText(
              '暂停异动开仓候选，已有持仓继续交由原策略管理。',
              language
            )}
          />
        )}
        <Table<RadarItem>
          rowKey="symbol"
          size="small"
          loading={!data && !error}
          dataSource={error ? [] : data?.items || []}
          scroll={{ x: 850 }}
          pagination={{
            pageSize: 8,
            showTotal: (n) =>
              language === 'zh'
                ? `全部 ${n} 个有效异动`
                : `${n} valid anomalies`,
          }}
          locale={{ emptyText: uiText('当前没有有效异动候选', language) }}
          columns={[
            {
              title: uiText('合约', language),
              dataIndex: 'symbol',
              render: (v, i) => (
                <Space>
                  <strong>{v}</strong>
                  <Typography.Text type="secondary">
                    {i.category === 'equity'
                      ? uiText('美股／ETF', language)
                      : uiText('加密货币', language)}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: uiText('方向线索', language),
              dataIndex: 'bias',
              render: (v) =>
                ({
                  bull: uiText('偏多', language),
                  bear: uiText('偏空', language),
                  mixed: uiText('多空分歧', language),
                  neutral: uiText('方向未明', language),
                })[v as string] || uiText('数据不足', language),
            },
            {
              title: uiText('异动依据', language),
              dataIndex: 'signals',
              render: (v: RadarItem['signals']) => (
                <Space wrap size={4}>
                  {v.map((s) => (
                    <Tag key={s.kind}>{marketText(s.label, language)}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: uiText('状态', language),
              key: 'state',
              render: () =>
                data?.enabled
                  ? uiText('待策略评估', language)
                  : uiText('仅预览', language),
            },
          ]}
        />
      </Space>
    </Card>
  )
}
