import { useMemo, useState } from 'react'
import { CheckOutlined, DownOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons'
import { Popover, Switch } from 'antd'
import type { PopoverProps } from 'antd'
import type { AgentModelOption } from '../types'
import {
  getAutoModelEnabled,
  listAgentModelOptions,
  pickDefaultAgentModelId,
  setAutoModelEnabled,
  setSelectedAgentModelId,
} from '../lib/agentModelApi'

interface ChatModelSelectorProps {
  models: AgentModelOption[]
  selectedModelId: string
  autoModel: boolean
  disabled?: boolean
  loading?: boolean
  getPopupContainer?: PopoverProps['getPopupContainer']
  onModelsChange?: (models: AgentModelOption[]) => void
  onSelectedModelIdChange: (modelId: string) => void
  onAutoModelChange: (enabled: boolean) => void
}

export function ChatModelSelector({
  models,
  selectedModelId,
  autoModel,
  disabled = false,
  loading = false,
  getPopupContainer,
  onModelsChange,
  onSelectedModelIdChange,
  onAutoModelChange,
}: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const activeModel = useMemo(
    () => models.find((item) => item.id === selectedModelId) || models.find((item) => item.isDefault) || models[0],
    [models, selectedModelId],
  )

  const triggerLabel = autoModel ? '自动' : activeModel?.name || '选择模型'

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const items = await listAgentModelOptions()
      onModelsChange?.(items)
      const nextId = pickDefaultAgentModelId(items)
      if (!selectedModelId || !items.some((item) => item.id === selectedModelId)) {
        onSelectedModelIdChange(nextId)
        setSelectedAgentModelId(nextId)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleSelectModel = (modelId: string) => {
    onAutoModelChange(false)
    setAutoModelEnabled(false)
    onSelectedModelIdChange(modelId)
    setSelectedAgentModelId(modelId)
    setOpen(false)
  }

  const handleAutoChange = (checked: boolean) => {
    onAutoModelChange(checked)
    setAutoModelEnabled(checked)
    if (checked) {
      setOpen(false)
    }
  }

  const popoverContent = (
    <div className="chat-model-selector-panel">
      <div className="chat-model-selector-panel-head">
        <button
          type="button"
          className="chat-model-selector-refresh"
          aria-label="刷新模型列表"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          <ReloadOutlined spin={refreshing} />
        </button>
        <label className="chat-model-selector-auto">
          <span>自动</span>
          <Switch size="small" checked={autoModel} onChange={handleAutoChange} />
        </label>
      </div>

      <div className="chat-model-selector-list" role="listbox" aria-label="模型列表">
        {models.length === 0 ? (
          <div className="chat-model-selector-empty">暂无可用模型</div>
        ) : (
          models.map((item) => {
            const selected = !autoModel && item.id === selectedModelId
            const showModelId = item.model.trim() !== item.name.trim()
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`chat-model-selector-item${selected ? ' is-selected' : ''}`}
                title={showModelId ? item.model : item.name}
                onClick={() => handleSelectModel(item.id)}
              >
                <span className="chat-model-selector-item-copy">
                  <strong>{item.name}</strong>
                  {showModelId ? <span>{item.model}</span> : null}
                </span>
                <span className={`chat-model-selector-item-check${selected ? ' is-visible' : ''}`} aria-hidden="true">
                  <CheckOutlined />
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      trigger="click"
      placement="topLeft"
      arrow={false}
      overlayClassName="chat-model-selector-popover"
      content={popoverContent}
      getPopupContainer={getPopupContainer}
      zIndex={1001}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen)
        }
      }}
    >
      <button
        type="button"
        className={`chat-model-selector-trigger${open ? ' is-open' : ''}`}
        disabled={disabled || loading || models.length === 0}
      >
        <RobotOutlined />
        <span className="chat-model-selector-trigger-label">{triggerLabel}</span>
        <DownOutlined className={`chat-model-selector-trigger-caret${open ? ' is-open' : ''}`} />
      </button>
    </Popover>
  )
}

export function readAutoModelEnabled(): boolean {
  return getAutoModelEnabled()
}
