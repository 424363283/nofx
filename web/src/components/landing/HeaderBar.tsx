import { useState } from 'react'
import useSWR from 'swr'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { Button, Drawer, Menu, Dropdown, Space } from 'antd'
import {
  MenuOutlined,
  RadarChartOutlined,
  HistoryOutlined,
  DashboardOutlined,
  SettingOutlined,
  LineChartOutlined,
  UserOutlined,
  GlobalOutlined,
  DownOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import './header.css'
import type { Language } from '../../i18n/translations'
interface HeaderBarProps {
  onLoginClick?: () => void
  isLoggedIn?: boolean
  isHomePage?: boolean
  currentPage?: string
  language?: Language
  onLanguageChange?: (lang: Language) => void
  user?: { email: string } | null
  onLogout?: () => void
  onPageChange?: (page: string) => void
}
export default function HeaderBar({
  isLoggedIn = false,
  currentPage,
  language = 'zh',
  onLanguageChange,
  user,
  onLogout,
  onPageChange,
}: HeaderBarProps) {
  const [expanded, setExpanded] = useState(false)
  const { user: authUser, token } = useAuth()
  const { data: traders } = useSWR(
    isLoggedIn && authUser && token ? ['traders', authUser.id] : null,
    api.getTraders,
    { refreshInterval: 10000 }
  )
  const hasTraders = Boolean(traders?.length)
  const zh = language === 'zh'
  const routeKey = currentPage || window.location.pathname.split('/')[1]
  const active = routeKey === 'dashboard' ? 'trader' : routeKey
  const links = [
    {
      key: 'radar',
      path: '/radar',
      label: zh ? '市场雷达' : 'Radar',
      icon: <RadarChartOutlined />,
    },
    {
      key: 'competition',
      path: '/competition',
      label: zh ? '实时总览' : 'Overview',
      icon: <DashboardOutlined />,
    },
    {
      key: 'signals',
      path: '/signals',
      label: zh ? '信号档案' : 'Signal archive',
      icon: <HistoryOutlined />,
    },
    ...(isLoggedIn
      ? [
          {
            key: 'traders',
            path: '/traders',
            label: zh ? '交易配置' : 'Configuration',
            icon: <SettingOutlined />,
          },
          ...(hasTraders
            ? [
                {
                  key: 'trader',
                  path: '/dashboard',
                  label: zh ? '交易面板' : 'Dashboard',
                  icon: <LineChartOutlined />,
                },
              ]
            : []),
        ]
      : []),
  ]
  const items = links.map((link) => ({
    key: link.key,
    icon: link.icon,
    label: (
      <a
        href={link.path}
        aria-current={active === link.key ? 'page' : undefined}
        onClick={(e) => {
          setExpanded(false)
          if (onPageChange && !['radar', 'signals'].includes(link.key)) {
            e.preventDefault()
            onPageChange(link.key)
          }
        }}
      >
        {link.label}
      </a>
    ),
  }))
  const actions = (
    <Space size={8}>
      {onLanguageChange && (
        <Button
          type="text"
          className="guanlan-language"
          aria-label={zh ? '切换为英文' : 'Switch to Chinese'}
          icon={<GlobalOutlined />}
          onClick={() => onLanguageChange(zh ? 'en' : 'zh')}
        >
          {zh ? 'EN' : '中文'}
        </Button>
      )}
      {isLoggedIn ? (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'email', label: user?.email, disabled: true },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: zh ? '退出登录' : 'Sign out',
                onClick: onLogout,
              },
            ],
          }}
        >
          <Button
            className="guanlan-account"
            aria-label={zh ? '账户菜单' : 'Account menu'}
          >
            <span className="guanlan-avatar">
              <UserOutlined />
            </span>
            <span>{zh ? '我的账户' : 'My account'}</span>
            <DownOutlined className="guanlan-account-chevron" />
          </Button>
        </Dropdown>
      ) : (
        <>
          <Button type="text" href="/login">
            {zh ? '登录' : 'Sign in'}
          </Button>
          <Button type="primary" href="/register">
            {zh ? '创建账户' : 'Create account'}
          </Button>
        </>
      )}
    </Space>
  )
  return (
    <header className="ant-desk-header guanlan-header">
      <a className="desk-skip" href="#main-content">
        {zh ? '跳到主要内容' : 'Skip to main content'}
      </a>
      <div className="ant-desk-header-inner">
        <a
          href="/"
          className="ant-desk-brand"
          aria-label={zh ? '观澜首页' : 'Guanlan home'}
        >
          <img src="/icons/trading-desk.svg" alt="" width={30} height={30} />
          <span className="guanlan-wordmark">
            <strong>{zh ? '观澜' : 'Guanlan'}</strong>
            <span>GUANLAN</span>
          </span>
        </a>
        <nav
          className="guanlan-desktop-nav"
          aria-label={zh ? '主导航' : 'Main navigation'}
        >
          <Menu
            mode="horizontal"
            selectedKeys={[active]}
            items={items}
            className="ant-desk-menu"
          />
        </nav>
        <div className="ant-desk-actions">{actions}</div>
        <span className="guanlan-mobile-location">
          {links.find((link) => link.key === active)?.label ||
            (zh ? '交易工作空间' : 'Workspace')}
        </span>
        <Button
          className="ant-desk-mobile-toggle"
          icon={<MenuOutlined />}
          aria-label={zh ? '导航菜单' : 'Navigation menu'}
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        />
      </div>
      <Drawer
        title={zh ? '观澜 · 工作空间' : 'Guanlan · Workspace'}
        className="guanlan-nav-drawer"
        open={expanded}
        onClose={() => setExpanded(false)}
        size={300}
      >
        <Menu mode="inline" selectedKeys={[active]} items={items} />
        <div className="guanlan-drawer-actions">{actions}</div>
      </Drawer>
    </header>
  )
}
