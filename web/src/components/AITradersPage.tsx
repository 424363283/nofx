import './design/exchange-dialog.css'
import { uiText } from '../i18n/uiText'
import { TradersManagementView } from './TradersManagementView'
import { UiCheckLabel } from './design/Controls'
import { App as AntApp, Tooltip as AntTooltip, Alert as AntAlert } from 'antd'
import {
  UiButton,
  UiDialog,
  UiForm,
  UiInput,
  UiSelect,
} from './design/Controls'
import React, { useState, useEffect } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { api } from '../lib/api'
import type {
  TraderInfo,
  CreateTraderRequest,
  AIModel,
  Exchange,
} from '../types'
import { useLanguage } from '../contexts/LanguageContext'
import { t, type Language } from '../i18n/translations'
import { useAuth } from '../contexts/AuthContext'
import { getExchangeIcon } from './ExchangeIcons'
import { getModelIcon } from './ModelIcons'
import { TraderConfigModal } from './TraderConfigModal'
import {
  TwoStageKeyModal,
  type TwoStageKeyModalResult,
} from './TwoStageKeyModal'
import { Trash2, AlertTriangle, BookOpen, HelpCircle } from 'lucide-react'

// 提取下划线后面的名称部分
function getShortName(fullName: string): string {
  const parts = fullName.split('_')
  return parts.length > 1 ? parts[parts.length - 1] : fullName
}

interface AITradersPageProps {
  onTraderSelect?: (traderId: string) => void
}

export function AITradersPage({ onTraderSelect }: AITradersPageProps) {
  const { message, modal } = AntApp.useApp()
  const { language } = useLanguage()
  const { user, token } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showModelModal, setShowModelModal] = useState(false)
  const [showExchangeModal, setShowExchangeModal] = useState(false)
  const [showSignalSourceModal, setShowSignalSourceModal] = useState(false)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [editingExchange, setEditingExchange] = useState<string | null>(null)
  const [editingTrader, setEditingTrader] = useState<any>(null)
  const [allModels, setAllModels] = useState<AIModel[]>([])
  const [allExchanges, setAllExchanges] = useState<Exchange[]>([])
  const [supportedModels, setSupportedModels] = useState<AIModel[]>([])
  const [supportedExchanges, setSupportedExchanges] = useState<Exchange[]>([])
  const [userSignalSource, setUserSignalSource] = useState<{
    coinPoolUrl: string
    oiTopUrl: string
  }>({
    coinPoolUrl: '',
    oiTopUrl: '',
  })

  const { data: traders, mutate: mutateTraders } = useSWR<TraderInfo[]>(
    user && token ? ['traders', user.id] : null,
    api.getTraders,
    { refreshInterval: 5000 }
  )

  // 加载AI模型和交易所配置
  useEffect(() => {
    const loadConfigs = async () => {
      if (!user || !token) {
        // 未登录时只加载公开的支持模型和交易所
        try {
          const [supportedModels, supportedExchanges] = await Promise.all([
            api.getSupportedModels(),
            api.getSupportedExchanges(),
          ])
          setSupportedModels(supportedModels)
          setSupportedExchanges(supportedExchanges)
        } catch (err) {
          console.error('Failed to load supported configs:', err)
        }
        return
      }

      try {
        const [
          modelConfigs,
          exchangeConfigs,
          supportedModels,
          supportedExchanges,
        ] = await Promise.all([
          api.getModelConfigs(),
          api.getExchangeConfigs(),
          api.getSupportedModels(),
          api.getSupportedExchanges(),
        ])
        setAllModels(modelConfigs)
        setAllExchanges(exchangeConfigs)
        setSupportedModels(supportedModels)
        setSupportedExchanges(supportedExchanges)

        // 加载用户信号源配置
        try {
          const signalSource = await api.getUserSignalSource()
          setUserSignalSource({
            coinPoolUrl: signalSource.coin_pool_url || '',
            oiTopUrl: signalSource.oi_top_url || '',
          })
        } catch (error) {
          console.log(uiText('📡 用户信号源配置暂未设置', language))
        }
      } catch (error) {
        console.error('Failed to load configs:', error)
      }
    }
    loadConfigs()
  }, [user, token])

  // 只显示已配置的模型和交易所
  // 注意：后端返回的数据不包含敏感信息（apiKey等），所以通过其他字段判断是否已配置
  const configuredModels =
    allModels?.filter((m) => {
      // 如果模型已启用，说明已配置
      // 或者有自定义API URL，也说明已配置
      return m.enabled || (m.customApiUrl && m.customApiUrl.trim() !== '')
    }) || []
  const configuredExchanges =
    allExchanges?.filter((e) => {
      // Aster 交易所检查特殊字段
      if (e.id === 'aster') {
        return e.asterUser && e.asterUser.trim() !== ''
      }
      // Hyperliquid 需要检查钱包地址（后端会返回这个字段）
      if (e.id === 'hyperliquid') {
        return e.hyperliquidWalletAddr && e.hyperliquidWalletAddr.trim() !== ''
      }
      // 其他交易所：如果已启用，说明已配置（后端返回的已配置交易所会有 enabled: true）
      return e.enabled
    }) || []

  // 只在创建交易员时使用已启用且配置完整的
  // 注意：后端返回的数据不包含敏感信息，所以只检查 enabled 状态和必要的非敏感字段
  const enabledModels = allModels?.filter((m) => m.enabled) || []
  const enabledExchanges =
    allExchanges?.filter((e) => {
      if (!e.enabled) return false

      // Aster 交易所需要特殊字段（后端会返回这些非敏感字段）
      if (e.id === 'aster') {
        return (
          e.asterUser &&
          e.asterUser.trim() !== '' &&
          e.asterSigner &&
          e.asterSigner.trim() !== ''
        )
      }

      // Hyperliquid 需要钱包地址（后端会返回这个字段）
      if (e.id === 'hyperliquid') {
        return e.hyperliquidWalletAddr && e.hyperliquidWalletAddr.trim() !== ''
      }

      // 其他交易所：如果已启用，说明已配置完整（后端只返回已配置的交易所）
      return true
    }) || []

  // 检查模型是否正在被运行中的交易员使用（用于UI禁用）
  const isModelInUse = (modelId: string) => {
    return traders?.some((t) => t.ai_model === modelId && t.is_running)
  }

  // 检查交易所是否正在被运行中的交易员使用（用于UI禁用）
  const isExchangeInUse = (exchangeId: string) => {
    return traders?.some((t) => t.exchange_id === exchangeId && t.is_running)
  }

  // 检查模型是否被任何交易员使用（包括停止状态的）
  const isModelUsedByAnyTrader = (modelId: string) => {
    return traders?.some((t) => t.ai_model === modelId) || false
  }

  // 检查交易所是否被任何交易员使用（包括停止状态的）
  const isExchangeUsedByAnyTrader = (exchangeId: string) => {
    return traders?.some((t) => t.exchange_id === exchangeId) || false
  }

  // 获取使用特定模型的交易员列表
  const getTradersUsingModel = (modelId: string) => {
    return traders?.filter((t) => t.ai_model === modelId) || []
  }

  // 获取使用特定交易所的交易员列表
  const getTradersUsingExchange = (exchangeId: string) => {
    return traders?.filter((t) => t.exchange_id === exchangeId) || []
  }

  const handleCreateTrader = async (data: CreateTraderRequest) => {
    try {
      const model = allModels?.find((m) => m.id === data.ai_model_id)
      const exchange = allExchanges?.find((e) => e.id === data.exchange_id)

      if (!model?.enabled) {
        throw new Error(t('modelNotConfigured', language))
      }

      if (!exchange?.enabled) {
        throw new Error(t('exchangeNotConfigured', language))
      }

      await api.createTrader(data)
      setShowCreateModal(false)
      mutateTraders()
    } catch (error) {
      console.error('Failed to create trader:', error)
      throw error
    }
  }

  const handleEditTrader = async (traderId: string) => {
    try {
      const traderConfig = await api.getTraderConfig(traderId)
      setEditingTrader(traderConfig)
      setShowEditModal(true)
    } catch (error) {
      console.error('Failed to fetch trader config:', error)
      message.error(t('getTraderConfigFailed', language))
    }
  }

  const handleSaveEditTrader = async (data: CreateTraderRequest) => {
    if (!editingTrader) return

    try {
      const model = enabledModels?.find((m) => m.id === data.ai_model_id)
      const exchange = enabledExchanges?.find((e) => e.id === data.exchange_id)

      if (!model) {
        throw new Error(t('modelConfigNotExist', language))
      }

      if (!exchange) {
        throw new Error(t('exchangeConfigNotExist', language))
      }

      const request = {
        name: data.name,
        ai_model_id: data.ai_model_id,
        exchange_id: data.exchange_id,
        initial_balance: data.initial_balance,
        scan_interval_minutes: data.scan_interval_minutes,
        btc_eth_leverage: data.btc_eth_leverage,
        altcoin_leverage: data.altcoin_leverage,
        trading_symbols: data.trading_symbols,
        custom_prompt: data.custom_prompt,
        override_base_prompt: data.override_base_prompt,
        is_cross_margin: data.is_cross_margin,
        use_coin_pool: data.use_coin_pool,
        signal_config: data.signal_config,
        use_oi_top: data.use_oi_top,
      }

      await api.updateTrader(editingTrader.trader_id, request)
      setShowEditModal(false)
      setEditingTrader(null)
      mutateTraders()
    } catch (error) {
      console.error('Failed to update trader:', error)
      throw error
    }
  }

  const handleDeleteTrader = async (traderId: string) => {
    if (
      !(await modal.confirm({
        title: t('confirmDeleteTrader', language),
        okText: uiText('删除', language),
        cancelText: uiText('取消', language),
        okButtonProps: { danger: true },
      }))
    )
      return

    try {
      await api.deleteTrader(traderId)
      await Promise.all([mutateTraders(), mutateCache('competition')])
    } catch (error) {
      console.error('Failed to delete trader:', error)
      message.error(t('deleteTraderFailed', language))
    }
  }

  const handleToggleTrader = async (traderId: string, running: boolean) => {
    try {
      if (running) {
        await api.stopTrader(traderId)
      } else {
        await api.startTrader(traderId)
      }
      mutateTraders()
    } catch (error) {
      console.error('Failed to toggle trader:', error)
      message.error(t('operationFailed', language))
    }
  }

  const handleModelClick = (modelId: string) => {
    if (!isModelInUse(modelId)) {
      setEditingModel(modelId)
      setShowModelModal(true)
    }
  }

  const handleExchangeClick = (exchangeId: string) => {
    if (!isExchangeInUse(exchangeId)) {
      setEditingExchange(exchangeId)
      setShowExchangeModal(true)
    }
  }

  // 通用删除配置处理函数
  const handleDeleteConfig = async <T extends { id: string }>(config: {
    id: string
    type: 'model' | 'exchange'
    checkInUse: (id: string) => boolean
    getUsingTraders: (id: string) => any[]
    cannotDeleteKey: string
    confirmDeleteKey: string
    allItems: T[] | undefined
    clearFields: (item: T) => T
    buildRequest: (items: T[]) => any
    updateApi: (request: any) => Promise<void>
    refreshApi: () => Promise<T[]>
    setItems: (items: T[]) => void
    closeModal: () => void
    errorKey: string
  }) => {
    // 检查是否有交易员正在使用
    if (config.checkInUse(config.id)) {
      const usingTraders = config.getUsingTraders(config.id)
      const traderNames = usingTraders.map((t) => t.trader_name).join(', ')
      message.error(
        t(config.cannotDeleteKey, language) +
          '\n\n' +
          t('tradersUsing', language) +
          ': ' +
          traderNames +
          '\n\n' +
          t('pleaseDeleteTradersFirst', language)
      )
      return
    }

    if (
      !(await modal.confirm({
        title: t(config.confirmDeleteKey, language),
        okText: uiText('删除', language),
        cancelText: uiText('取消', language),
        okButtonProps: { danger: true },
      }))
    )
      return

    try {
      const updatedItems =
        config.allItems?.map((item) =>
          item.id === config.id ? config.clearFields(item) : item
        ) || []

      const request = config.buildRequest(updatedItems)
      await config.updateApi(request)

      // 重新获取用户配置以确保数据同步
      const refreshedItems = await config.refreshApi()
      config.setItems(refreshedItems)

      config.closeModal()
    } catch (error) {
      console.error(`Failed to delete ${config.type} config:`, error)
      message.error(t(config.errorKey, language))
    }
  }

  const handleDeleteModelConfig = async (modelId: string) => {
    await handleDeleteConfig({
      id: modelId,
      type: 'model',
      checkInUse: isModelUsedByAnyTrader,
      getUsingTraders: getTradersUsingModel,
      cannotDeleteKey: 'cannotDeleteModelInUse',
      confirmDeleteKey: 'confirmDeleteModel',
      allItems: allModels,
      clearFields: (m) => ({
        ...m,
        apiKey: '',
        customApiUrl: '',
        customModelName: '',
        enabled: false,
      }),
      buildRequest: (models) => ({
        models: Object.fromEntries(
          models.map((model) => [
            model.provider,
            {
              enabled: model.enabled,
              api_key: model.apiKey || '',
              custom_api_url: model.customApiUrl || '',
              custom_model_name: model.customModelName || '',
            },
          ])
        ),
      }),
      updateApi: api.updateModelConfigs,
      refreshApi: api.getModelConfigs,
      setItems: (items) => {
        // 使用函数式更新确保状态正确更新
        setAllModels([...items])
      },
      closeModal: () => {
        setShowModelModal(false)
        setEditingModel(null)
      },
      errorKey: 'deleteConfigFailed',
    })
  }

  const handleSaveModelConfig = async (
    modelId: string,
    apiKey: string,
    customApiUrl?: string,
    customModelName?: string
  ) => {
    try {
      // 创建或更新用户的模型配置
      const existingModel = allModels?.find((m) => m.id === modelId)
      let updatedModels

      // 找到要配置的模型（优先从已配置列表，其次从支持列表）
      const modelToUpdate =
        existingModel || supportedModels?.find((m) => m.id === modelId)
      if (!modelToUpdate) {
        message.error(t('modelNotExist', language))
        return
      }

      if (existingModel) {
        // 更新现有配置
        updatedModels =
          allModels?.map((m) =>
            m.id === modelId
              ? {
                  ...m,
                  apiKey,
                  customApiUrl: customApiUrl || '',
                  customModelName: customModelName || '',
                  enabled: true,
                }
              : m
          ) || []
      } else {
        // 添加新配置
        const newModel = {
          ...modelToUpdate,
          apiKey,
          customApiUrl: customApiUrl || '',
          customModelName: customModelName || '',
          enabled: true,
        }
        updatedModels = [...(allModels || []), newModel]
      }

      const request = {
        models: Object.fromEntries(
          updatedModels.map((model) => [
            model.provider, // 使用 provider 而不是 id
            {
              enabled: model.enabled,
              api_key: model.apiKey || '',
              custom_api_url: model.customApiUrl || '',
              custom_model_name: model.customModelName || '',
            },
          ])
        ),
      }

      await api.updateModelConfigs(request)

      // 重新获取用户配置以确保数据同步
      const refreshedModels = await api.getModelConfigs()
      setAllModels(refreshedModels)

      setShowModelModal(false)
      setEditingModel(null)
    } catch (error) {
      console.error('Failed to save model config:', error)
      message.error(t('saveConfigFailed', language))
    }
  }

  const handleDeleteExchangeConfig = async (exchangeId: string) => {
    await handleDeleteConfig({
      id: exchangeId,
      type: 'exchange',
      checkInUse: isExchangeUsedByAnyTrader,
      getUsingTraders: getTradersUsingExchange,
      cannotDeleteKey: 'cannotDeleteExchangeInUse',
      confirmDeleteKey: 'confirmDeleteExchange',
      allItems: allExchanges,
      clearFields: (e) => ({
        ...e,
        apiKey: '',
        secretKey: '',
        hyperliquidWalletAddr: '',
        asterUser: '',
        asterSigner: '',
        asterPrivateKey: '',
        enabled: false,
      }),
      buildRequest: (exchanges) => ({
        exchanges: Object.fromEntries(
          exchanges.filter((exchange) => exchange.id === exchangeId).map((exchange) => [
            exchange.id,
            {
              enabled: exchange.enabled,
              api_key: exchange.apiKey || '',
              secret_key: exchange.secretKey || '',
              testnet: exchange.testnet || false,
              hyperliquid_wallet_addr: exchange.hyperliquidWalletAddr || '',
              aster_user: exchange.asterUser || '',
              aster_signer: exchange.asterSigner || '',
              aster_private_key: exchange.asterPrivateKey || '',
            },
          ])
        ),
      }),
      updateApi: api.updateExchangeConfigsEncrypted,
      refreshApi: api.getExchangeConfigs,
      setItems: (items) => {
        // 使用函数式更新确保状态正确更新
        setAllExchanges([...items])
      },
      closeModal: () => {
        setShowExchangeModal(false)
        setEditingExchange(null)
      },
      errorKey: 'deleteExchangeConfigFailed',
    })
  }

  const handleSaveExchangeConfig = async (
    exchangeId: string,
    apiKey: string,
    secretKey?: string,
    testnet?: boolean,
    hyperliquidWalletAddr?: string,
    asterUser?: string,
    asterSigner?: string,
    asterPrivateKey?: string
  ) => {
    try {
      // 找到要配置的交易所（从supportedExchanges中）
      const exchangeToUpdate = supportedExchanges?.find(
        (e) => e.id === exchangeId
      )
      if (!exchangeToUpdate) {
        message.error(t('exchangeNotExist', language))
        return
      }

      // 创建或更新用户的交易所配置
      const existingExchange = allExchanges?.find((e) => e.id === exchangeId)
      let updatedExchanges

      if (existingExchange) {
        // 更新现有配置
        updatedExchanges =
          allExchanges?.map((e) =>
            e.id === exchangeId
              ? {
                  ...e,
                  apiKey,
                  secretKey,
                  testnet,
                  hyperliquidWalletAddr,
                  asterUser,
                  asterSigner,
                  asterPrivateKey,
                  enabled: true,
                }
              : e
          ) || []
      } else {
        // 添加新配置
        const newExchange = {
          ...exchangeToUpdate,
          apiKey,
          secretKey,
          testnet,
          hyperliquidWalletAddr,
          asterUser,
          asterSigner,
          asterPrivateKey,
          enabled: true,
        }
        updatedExchanges = [...(allExchanges || []), newExchange]
      }

      const request = {
        exchanges: Object.fromEntries(
          updatedExchanges.filter((exchange) => exchange.id === exchangeId).map((exchange) => [
            exchange.id,
            {
              enabled: exchange.enabled,
              api_key: exchange.apiKey || '',
              secret_key: exchange.secretKey || '',
              testnet: exchange.testnet || false,
              hyperliquid_wallet_addr: exchange.hyperliquidWalletAddr || '',
              aster_user: exchange.asterUser || '',
              aster_signer: exchange.asterSigner || '',
              aster_private_key: exchange.asterPrivateKey || '',
            },
          ])
        ),
      }

      await api.updateExchangeConfigsEncrypted(request)

      // 重新获取用户配置以确保数据同步
      const refreshedExchanges = await api.getExchangeConfigs()
      setAllExchanges(refreshedExchanges)

      setShowExchangeModal(false)
      setEditingExchange(null)
    } catch (error) {
      console.error('Failed to save exchange config:', error)
      message.error(t('saveConfigFailed', language))
    }
  }

  const handleAddModel = () => {
    setEditingModel(null)
    setShowModelModal(true)
  }

  const handleAddExchange = () => {
    setEditingExchange(null)
    setShowExchangeModal(true)
  }

  const handleSaveSignalSource = async (
    coinPoolUrl: string,
    oiTopUrl: string
  ) => {
    try {
      await api.saveUserSignalSource(coinPoolUrl, oiTopUrl)
      setUserSignalSource({ coinPoolUrl, oiTopUrl })
      setShowSignalSourceModal(false)
    } catch (error) {
      console.error('Failed to save signal source:', error)
      message.error(t('saveSignalSourceFailed', language))
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <TradersManagementView
        traders={traders}
        models={configuredModels}
        exchanges={configuredExchanges}
        modelInUse={(id) => !!isModelInUse(id)}
        exchangeInUse={(id) => !!isExchangeInUse(id)}
        onModel={handleModelClick}
        onExchange={handleExchangeClick}
        onAddModel={handleAddModel}
        onAddExchange={handleAddExchange}
        onLegacy={() => setShowSignalSourceModal(true)}
        onCreate={() => setShowCreateModal(true)}
        onView={(id) => onTraderSelect?.(id)}
        onEdit={handleEditTrader}
        onToggle={handleToggleTrader}
        onDelete={handleDeleteTrader}
        legacyWarning={
          !!traders?.some((t) => t.use_coin_pool || t.use_oi_top) &&
          !userSignalSource.coinPoolUrl &&
          !userSignalSource.oiTopUrl
        }
      />

      {/* Create Trader Modal */}
      {showCreateModal && (
        <TraderConfigModal
          isOpen={showCreateModal}
          isEditMode={false}
          availableModels={enabledModels}
          availableExchanges={enabledExchanges}
          onSave={handleCreateTrader}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit Trader Modal */}
      {showEditModal && editingTrader && (
        <TraderConfigModal
          isOpen={showEditModal}
          isEditMode={true}
          traderData={editingTrader}
          availableModels={enabledModels}
          availableExchanges={enabledExchanges}
          onSave={handleSaveEditTrader}
          onClose={() => {
            setShowEditModal(false)
            setEditingTrader(null)
          }}
        />
      )}

      {/* Model Configuration Modal */}
      {showModelModal && (
        <ModelConfigModal
          allModels={supportedModels}
          configuredModels={allModels}
          editingModelId={editingModel}
          onSave={handleSaveModelConfig}
          onDelete={handleDeleteModelConfig}
          onClose={() => {
            setShowModelModal(false)
            setEditingModel(null)
          }}
          language={language}
        />
      )}

      {/* Exchange Configuration Modal */}
      {showExchangeModal && (
        <ExchangeConfigModal
          allExchanges={supportedExchanges}
          editingExchangeId={editingExchange}
          onSave={handleSaveExchangeConfig}
          onDelete={handleDeleteExchangeConfig}
          onClose={() => {
            setShowExchangeModal(false)
            setEditingExchange(null)
          }}
          language={language}
        />
      )}

      {/* Signal Source Configuration Modal */}
      {showSignalSourceModal && (
        <SignalSourceModal
          coinPoolUrl={userSignalSource.coinPoolUrl}
          oiTopUrl={userSignalSource.oiTopUrl}
          onSave={handleSaveSignalSource}
          onClose={() => setShowSignalSourceModal(false)}
          language={language}
        />
      )}
    </div>
  )
}

// Tooltip Helper Component
function Tooltip({
  content,
  children,
}: {
  content: string
  children: React.ReactNode
}) {
  return (
    <AntTooltip title={content}>
      <span className="inline-flex">{children}</span>
    </AntTooltip>
  )
}

// Signal Source Configuration Modal Component
function SignalSourceModal({
  coinPoolUrl,
  oiTopUrl,
  onSave,
  onClose,
  language,
}: {
  coinPoolUrl: string
  oiTopUrl: string
  onSave: (coinPoolUrl: string, oiTopUrl: string) => void
  onClose: () => void
  language: Language
}) {
  const [coinPool, setCoinPool] = useState(coinPoolUrl || '')
  const [oiTop, setOiTop] = useState(oiTopUrl || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(coinPool.trim(), oiTop.trim())
  }

  return (
    <UiDialog onClose={onClose} width={600}>
      <div>
        <h3
          className="text-xl font-bold mb-4"
          style={{ color: 'var(--foreground)' }}
        >
          {uiText('📡 旧版自定义信号接口（兼容）', language)}{' '}
        </h3>

        <UiForm onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              COIN POOL URL
            </label>
            <UiInput
              type="url"
              value={coinPool}
              onChange={(e) => setCoinPool(e.target.value)}
              placeholder={uiText('输入币种池数据接口地址', language)}
              className="w-full px-3 py-2 rounded"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--panel-border)',
                color: 'var(--foreground)',
              }}
            />
            <div
              className="text-xs mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('coinPoolDescription', language)}
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-semibold mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              OI TOP URL
            </label>
            <UiInput
              type="url"
              value={oiTop}
              onChange={(e) => setOiTop(e.target.value)}
              placeholder={uiText('输入持仓量排行数据接口地址', language)}
              className="w-full px-3 py-2 rounded"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--panel-border)',
                color: 'var(--foreground)',
              }}
            />
            <div
              className="text-xs mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('oiTopDescription', language)}
            </div>
          </div>

          <div
            className="p-4 rounded"
            style={{
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.2)',
            }}
          >
            <div
              className="text-sm font-semibold mb-2"
              style={{ color: 'var(--binance-yellow)' }}
            >
              ℹ️ {t('information', language)}
            </div>
            <div
              className="text-xs space-y-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <div>{t('signalSourceInfo1', language)}</div>
              <div>{t('signalSourceInfo2', language)}</div>
              <div>{t('signalSourceInfo3', language)}</div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <UiButton
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded text-sm font-semibold"
              style={{
                background: 'var(--panel-border)',
                color: 'var(--text-secondary)',
              }}
            >
              {t('cancel', language)}
            </UiButton>
            <UiButton
              type="submit"
              className="flex-1 px-4 py-2 rounded text-sm font-semibold"
              style={{ background: 'var(--binance-yellow)', color: '#000' }}
            >
              {t('save', language)}
            </UiButton>
          </div>
        </UiForm>
      </div>
    </UiDialog>
  )
}

// Model Configuration Modal Component
function ModelConfigModal({
  allModels,
  configuredModels,
  editingModelId,
  onSave,
  onDelete,
  onClose,
  language,
}: {
  allModels: AIModel[]
  configuredModels: AIModel[]
  editingModelId: string | null
  onSave: (
    modelId: string,
    apiKey: string,
    baseUrl?: string,
    modelName?: string
  ) => void
  onDelete: (modelId: string) => void
  onClose: () => void
  language: Language
}) {
  const [selectedModelId, setSelectedModelId] = useState(editingModelId || '')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelName, setModelName] = useState('')

  // 获取当前编辑的模型信息 - 编辑时从已配置的模型中查找，新建时从所有支持的模型中查找
  const selectedModel = editingModelId
    ? configuredModels?.find((m) => m.id === selectedModelId)
    : allModels?.find((m) => m.id === selectedModelId)

  const requiresCustom =
    !!selectedModel && !['deepseek', 'qwen'].includes(selectedModel.provider)
  useEffect(() => {
    if (editingModelId) return
    const urls: Record<string, string> = {
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
      kimi: 'https://api.moonshot.ai/v1',
      siliconflow: 'https://api.siliconflow.cn/v1',
      openrouter: 'https://openrouter.ai/api/v1',
    }
    setBaseUrl(urls[selectedModel?.provider || ''] || '')
    setModelName('')
    setApiKey('')
  }, [selectedModelId, editingModelId])

  // 如果是编辑现有模型，初始化API Key、Base URL和Model Name
  useEffect(() => {
    if (editingModelId && selectedModel) {
      setApiKey(selectedModel.apiKey || '')
      setBaseUrl(selectedModel.customApiUrl || '')
      setModelName(selectedModel.customModelName || '')
    }
  }, [editingModelId, selectedModel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !selectedModelId ||
      !apiKey.trim() ||
      (requiresCustom && (!baseUrl.trim() || !modelName.trim()))
    )
      return

    onSave(
      selectedModelId,
      apiKey.trim(),
      baseUrl.trim() || undefined,
      modelName.trim() || undefined
    )
  }

  // 可选择的模型列表（所有支持的模型）
  const availableModels = allModels || []

  return (
    <UiDialog onClose={onClose} width={600}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-xl font-bold"
            style={{ color: 'var(--foreground)' }}
          >
            {editingModelId
              ? t('editAIModel', language)
              : t('addAIModel', language)}
          </h3>
          {editingModelId && (
            <UiButton
              type="button"
              onClick={() => onDelete(editingModelId)}
              className="p-2 rounded hover:bg-red-100 transition-colors"
              style={{
                background: 'rgba(246, 70, 93, 0.1)',
                color: 'var(--binance-red)',
              }}
              title={t('delete', language)}
            >
              <Trash2 className="w-4 h-4" />
            </UiButton>
          )}
        </div>

        <UiForm onSubmit={handleSubmit} className="space-y-4">
          {!editingModelId && (
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                {t('selectModel', language)}
              </label>
              <UiSelect
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-2 rounded"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--panel-border)',
                  color: 'var(--foreground)',
                }}
                required
              >
                <option value="">{t('pleaseSelectModel', language)}</option>
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {getShortName(model.name)} ({model.provider})
                  </option>
                ))}
              </UiSelect>
            </div>
          )}

          {selectedModel && (
            <div
              className="p-4 rounded"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--panel-border)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  {getModelIcon(selectedModel.provider || selectedModel.id, {
                    width: 32,
                    height: 32,
                  }) || (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{
                        background:
                          selectedModel.id === 'deepseek'
                            ? '#60a5fa'
                            : '#c084fc',
                        color: '#fff',
                      }}
                    >
                      {selectedModel.name[0]}
                    </div>
                  )}
                </div>
                <div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {getShortName(selectedModel.name)}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {selectedModel.provider} • {selectedModel.id}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedModel && (
            <>
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  API Key
                </label>
                <UiInput
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('enterAPIKey', language)}
                  className="w-full px-3 py-2 rounded"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--panel-border)',
                    color: 'var(--foreground)',
                  }}
                  required
                />
              </div>

              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  {requiresCustom
                    ? uiText('API 地址（必填）', language)
                    : t('customBaseURL', language)}
                </label>
                <UiInput
                  type="url"
                  value={baseUrl}
                  required={requiresCustom}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={t('customBaseURLPlaceholder', language)}
                  className="w-full px-3 py-2 rounded"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--panel-border)',
                    color: 'var(--foreground)',
                  }}
                />
                <div
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {requiresCustom
                    ? uiText(
                        '使用兼容 Chat Completions 的接口，默认追加 /chat/completions；地区地址可自行修改。',
                        language
                      )
                    : t('leaveBlankForDefault', language)}
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  {requiresCustom
                    ? uiText('模型 ID（必填）', language)
                    : uiText('模型 ID（可选）', language)}
                </label>
                <UiInput
                  type="text"
                  value={modelName}
                  required={requiresCustom}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={uiText(
                    '例如: deepseek-chat, qwen3-max, gpt-5',
                    language
                  )}
                  className="w-full px-3 py-2 rounded"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--panel-border)',
                    color: 'var(--foreground)',
                  }}
                />
                <div
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {requiresCustom
                    ? uiText(
                        '填写服务商提供的完整模型 ID；OpenRouter 通常为 服务商/模型名。仅支持文本对话模型。',
                        language
                      )
                    : uiText('留空使用默认模型名称', language)}
                </div>
              </div>

              <div
                className="p-4 rounded"
                style={{
                  background: 'rgba(52, 211, 153, 0.1)',
                  border: '1px solid rgba(52, 211, 153, 0.2)',
                }}
              >
                <div
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--binance-yellow)' }}
                >
                  ℹ️ {t('information', language)}
                </div>
                <div
                  className="text-xs space-y-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div>{t('modelConfigInfo1', language)}</div>
                  <div>{t('modelConfigInfo2', language)}</div>
                  <div>{t('modelConfigInfo3', language)}</div>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 mt-6">
            <UiButton
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded text-sm font-semibold"
              style={{
                background: 'var(--panel-border)',
                color: 'var(--text-secondary)',
              }}
            >
              {t('cancel', language)}
            </UiButton>
            <UiButton
              type="submit"
              disabled={
                !selectedModel ||
                !apiKey.trim() ||
                (requiresCustom && (!baseUrl.trim() || !modelName.trim()))
              }
              className="flex-1 px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--binance-yellow)', color: '#000' }}
            >
              {t('saveConfig', language)}
            </UiButton>
          </div>
        </UiForm>
      </div>
    </UiDialog>
  )
}

// Exchange Configuration Modal Component
export function ExchangeConfigModal({
  allExchanges,
  editingExchangeId,
  onSave,
  onDelete,
  onClose,
  language,
}: {
  allExchanges: Exchange[]
  editingExchangeId: string | null
  onSave: (
    exchangeId: string,
    apiKey: string,
    secretKey?: string,
    testnet?: boolean,
    hyperliquidWalletAddr?: string,
    asterUser?: string,
    asterSigner?: string,
    asterPrivateKey?: string
  ) => Promise<void>
  onDelete: (exchangeId: string) => void
  onClose: () => void
  language: Language
}) {
  const [selectedExchangeId, setSelectedExchangeId] = useState(
    editingExchangeId || ''
  )
  const [credentialsLoading, setCredentialsLoading] = useState(!!editingExchangeId)
  const [credentialsError, setCredentialsError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [testnet, setTestnet] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [serverIP, setServerIP] = useState<{
    public_ip: string
    message: string
  } | null>(null)
  const [loadingIP, setLoadingIP] = useState(false)
  const [copiedIP, setCopiedIP] = useState(false)

  // Aster 特定字段
  const [asterUser, setAsterUser] = useState('')
  const [asterSigner, setAsterSigner] = useState('')
  const [asterPrivateKey, setAsterPrivateKey] = useState('')

  // Hyperliquid 特定字段
  const [hyperliquidWalletAddr, setHyperliquidWalletAddr] = useState('')

  // 安全输入状态
  const [secureInputTarget, setSecureInputTarget] = useState<
    null | 'hyperliquid' | 'aster'
  >(null)

  // 获取当前编辑的交易所信息
  const selectedExchange = allExchanges?.find(
    (e) => e.id === selectedExchangeId
  )

  // Fetch the owner's saved credentials once per edit, not the public catalog.
  useEffect(() => {
    if (!editingExchangeId) return
    let cancelled = false
    setCredentialsLoading(true)
    setCredentialsError('')
    api.getExchangeCredentials(editingExchangeId).then((saved) => {
      if (cancelled) return
      setApiKey(saved.apiKey || '')
      setSecretKey(saved.secretKey || '')
      setTestnet(saved.testnet || false)
      setHyperliquidWalletAddr(saved.hyperliquidWalletAddr || '')
      setAsterUser(saved.asterUser || '')
      setAsterSigner(saved.asterSigner || '')
    }).catch(() => {
      if (!cancelled) setCredentialsError(language === 'zh'
        ? '已保存的凭证加载失败，请关闭弹窗后重试；当前空白不代表原配置为空。'
        : 'Saved credentials could not be loaded. Close this dialog and try again; empty fields do not mean the saved configuration is empty.')
    }).finally(() => { if (!cancelled) setCredentialsLoading(false) })
    return () => { cancelled = true }
  }, [editingExchangeId])

  // 加载服务器IP（当选择binance时）
  useEffect(() => {
    if (selectedExchangeId === 'binance' && !serverIP) {
      setLoadingIP(true)
      api
        .getServerIP()
        .then((data) => {
          setServerIP(data)
        })
        .catch((err) => {
          console.error('Failed to load server IP:', err)
        })
        .finally(() => {
          setLoadingIP(false)
        })
    }
  }, [selectedExchangeId])

  const handleCopyIP = (ip: string) => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopiedIP(true)
      setTimeout(() => setCopiedIP(false), 2000)
    })
  }

  // 安全输入处理函数
  const secureInputContextLabel =
    secureInputTarget === 'aster'
      ? t('asterExchangeName', language)
      : secureInputTarget === 'hyperliquid'
        ? t('hyperliquidExchangeName', language)
        : undefined

  const handleSecureInputCancel = () => {
    setSecureInputTarget(null)
  }

  const handleSecureInputComplete = ({
    value,
    obfuscationLog,
  }: TwoStageKeyModalResult) => {
    const trimmed = value.trim()
    if (secureInputTarget === 'hyperliquid') {
      setApiKey(trimmed)
    }
    if (secureInputTarget === 'aster') {
      setAsterPrivateKey(trimmed)
    }
    console.log('Secure input obfuscation log:', obfuscationLog)
    setSecureInputTarget(null)
  }

  // 掩盖敏感数据显示
  const maskSecret = (secret: string) => {
    if (!secret || secret.length === 0) return ''
    if (secret.length <= 8) return '*'.repeat(secret.length)
    return (
      secret.slice(0, 4) +
      '*'.repeat(Math.max(secret.length - 8, 4)) +
      secret.slice(-4)
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (credentialsLoading || credentialsError) return
    if (!selectedExchangeId) return

    // 根据交易所类型验证不同字段
    if (selectedExchange?.id === 'binance') {
      if (!apiKey.trim() || !secretKey.trim()) return
      await onSave(selectedExchangeId, apiKey.trim(), secretKey.trim(), testnet)
    } else if (selectedExchange?.id === 'hyperliquid') {
      if (!apiKey.trim() || !hyperliquidWalletAddr.trim()) return // 验证私钥和钱包地址
      await onSave(
        selectedExchangeId,
        apiKey.trim(),
        '',
        testnet,
        hyperliquidWalletAddr.trim()
      )
    } else if (selectedExchange?.id === 'aster') {
      if (!asterUser.trim() || !asterSigner.trim() || !asterPrivateKey.trim())
        return
      await onSave(
        selectedExchangeId,
        '',
        '',
        testnet,
        undefined,
        asterUser.trim(),
        asterSigner.trim(),
        asterPrivateKey.trim()
      )
    } else if (selectedExchange?.id === 'okx') {
      if (!apiKey.trim() || !secretKey.trim() || !passphrase.trim()) return
      await onSave(selectedExchangeId, apiKey.trim(), secretKey.trim(), testnet)
    } else {
      // 默认情况（其他CEX交易所）
      if (!apiKey.trim() || !secretKey.trim()) return
      await onSave(selectedExchangeId, apiKey.trim(), secretKey.trim(), testnet)
    }
  }

  const standardCredentials = !!selectedExchange &&
    (selectedExchange.id === 'binance' || selectedExchange.type === 'cex') &&
    selectedExchange.id !== 'hyperliquid' && selectedExchange.id !== 'aster'

  // 可选择的交易所列表（所有支持的交易所）
  const availableExchanges = allExchanges || []

  return (
    <UiDialog onClose={onClose} width={standardCredentials ? 920 : 720} className="exchange-config-dialog" title={editingExchangeId ? t('editExchange', language) : t('addExchange', language)}>
      <div>
        <div className="exchange-config-toolbar">
          <p className="exchange-config-intro">{language === 'zh' ? '管理账户连接、API 凭证与运行环境' : 'Manage your account connection, API credentials and environment'}</p>
          <div className="flex items-center gap-2">
            {selectedExchange?.id === 'binance' && (
              <UiButton
                type="button"
                onClick={() => setShowGuide(true)}
                className="px-3 py-2 rounded text-sm font-semibold transition-all  flex items-center gap-2"
                style={{
                  background: 'rgba(52, 211, 153, 0.1)',
                  color: 'var(--binance-yellow)',
                }}
              >
                <BookOpen className="w-4 h-4" />
                {t('viewGuide', language)}
              </UiButton>
            )}
            {editingExchangeId && (
              <UiButton
                type="button"
                onClick={() => onDelete(editingExchangeId)}
                className="p-2 rounded hover:bg-red-100 transition-colors"
                style={{
                  background: 'rgba(246, 70, 93, 0.1)',
                  color: 'var(--binance-red)',
                }}
                title={t('delete', language)}
              >
                <Trash2 className="w-4 h-4" />
              </UiButton>
            )}
          </div>
        </div>

        <UiForm onSubmit={handleSubmit} className="exchange-config-form">
          <div className="exchange-config-scroll">
          {credentialsLoading && <AntAlert type="info" showIcon title={language === 'zh' ? '正在加载已保存的账户配置…' : 'Loading saved account configuration…'} />}
          {credentialsError && <AntAlert type="error" showIcon title={credentialsError} />}
          {!editingExchangeId && (
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                {t('selectExchange', language)}
              </label>
              <UiSelect
                value={selectedExchangeId}
                onChange={(e) => setSelectedExchangeId(e.target.value)}
                className="w-full px-3 py-2 rounded"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--panel-border)',
                  color: 'var(--foreground)',
                }}
                required
              >
                <option value="">{t('pleaseSelectExchange', language)}</option>
                {availableExchanges.map((exchange) => (
                  <option key={exchange.id} value={exchange.id}>
                    {getShortName(exchange.name)} ({exchange.type.toUpperCase()}
                    )
                  </option>
                ))}
              </UiSelect>
            </div>
          )}

          {selectedExchange && (
            <div
              className="exchange-config-account"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 flex items-center justify-center">
                  {getExchangeIcon(selectedExchange.id, {
                    width: 32,
                    height: 32,
                  })}
                </div>
                <div>
                  <div
                    className="font-semibold"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {getShortName(selectedExchange.name)}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {selectedExchange.type.toUpperCase()} •{' '}
                    {selectedExchange.id}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedExchange && (
            <>
              {/* Binance 和其他 CEX 交易所的字段 */}
              {standardCredentials && (
                <div className="exchange-config-grid">
                  <section className="exchange-config-credentials" aria-label={language === 'zh' ? 'API 访问凭证' : 'API credentials'}>
                    <div className="exchange-config-section-heading">
                      <h4>{language === 'zh' ? '访问凭证' : 'API credentials'}</h4>
                      <span>{language === 'zh' ? '明文显示' : 'Visible'}</span>
                    </div>
                    <div className="exchange-config-field">
                      <label htmlFor="exchange-api-key">API Key</label>
                      <UiInput id="exchange-api-key" disabled={credentialsLoading || !!credentialsError} type="text" value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={t('enterAPIKey', language)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
                    </div>
                    <div className="exchange-config-field">
                      <label htmlFor="exchange-secret-key">Secret Key</label>
                      <UiInput id="exchange-secret-key" disabled={credentialsLoading || !!credentialsError} type="text" value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        placeholder={t('enterSecretKey', language)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
                    </div>
                    {selectedExchange.id === 'okx' && <div className="exchange-config-field">
                      <label htmlFor="exchange-passphrase">{t('passphrase', language)}</label>
                      <UiInput id="exchange-passphrase" disabled={credentialsLoading || !!credentialsError} type="text" value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder={t('enterPassphrase', language)} autoComplete="off" spellCheck={false} required />
                    </div>}
                    <div className="exchange-config-mode">
                      <h4>{language === 'zh' ? '运行环境' : 'Environment'}</h4>
              <div className="exchange-config-environment">
                <UiCheckLabel className="flex items-center gap-2 text-sm">
                  <UiInput
                    type="checkbox"
                    checked={testnet}
                    onChange={(e) => setTestnet(e.target.checked)}
                    className="form-checkbox rounded"
                    style={{ accentColor: 'var(--binance-yellow)' }}
                  />
                  <span style={{ color: 'var(--foreground)' }}>
                    {t('useTestnet', language)}
                  </span>
                </UiCheckLabel>
                <div
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('testnetDescription', language)}
                </div>
              </div>

                    </div>
                  </section>
                  <aside className="exchange-config-sidebar" aria-label={language === 'zh' ? '连接说明' : 'Connection details'}>
                    {selectedExchange.id === 'binance' && <div className="exchange-config-whitelist">
                      <h4>{t('whitelistIP', language)}</h4>
                      <p>{language === 'zh' ? '将此出口 IP 添加到币安 API 白名单。' : 'Add this outbound IP to your Binance API allowlist.'}</p>
                      {loadingIP ? <span>{t('loadingServerIP', language)}</span> : serverIP?.public_ip ? <div className="exchange-config-ip-row">
                        <code>{serverIP.public_ip}</code>
                        <UiButton type="button" onClick={() => handleCopyIP(serverIP.public_ip)}>
                          {copiedIP ? t('ipCopied', language) : t('copyIP', language)}
                        </UiButton>
                      </div> : <span>{language === 'zh' ? '暂未获取到出口 IP，可稍后查看' : 'Outbound IP unavailable. Try again later.'}</span>}
                    </div>}
                    <div className="exchange-config-permissions">
                      <h4>{language === 'zh' ? '权限说明' : 'API permissions'}</h4>
                      <ul>
                        <li>{t('exchangeConfigWarning1', language).replace(/^[•·]\s*/, '')}</li>
                        <li>{t('exchangeConfigWarning2', language).replace(/^[•·]\s*/, '')}</li>
                        <li>{t('exchangeConfigWarning3', language).replace(/^[•·]\s*/, '')}</li>
                      </ul>
                    </div>
                  </aside>
                </div>
              )}

              {/* Hyperliquid 交易所的字段 */}
              {selectedExchange.id === 'hyperliquid' && (
                <>
                  {/* 安全提示 banner */}
                  <div
                    className="p-3 rounded mb-4"
                    style={{
                      background: 'rgba(52, 211, 153, 0.1)',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        style={{
                          color: 'var(--binance-yellow)',
                          fontSize: '16px',
                        }}
                      >
                        🔐
                      </span>
                      <div className="flex-1">
                        <div
                          className="text-sm font-semibold mb-1"
                          style={{ color: 'var(--binance-yellow)' }}
                        >
                          {t('hyperliquidAgentWalletTitle', language)}
                        </div>
                        <div
                          className="text-xs"
                          style={{
                            color: 'var(--text-secondary)',
                            lineHeight: '1.5',
                          }}
                        >
                          {t('hyperliquidAgentWalletDesc', language)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Agent Private Key 字段 */}
                  <div>
                    <label
                      className="block text-sm font-semibold mb-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {t('hyperliquidAgentPrivateKey', language)}
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <UiInput
                          type="text"
                          value={maskSecret(apiKey)}
                          readOnly
                          placeholder={t(
                            'enterHyperliquidAgentPrivateKey',
                            language
                          )}
                          className="w-full px-3 py-2 rounded"
                          style={{
                            background: 'var(--background)',
                            border: '1px solid var(--panel-border)',
                            color: 'var(--foreground)',
                          }}
                        />
                        <UiButton
                          type="button"
                          onClick={() => setSecureInputTarget('hyperliquid')}
                          className="px-3 py-2 rounded text-xs font-semibold transition-all "
                          style={{
                            background: 'var(--binance-yellow)',
                            color: '#000',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {apiKey
                            ? t('secureInputReenter', language)
                            : t('secureInputButton', language)}
                        </UiButton>
                        {apiKey && (
                          <UiButton
                            type="button"
                            onClick={() => setApiKey('')}
                            className="px-3 py-2 rounded text-xs font-semibold transition-all "
                            style={{
                              background: '#1B1F2B',
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t('secureInputClear', language)}
                          </UiButton>
                        )}
                      </div>
                      {apiKey && (
                        <div
                          className="text-xs"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {t('secureInputHint', language)}
                        </div>
                      )}
                    </div>
                    <div
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('hyperliquidAgentPrivateKeyDesc', language)}
                    </div>
                  </div>

                  {/* Main Wallet Address 字段 */}
                  <div>
                    <label
                      className="block text-sm font-semibold mb-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {t('hyperliquidMainWalletAddress', language)}
                    </label>
                    <UiInput
                      type="text"
                      value={hyperliquidWalletAddr}
                      onChange={(e) => setHyperliquidWalletAddr(e.target.value)}
                      placeholder={t(
                        'enterHyperliquidMainWalletAddress',
                        language
                      )}
                      className="w-full px-3 py-2 rounded"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      required
                    />
                    <div
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('hyperliquidMainWalletAddressDesc', language)}
                    </div>
                  </div>
                </>
              )}

              {/* Aster 交易所的字段 */}
              {selectedExchange.id === 'aster' && (
                <>
                  <div>
                    <label
                      className="block text-sm font-semibold mb-2 flex items-center gap-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {t('user', language)}
                      <Tooltip content={t('asterUserDesc', language)}>
                        <HelpCircle
                          className="w-4 h-4 cursor-help"
                          style={{ color: 'var(--binance-yellow)' }}
                        />
                      </Tooltip>
                    </label>
                    <UiInput
                      type="text"
                      value={asterUser}
                      onChange={(e) => setAsterUser(e.target.value)}
                      placeholder={t('enterUser', language)}
                      className="w-full px-3 py-2 rounded"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label
                      className="block text-sm font-semibold mb-2 flex items-center gap-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {t('signer', language)}
                      <Tooltip content={t('asterSignerDesc', language)}>
                        <HelpCircle
                          className="w-4 h-4 cursor-help"
                          style={{ color: 'var(--binance-yellow)' }}
                        />
                      </Tooltip>
                    </label>
                    <UiInput
                      type="text"
                      value={asterSigner}
                      onChange={(e) => setAsterSigner(e.target.value)}
                      placeholder={t('enterSigner', language)}
                      className="w-full px-3 py-2 rounded"
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--panel-border)',
                        color: 'var(--foreground)',
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label
                      className="block text-sm font-semibold mb-2 flex items-center gap-2"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {t('privateKey', language)}
                      <Tooltip content={t('asterPrivateKeyDesc', language)}>
                        <HelpCircle
                          className="w-4 h-4 cursor-help"
                          style={{ color: 'var(--binance-yellow)' }}
                        />
                      </Tooltip>
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <UiInput
                          type="text"
                          value={maskSecret(asterPrivateKey)}
                          readOnly
                          placeholder={t('enterPrivateKey', language)}
                          className="w-full px-3 py-2 rounded"
                          style={{
                            background: 'var(--background)',
                            border: '1px solid var(--panel-border)',
                            color: 'var(--foreground)',
                          }}
                        />
                        <UiButton
                          type="button"
                          onClick={() => setSecureInputTarget('aster')}
                          className="px-3 py-2 rounded text-xs font-semibold transition-all "
                          style={{
                            background: 'var(--binance-yellow)',
                            color: '#000',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {asterPrivateKey
                            ? t('secureInputReenter', language)
                            : t('secureInputButton', language)}
                        </UiButton>
                        {asterPrivateKey && (
                          <UiButton
                            type="button"
                            onClick={() => setAsterPrivateKey('')}
                            className="px-3 py-2 rounded text-xs font-semibold transition-all "
                            style={{
                              background: '#1B1F2B',
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t('secureInputClear', language)}
                          </UiButton>
                        )}
                      </div>
                      {asterPrivateKey && (
                        <div
                          className="text-xs"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {t('secureInputHint', language)}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!standardCredentials && <>
              <div className="exchange-config-environment">
                <UiCheckLabel className="flex items-center gap-2 text-sm">
                  <UiInput
                    type="checkbox"
                    checked={testnet}
                    onChange={(e) => setTestnet(e.target.checked)}
                    className="form-checkbox rounded"
                    style={{ accentColor: 'var(--binance-yellow)' }}
                  />
                  <span style={{ color: 'var(--foreground)' }}>
                    {t('useTestnet', language)}
                  </span>
                </UiCheckLabel>
                <div
                  className="text-xs mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('testnetDescription', language)}
                </div>
              </div>

              <div
                className="exchange-config-permissions"
                style={{
                  background: 'rgba(52, 211, 153, 0.1)',
                  border: '1px solid rgba(52, 211, 153, 0.2)',
                }}
              >
                <div
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--binance-yellow)' }}
                >
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />{' '}
                    {t('securityWarning', language)}
                  </span>
                </div>
                <div
                  className="text-xs space-y-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {selectedExchange.id === 'aster' && (
                    <div>{t('asterUsdtWarning', language)}</div>
                  )}
                  <div>{t('exchangeConfigWarning1', language)}</div>
                  <div>{t('exchangeConfigWarning2', language)}</div>
                  <div>{t('exchangeConfigWarning3', language)}</div>
                </div>
              </div>
              </>}
            </>
          )}

           </div>
          <div className="exchange-config-footer">
            <UiButton
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded text-sm font-semibold"
              style={{
                background: 'var(--panel-border)',
                color: 'var(--text-secondary)',
              }}
            >
              {t('cancel', language)}
            </UiButton>
            <UiButton
              type="submit"
              disabled={
                credentialsLoading || !!credentialsError || !selectedExchange ||
                (selectedExchange.id === 'binance' &&
                  (!apiKey.trim() || !secretKey.trim())) ||
                (selectedExchange.id === 'okx' &&
                  (!apiKey.trim() ||
                    !secretKey.trim() ||
                    !passphrase.trim())) ||
                (selectedExchange.id === 'hyperliquid' &&
                  (!apiKey.trim() || !hyperliquidWalletAddr.trim())) || // 验证私钥和钱包地址
                (selectedExchange.id === 'aster' &&
                  (!asterUser.trim() ||
                    !asterSigner.trim() ||
                    !asterPrivateKey.trim())) ||
                (selectedExchange.type === 'cex' &&
                  selectedExchange.id !== 'hyperliquid' &&
                  selectedExchange.id !== 'aster' &&
                  selectedExchange.id !== 'binance' &&
                  selectedExchange.id !== 'okx' &&
                  (!apiKey.trim() || !secretKey.trim()))
              }
              className="flex-1 px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--binance-yellow)', color: '#000' }}
            >
              {t('saveConfig', language)}
            </UiButton>
          </div>
        </UiForm>
      </div>

      {/* Binance Setup Guide Modal */}
      {showGuide && (
        <UiDialog onClose={() => setShowGuide(false)} width={880}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-xl font-bold flex items-center gap-2"
                style={{ color: 'var(--foreground)' }}
              >
                <BookOpen
                  className="w-6 h-6"
                  style={{ color: 'var(--binance-yellow)' }}
                />
                {t('binanceSetupGuide', language)}
              </h3>
              <UiButton
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 rounded text-sm font-semibold transition-all "
                style={{
                  background: 'var(--panel-border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('closeGuide', language)}
              </UiButton>
            </div>
            <div className="overflow-y-auto max-h-[80vh]">
              <ol className="list-decimal pl-6 space-y-4 text-gray-300 leading-7">
                <li>
                  {uiText(
                    '在交易所确认合约账户已开通，并根据策略要求设置持仓模式和保证金模式。',
                    language
                  )}{' '}
                </li>
                <li>
                  {uiText(
                    '在交易所账户的 API 管理中创建专用密钥，仅启用所需的读取与合约交易权限，保持提现权限关闭。',
                    language
                  )}{' '}
                </li>
                <li>
                  {uiText(
                    '根据交易所要求设置服务器出口 IP 白名单，并将 API 密钥和密钥密码填入此工作台。',
                    language
                  )}{' '}
                </li>
                <li>
                  {uiText(
                    '保存后检查连接、余额与仓位配置。确认参数后，再自主决定是否启动交易员。',
                    language
                  )}{' '}
                </li>
              </ol>
            </div>
          </div>
        </UiDialog>
      )}

      {/* Two Stage Key Modal */}
      <TwoStageKeyModal
        isOpen={secureInputTarget !== null}
        language={language}
        contextLabel={secureInputContextLabel}
        expectedLength={64}
        onCancel={handleSecureInputCancel}
        onComplete={handleSecureInputComplete}
      />
    </UiDialog>
  )
}
