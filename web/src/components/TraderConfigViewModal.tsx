import { uiText } from '../i18n/uiText'
import { useLanguage } from '../contexts/LanguageContext'
import { UiCard } from './design/Controls'
import { UiButton, UiDialog } from './design/Controls'
import { useState } from 'react'
import type { TraderConfigData } from '../types'

// 提取下划线后面的名称部分
function getShortName(fullName: string): string {
  const parts = fullName.split('_')
  return parts.length > 1 ? parts[parts.length - 1] : fullName
}

interface TraderConfigViewModalProps {
  isOpen: boolean
  onClose: () => void
  traderData?: TraderConfigData | null
}

export function TraderConfigViewModal({
  isOpen,
  onClose,
  traderData,
}: TraderConfigViewModalProps) {
  const { language } = useLanguage()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!isOpen || !traderData) return null

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const CopyButton = ({
    text,
    fieldName,
  }: {
    text: string
    fieldName: string
  }) => (
    <UiButton
      onClick={() => copyToClipboard(text, fieldName)}
      className="ml-2 px-2 py-1 text-xs rounded transition-all duration-200 "
      style={{
        background:
          copiedField === fieldName
            ? 'rgba(14, 203, 129, 0.1)'
            : 'rgba(52, 211, 153, 0.1)',
        color:
          copiedField === fieldName
            ? 'var(--binance-green)'
            : 'var(--binance-yellow)',
        border: `1px solid ${copiedField === fieldName ? 'rgba(14, 203, 129, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
      }}
    >
      {copiedField === fieldName
        ? uiText('✓ 已复制', language)
        : uiText('📋 复制', language)}
    </UiButton>
  )

  const InfoRow = ({
    label,
    value,
    copyable = false,
    fieldName = '',
  }: {
    label: string
    value: string | number | boolean
    copyable?: boolean
    fieldName?: string
  }) => (
    <div className="flex justify-between items-start py-2 border-b border-[var(--panel-border)] last:border-b-0">
      <span className="text-sm text-[var(--text-secondary)] font-medium">
        {label}
      </span>
      <div className="flex items-center text-right">
        <span className="text-sm text-[var(--foreground)] font-mono">
          {typeof value === 'boolean'
            ? value
              ? uiText('是', language)
              : uiText('否', language)
            : value}
        </span>
        {copyable && typeof value === 'string' && value && (
          <CopyButton text={value} fieldName={fieldName} />
        )}
      </div>
    </div>
  )

  return (
    <UiDialog onClose={onClose} width={880}>
      <div
        aria-label={uiText('交易员配置详情', language)}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="desk-dialog-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--binance-yellow)] to-[#10b981] flex items-center justify-center">
              <span className="text-lg">👁️</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">
                {uiText('交易员配置', language)}{' '}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {traderData.trader_name} {uiText('的配置信息', language)}{' '}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Running Status */}
            <div
              className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
              style={
                traderData.is_running
                  ? {
                      background: 'rgba(14, 203, 129, 0.1)',
                      color: 'var(--binance-green)',
                    }
                  : {
                      background: 'rgba(246, 70, 93, 0.1)',
                      color: 'var(--binance-red)',
                    }
              }
            >
              <span>{traderData.is_running ? '●' : '○'}</span>
              {traderData.is_running
                ? uiText('运行中', language)
                : uiText('已停止', language)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="desk-dialog-body space-y-6">
          {/* Basic Info */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              {uiText('🤖 基础信息', language)}{' '}
            </h3>
            <div className="space-y-3">
              <InfoRow
                label={uiText('交易员ID', language)}
                value={traderData.trader_id || ''}
                copyable
                fieldName="trader_id"
              />
              <InfoRow
                label={uiText('交易员名称', language)}
                value={traderData.trader_name}
                copyable
                fieldName="trader_name"
              />
              <InfoRow
                label={uiText('AI模型', language)}
                value={getShortName(traderData.ai_model).toUpperCase()}
              />
              <InfoRow
                label={uiText('交易所', language)}
                value={getShortName(traderData.exchange_id).toUpperCase()}
              />
              <InfoRow
                label={uiText('初始余额', language)}
                value={`$${traderData.initial_balance.toLocaleString()}`}
              />
            </div>
          </UiCard>

          {/* Trading Configuration */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              {uiText('⚖️ 交易配置', language)}{' '}
            </h3>
            <div className="space-y-3">
              <InfoRow
                label={uiText('保证金模式', language)}
                value={
                  traderData.is_cross_margin
                    ? uiText('全仓', language)
                    : uiText('逐仓', language)
                }
              />
              <InfoRow
                label={uiText('BTC/ETH 杠杆', language)}
                value={`${traderData.btc_eth_leverage}x`}
              />
              <InfoRow
                label={uiText('山寨币杠杆', language)}
                value={`${traderData.altcoin_leverage}x`}
              />
              <InfoRow
                label={uiText('交易币种', language)}
                value={
                  traderData.trading_symbols || uiText('使用默认币种', language)
                }
                copyable
                fieldName="trading_symbols"
              />
            </div>
          </UiCard>

          {/* Signal Sources */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              {uiText('📡 信号源配置', language)}{' '}
            </h3>
            <div className="space-y-3">
              <InfoRow
                label={uiText('异动候选池', language)}
                value={!!traderData.signal_config?.radar_enabled}
              />
              <InfoRow
                label={uiText('币安原生信号', language)}
                value={!!traderData.signal_config?.enabled}
              />
              {traderData.signal_config?.enabled && (
                <>
                  <InfoRow
                    label={uiText('资产范围', language)}
                    value={
                      (
                        {
                          all: uiText('全部', language),
                          crypto: uiText('加密货币', language),
                          equity: uiText('美股 / ETF', language),
                          commodity: uiText('大宗商品', language),
                        } as Record<string, string>
                      )[traderData.signal_config.category] ||
                      uiText('全部', language)
                    }
                  />
                  <InfoRow
                    label={uiText('最多候选数', language)}
                    value={traderData.signal_config.limit}
                  />
                  <InfoRow
                    label={uiText('成交额排行', language)}
                    value={traderData.signal_config.volume}
                  />
                  <InfoRow
                    label={uiText('持仓量增长', language)}
                    value={traderData.signal_config.oi}
                  />
                  <InfoRow
                    label={uiText('资金费率偏离', language)}
                    value={traderData.signal_config.funding}
                  />
                  <InfoRow
                    label={uiText('价格突破', language)}
                    value={traderData.signal_config.breakout}
                  />
                </>
              )}
            </div>
          </UiCard>

          {/* Custom Prompt */}
          <UiCard className="bg-[var(--background)] border border-[var(--panel-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                {uiText('💬 交易策略提示词', language)}{' '}
              </h3>
              {traderData.custom_prompt && (
                <CopyButton
                  text={traderData.custom_prompt}
                  fieldName="custom_prompt"
                />
              )}
            </div>
            <div className="space-y-3">
              <InfoRow
                label={uiText('覆盖默认提示词', language)}
                value={traderData.override_base_prompt}
              />
              {traderData.custom_prompt ? (
                <div>
                  <div className="text-sm text-[var(--text-secondary)] mb-2">
                    {traderData.override_base_prompt
                      ? uiText('自定义提示词', language)
                      : uiText('附加提示词', language)}
                    ：
                  </div>
                  <div
                    className="p-3 rounded border text-sm text-[var(--foreground)] font-mono leading-relaxed max-h-48 overflow-y-auto"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--panel-border)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {traderData.custom_prompt}
                  </div>
                </div>
              ) : (
                <div
                  className="text-sm text-[var(--text-secondary)] italic p-3 rounded border"
                  style={{ border: '1px solid var(--panel-border)' }}
                >
                  {uiText(
                    '未设置自定义提示词，使用系统默认策略',
                    language
                  )}{' '}
                </div>
              )}
            </div>
          </UiCard>
        </div>

        {/* Footer */}
        <div className="desk-dialog-footer">
          <UiButton
            onClick={onClose}
            className="px-6 py-3 bg-[var(--panel-border)] text-[var(--foreground)] rounded-lg hover:bg-[#404750] transition-all duration-200 border border-[#404750]"
          >
            {uiText('关闭', language)}{' '}
          </UiButton>
          <UiButton
            onClick={() =>
              copyToClipboard(
                JSON.stringify(traderData, null, 2),
                'full_config'
              )
            }
            className="px-6 py-3 bg-gradient-to-r from-[var(--binance-yellow)] to-[#10b981] text-black rounded-lg hover:from-[#10b981] hover:to-[#059669] transition-all duration-200 font-medium shadow-lg"
          >
            {copiedField === 'full_config'
              ? uiText('✓ 已复制配置', language)
              : uiText('📋 复制完整配置', language)}
          </UiButton>
        </div>
      </div>
    </UiDialog>
  )
}
