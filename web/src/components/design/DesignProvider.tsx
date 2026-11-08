import { App as AntApp, ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useLanguage } from '../../contexts/LanguageContext'
import type { ReactNode } from 'react'
import './design.css'
export function DesignProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  return (
    <ConfigProvider
      locale={language === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: (seed) => ({
          ...theme.darkAlgorithm(seed),
          colorPrimary: '#34d399',
          colorPrimaryHover: '#6ee7b7',
          colorPrimaryActive: '#10b981',
          colorPrimaryText: '#34d399',
          colorSuccess: '#34d399',
          colorSuccessText: '#34d399',
          colorSuccessBg: '#34d39914',
          colorSuccessBorder: '#34d39940',
        }),
        token: {
          colorPrimary: '#34d399',
          colorInfo: '#34d399',
          colorSuccess: '#34d399',
          colorBgBase: '#0b1012',
          colorBgContainer: '#141d21',
          colorBgElevated: '#1c282d',
          colorBorder: '#304149',
          colorText: '#edf5f3',
          colorTextSecondary: '#9db0b7',
          borderRadius: 8,
          controlHeight: 40,
          fontFamily:
            '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
          fontSize: 14,
        },
        components: {
          Button: { primaryColor: '#042b20', fontWeight: 500 },
          Card: { headerFontSize: 16 },
          Table: { cellPaddingBlock: 14, headerBg: '#1a272c' },
          Menu: { itemBg: 'transparent', darkItemBg: 'transparent' },
          Modal: { contentBg: '#141d21' },
          Layout: { headerBg: '#10191d' },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}
