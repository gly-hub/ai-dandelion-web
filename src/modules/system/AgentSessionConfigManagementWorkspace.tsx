import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Select, Space, Spin, Tabs, Tag } from 'antd'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { listAgentModelOptions } from '../../lib/agentModelApi'
import {
  listAgentSessionConfigs,
  updateAgentSessionConfig,
} from '../../lib/systemApi'
import type { AgentModelOption, AgentSessionConfig, AgentSessionConfigType } from '../../types'

type SessionConfigFormValues = {
  systemPrompt: string
  permissionMode: string
  maxTurns: number
  modelId: string
}

const PERMISSION_MODE_OPTIONS = [
  { value: 'bypassPermissions', label: 'bypassPermissions', desc: '跳过工具权限确认，适合内部功能搭建流程。' },
  { value: 'default', label: 'default', desc: '使用 SDK 默认权限策略。' },
]

export function AgentSessionConfigManagementWorkspace() {
  const { message } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<SessionConfigFormValues>()
  const [configs, setConfigs] = useState<AgentSessionConfig[]>([])
  const [models, setModels] = useState<AgentModelOption[]>([])
  const [activeType, setActiveType] = useState<AgentSessionConfigType>('func_product')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const activeConfig = useMemo(
    () => configs.find((item) => item.sessionType === activeType) || configs[0] || null,
    [activeType, configs],
  )
  const selectedPermissionMode = Form.useWatch('permissionMode', form)
  const selectedModelId = Form.useWatch('modelId', form)
  const selectedModel = models.find((item) => item.id === selectedModelId) || null
  const canRefresh = hasPageButton('func-operation', 'agent-session-configs', 'refresh')
  const canSave = hasPageButton('func-operation', 'agent-session-configs', 'save')

  const modelOptions = useMemo(
    () => models.map((item) => ({
      value: item.id,
      label: item.isDefault ? `${item.name}（默认）` : item.name,
    })),
    [models],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [nextConfigs, nextModels] = await Promise.all([
        listAgentSessionConfigs(),
        listAgentModelOptions(),
      ])
      setConfigs(nextConfigs)
      setModels(nextModels)
      const nextActive = nextConfigs.some((item) => item.sessionType === activeType)
        ? activeType
        : nextConfigs[0]?.sessionType || 'func_product'
      setActiveType(nextActive)
      applyConfigToForm(nextConfigs.find((item) => item.sessionType === nextActive) || nextConfigs[0] || null, nextModels)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载搭建会话配置失败')
    } finally {
      setLoading(false)
    }
  }, [activeType, form, message])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleTabChange = (key: string) => {
    const sessionType = key as AgentSessionConfigType
    setActiveType(sessionType)
    applyConfigToForm(configs.find((item) => item.sessionType === sessionType) || null, models)
  }

  const handleSubmit = async () => {
    if (!activeConfig) {
      return
    }
    if (!canSave) {
      message.warning('当前角色没有保存搭建会话配置的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      const updated = await updateAgentSessionConfig(activeConfig.sessionType, {
        systemPrompt: values.systemPrompt,
        permissionMode: values.permissionMode,
        maxTurns: values.maxTurns,
        modelId: values.modelId,
        enabled: true,
      })
      setConfigs((current) => current.map((item) => (
        item.sessionType === updated.sessionType ? { ...item, ...updated } : item
      )))
      message.success(`${activeConfig.name}配置已保存`)
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="agent-settings-workspace">
      <header className="agent-settings-header">
        <div className="agent-settings-header-copy">
          <span className="agent-settings-eyebrow">AI Agent 管理</span>
          <h2>搭建会话配置</h2>
          <p>按功能搭建的会话类型配置提示词、权限、最大轮次和固定模型。配置后编辑器会自动使用对应模型，不再由用户临时选择。</p>
        </div>
        <Space className="agent-settings-header-actions" wrap>
          {canRefresh ? (
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
              刷新
            </Button>
          ) : null}
          {canSave ? (
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSubmit()}>
              保存配置
            </Button>
          ) : null}
        </Space>
      </header>

      <Spin spinning={loading}>
        <div className="agent-settings-body agent-session-settings-body">
          <section className="agent-settings-card">
            <Tabs
              activeKey={activeType}
              onChange={handleTabChange}
              items={configs.map((item) => ({
                key: item.sessionType,
                label: item.name,
              }))}
            />

            <Form form={form} layout="vertical" requiredMark="optional" className="agent-settings-form">
              <div className="agent-settings-section">
                <div className="agent-settings-section-head">
                  <h3>{activeConfig?.name || '会话类型'}</h3>
                  <p>{activeConfig?.description || '配置该类型会话的默认执行参数。'}</p>
                </div>
                <div className="agent-settings-field-grid agent-settings-field-grid-3">
                  <Form.Item
                    name="modelId"
                    label="固定模型"
                    rules={[{ required: true, message: '请选择模型' }]}
                  >
                    <Select
                      placeholder="选择模型配置中的已启用模型"
                      options={modelOptions}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                  <Form.Item name="permissionMode" label="权限模式">
                    <Select options={PERMISSION_MODE_OPTIONS.map(({ value, label }) => ({ value, label }))} />
                  </Form.Item>
                  <Form.Item
                    name="maxTurns"
                    label="最大轮次"
                    rules={[{ required: true, message: '请输入最大轮次' }]}
                  >
                    <InputNumber min={1} max={200} style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              </div>

              <div className="agent-settings-section">
                <div className="agent-settings-section-head">
                  <h3>系统提示词</h3>
                  <p>仅对当前会话类型生效，会覆盖全局系统配置里的通用提示词。</p>
                </div>
                <Form.Item
                  name="systemPrompt"
                  label="提示词内容"
                  rules={[{ required: true, message: '请输入系统提示词' }]}
                >
                  <Input.TextArea
                    rows={10}
                    showCount
                    maxLength={6000}
                    className="agent-settings-textarea"
                  />
                </Form.Item>
              </div>
            </Form>
          </section>

          <aside className="agent-settings-aside">
            <div className="agent-settings-aside-card">
              <h4>当前会话</h4>
              <ul className="agent-settings-tip-list">
                <li>
                  <strong>固定模型</strong>
                  <span>{selectedModel ? `${selectedModel.name} / ${selectedModel.model}` : '请先选择一个模型。'}</span>
                </li>
                <li>
                  <strong>权限模式</strong>
                  <span>
                    {PERMISSION_MODE_OPTIONS.find((item) => item.value === selectedPermissionMode)?.desc ||
                      '控制工具调用时的权限校验策略。'}
                  </span>
                </li>
                <li>
                  <strong>使用位置</strong>
                  <span>功能搭建编辑器右侧 AI 会话会按产品方案、技术方案、页面生成自动套用。</span>
                </li>
              </ul>
            </div>
            <div className="agent-settings-aside-meta">
              {activeConfig?.updatedAt ? `最近更新：${formatUpdatedAt(activeConfig.updatedAt)}` : '使用默认配置'}
            </div>
            {models.length === 0 ? (
              <Tag color="warning">请先在模型配置中添加可用模型</Tag>
            ) : null}
          </aside>
        </div>
      </Spin>
    </div>
  )

  function applyConfigToForm(config: AgentSessionConfig | null, modelItems: AgentModelOption[]) {
    const fallbackModelId = modelItems.find((item) => item.isDefault)?.id || modelItems[0]?.id || ''
    form.setFieldsValue({
      systemPrompt: config?.systemPrompt || '',
      permissionMode: config?.permissionMode || 'bypassPermissions',
      maxTurns: config?.maxTurns || 20,
      modelId: config?.modelId || fallbackModelId,
    })
  }
}

function formatUpdatedAt(value: number) {
  const ms = value > 1_000_000_000_000 ? value : value * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
