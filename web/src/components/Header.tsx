import { UiButton } from './design/Controls'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'

interface HeaderProps {
  simple?: boolean // For login/register pages
}

export function Header({ simple = false }: HeaderProps) {
  const { language, setLanguage } = useLanguage()

  return (
    <header className="glass sticky top-0 z-50 backdrop-blur-xl">
      <div className="max-w-[1920px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left - Logo and Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center">
              <img
                src="/icons/trading-desk.svg"
                alt="观澜 Logo"
                className="w-8 h-8"
              />
            </div>
            <div>
              <h1
                className="text-xl font-bold"
                style={{ color: 'var(--foreground)' }}
              >
                {t('appTitle', language)}
              </h1>
              {!simple && (
                <p
                  className="text-xs mono"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('subtitle', language)}
                </p>
              )}
            </div>
          </div>

          {/* Right - Language Toggle (always show) */}
          <div
            className="flex gap-1 rounded p-1"
            style={{ background: 'var(--panel-bg)' }}
          >
            <UiButton
              onClick={() => setLanguage('zh')}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={
                language === 'zh'
                  ? { background: 'var(--binance-yellow)', color: '#000' }
                  : {
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              中文
            </UiButton>
            <UiButton
              onClick={() => setLanguage('en')}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={
                language === 'en'
                  ? { background: 'var(--binance-yellow)', color: '#000' }
                  : {
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              EN
            </UiButton>
          </div>
        </div>
      </div>
    </header>
  )
}
