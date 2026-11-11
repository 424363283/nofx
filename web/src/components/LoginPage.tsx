import { UiCard } from './design/Controls'
import { UiForm, UiInput, UiButton } from './design/Controls'
import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'
import HeaderBar from './landing/HeaderBar'
import { AUTH_EXPIRED_NOTICE } from '../lib/authFetch'

export function LoginPage() {
  const { language, setLanguage } = useLanguage()
  const { login, loginAdmin, verifyOTP } = useAuth()
  const [step, setStep] = useState<'login' | 'otp'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [userID, setUserID] = useState('')
  const [error, setError] = useState(() => sessionStorage.getItem(AUTH_EXPIRED_NOTICE)
    ? '登录已失效，请重新登录。已有模型、交易账户和策略配置仍会保留。'
    : '')
  const [loading, setLoading] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const adminMode = false

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await loginAdmin(adminPassword)
    if (!result.success) {
      setError(result.message || t('loginFailed', language))
    }
    setLoading(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)

    if (result.success) {
      if (result.requiresOTP && result.userID) {
        setUserID(result.userID)
        setStep('otp')
      }
    } else {
      setError(result.message || t('loginFailed', language))
    }

    setLoading(false)
  }

  const handleOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await verifyOTP(userID, otpCode)

    if (!result.success) {
      setError(result.message || t('verificationFailed', language))
    }
    // 成功的话AuthContext会自动处理登录状态

    setLoading(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-black)' }}>
      <HeaderBar
        isLoggedIn={false}
        currentPage="login"
        language={language}
        onLanguageChange={setLanguage}
      />

      <div id="main-content" className="desk-auth">
        <div className="desk-auth-card ant-desk-auth">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <img
                src="/icons/trading-desk.svg"
                alt="观澜 Logo"
                className="w-16 h-16 object-contain"
              />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--brand-light-gray)' }}
            >
              登录 观澜
            </h1>
            <p
              className="text-sm mt-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {step === 'login' ? '请输入您的邮箱和密码' : '请输入两步验证码'}
            </p>
          </div>

          {/* Login Form */}
          <UiCard
            className="rounded-lg p-6"
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
            }}
          >
            {adminMode ? (
              <UiForm onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="loginpage-1"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    管理员密码
                  </label>
                  <UiInput
                    id="loginpage-1"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--brand-light-gray)',
                    }}
                    placeholder="请输入管理员密码"
                    required
                  />
                </div>

                {error && (
                  <div
                    className="text-sm px-3 py-2 rounded"
                    style={{
                      background: 'var(--binance-red-bg)',
                      color: 'var(--binance-red)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <UiButton
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 rounded text-sm font-semibold transition-all  disabled:opacity-50"
                  style={{
                    background: 'var(--brand-yellow)',
                    color: 'var(--brand-black)',
                  }}
                >
                  {loading ? t('loading', language) : '登录'}
                </UiButton>
              </UiForm>
            ) : step === 'login' ? (
              <UiForm onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="loginpage-2"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('email', language)}
                  </label>
                  <UiInput
                    id="loginpage-2"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--brand-light-gray)',
                    }}
                    placeholder={t('emailPlaceholder', language)}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="loginpage-3"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('password', language)}
                  </label>
                  <UiInput
                    id="loginpage-3"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--brand-light-gray)',
                    }}
                    placeholder={t('passwordPlaceholder', language)}
                    required
                  />
                  <div className="text-right mt-2">
                    <UiButton
                      type="button"
                      onClick={() => {
                        window.history.pushState({}, '', '/reset-password')
                        window.dispatchEvent(new PopStateEvent('popstate'))
                      }}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--binance-yellow)' }}
                    >
                      {t('forgotPassword', language)}
                    </UiButton>
                  </div>
                </div>

                {error && (
                  <div
                    className="text-sm px-3 py-2 rounded"
                    style={{
                      background: 'var(--binance-red-bg)',
                      color: 'var(--binance-red)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <UiButton
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 rounded text-sm font-semibold transition-all  disabled:opacity-50"
                  style={{
                    background: 'var(--brand-yellow)',
                    color: 'var(--brand-black)',
                  }}
                >
                  {loading
                    ? t('loading', language)
                    : t('loginButton', language)}
                </UiButton>
              </UiForm>
            ) : (
              <UiForm onSubmit={handleOTPVerify} className="space-y-4">
                <div className="text-center mb-4">
                  <div className="text-4xl mb-2">📱</div>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('scanQRCodeInstructions', language)}
                    <br />
                    {t('enterOTPCode', language)}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="loginpage-4"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('otpCode', language)}
                  </label>
                  <UiInput
                    id="loginpage-4"
                    type="text"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full px-3 py-2 rounded text-center text-2xl font-mono"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--brand-light-gray)',
                    }}
                    placeholder={t('otpPlaceholder', language)}
                    maxLength={6}
                    required
                  />
                </div>

                {error && (
                  <div
                    className="text-sm px-3 py-2 rounded"
                    style={{
                      background: 'var(--binance-red-bg)',
                      color: 'var(--binance-red)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <UiButton
                    type="button"
                    onClick={() => setStep('login')}
                    className="flex-1 px-4 py-2 rounded text-sm font-semibold"
                    style={{
                      background: 'var(--panel-bg-hover)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {t('back', language)}
                  </UiButton>
                  <UiButton
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="flex-1 px-4 py-2 rounded text-sm font-semibold transition-all  disabled:opacity-50"
                    style={{
                      background: 'var(--binance-yellow)',
                      color: '#000',
                    }}
                  >
                    {loading
                      ? t('loading', language)
                      : t('verifyOTP', language)}
                  </UiButton>
                </div>
              </UiForm>
            )}
          </UiCard>

          {/* Register Link */}
          {!adminMode && (
            <div className="text-center mt-6">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                还没有账户？{' '}
                <UiButton
                  onClick={() => {
                    window.history.pushState({}, '', '/register')
                    window.dispatchEvent(new PopStateEvent('popstate'))
                  }}
                  className="font-semibold hover:underline transition-colors"
                  style={{ color: 'var(--brand-yellow)' }}
                >
                  立即注册
                </UiButton>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
