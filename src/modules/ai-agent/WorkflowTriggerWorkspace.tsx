import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  createWorkflowTrigger,
  deleteWorkflowTrigger,
  listWorkflowTriggerExecutions,
  listWorkflowTriggers,
  listWorkflows,
  setWorkflowTriggerEnabled,
  updateWorkflowTrigger,
} from '../../lib/workflowApi'
import type { WorkflowDefinition, WorkflowTrigger, WorkflowTriggerExecution } from '../../types'
import './WorkflowTriggerWorkspace.css'

type TriggerFormValues = {
  name: string
  type: 'event' | 'schedule'
  topic?: string
  eventType?: string
  key?: string
  cron?: string
  timezone?: string
  inputJson?: string
  message?: string
  maxAttempts?: number
  retryDelay?: string
}

const DEFAULT_FORM: TriggerFormValues = {
  name: '', type: 'event', topic: '', eventType: '', key: '', cron: '*/5 * * * *', timezone: 'Asia/Shanghai',
  inputJson: '{}', message: '', maxAttempts: 1, retryDelay: '2s',
}

export function WorkflowTriggerWorkspace() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<TriggerFormValues>()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<WorkflowTrigger | null>(null)
  const [historyTrigger, setHistoryTrigger] = useState<WorkflowTrigger | null>(null)
  const [executions, setExecutions] = useState<WorkflowTriggerExecution[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [changingId, setChangingId] = useState('')
  const triggerType = Form.useWatch('type', form) || 'event'
  const selectedWorkflow = useMemo(() => workflows.find((item) => item.id === selectedWorkflowId) || null, [selectedWorkflowId, workflows])

  const loadWorkflows = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listWorkflows()
      setWorkflows(items)
      setSelectedWorkflowId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || '')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载工作流失败')
      setWorkflows([])
      setSelectedWorkflowId('')
    } finally {
      setLoading(false)
    }
  }, [message])

  const loadTriggers = useCallback(async () => {
    if (!selectedWorkflowId) {
      setTriggers([])
      return
    }
    try {
      setTriggers(await listWorkflowTriggers(selectedWorkflowId))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载触发器失败')
      setTriggers([])
    }
  }, [message, selectedWorkflowId])

  // The initial load synchronizes this workspace with the API after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadWorkflows() }, [loadWorkflows])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadTriggers() }, [loadTriggers])

  function openCreate() {
    setEditingTrigger(null)
    form.setFieldsValue(DEFAULT_FORM)
    setModalOpen(true)
  }

  function openEdit(trigger: WorkflowTrigger) {
    setEditingTrigger(trigger)
    const config = parseObject(trigger.configJson)
    form.setFieldsValue({
      ...DEFAULT_FORM,
      name: trigger.name,
      type: trigger.type === 'schedule' ? 'schedule' : 'event',
      topic: stringValue(config.topic), eventType: stringValue(config.event_type), key: stringValue(config.key),
      cron: stringValue(config.cron || config.schedule) || DEFAULT_FORM.cron,
      timezone: stringValue(config.timezone) || DEFAULT_FORM.timezone,
      inputJson: stringValue(config.input_json) || '{}', message: stringValue(config.message),
      maxAttempts: numberValue(config.max_attempts) || 1, retryDelay: stringValue(config.retry_delay) || '2s',
    })
    setModalOpen(true)
  }

  async function saveTrigger() {
    if (!selectedWorkflowId) return
    try {
      const values = await form.validateFields()
      const configJson = buildConfig(values)
      setSaving(true)
      const saved = editingTrigger
        ? await updateWorkflowTrigger(editingTrigger.id, { name: values.name, type: values.type, configJson })
        : await createWorkflowTrigger(selectedWorkflowId, { name: values.name, type: values.type, configJson })
      setTriggers((current) => editingTrigger ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])
      setModalOpen(false)
      message.success(editingTrigger ? '触发器已更新' : '触发器已创建')
    } catch (error) {
      if (error instanceof Error && error.message) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(trigger: WorkflowTrigger) {
    modal.confirm({
      title: '删除触发器', content: `确定删除“${trigger.name}”吗？`, okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => {
        await deleteWorkflowTrigger(trigger.id)
        setTriggers((current) => current.filter((item) => item.id !== trigger.id))
        message.success('触发器已删除')
      },
    })
  }

  async function toggleTrigger(trigger: WorkflowTrigger, enabled: boolean) {
    setChangingId(trigger.id)
    try {
      const updated = await setWorkflowTriggerEnabled(trigger.id, enabled)
      setTriggers((current) => current.map((item) => item.id === updated.id ? updated : item))
      message.success(enabled ? '触发器已启用' : '触发器已停用')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新触发器状态失败')
    } finally {
      setChangingId('')
    }
  }

  async function openHistory(trigger: WorkflowTrigger) {
    setHistoryTrigger(trigger)
    setHistoryLoading(true)
    try {
      setExecutions(await listWorkflowTriggerExecutions(trigger.id))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载执行记录失败')
      setExecutions([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const columns: ColumnsType<WorkflowTrigger> = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (value: string, item) => <div className="workflow-trigger-name"><strong>{value}</strong><span>{item.type === 'event' ? '事件触发' : '定时触发'}</span></div> },
    { title: '状态', dataIndex: 'enabled', key: 'enabled', width: 105, render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? '运行中' : '已停用'}</Tag> },
    { title: '最近执行', dataIndex: 'lastRunAt', key: 'lastRunAt', width: 170, render: (value: number) => formatTime(value) },
    { title: '下次执行', dataIndex: 'nextRunAt', key: 'nextRunAt', width: 170, render: (value: number) => formatTime(value) },
    {
      title: '操作', key: 'actions', width: 180, render: (_, item) => <Space size={2}>
        <Tooltip title={item.enabled ? '停用' : '启用'}><Button type="text" size="small" icon={item.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />} loading={changingId === item.id} onClick={() => void toggleTrigger(item, !item.enabled)} /></Tooltip>
        <Tooltip title="执行历史"><Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => void openHistory(item)} /></Tooltip>
        <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} /></Tooltip>
        <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(item)} /></Tooltip>
      </Space>,
    },
  ]

  const executionColumns: ColumnsType<WorkflowTriggerExecution> = [
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (value: string) => <Tag color={value === 'succeeded' ? 'green' : value === 'failed' ? 'red' : 'blue'}>{executionStatusLabel(value)}</Tag> },
    { title: '运行 ID', dataIndex: 'runId', key: 'runId', ellipsis: true, render: (value: string) => value || '-' },
    { title: '幂等键', dataIndex: 'idempotencyKey', key: 'idempotencyKey', ellipsis: true },
    { title: '错误', dataIndex: 'error', key: 'error', ellipsis: true, render: (value: string) => value || '-' },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (value: number) => formatTime(value) },
  ]

  return <section className="workflow-trigger-workspace agent-panel-stage">
    <header className="agent-panel-header workflow-trigger-header">
      <div><p className="eyebrow">Agent</p><h1 className="agent-panel-title">工作流触发器</h1><p className="agent-panel-desc">为已发布工作流配置事件或定时触发，并追踪每次自动执行。</p></div>
      <Space><Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={() => void loadWorkflows()} /></Tooltip><Button type="primary" icon={<PlusOutlined />} disabled={!selectedWorkflowId} onClick={openCreate}>新增触发器</Button></Space>
    </header>
    <div className="workflow-trigger-body">
      <div className="workflow-trigger-toolbar"><span className="workflow-trigger-toolbar-label">工作流</span><Select value={selectedWorkflowId || undefined} placeholder="选择工作流" loading={loading} onChange={setSelectedWorkflowId} options={workflows.map((item) => ({ value: item.id, label: `${item.name}${item.status === 'published' ? '' : '（草稿）'}` }))} className="workflow-trigger-workflow-select" /></div>
      {loading ? <div className="workflow-trigger-loading"><Spin /></div> : selectedWorkflow ? <Table rowKey="id" columns={columns} dataSource={triggers} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无触发器" /> }} pagination={false} scroll={{ x: 760 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作流" />}
    </div>
    <Modal open={modalOpen} title={editingTrigger ? '编辑触发器' : '新增触发器'} okText="保存" cancelText="取消" confirmLoading={saving} width={640} destroyOnHidden onCancel={() => setModalOpen(false)} onOk={() => void saveTrigger()}>
      <Form form={form} layout="vertical" initialValues={DEFAULT_FORM} preserve={false}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入触发器名称' }]}><Input placeholder="例如：订单创建后同步" /></Form.Item>
        <Form.Item name="type" label="类型"><Select options={[{ value: 'event', label: <><ThunderboltOutlined /> 事件</> }, { value: 'schedule', label: <><ClockCircleOutlined /> 定时</> }]} /></Form.Item>
        {triggerType === 'event' ? <>
          <Form.Item name="topic" label="事件主题" rules={[{ required: true, message: '请输入事件主题' }]}><Input placeholder="orders" /></Form.Item>
          <div className="workflow-trigger-form-grid"><Form.Item name="eventType" label="事件类型"><Input placeholder="order.created" /></Form.Item><Form.Item name="key" label="事件键"><Input placeholder="可选，用于精确匹配" /></Form.Item></div>
        </> : <>
          <Form.Item name="cron" label="调度表达式" rules={[{ required: true, message: '请输入 cron 或 @every 表达式' }]}><Input placeholder="*/5 * * * * 或 @every 1m" /></Form.Item>
          <div className="workflow-trigger-form-grid"><Form.Item name="timezone" label="时区"><Input placeholder="Asia/Shanghai" /></Form.Item><Form.Item name="maxAttempts" label="最大尝试次数"><InputNumber min={1} max={5} className="workflow-trigger-full-width" /></Form.Item></div>
          <Form.Item name="retryDelay" label="重试间隔"><Input placeholder="2s" /></Form.Item>
        </>}
        <Form.Item name="inputJson" label="输入 JSON" rules={[{ validator: (_, value) => validateJSON(value) }]}><Input.TextArea rows={4} placeholder='{"key":"value"}' /></Form.Item>
        <Form.Item name="message" label="启动消息"><Input.TextArea rows={2} placeholder="可选" /></Form.Item>
      </Form>
    </Modal>
    <Drawer title={historyTrigger ? `${historyTrigger.name} · 执行历史` : '执行历史'} width={860} open={Boolean(historyTrigger)} onClose={() => setHistoryTrigger(null)} destroyOnHidden>
      <Table rowKey="id" columns={executionColumns} dataSource={executions} loading={historyLoading} pagination={false} scroll={{ x: 720 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无执行记录" /> }} />
    </Drawer>
  </section>
}

function parseObject(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value || 0) || 0 }
function buildConfig(values: TriggerFormValues): string {
  const config: Record<string, unknown> = {}
  if (values.type === 'event') {
    config.topic = values.topic?.trim() || ''
    if (values.eventType?.trim()) config.event_type = values.eventType.trim()
    if (values.key?.trim()) config.key = values.key.trim()
  } else {
    config.cron = values.cron?.trim() || ''
    if (values.timezone?.trim()) config.timezone = values.timezone.trim()
    config.max_attempts = values.maxAttempts || 1
    if (values.retryDelay?.trim()) config.retry_delay = values.retryDelay.trim()
  }
  if (values.inputJson?.trim() && values.inputJson.trim() !== '{}') config.input_json = values.inputJson.trim()
  if (values.message?.trim()) config.message = values.message.trim()
  return JSON.stringify(config)
}
function validateJSON(value: unknown) {
  if (!value || !String(value).trim()) return Promise.resolve()
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Promise.resolve() : Promise.reject(new Error('请输入 JSON 对象')) } catch { return Promise.reject(new Error('JSON 格式不正确')) }
}
function formatTime(value: number): string {
  if (!value) return '-'
  const ms = value > 1_000_000_000_000_000 ? value / 1000 : value > 1_000_000_000_000 ? value : value * 1000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false })
}
function executionStatusLabel(value: string): string { return value === 'succeeded' ? '成功' : value === 'failed' ? '失败' : value === 'started' ? '执行中' : value || '未知' }
