import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  createAgentModel,
  deleteAgentModel,
  disableAgentModel,
  enableAgentModel,
  listAgentModels,
  updateAgentModel,
} from '../../lib/systemApi'
import type { AgentModel } from '../../types'
import { AGENT_MODEL_STATUS_DISABLED, AGENT_MODEL_STATUS_ENABLED } from '../../types'
import { useNavMenus } from '../../contexts/NavMenuContext'

const MASKED_AUTH_TOKEN = '******'

type AgentModelFormValues = {
  name: string
  model: string
  baseUrl: string
  authToken?: string
  thinkMode: string
  thinkBudgetTokens: number
  thinkDisplay: string
  maxThinkingTokens: number
  status: number
  isDefault: boolean
  sort: number
  remark?: string
}

export function AgentModelManagementWorkspace() {
  const { message, modal } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<AgentModelFormValues>()
  const [models, setModels] = useState<AgentModel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<AgentModel | null>(null)
  const canCreate = hasPageButton('func-operation', 'agent-models', 'create')
  const canUpdate = hasPageButton('func-operation', 'agent-models', 'update')
  const canStatus = hasPageButton('func-operation', 'agent-models', 'status')
  const canDelete = hasPageButton('func-operation', 'agent-models', 'delete')

  const loadModels = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listAgentModels()
      setModels(items)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载模型配置失败')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  const openCreateModal = () => {
    setEditingModel(null)
    form.setFieldsValue({
      name: '',
      model: '',
      baseUrl: '',
      authToken: '',
      thinkMode: 'adaptive',
      thinkBudgetTokens: 4096,
      thinkDisplay: 'summarized',
      maxThinkingTokens: 0,
      status: AGENT_MODEL_STATUS_ENABLED,
      isDefault: false,
      sort: 0,
      remark: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (item: AgentModel) => {
    setEditingModel(item)
    form.setFieldsValue({
      name: item.name,
      model: item.model,
      baseUrl: item.baseUrl,
      authToken: item.authToken ? MASKED_AUTH_TOKEN : '',
      thinkMode: item.thinkConfig.mode || 'adaptive',
      thinkBudgetTokens: item.thinkConfig.budgetTokens || 4096,
      thinkDisplay: item.thinkConfig.display || 'summarized',
      maxThinkingTokens: item.thinkConfig.maxThinkingTokens || 0,
      status: item.status,
      isDefault: item.isDefault,
      sort: item.sort,
      remark: item.remark,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        name: values.name,
        model: values.model,
        baseUrl: values.baseUrl,
        authToken: values.authToken === MASKED_AUTH_TOKEN ? undefined : values.authToken,
        thinkConfig: {
          mode: values.thinkMode,
          budgetTokens: values.thinkBudgetTokens,
          display: values.thinkDisplay,
          maxThinkingTokens: values.maxThinkingTokens,
        },
        status: values.status,
        isDefault: values.isDefault,
        sort: values.sort,
        remark: values.remark,
      }
      if (editingModel) {
        await updateAgentModel(editingModel.id, payload)
        message.success('模型配置已更新')
      } else {
        await createAgentModel(payload)
        message.success('模型配置已创建')
      }
      setModalOpen(false)
      await loadModels()
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (item: AgentModel) => {
    modal.confirm({
      title: '删除模型配置',
      content: `确认删除「${item.name}」？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteAgentModel(item.id)
        message.success('模型配置已删除')
        await loadModels()
      },
    })
  }

  const handleToggleStatus = async (item: AgentModel) => {
    try {
      if (item.status === AGENT_MODEL_STATUS_ENABLED) {
        await disableAgentModel(item.id)
        message.success('模型已禁用')
      } else {
        await enableAgentModel(item.id)
        message.success('模型已启用')
      }
      await loadModels()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    }
  }

  const columns: ColumnsType<AgentModel> = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '模型标识', dataIndex: 'model', key: 'model' },
    { title: 'Base URL', dataIndex: 'baseUrl', key: 'baseUrl', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status === AGENT_MODEL_STATUS_ENABLED ? 'success' : 'default'}>
          {status === AGENT_MODEL_STATUS_ENABLED ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      key: 'isDefault',
      render: (value: boolean) => (value ? <Tag color="blue">默认</Tag> : '-'),
    },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 72 },
    {
      title: '操作',
      key: 'actions',
      render: (_, item) => (
        <Space size="small">
          {canUpdate ? <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(item)}>
            编辑
          </Button> : null}
          {canStatus ? <Button
            type="link"
            icon={item.status === AGENT_MODEL_STATUS_ENABLED ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => void handleToggleStatus(item)}
          >
            {item.status === AGENT_MODEL_STATUS_ENABLED ? '禁用' : '启用'}
          </Button> : null}
          {canDelete ? <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item)}>
            删除
          </Button> : null}
        </Space>
      ),
    },
  ]

  return (
    <div className="agent-settings-workspace">
      <header className="agent-settings-header">
        <div className="agent-settings-header-copy">
          <span className="agent-settings-eyebrow">AI Agent 管理</span>
          <h2>模型配置</h2>
          <p>管理各模型的连接参数与思考配置，客户端可在对话中切换。</p>
        </div>
        <Space className="agent-settings-header-actions" wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadModels()}>
            刷新
          </Button>
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建模型
          </Button> : null}
        </Space>
      </header>

      <div className="agent-settings-card agent-settings-table-card">
        <Spin spinning={loading}>
          <Table rowKey="id" columns={columns} dataSource={models} pagination={false} />
        </Spin>
      </div>

      <Modal
        open={modalOpen}
        title={editingModel ? '编辑模型配置' : '新建模型配置'}
        okText={editingModel ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saving}
        centered
        onOk={() => void handleSubmit()}
        onCancel={() => setModalOpen(false)}
        width={760}
        destroyOnHidden
        className="agent-model-modal"
        styles={{ body: { maxHeight: 'min(72vh, 680px)', overflowY: 'auto', paddingTop: 4 } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional" className="agent-model-modal-form">
          <section className="agent-model-modal-section">
            <h4 className="agent-model-modal-section-title">连接信息</h4>
            <div className="agent-model-modal-grid agent-model-modal-grid-2">
              <Form.Item name="name" label="展示名称" rules={[{ required: true, message: '请输入展示名称' }]}>
                <Input placeholder="例如 DeepSeek V4 Flash" />
              </Form.Item>
              <Form.Item name="model" label="模型标识" rules={[{ required: true, message: '请输入模型标识' }]}>
                <Input placeholder="传给 SDK 的 model 参数" />
              </Form.Item>
            </div>
            <Form.Item name="baseUrl" label="Base URL">
              <Input placeholder="https://api.example.com/anthropic" />
            </Form.Item>
            <Form.Item name="authToken" label="Auth Token">
              <Input.Password placeholder={editingModel ? '留空表示不修改' : 'sk-...'} />
            </Form.Item>
          </section>

          <section className="agent-model-modal-section">
            <h4 className="agent-model-modal-section-title">思考配置</h4>
            <div className="agent-model-modal-grid agent-model-modal-grid-4">
              <Form.Item name="thinkMode" label="思考模式">
                <Select
                  options={[
                    { value: 'adaptive', label: 'adaptive' },
                    { value: 'enabled', label: 'enabled' },
                    { value: 'disabled', label: 'disabled' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="thinkBudgetTokens" label="思考预算">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="thinkDisplay" label="思考展示">
                <Select
                  options={[
                    { value: 'summarized', label: 'summarized' },
                    { value: 'omitted', label: 'omitted' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="maxThinkingTokens" label="最大思考 Token">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </section>

          <section className="agent-model-modal-section">
            <h4 className="agent-model-modal-section-title">发布设置</h4>
            <div className="agent-model-modal-grid agent-model-modal-grid-3">
              <Form.Item name="sort" label="排序">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Select
                  options={[
                    { value: AGENT_MODEL_STATUS_ENABLED, label: '启用' },
                    { value: AGENT_MODEL_STATUS_DISABLED, label: '禁用' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="isDefault" label="默认模型" valuePropName="checked" className="agent-model-modal-switch-item">
                <Switch />
              </Form.Item>
            </div>
            <Form.Item name="remark" label="备注" className="agent-model-modal-remark-item">
              <Input.TextArea rows={2} placeholder="可选备注" />
            </Form.Item>
          </section>
        </Form>
      </Modal>
    </div>
  )
}
