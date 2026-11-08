import { UiCard } from './design/Controls'
import { UiForm, UiInput, UiButton } from './design/Controls'
import { QRCodeSVG } from 'qrcode.react'
import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'
import { getSystemConfig } from '../lib/config'
import HeaderBar from './landing/HeaderBar'

export function RegisterPage() {
  const { language, setLanguage } = useLanguage()
  const { register, completeRegistration } = useAuth()
  const [step, setStep] = useState<'register' | 'setup-otp' | 'verify-otp'>(
    'register'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [betaCode, setBetaCode] = useState('')
  const [betaMode, setBetaMode] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [userID, setUserID] = useState('')
  const [otpSecret, setOtpSecret] = useState('')
  const [qrCodeURL, setQrCodeURL] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 获取系统配置，检查是否开启内测模式
    getSystemConfig()
      .then((config) => {
        setBetaMode(config.beta_mode || false)
      })
      .catch((err) => {
        console.error('Failed to fetch system config:', err)
      })
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('passwordMismatch', language))
      return
    }

    if (password.length < 6) {
      setError(t('passwordTooShort', language))
      return
    }

    if (betaMode && !betaCode.trim()) {
      setError('内测期间，注册需要提供内测码')
      return
    }

    setLoading(true)

    const result = await register(email, password, betaCode.trim() || undefined)

    if (result.success && result.userID) {
      setUserID(result.userID)
      setOtpSecret(result.otpSecret || '')
      setQrCodeURL(result.qrCodeURL || '')
      setStep('setup-otp')
    } else {
      setError(result.message || t('registrationFailed', language))
    }

    setLoading(false)
  }

  const handleSetupComplete = () => {
    setStep('verify-otp')
  }

  const handleOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await completeRegistration(userID, otpCode)

    if (!result.success) {
      setError(result.message || t('registrationFailed', language))
    }
    // 成功的话AuthContext会自动处理登录状态

    setLoading(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-black)' }}>
      <HeaderBar
        isLoggedIn={false}
        currentPage="register"
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
              style={{ color: 'var(--foreground)' }}
            >
              {t('appTitle', language)}
            </h1>
            <p
              className="text-sm mt-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {step === 'register' && t('registerTitle', language)}
              {step === 'setup-otp' && t('setupTwoFactor', language)}
              {step === 'verify-otp' && t('verifyOTP', language)}
            </p>
          </div>

          {/* Registration Form */}
          <UiCard
            className="rounded-lg p-6"
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
            }}
          >
            {step === 'register' && (
              <UiForm onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label
                    htmlFor="registerpage-1"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('email', language)}
                  </label>
                  <UiInput
                    id="registerpage-1"
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
                    htmlFor="registerpage-2"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('password', language)}
                  </label>
                  <UiInput
                    id="registerpage-2"
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
                </div>

                <div>
                  <label
                    htmlFor="registerpage-3"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('confirmPassword', language)}
                  </label>
                  <UiInput
                    id="registerpage-3"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--brand-light-gray)',
                    }}
                    placeholder={t('confirmPasswordPlaceholder', language)}
                    required
                  />
                </div>

                {betaMode && (
                  <div>
                    <label
                      htmlFor="registerpage-4"
                      className="block text-sm font-semibold mb-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      内测码 *
                    </label>
                    <UiInput
                      id="registerpage-4"
                      type="text"
                      value={betaCode}
                      onChange={(e) =>
                        setBetaCode(
                          e.target.value
                            .replace(/[^a-z0-9]/gi, '')
                            .toLowerCase()
                        )
                      }
                      className="w-full px-3 py-2 rounded font-mono"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      placeholder="请输入6位内测码"
                      maxLength={6}
                      required={betaMode}
                    />
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      内测码由6位字母数字组成，区分大小写
                    </p>
                  </div>
                )}

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
                  disabled={loading || (betaMode && !betaCode.trim())}
                  className="w-full px-4 py-2 rounded text-sm font-semibold transition-all  disabled:opacity-50"
                  style={{
                    background: 'var(--brand-yellow)',
                    color: 'var(--brand-black)',
                  }}
                >
                  {loading
                    ? t('loading', language)
                    : t('registerButton', language)}
                </UiButton>
              </UiForm>
            )}

            {step === 'setup-otp' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">📱</div>
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {t('setupTwoFactor', language)}
                  </h3>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('setupTwoFactorDesc', language)}
                  </p>
                </div>

                <div className="space-y-3">
                  <div
                    className="p-3 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                    }}
                  >
                    <p
                      className="text-sm font-semibold mb-2"
                      style={{ color: 'var(--brand-light-gray)' }}
                    >
                      {t('authStep1Title', language)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('authStep1Desc', language)}
                    </p>
                  </div>

                  <div
                    className="p-3 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                    }}
                  >
                    <p
                      className="text-sm font-semibold mb-2"
                      style={{ color: 'var(--brand-light-gray)' }}
                    >
                      {t('authStep2Title', language)}
                    </p>
                    <p
                      className="text-xs mb-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('authStep2Desc', language)}
                    </p>

                    {qrCodeURL && (
                      <div className="mt-2">
                        <p
                          className="text-xs mb-2"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {t('qrCodeHint', language)}
                        </p>
                        <div className="bg-white p-2 rounded text-center">
                          <QRCodeSVG
                            value={qrCodeURL}
                            size={150}
                            title="验证器二维码"
                            className="mx-auto"
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-2">
                      <p
                        className="text-xs mb-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {t('otpSecret', language)}
                      </p>
                      <div className="flex items-center gap-2">
                        <code
                          className="flex-1 px-2 py-1 text-xs rounded font-mono"
                          style={{
                            background: 'var(--panel-bg-hover)',
                            color: 'var(--brand-light-gray)',
                          }}
                        >
                          {otpSecret}
                        </code>
                        <UiButton
                          onClick={() => copyToClipboard(otpSecret)}
                          className="px-2 py-1 text-xs rounded"
                          style={{
                            background: 'var(--brand-yellow)',
                            color: 'var(--brand-black)',
                          }}
                        >
                          {t('copy', language)}
                        </UiButton>
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-3 rounded"
                    style={{
                      background: 'var(--brand-black)',
                      border: '1px solid var(--panel-border)',
                    }}
                  >
                    <p
                      className="text-sm font-semibold mb-2"
                      style={{ color: 'var(--brand-light-gray)' }}
                    >
                      {t('authStep3Title', language)}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('authStep3Desc', language)}
                    </p>
                  </div>
                </div>

                <UiButton
                  onClick={handleSetupComplete}
                  className="w-full px-4 py-2 rounded text-sm font-semibold transition-all "
                  style={{ background: 'var(--binance-yellow)', color: '#000' }}
                >
                  {t('setupCompleteContinue', language)}
                </UiButton>
              </div>
            )}

            {step === 'verify-otp' && (
              <UiForm onSubmit={handleOTPVerify} className="space-y-4">
                <div className="text-center mb-4">
                  <div className="text-4xl mb-2">🔐</div>
                  <p
                    className="text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('enterOTPCode', language)}
                    <br />
                    {t('completeRegistrationSubtitle', language)}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="registerpage-5"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--brand-light-gray)' }}
                  >
                    {t('otpCode', language)}
                  </label>
                  <UiInput
                    id="registerpage-5"
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
                    onClick={() => setStep('setup-otp')}
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
                      : t('completeRegistration', language)}
                  </UiButton>
                </div>
              </UiForm>
            )}
          </UiCard>

          {/* Login Link */}
          {step === 'register' && (
            <div className="text-center mt-6">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                已有账户？{' '}
                <UiButton
                  onClick={() => {
                    window.history.pushState({}, '', '/login')
                    window.dispatchEvent(new PopStateEvent('popstate'))
                  }}
                  className="font-semibold hover:underline transition-colors"
                  style={{ color: 'var(--brand-yellow)' }}
                >
                  立即登录
                </UiButton>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
