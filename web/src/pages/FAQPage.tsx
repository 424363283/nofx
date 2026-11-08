import { UiInput, UiCollapse } from '../components/design/Controls'
import { useState } from 'react'
import HeaderBar from '../components/landing/HeaderBar'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'

export function FAQPage() {
  const { language, setLanguage } = useLanguage()
  const { user, logout } = useAuth()
  const [search, setSearch] = useState('')
  const zh = language === 'zh'
  const items = zh
    ? [
        [
          '如何开始？',
          '创建账户并完成验证器绑定后，在交易配置中添加 AI 模型和交易账户，再创建交易员。检查参数后手动启动。',
        ],
        [
          '创建账户会自动交易吗？',
          '不会。需要配置模型、交易所和交易员，并明确启动交易员后才会运行策略。',
        ],
        [
          '如何配置模型？',
          '在交易配置页面添加服务商、模型名称和 API 密钥。自定义服务需要填写正确的接口地址。',
        ],
        [
          '如何配置交易账户？',
          '在交易配置中选择交易所，填写所需凭据。确认交易权限和账户余额，避免启用不必要的提现权限。',
        ],
        [
          '在哪里查看持仓和决策？',
          '在交易面板选择交易员，即可查看账户、持仓、历史决策和表现。实时总览用于比较交易员。',
        ],
        [
          '如何停止策略？',
          '在交易配置中停止对应交易员。停止自动策略不代表现有持仓已平仓，请核对账户中的实际持仓和订单。',
        ],
        [
          '如何备份？',
          '妥善备份本地数据库、配置和加密密钥。不要公开密钥文件，也不要将账户凭据发送给他人。',
        ],
        [
          '登录需要什么？',
          '使用注册时的邮箱、密码，以及验证器当前生成的一次性验证码。保存好验证器备份。',
        ],
      ]
    : [
        [
          'How do I start?',
          'Create an account, set up your authenticator, configure a model and exchange account, then create and start a trader.',
        ],
        [
          'Does registration start trading?',
          'No. A trader only runs after you configure it and explicitly start it.',
        ],
        [
          'Where are my positions?',
          'Select a trader in the dashboard to review balances, positions and decisions.',
        ],
        [
          'How do I stop?',
          'Stop the trader in Configuration. Stopping a strategy does not automatically close existing positions.',
        ],
        [
          'What should I back up?',
          'Keep secure copies of your local database, configuration, encryption keys and authenticator backup.',
        ],
      ]
  return (
    <div className="min-h-screen bg-black text-gray-100">
      <HeaderBar
        currentPage="faq"
        isLoggedIn={!!user}
        user={user}
        onLogout={logout}
        language={language}
        onLanguageChange={setLanguage}
      />
      <main id="main-content" className="max-w-3xl mx-auto px-5 pt-32 pb-16">
        <p className="desk-eyebrow mb-3">{zh ? '帮助中心' : 'HELP CENTER'}</p>
        <h1 className="text-3xl font-semibold mb-3">
          {zh ? '使用帮助' : 'Help'}
        </h1>
        <p className="text-gray-400 mb-8">
          {zh
            ? '账户、配置与日常操作说明。'
            : 'Account setup and everyday operations.'}
        </p>
        <UiInput
          aria-label={zh ? '搜索帮助' : 'Search help'}
          placeholder={zh ? '搜索问题…' : 'Search questions…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 mb-8"
        />
        {items.filter((row) =>
          row.join(' ').toLowerCase().includes(search.toLowerCase())
        ).length === 0 && (
          <p role="status" className="desk-muted py-8 text-center">
            {zh
              ? '没有找到相关问题，试试其他关键词。'
              : 'No matching questions. Try another keyword.'}
          </p>
        )}
        {items
          .filter((row) =>
            row.join(' ').toLowerCase().includes(search.toLowerCase())
          )
          .map(([q, a]) => (
            <UiCollapse
              key={q}
              className="desk-faq-item"
              open={search ? true : undefined}
            >
              <summary>{q}</summary>
              <p className="text-gray-400 leading-7">{a}</p>
            </UiCollapse>
          ))}
      </main>
    </div>
  )
}
