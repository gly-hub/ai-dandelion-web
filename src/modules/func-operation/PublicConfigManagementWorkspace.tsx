import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography, Upload, message } from 'antd'
import { HistoryOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavMenus } from '../../contexts/NavMenuContext'
import {
  createPublicConfig,
  listPublicConfigs,
  listPublicConfigVersions,
  rollbackPublicConfig,
  updatePublicConfig,
} from '../../lib/funcOperationApi'
import type { PublicConfig, PublicConfigVersion } from '../../types'

const CONFIG_PAGE = 'func-operation.configs'

interface ConfigFormValues {
  configKey: string
  name: string
  description: string
  valueJson: string
}

export function PublicConfigManagementWorkspace() {
  const { hasPageButton } = useNavMenus()
  const [items, setItems] = useState<PublicConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<PublicConfig | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [historyItem, setHistoryItem] = useState<PublicConfig | null>(null)
  const [versions, setVersions] = useState<PublicConfigVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [form] = Form.useForm<ConfigFormValues>()
  const canCreate = hasPageButton('func-operation', CONFIG_PAGE, 'create')
  const canUpdate = hasPageButton('func-operation', CONFIG_PAGE, 'update')
  const canRollback = hasPageButton('func-operation', CONFIG_PAGE, 'rollback')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await listPublicConfigs())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo(() => [
    {
      title: '配置 Key',
      dataIndex: 'configKey',
      width: 180,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '说明', dataIndex: 'description', ellipsis: true },
    {
      title: '选项',
      dataIndex: 'valueJson',
      width: 100,
      render: (value: string) => <Tag>{optionCount(value)} 项</Tag>,
    },
    { title: '版本', dataIndex: 'version', width: 80, align: 'right' as const },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (value: number) => formatTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: PublicConfig) => (
        <Space size={0}>
          {canUpdate ? <Button type="link" onClick={() => openEditor(record)}>更新</Button> : null}
          <Button type="link" icon={<HistoryOutlined />} onClick={() => void openHistory(record)}>历史</Button>
        </Space>
      ),
    },
  ], [canUpdate])

  function openEditor(item?: PublicConfig) {
    const target = item || null
    setEditing(target)
    form.setFieldsValue({
      configKey: target?.configKey || '',
      name: target?.name || '',
      description: target?.description || '',
      valueJson: target ? prettyJSON(target.valueJson) : '[]',
    })
    setEditorOpen(true)
  }

  async function handleUpload(file: File) {
    try {
      const raw = await file.text()
      const normalized = prettyJSON(raw)
      JSON.parse(normalized)
      form.setFieldValue('valueJson', normalized)
      message.success('配置文件已读取，请确认后发布')
    } catch {
      message.error('文件不是有效 JSON')
    }
    return false
  }

  async function submit() {
    const values = await form.validateFields()
    try {
      JSON.parse(values.valueJson)
    } catch {
      form.setFields([{ name: 'valueJson', errors: ['请输入有效的 JSON 数组'] }])
      return
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updatePublicConfig(editing.configKey, values)
      } else {
        await createPublicConfig(values)
      }
      setEditorOpen(false)
      await load()
    } catch (err) {
      message.error(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function openHistory(item: PublicConfig) {
    setHistoryItem(item)
    setHistoryLoading(true)
    try {
      setVersions(await listPublicConfigVersions(item.configKey))
    } catch (err) {
      message.error(errorMessage(err))
      setVersions([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function rollback(item: PublicConfigVersion) {
    if (!historyItem) {
      return
    }
    try {
      await rollbackPublicConfig(historyItem.configKey, item.version)
      await Promise.all([load(), openHistory(historyItem)])
      message.success(`已发布版本 ${item.version} 的配置内容`)
    } catch (err) {
      message.error(errorMessage(err))
    }
  }

  return (
    <section className="func-admin-list-page">
      <section className="func-admin-query">
        <div>
          <strong>公共配置</strong>
          <p>生成的功能可按配置 key 动态读取选项，更新后无需重新生成页面。</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} />
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新建配置</Button> : null}
        </Space>
      </section>
      {error ? <p className="error-banner func-error inline-error">{error}</p> : null}
      <Table<PublicConfig>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: '尚未创建公共配置' }}
      />

      <Modal
        title={editing ? `更新配置：${editing.configKey}` : '新建公共配置'}
        open={editorOpen}
        confirmLoading={submitting}
        okText={editing ? '发布更新' : '创建并发布'}
        onOk={() => void submit()}
        onCancel={() => setEditorOpen(false)}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="configKey" label="配置 Key" rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{0,119}$/, message: '仅允许小写字母、数字、连字符和下划线' }]}>
            <Input disabled={Boolean(editing)} placeholder="例如 country" />
          </Form.Item>
          <Form.Item name="name" label="名称">
            <Input placeholder="例如 发货城市" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="说明配置的业务用途，帮助生成 Agent 正确选择。" />
          </Form.Item>
          <Form.Item label="上传 JSON">
            <Upload accept="application/json,.json" maxCount={1} beforeUpload={handleUpload} showUploadList={false}>
              <Button icon={<UploadOutlined />}>选择 JSON 文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="valueJson" label="配置值" rules={[{ required: true, message: '请上传或输入配置 JSON' }]}>
            <Input.TextArea rows={12} spellCheck={false} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={historyItem ? `${historyItem.configKey} 的版本历史` : '版本历史'} open={Boolean(historyItem)} footer={null} onCancel={() => setHistoryItem(null)} width={760}>
        <Table<PublicConfigVersion>
          rowKey="id"
          size="small"
          loading={historyLoading}
          dataSource={versions}
          pagination={false}
          columns={[
            { title: '版本', dataIndex: 'version', width: 80 },
            { title: '来源', dataIndex: 'source', width: 100 },
            { title: '时间', dataIndex: 'createdAt', width: 170, render: (value: number) => formatTime(value) },
            { title: '选项', dataIndex: 'valueJson', width: 90, render: (value: string) => `${optionCount(value)} 项` },
            {
              title: '操作',
              key: 'actions',
              width: 100,
              render: (_: unknown, record: PublicConfigVersion) => canRollback ? (
                <Popconfirm title={`发布版本 ${record.version} 的配置内容？`} onConfirm={() => void rollback(record)}>
                  <Button type="link">回滚</Button>
                </Popconfirm>
              ) : null,
            },
          ]}
        />
      </Modal>
    </section>
  )
}

function optionCount(valueJSON: string): number {
  try {
    const parsed = JSON.parse(valueJSON)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function prettyJSON(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function formatTime(value: number): string {
  if (!value) {
    return '-'
  }
  return new Date(value / 1000).toLocaleString('zh-CN', { hour12: false })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '操作失败')
}
