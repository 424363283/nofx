import { useLanguage } from '../contexts/LanguageContext'
import { uiText } from '../i18n/uiText'
import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  Segmented,
  Space,
  Table,
  Tooltip,
} from 'antd'
import {
  ArrowRightOutlined,
  EditOutlined,
  MoreOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { TraderInfo, AIModel, Exchange } from '../types'
import './design/traders.css'
interface Props {
  traders?: TraderInfo[]
  models: AIModel[]
  exchanges: Exchange[]
  modelInUse: (id: string) => boolean
  exchangeInUse: (id: string) => boolean
  onModel: (id: string) => void
  onExchange: (id: string) => void
  onAddModel: () => void
  onAddExchange: () => void
  onLegacy: () => void
  onCreate: () => void
  onView: (id: string) => void
  onEdit: (id: string) => void
  onToggle: (id: string, running: boolean) => void
  onDelete: (id: string) => void
  legacyWarning: boolean
}
export function TradersManagementView(p: Props) {
  const { language } = useLanguage()
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all')
  const [pending, setPending] = useState<string | null>(null)
  const traders = p.traders || [],
    running = traders.filter((t) => t.is_running).length
  const shown = traders.filter(
    (t) =>
      (filter === 'all' || !!t.is_running === (filter === 'running')) &&
      `${t.trader_name} ${t.ai_model} ${t.exchange_id || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  const canCreate = p.models.length > 0 && p.exchanges.length > 0
  const displayModel = (id: string) =>
    p.models.find((m) => m.id === id)?.name || id.split('_').pop() || id
  async function toggle(t: TraderInfo) {
    setPending(t.trader_id)
    try {
      await p.onToggle(t.trader_id, !!t.is_running)
    } finally {
      setPending(null)
    }
  }
  return (
    <section className="traders-management">
      <header className="traders-heading">
        <div>
          <div className="traders-eyebrow">{uiText('策略管理', language)}</div>
          <h1>{uiText('AI 交易员', language)}</h1>
          <p>
            {uiText('配置模型与交易账户，管理每个策略的运行状态。', language)}
          </p>
        </div>
        <Space>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'legacy', label: uiText('旧版信号接口', language) },
              ],
              onClick: p.onLegacy,
            }}
          >
            <Button icon={<SettingOutlined />}>
              {uiText('更多设置', language)}
            </Button>
          </Dropdown>
          <Tooltip
            title={
              !canCreate
                ? uiText('请先配置 AI 模型和交易所', language)
                : undefined
            }
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canCreate}
              onClick={p.onCreate}
            >
              {uiText('创建交易员', language)}{' '}
            </Button>
          </Tooltip>
        </Space>
      </header>
      <div className="traders-resources">
        {[
          {
            title: uiText('AI 模型', language),
            note: uiText('策略的分析引擎', language),
            items: p.models,
            check: p.modelInUse,
            click: p.onModel,
            add: p.onAddModel,
          },
          {
            title: uiText('交易账户', language),
            note: uiText('连接交易所与资金账户', language),
            items: p.exchanges,
            check: p.exchangeInUse,
            click: p.onExchange,
            add: p.onAddExchange,
          },
        ].map((group) => (
          <Card
            key={group.title}
            className="resource-card"
            title={
              <div>
                <strong>{group.title}</strong>
                <span>
                  {group.items.length} {uiText('已配置', language)}
                </span>
              </div>
            }
            extra={
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={group.add}
              >
                {uiText('添加', language)}{' '}
              </Button>
            }
          >
            {group.items.length ? (
              <div className="resource-list">
                {group.items.map((item) => (
                  <Tooltip
                    key={item.id}
                    title={
                      group.check(item.id)
                        ? uiText('运行中的策略正在使用此配置', language)
                        : undefined
                    }
                  >
                    <Button
                      type="text"
                      className="resource-item"
                      onClick={() => group.click(item.id)}
                      disabled={group.check(item.id)}
                    >
                      <span className="resource-monogram">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="resource-name">
                        {item.name}
                        <small>
                          {group.check(item.id)
                            ? uiText('使用中', language)
                            : item.enabled
                              ? uiText('已启用', language)
                              : uiText('已配置', language)}
                        </small>
                      </span>
                      <ArrowRightOutlined />
                    </Button>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <div className="resource-empty">
                <span>
                  {group.note} {uiText('· 尚未配置', language)}
                </span>
                <Button type="link" onClick={group.add}>
                  {uiText('立即配置', language)}{' '}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {p.legacyWarning && (
        <Alert
          type="warning"
          showIcon
          title={uiText('部分交易员仍使用未配置的旧版信号接口', language)}
          action={
            <Button size="small" onClick={p.onLegacy}>
              {uiText('检查配置', language)}{' '}
            </Button>
          }
          style={{ marginBottom: 20 }}
        />
      )}
      <Card
        className="traders-list-card"
        title={
          <div className="traders-list-title">
            {uiText('交易员列表', language)} <span>{traders.length}</span>
          </div>
        }
        extra={
          <div className="traders-counts">
            <span>
              <i className="running-dot" />
              {running} {uiText('运行中', language)}{' '}
            </span>
            <span>
              {traders.length - running} {uiText('已停止', language)}
            </span>
          </div>
        }
      >
        <div className="traders-toolbar">
          <Segmented
            aria-label={uiText('交易员状态筛选', language)}
            value={filter}
            onChange={(v) => setFilter(String(v))}
            options={[
              { value: 'all', label: uiText('全部策略', language) },
              { value: 'running', label: uiText('运行中', language) },
              { value: 'stopped', label: uiText('已停止', language) },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={uiText('搜索名称、模型或交易所', language)}
            aria-label={uiText('搜索交易员', language)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Table<TraderInfo>
          loading={!p.traders}
          rowKey="trader_id"
          dataSource={shown}
          scroll={{ x: 900 }}
          pagination={
            traders.length > 10
              ? { pageSize: 10, showSizeChanger: false }
              : false
          }
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  traders.length
                    ? uiText('没有匹配的交易员', language)
                    : uiText('还没有交易员', language)
                }
              >
                {!traders.length && (
                  <Button disabled={!canCreate} onClick={p.onCreate}>
                    {uiText('创建第一个策略', language)}{' '}
                  </Button>
                )}
              </Empty>
            ),
          }}
          columns={[
            {
              title: uiText('策略名称', language),
              dataIndex: 'trader_name',
              width: 260,
              render: (name, t) => (
                <div className="trader-identity">
                  <span className="trader-icon">
                    <RobotOutlined />
                  </span>
                  <div>
                    <Button type="link" onClick={() => p.onView(t.trader_id)}>
                      {name}
                    </Button>
                    <small>{uiText('AI 自动交易策略', language)}</small>
                  </div>
                </div>
              ),
            },
            {
              title: uiText('AI 模型', language),
              dataIndex: 'ai_model',
              render: displayModel,
            },
            {
              title: uiText('交易所', language),
              dataIndex: 'exchange_id',
              render: (v) => (
                <span className="exchange-label">
                  {v?.toUpperCase() || '—'}
                </span>
              ),
            },
            {
              title: uiText('运行状态', language),
              dataIndex: 'is_running',
              width: 120,
              render: (v) => (
                <Badge
                  status={v ? 'processing' : 'default'}
                  text={
                    v ? uiText('运行中', language) : uiText('已停止', language)
                  }
                />
              ),
            },
            {
              title: uiText('操作', language),
              key: 'actions',
              width: 300,
              align: 'right',
              render: (_, t) => (
                <Space size={6}>
                  <Button type="text" onClick={() => p.onView(t.trader_id)}>
                    {uiText('工作台', language)}{' '}
                  </Button>
                  <Tooltip
                    title={
                      t.is_running
                        ? uiText('停止交易员后可编辑', language)
                        : undefined
                    }
                  >
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      disabled={t.is_running}
                      onClick={() => p.onEdit(t.trader_id)}
                    >
                      {uiText('编辑', language)}{' '}
                    </Button>
                  </Tooltip>
                  <Button
                    className={t.is_running ? '' : 'trader-start'}
                    loading={pending === t.trader_id}
                    disabled={pending !== null && pending !== t.trader_id}
                    icon={
                      t.is_running ? <PauseOutlined /> : <PlayCircleOutlined />
                    }
                    onClick={() => void toggle(t)}
                  >
                    {t.is_running
                      ? uiText('停止', language)
                      : uiText('启动', language)}
                  </Button>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'delete',
                          label: uiText('删除交易员', language),
                          danger: true,
                        },
                      ],
                      onClick: () => p.onDelete(t.trader_id),
                    }}
                  >
                    <Button
                      type="text"
                      icon={<MoreOutlined />}
                      aria-label={
                        language === 'zh'
                          ? `${t.trader_name}的更多操作`
                          : `More actions for ${t.trader_name}`
                      }
                    />
                  </Dropdown>
                </Space>
              ),
            },
          ]}
        />
        <div className="traders-list-foot">
          {shown.length} {uiText('个策略', language)}{' '}
          <span>
            {uiText('创建与运行分开管理，创建后需要手动启动。', language)}
          </span>
        </div>
      </Card>
    </section>
  )
}
