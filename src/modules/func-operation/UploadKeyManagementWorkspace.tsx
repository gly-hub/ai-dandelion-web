import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { CopyOutlined, KeyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { listExternalAPIClients, rotateExternalAPIImportKey, rotatePublicConfigImportKey } from '../../lib/funcOperationApi'
import type { ExternalAPIClient } from '../../types'

const PAGE = 'func-operation.upload-keys'
type UploadType = 'swagger' | 'public-config'
type KeyTarget = { id: string; type: UploadType; key?: string; name: string; configured: boolean }
type KeyForm = { type: UploadType; targetKey?: string }

export function UploadKeyManagementWorkspace() {
  const { hasPageButton } = useNavMenus()
  const [clients, setClients] = useState<ExternalAPIClient[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [usageTarget, setUsageTarget] = useState<KeyTarget | null>(null)
  const [newKey, setNewKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<KeyForm>()
  const canCreate = hasPageButton('func-operation', PAGE, 'create')
  const load = useCallback(async () => { setLoading(true); try { setClients(await listExternalAPIClients()) } catch (error) { message.error(error instanceof Error ? error.message : '加载密钥失败') } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  const targets = useMemo<KeyTarget[]>(() => [...clients.map(item => ({ id: `swagger:${item.id}`, type: 'swagger' as const, key: item.clientKey, name: item.name, configured: item.swaggerImportKeyConfigured })), { id: 'public-config:all', type: 'public-config' as const, name: '全部公共配置', configured: true }], [clients])
  const type = Form.useWatch('type', form) || 'swagger'
  const swaggerOptions = clients.map(item => ({ value: item.clientKey, label: `${item.name} (${item.clientKey})` }))
  async function createKey() { const values = await form.validateFields(); const target = values.type === 'public-config' ? targets.find(item => item.type === 'public-config') : targets.find(item => item.type === 'swagger' && item.key === values.targetKey); if (!target) return; setSaving(true); try { const key = target.type === 'swagger' && target.key ? await rotateExternalAPIImportKey(target.key) : await rotatePublicConfigImportKey(); setCreateOpen(false); setNewKey(key); setUsageTarget(target); await load(); message.success('上传密钥已生成') } catch (error) { message.error(error instanceof Error ? error.message : '生成密钥失败') } finally { setSaving(false) } }
  function openCreate() { form.setFieldsValue({ type: 'swagger', targetKey: clients[0]?.clientKey || '' }); setCreateOpen(true) }
  return <section className="func-admin-list-page"><section className="func-admin-query"><div><strong>上传密钥管理</strong><p>Swagger 密钥只授权绑定客户端；公共配置密钥可批量上传任意公共配置。</p></div><Space><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} />{canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建密钥</Button> : null}</Space></section><Table<KeyTarget> rowKey="id" loading={loading} dataSource={targets} pagination={{ pageSize: 10, showSizeChanger: false }} columns={[{ title: '支持的上传接口', width: 190, render: (_, item) => <Tag color={item.type === 'swagger' ? 'blue' : 'green'}>{item.type === 'swagger' ? 'Swagger 文档上传' : '公共配置批量上传'}</Tag> }, { title: '授权范围', render: (_, item) => <Space direction="vertical" size={0}><Typography.Text>{item.name}</Typography.Text>{item.key ? <Typography.Text type="secondary" code>{item.key}</Typography.Text> : <Typography.Text type="secondary">上传 body 中的全部配置 Key</Typography.Text>}</Space> }, { title: '密钥状态', width: 120, render: (_, item) => item.type === 'public-config' ? <Tag color="blue">全局授权</Tag> : <Tag color={item.configured ? 'green' : 'default'}>{item.configured ? '已配置' : '未配置'}</Tag> }, { title: '操作', width: 180, render: (_, item) => <Space size={0}><Button type="link" icon={<CopyOutlined />} onClick={() => { setNewKey(''); setUsageTarget(item) }}>使用示例</Button>{canCreate ? <Button type="link" icon={<KeyOutlined />} onClick={() => { form.setFieldsValue({ type: item.type, targetKey: item.key || '' }); setCreateOpen(true) }}>{item.type === 'public-config' || item.configured ? '轮换' : '生成'}</Button> : null}</Space> }]} /><Modal title="创建上传密钥" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void createKey()} confirmLoading={saving} okText="生成密钥"><Form form={form} layout="vertical"><Form.Item name="type" label="支持的上传接口" rules={[{ required: true }]}><Select onChange={() => form.setFieldValue('targetKey', '')} options={[{ value: 'swagger', label: 'Swagger / OpenAPI 文档上传' }, { value: 'public-config', label: '公共配置批量上传' }]} /></Form.Item>{type === 'swagger' ? <Form.Item name="targetKey" label="绑定接口客户端" rules={[{ required: true }]}><Select options={swaggerOptions} placeholder="选择接口客户端" /></Form.Item> : <Typography.Paragraph type="secondary">该密钥可上传 body 中任意合法的公共配置 Key，不需要绑定单项配置。</Typography.Paragraph>}</Form></Modal><UsageModal target={usageTarget} apiKey={newKey} onClose={() => { setUsageTarget(null); setNewKey('') }} /></section>
}

function UsageModal({ target, apiKey, onClose }: { target: KeyTarget | null; apiKey: string; onClose: () => void }) {
  const endpoint = target ? `${window.location.origin}/func-operation/${target.type === 'swagger' ? `swagger-import/${encodeURIComponent(target.key || '')}` : 'import_configs'}` : ''
  const body = target?.type === 'swagger' ? '@swagger.json' : '@configs.json'
  const command = target ? `curl -X POST '${endpoint}' -H 'Content-Type: application/json' -H 'X-API-Key: ${apiKey || 'YOUR_API_KEY'}' --data-binary ${body}` : ''
  const description = target?.type === 'swagger' ? '请求体直接传 OpenAPI 3.x 或 Swagger 2 JSON。重复上传同一路由时，仅覆盖发生变化的接口。' : '请求体是配置 Key 到选项数组的 JSON 对象；每个 Key 会新增或更新对应公共配置，并生成版本记录。'
  const example = '{\n  "country": [{ "value": "cn", "label": "中国" }],\n  "city": [{ "value": "chengdu", "label": "成都" }]\n}'
  return <Modal title={target ? `${target.type === 'swagger' ? 'Swagger 文档上传' : '公共配置批量上传'}使用说明` : '使用说明'} open={Boolean(target)} footer={<Button onClick={onClose}>关闭</Button>} onCancel={onClose} width={720}>{target ? <Space direction="vertical" size={14} style={{ width: '100%' }}><Typography.Paragraph>{description}</Typography.Paragraph>{target.type === 'public-config' ? <pre>{example}</pre> : null}<div><Typography.Text strong>上传地址</Typography.Text><Typography.Paragraph copyable={{ text: endpoint }}><code>POST {endpoint}</code></Typography.Paragraph></div><div><Typography.Text strong>请求 Header</Typography.Text><Typography.Paragraph><code>Content-Type: application/json</code><br /><code>X-API-Key: {apiKey || 'YOUR_API_KEY'}</code></Typography.Paragraph></div>{apiKey ? <div><Typography.Text strong>新密钥</Typography.Text><Typography.Paragraph copyable={{ text: apiKey }}><code>{apiKey}</code></Typography.Paragraph></div> : <Typography.Text type="secondary">密钥只会在创建或轮换后展示一次。需要新密钥时请轮换。</Typography.Text>}<div><Typography.Text strong>调用示例</Typography.Text><Typography.Paragraph copyable={{ text: command }}><pre>{command}</pre></Typography.Paragraph></div></Space> : null}</Modal>
}
