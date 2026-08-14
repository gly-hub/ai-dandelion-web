import { useCallback, useEffect, useState } from 'react'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Select, Space, Spin } from 'antd'
import { getAgentConfig, updateAgentConfig } from '../../lib/systemApi'
import { useNavMenus } from '../../contexts/NavMenuContext'

type AgentConfigFormValues = {
  systemPrompt: string
  permissionMode: string
  maxTurns: number
}

const PERMISSION_MODE_OPTIONS = [
  { value: 'bypassPermissions', label: 'bypassPermissions', desc: '跳过工具权限确认，适合内部环境' },
  { value: 'default', label: 'default', desc: '使用 SDK 默认权限策略' },
]

export function AgentConfigManagementWorkspace() {
  const { message } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<AgentConfigFormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(0)
  const permissionMode = Form.useWatch('permissionMode', form)
  const canSave = hasPageButton('func-operation', 'agent-config', 'save')

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const config = await getAgentConfig()
      form.setFieldsValue({
        systemPrompt: config.systemPrompt,
        permissionMode: config.permissionMode || 'bypassPermissions',
        maxTurns: config.maxTurns || 20,
      })
      setUpdatedAt(config.updatedAt)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载系统配置失败')
    } finally {
      setLoading(false)
    }
  }, [form, message])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSubmit = async () => {
    if (!canSave) {
      message.warning('当前角色没有保存系统配置的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      const config = await updateAgentConfig({
        systemPrompt: values.systemPrompt,
        permissionMode: values.permissionMode,
        maxTurns: values.maxTurns,
      })
      setUpdatedAt(config.updatedAt)
      message.success('系统配置已保存')
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
          <h2>系统配置</h2>
          <p>配置全局系统提示词、权限模式与最大轮次，对所有模型会话生效。</p>
        </div>
        <Space className="agent-settings-header-actions" wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadConfig()}>
            刷新
          </Button>
          {canSave ? (
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSubmit()}>
              保存配置
            </Button>
          ) : null}
        </Space>
      </header>

      <Spin spinning={loading}>
        <div className="agent-settings-body">
          <section className="agent-settings-card">
            <Form form={form} layout="vertical" requiredMark="optional" className="agent-settings-form">
              <div className="agent-settings-section">
                <div className="agent-settings-section-head">
                  <h3>系统提示词</h3>
                  <p>定义 Agent 的角色、语气与回答约束，会注入到每次对话上下文。</p>
                </div>
                <Form.Item
                  name="systemPrompt"
                  label="提示词内容"
                  rules={[{ required: true, message: '请输入系统提示词' }]}
                >
                  <Input.TextArea
                    rows={8}
                    showCount
                    maxLength={4000}
                    placeholder="例如：You are a helpful agent assistant. Keep answers clear and practical."
                    className="agent-settings-textarea"
                  />
                </Form.Item>
              </div>

              <div className="agent-settings-section">
                <div className="agent-settings-section-head">
                  <h3>运行参数</h3>
                  <p>控制 Agent 执行权限与单轮对话内的最大交互轮次。</p>
                </div>
                <div className="agent-settings-field-grid">
                  <Form.Item name="permissionMode" label="权限模式">
                    <Select
                      options={PERMISSION_MODE_OPTIONS.map((item) => ({
                        value: item.value,
                        label: item.label,
                      }))}
                    />
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
            </Form>
          </section>

          <aside className="agent-settings-aside">
            <div className="agent-settings-aside-card">
              <h4>配置说明</h4>
              <ul className="agent-settings-tip-list">
                <li>
                  <strong>系统提示词</strong>
                  <span>对所有已启用模型统一生效，不需要在每个模型里重复配置。</span>
                </li>
                <li>
                  <strong>权限模式</strong>
                  <span>
                    {PERMISSION_MODE_OPTIONS.find((item) => item.value === permissionMode)?.desc ||
                      '控制工具调用时的权限校验策略。'}
                  </span>
                </li>
                <li>
                  <strong>最大轮次</strong>
                  <span>限制单次用户提问后 Agent 与工具之间的往返次数，避免无限循环。</span>
                </li>
              </ul>
            </div>
            {updatedAt > 0 ? (
              <div className="agent-settings-aside-meta">
                最近更新：{formatUpdatedAt(updatedAt)}
              </div>
            ) : null}
          </aside>
        </div>
      </Spin>
    </div>
  )
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
