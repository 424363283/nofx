import { UiCard } from './design/Controls'
import { UiButton, UiForm, UiInput } from './design/Controls'
import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { t } from '../i18n/translations'
import HeaderBar from './landing/HeaderBar'
import { ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react'

export function ResetPasswordPage() {
  const { language, setLanguage } = useLanguage()
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // 验证两次密码是否一致
    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch', language))
      return
    }

    setLoading(true)

    const result = await resetPassword(email, newPassword, otpCode)

    if (result.success) {
      setSuccess(true)
      // 3秒后跳转到登录页面
      setTimeout(() => {
        window.history.pushState({}, '', '/login')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, 3000)
    } else {
      setError(result.message || t('resetPasswordFailed', language))
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <HeaderBar
        isLoggedIn={false}
        language={language}
        onLanguageChange={setLanguage}
      />

      <div id="main-content" className="desk-auth">
        <div className="desk-auth-card ant-desk-auth">
          {/* Back to Login */}
          <UiButton
            onClick={() => {
              window.history.pushState({}, '', '/login')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
            className="flex items-center gap-2 mb-6 text-sm hover:text-[var(--binance-yellow)] transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToLogin', language)}
          </UiButton>

          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(52, 211, 153, 0.1)' }}
            >
              <KeyRound
                className="w-8 h-8"
                style={{ color: 'var(--binance-yellow)' }}
              />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              {t('resetPasswordTitle', language)}
            </h1>
            <p
              className="text-sm mt-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              使用邮箱和 Google Authenticator 重置密码
            </p>
          </div>

          {/* Reset Password Form */}
          <UiCard
            className="rounded-lg p-6"
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
            }}
          >
            {success ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">✅</div>
                <p
                  className="text-lg font-semibold mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  {t('resetPasswordSuccess', language)}
                </p>
                <p
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  3秒后将自动跳转到登录页面...
                </p>
              </div>
            ) : (
              <UiForm onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {t('email', language)}
                  </label>
                  <UiInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--foreground)',
                    }}
                    placeholder={t('emailPlaceholder', language)}
                    required
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {t('newPassword', language)}
                  </label>
                  <div className="relative">
                    <UiInput
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 rounded"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      placeholder={t('newPasswordPlaceholder', language)}
                      required
                      minLength={6}
                    />
                    <UiButton
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </UiButton>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {t('confirmPassword', language)}
                  </label>
                  <div className="relative">
                    <UiInput
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 rounded"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      placeholder={t('confirmPasswordPlaceholder', language)}
                      required
                      minLength={6}
                    />
                    <UiButton
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </UiButton>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold mb-2"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {t('otpCode', language)}
                  </label>
                  <div className="text-center mb-3">
                    <div className="text-3xl">📱</div>
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      打开 Google Authenticator 获取6位验证码
                    </p>
                  </div>
                  <UiInput
                    type="text"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full px-3 py-2 rounded text-center text-2xl font-mono"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--foreground)',
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
                      background: 'rgba(246, 70, 93, 0.1)',
                      color: 'var(--binance-red)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <UiButton
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full px-4 py-2 rounded text-sm font-semibold transition-all  disabled:opacity-50"
                  style={{ background: 'var(--binance-yellow)', color: '#000' }}
                >
                  {loading
                    ? t('loading', language)
                    : t('resetPasswordButton', language)}
                </UiButton>
              </UiForm>
            )}
          </UiCard>
        </div>
      </div>
    </div>
  )
}
