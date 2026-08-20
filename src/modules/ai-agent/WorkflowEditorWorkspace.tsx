import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Tag, Tooltip } from 'antd'
import {
  ApiOutlined,
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflows,
  publishWorkflow,
  resumeWorkflow,
  startWorkflow,
  updateWorkflow,
} from '../../lib/workflowApi'
import type { WorkflowDefinition, WorkflowRun } from '../../types'
import './WorkflowEditorWorkspace.css'

type CanvasNodeType = 'agent' | 'transform' | 'http' | 'condition' | 'human' | 'start' | 'end'
type EditorNode = { id: string; type: CanvasNodeType; title: string; position: { x: number; y: number }; config: Record<string, unknown> }
type EditorEdge = { id: string; source: string; target: string; when?: string; condition?: string }
type CanvasDraft = { id: string; version: number; nodes: EditorNode[]; edges: EditorEdge[] }
type CreateValues = { name: string; description?: string }
type RunValues = { inputJson?: string; message?: string }

const NODE_META: Array<{ type: CanvasNodeType; label: string; icon: React.ReactNode; color: string }> = [
  { type: 'agent', label: 'Agent', icon: <RobotOutlined />, color: '#25324a' },
  { type: 'transform', label: 'Transform', icon: <DeploymentUnitOutlined />, color: '#5b5bd6' },
  { type: 'http', label: 'HTTP', icon: <ApiOutlined />, color: '#087f78' },
  { type: 'condition', label: 'Condition', icon: <BranchesOutlined />, color: '#0b9a8d' },
  { type: 'human', label: 'Human', icon: <UserSwitchOutlined />, color: '#b06b1d' },
]
const NODE_WIDTH = 224
const NODE_HEIGHT = 128

export function WorkflowEditorWorkspace() {
  const { message } = App.useApp()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [draft, setDraft] = useState<WorkflowDefinition | null>(null)
  const [canvas, setCanvas] = useState<CanvasDraft | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [connectingFrom, setConnectingFrom] = useState('')
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [runLoading, setRunLoading] = useState(false)
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null)
  const [runDrawerOpen, setRunDrawerOpen] = useState(false)
  const [decisionJson, setDecisionJson] = useState('{}')
  const [resuming, setResuming] = useState(false)
  const [createForm] = Form.useForm<CreateValues>()
  const [runForm] = Form.useForm<RunValues>()
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const selectedNode = useMemo(() => canvas?.nodes.find((node) => node.id === selectedNodeId) || null, [canvas, selectedNodeId])

  const loadWorkflows = useCallback(async () => {
    setLoading(true)
    try { setWorkflows(await listWorkflows()) } catch (error) { message.error(error instanceof Error ? error.message : '加载工作流失败') } finally { setLoading(false) }
  }, [message])

  useEffect(() => {
    // Initial synchronization with the workflow API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkflows()
  }, [loadWorkflows])

  useEffect(() => {
    if (!activeRun?.id || !['running', 'waiting_for_user'].includes(activeRun.status)) return undefined
    const timer = window.setInterval(() => {
      void getWorkflowRun(activeRun.id).then(setActiveRun).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [activeRun?.id, activeRun?.status])

  async function openEditor(item: WorkflowDefinition) {
    try {
      const loaded = item.definitionJson ? item : await getWorkflow(item.id)
      setDraft(loaded)
      setCanvas(parseCanvas(loaded.definitionJson, loaded.id, loaded.version))
      setSelectedNodeId('')
      setConnectingFrom('')
      setActiveRun(null)
    } catch (error) { message.error(error instanceof Error ? error.message : '打开工作流失败') }
  }

  function closeEditor() { setDraft(null); setCanvas(null); setSelectedNodeId(''); setConnectingFrom(''); setActiveRun(null); setRunDrawerOpen(false) }

  async function handleCreate() {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      const definition = defaultCanvas(crypto.randomUUID())
      const created = await createWorkflow(values.name, values.description || '', JSON.stringify(definition))
      setWorkflows((items) => [created, ...items])
      setCreateOpen(false)
      createForm.resetFields()
      await openEditor(created)
      message.success('工作流已创建')
    } catch (error) { if (error instanceof Error && error.message) message.error(error.message) } finally { setCreating(false) }
  }

  async function handleDelete(id: string) {
    try { await deleteWorkflow(id); setWorkflows((items) => items.filter((item) => item.id !== id)); if (draft?.id === id) closeEditor(); message.success('工作流已删除') } catch (error) { message.error(error instanceof Error ? error.message : '删除工作流失败') }
  }

  async function saveDraft(publish = false) {
    if (!draft || !canvas) return
    setSaving(true)
    try {
      const saved = await updateWorkflow(draft.id, draft.name, draft.description, JSON.stringify(canvas))
      const next = publish ? await publishWorkflow(saved.id) : saved
      setDraft(next)
      setCanvas((current) => current ? { ...current, id: next.id, version: next.version } : current)
      setWorkflows((items) => items.map((item) => item.id === next.id ? next : item))
      message.success(publish ? '工作流已发布' : '工作流已保存')
    } catch (error) { message.error(error instanceof Error ? error.message : '保存工作流失败') } finally { setSaving(false) }
  }

  async function handleRun() {
    if (!draft || !canvas) return
    try {
      const values = await runForm.validateFields()
      JSON.parse(values.inputJson || '{}')
      setRunLoading(true)
      const run = await startWorkflow(draft.id, values.inputJson || '{}', values.message || '')
      setActiveRun(run)
      setDecisionJson('{}')
      setRunDrawerOpen(true)
      message.success(`运行已启动：${run.id || '已提交'}`)
      setRunOpen(false)
    } catch (error) { message.error(error instanceof Error ? error.message : '启动运行失败') } finally { setRunLoading(false) }
  }

  async function refreshRun() {
    if (!activeRun?.id) return
    try { setActiveRun(await getWorkflowRun(activeRun.id)); message.success('运行状态已刷新') } catch (error) { message.error(error instanceof Error ? error.message : '刷新运行状态失败') }
  }

  async function resumeRun() {
    if (!activeRun?.waitingActionId) return
    try {
      JSON.parse(decisionJson || '{}')
      setResuming(true)
      setActiveRun(await resumeWorkflow(activeRun.waitingActionId, decisionJson || '{}'))
      message.success('人工决策已提交')
    } catch (error) { message.error(error instanceof Error ? error.message : '提交人工决策失败') } finally { setResuming(false) }
  }

  function updateMeta(patch: Partial<Pick<WorkflowDefinition, 'name' | 'description'>>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function updateNode(id: string, patch: Partial<EditorNode>) { setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) } : current) }
  function updateNodeConfig(id: string, key: string, value: unknown) { setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, config: { ...node.config, [key]: value } } : node) } : current) }
  function deleteNode(id: string) { setCanvas((current) => current ? { ...current, nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id) } : current); setSelectedNodeId('') }
  function addNode(type: CanvasNodeType) {
    if (!canvas) return
    const meta = NODE_META.find((item) => item.type === type)!
    const node: EditorNode = { id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type, title: meta.label, position: { x: 520 + (canvas.nodes.length % 4) * 280, y: 120 + Math.floor(canvas.nodes.length / 4) * 190 }, config: defaultNodeConfig(type) }
    setCanvas({ ...canvas, nodes: [...canvas.nodes, node] }); setSelectedNodeId(node.id)
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, node: EditorNode) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ id: node.id, dx: event.clientX - rect.left - node.position.x, dy: event.clientY - rect.top - node.position.y })
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(20, event.clientX - rect.left + canvasRef.current.scrollLeft - dragging.dx)
    const y = Math.max(20, event.clientY - rect.top + canvasRef.current.scrollTop - dragging.dy)
    setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === dragging.id ? { ...node, position: { x, y } } : node) } : current)
  }
  function finishDrag() { setDragging(null) }
  function handleNodeClick(node: EditorNode) { setSelectedNodeId(node.id); setConnectingFrom('') }
  function handlePortClick(node: EditorNode) {
    if (!connectingFrom) { setConnectingFrom(node.id); setSelectedNodeId(node.id); return }
    if (connectingFrom !== node.id && canvas && !canvas.edges.some((edge) => edge.source === connectingFrom && edge.target === node.id)) {
      setCanvas({ ...canvas, edges: [...canvas.edges, { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: connectingFrom, target: node.id }] })
    }
    setConnectingFrom('')
  }

  if (draft && canvas) {
    return <><WorkflowEditorCanvas draft={draft} canvas={canvas} selectedNode={selectedNode} selectedNodeId={selectedNodeId} connectingFrom={connectingFrom} saving={saving} canvasRef={canvasRef} onBack={closeEditor} onMetaChange={updateMeta} onSave={() => void saveDraft()} onPublish={() => void saveDraft(true)} onRun={() => { runForm.setFieldsValue({ inputJson: '{}', message: '' }); setRunOpen(true) }} onAddNode={addNode} onSelectNode={handleNodeClick} onDeleteNode={deleteNode} onUpdateNode={updateNode} onUpdateConfig={updateNodeConfig} onStartDrag={startDrag} onMoveDrag={moveDrag} onFinishDrag={finishDrag} onPortClick={handlePortClick} /><Modal open={runOpen} title="运行工作流" okText="启动" cancelText="取消" confirmLoading={runLoading} onCancel={() => setRunOpen(false)} onOk={() => void handleRun()}><Form form={runForm} layout="vertical"><Form.Item name="inputJson" label="输入 JSON" rules={[{ required: true, message: '请输入 JSON 对象' }, { validator: (_, value) => { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Promise.resolve() : Promise.reject(new Error('请输入 JSON 对象')) } catch { return Promise.reject(new Error('JSON 格式不正确')) } } }]}><Input.TextArea rows={6} /></Form.Item><Form.Item name="message" label="启动消息"><Input.TextArea rows={2} /></Form.Item></Form></Modal><Drawer title="运行详情" open={runDrawerOpen} width={560} onClose={() => setRunDrawerOpen(false)} extra={<Button icon={<ThunderboltOutlined />} onClick={() => void refreshRun()}>刷新</Button>}>{activeRun ? <div className="workflow-run-detail"><div className="workflow-run-detail-status"><Tag color={runStatusColor(activeRun.status)}>{runStatusLabel(activeRun.status)}</Tag><code>{activeRun.id}</code></div><dl><dt>版本</dt><dd>{activeRun.workflowVersion || '-'}</dd><dt>输入</dt><dd><pre>{activeRun.inputJson || '{}'}</pre></dd><dt>输出</dt><dd><pre>{activeRun.outputJson || '-'}</pre></dd><dt>错误</dt><dd>{activeRun.error || '-'}</dd><dt>等待动作</dt><dd>{activeRun.waitingActionId || '-'}</dd></dl>{activeRun.waitingActionId ? <div className="workflow-run-decision"><label>人工决策 JSON</label><Input.TextArea rows={5} value={decisionJson} onChange={(event) => setDecisionJson(event.target.value)} /><Button type="primary" loading={resuming} onClick={() => void resumeRun()}>提交决策</Button></div> : null}</div> : <Empty description="暂无运行" />}</Drawer></>
  }

  return <section className="workflow-editor-workspace agent-panel-stage">
    <header className="agent-panel-header workflow-list-header"><div><p className="eyebrow">Agent</p><h1 className="agent-panel-title">工作流编排</h1><p className="agent-panel-desc">创建工作流、配置节点与连线，并发布给触发器调用。</p></div><Space><Tooltip title="刷新"><Button icon={<ThunderboltOutlined />} onClick={() => void loadWorkflows()} /></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建工作流</Button></Space></header>
    <div className="workflow-list-body">{loading ? <div className="workflow-editor-loading"><Spin /></div> : workflows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作流" /> : <div className="workflow-list-grid">{workflows.map((item) => <article key={item.id} className="workflow-list-item" onDoubleClick={() => void openEditor(item)}><div className="workflow-list-item-main"><div className="workflow-list-item-icon"><BranchesOutlined /></div><div><strong>{item.name}</strong><p>{item.description || '暂无描述'}</p></div></div><div className="workflow-list-item-footer"><Tag color={item.status === 'published' ? 'green' : 'default'}>{item.status === 'published' ? '已发布' : '草稿'}</Tag><Space size={2}><Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => void openEditor(item)} /></Tooltip><Popconfirm title="删除工作流" description={`确定删除“${item.name}”吗？`} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void handleDelete(item.id)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space></div></article>)}</div>}</div>
    <Modal open={createOpen} title="新建工作流" okText="创建" cancelText="取消" confirmLoading={creating} onCancel={() => setCreateOpen(false)} onOk={() => void handleCreate()}><Form form={createForm} layout="vertical"><Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入工作流名称' }]}><Input placeholder="例如：客户反馈处理" /></Form.Item><Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
  </section>
}

function WorkflowEditorCanvas(props: { draft: WorkflowDefinition; canvas: CanvasDraft; selectedNode: EditorNode | null; selectedNodeId: string; connectingFrom: string; saving: boolean; canvasRef: React.RefObject<HTMLDivElement | null>; onBack: () => void; onMetaChange: (patch: Partial<Pick<WorkflowDefinition, 'name' | 'description'>>) => void; onSave: () => void; onPublish: () => void; onRun: () => void; onAddNode: (type: CanvasNodeType) => void; onSelectNode: (node: EditorNode) => void; onDeleteNode: (id: string) => void; onUpdateNode: (id: string, patch: Partial<EditorNode>) => void; onUpdateConfig: (id: string, key: string, value: unknown) => void; onStartDrag: (event: React.PointerEvent<HTMLDivElement>, node: EditorNode) => void; onMoveDrag: (event: React.PointerEvent<HTMLDivElement>) => void; onFinishDrag: () => void; onPortClick: (node: EditorNode) => void }) {
  const { draft, canvas, selectedNode, selectedNodeId, connectingFrom } = props
  // The ref is used by pointer handlers to translate coordinates inside the scrollable canvas.
  // eslint-disable-next-line react-hooks/refs
  return <section className="workflow-composer-stage"><header className="workflow-composer-topbar"><Space><Tooltip title="返回列表"><Button type="text" icon={<ArrowLeftOutlined />} onClick={props.onBack} /></Tooltip><span className="workflow-composer-logo"><BranchesOutlined /></span><div className="workflow-composer-meta"><Input value={draft.name} variant="borderless" onChange={(event) => props.onMetaChange({ name: event.target.value })} /><Input value={draft.description} variant="borderless" placeholder="添加描述" onChange={(event) => props.onMetaChange({ description: event.target.value })} /></div><Tag color={draft.status === 'published' ? 'green' : 'default'}>{draft.status === 'published' ? '已发布' : '草稿'}</Tag></Space><Space><Button icon={<PlayCircleOutlined />} onClick={props.onRun}>运行</Button><Button icon={<SaveOutlined />} loading={props.saving} onClick={props.onSave}>保存</Button><Button type="primary" icon={<CheckCircleOutlined />} loading={props.saving} onClick={props.onPublish}>发布</Button></Space></header><div className="workflow-composer-body"><div className="workflow-canvas-toolbar"><span>节点</span>{NODE_META.map((item) => <Tooltip key={item.type} title={`添加${item.label}`}><Button size="small" icon={item.icon} onClick={() => props.onAddNode(item.type)} /></Tooltip>)}<span className="workflow-canvas-hint">{connectingFrom ? '选择目标节点完成连线' : '拖动节点，点击端口连线'}</span></div><div className="workflow-canvas-shell" ref={props.canvasRef} onPointerMove={props.onMoveDrag} onPointerUp={props.onFinishDrag} onPointerLeave={props.onFinishDrag}><div className="workflow-canvas-inner"><svg className="workflow-edge-layer" width="1800" height="1100"><defs><marker id="workflow-edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>{canvas.edges.map((edge) => { const source = canvas.nodes.find((node) => node.id === edge.source); const target = canvas.nodes.find((node) => node.id === edge.target); if (!source || !target) return null; const sx = source.position.x + NODE_WIDTH; const sy = source.position.y + NODE_HEIGHT / 2; const tx = target.position.x; const ty = target.position.y + NODE_HEIGHT / 2; const offset = Math.max(60, Math.abs(tx - sx) * .4); return <path key={edge.id} className="workflow-edge-path" d={`M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx - offset} ${ty}, ${tx} ${ty}`} markerEnd="url(#workflow-edge-arrow)" /> })}</svg>{canvas.nodes.map((node) => { const meta = node.type === 'start' || node.type === 'end' ? { label: node.type === 'start' ? '开始' : '结束', icon: <ThunderboltOutlined />, color: '#5663c5' } : NODE_META.find((item) => item.type === node.type)!; return <div key={node.id} className={`workflow-editor-node${selectedNodeId === node.id ? ' is-selected' : ''}${connectingFrom === node.id ? ' is-connecting' : ''}`} style={{ left: node.position.x, top: node.position.y, borderTopColor: meta.color }} onClick={(event) => { event.stopPropagation(); props.onSelectNode(node) }} onPointerDown={(event) => props.onStartDrag(event, node)}><button type="button" className="workflow-node-port workflow-node-port-in" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onPortClick(node) }} aria-label={`连接到${node.title}`} /><div className="workflow-editor-node-head"><span style={{ background: meta.color }}>{meta.icon}</span><strong>{node.title}</strong><small>{meta.label}</small></div><div className="workflow-editor-node-summary">{summaryForNode(node).map((row) => <div key={row[0]}><span>{row[0]}</span><em>{row[1]}</em></div>)}</div><button type="button" className="workflow-node-port workflow-node-port-out" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onPortClick(node) }} aria-label={`从${node.title}连线`} /></div> })}</div></div>{selectedNode ? <WorkflowInspector node={selectedNode} onDelete={() => props.onDeleteNode(selectedNode.id)} onUpdateTitle={(title) => props.onUpdateNode(selectedNode.id, { title })} onUpdateConfig={(key, value) => props.onUpdateConfig(selectedNode.id, key, value)} /> : <aside className="workflow-inspector workflow-inspector-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择节点查看配置" /></aside>}</div></section>
}

function WorkflowInspector({ node, onDelete, onUpdateTitle, onUpdateConfig }: { node: EditorNode; onDelete: () => void; onUpdateTitle: (value: string) => void; onUpdateConfig: (key: string, value: unknown) => void }) {
  const meta = NODE_META.find((item) => item.type === node.type)
  return <aside className="workflow-inspector"><div className="workflow-inspector-head"><div><span className="workflow-inspector-icon" style={{ background: meta?.color || '#5663c5' }}>{meta?.icon || <ThunderboltOutlined />}</span><div><strong>{node.title}</strong><small>{meta?.label || (node.type === 'start' ? '开始' : '结束')}</small></div></div><Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete} /></div>{node.type !== 'start' && node.type !== 'end' ? <><label>节点名称</label><Input value={node.title} onChange={(event) => onUpdateTitle(event.target.value)} /><NodeConfigFields node={node} onUpdate={onUpdateConfig} /></> : <p className="workflow-inspector-note">边界节点由编排引擎自动处理。</p>}</aside>
}

function NodeConfigFields({ node, onUpdate }: { node: EditorNode; onUpdate: (key: string, value: unknown) => void }) {
  const config = node.config
  const text = (key: string, fallback = '') => String(config[key] ?? fallback)
  if (node.type === 'agent') return <><label>Agent</label><Input value={text('agent', 'claude_llm')} onChange={(event) => onUpdate('agent', event.target.value)} /><label>系统提示词</label><Input.TextArea rows={3} value={text('system_prompt')} onChange={(event) => onUpdate('system_prompt', event.target.value)} /><label>用户提示词</label><Input.TextArea rows={4} value={text('user_prompt', '{{input.message}}')} onChange={(event) => onUpdate('user_prompt', event.target.value)} /><label>最大轮次</label><InputNumber min={1} max={100} className="workflow-inspector-full" value={Number(config.max_turns ?? 10)} onChange={(value) => onUpdate('max_turns', value || 10)} /></>
  if (node.type === 'http') return <><label>请求方法</label><Select className="workflow-inspector-full" value={text('method', 'GET')} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value }))} onChange={(value) => onUpdate('method', value)} /><label>URL</label><Input value={text('url')} onChange={(event) => onUpdate('url', event.target.value)} placeholder="https://api.example.com" /><label>请求体 JSON</label><Input.TextArea rows={4} value={text('body', '{}')} onChange={(event) => onUpdate('body', event.target.value)} /></>
  if (node.type === 'condition') return <><label>判断输入</label><Input value={text('input', '{{input}}')} onChange={(event) => onUpdate('input', event.target.value)} /><label>分支 JSON</label><Input.TextArea rows={5} value={JSON.stringify(config.cases || [{ when: 'equals', value: 'yes' }], null, 2)} onChange={(event) => { try { onUpdate('cases', JSON.parse(event.target.value)) } catch { /* keep editing text until valid */ } }} /><label>默认分支</label><Input value={text('default')} onChange={(event) => onUpdate('default', event.target.value)} /></>
  if (node.type === 'human') return <><label>确认标题</label><Input value={text('title', node.title)} onChange={(event) => onUpdate('title', event.target.value)} /><label>表单字段 JSON</label><Input.TextArea rows={5} value={JSON.stringify(config.fields || [], null, 2)} onChange={(event) => { try { onUpdate('fields', JSON.parse(event.target.value)) } catch { /* keep editing text until valid */ } }} /></>
  return <><label>输入</label><Input value={text('input', '{{input}}')} onChange={(event) => onUpdate('input', event.target.value)} /><label>输出</label><Input value={text('output', '{{input}}')} onChange={(event) => onUpdate('output', event.target.value)} /></>
}

function defaultNodeConfig(type: CanvasNodeType): Record<string, unknown> {
  if (type === 'agent') return { agent: 'claude_llm', input: { message: '{{input.message}}' }, user_prompt: '{{input.message}}', max_turns: 10 }
  if (type === 'http') return { method: 'GET', url: '', body: '{}' }
  if (type === 'condition') return { input: '{{input}}', cases: [{ when: 'equals', value: 'yes' }], default: 'default' }
  if (type === 'human') return { title: '需要人工确认', fields: [] }
  return { input: '{{input}}', output: '{{input}}' }
}
function defaultCanvas(id: string): CanvasDraft { return { id, version: 1, nodes: [{ id: 'start', type: 'start', title: '开始', position: { x: 80, y: 270 }, config: {} }, { id: 'agent-1', type: 'agent', title: 'Agent', position: { x: 420, y: 270 }, config: defaultNodeConfig('agent') }, { id: 'end', type: 'end', title: '结束', position: { x: 800, y: 270 }, config: {} }], edges: [{ id: 'edge-start-agent', source: 'start', target: 'agent-1' }, { id: 'edge-agent-end', source: 'agent-1', target: 'end' }] } }
function parseCanvas(raw: string, id: string, version: number): CanvasDraft { try { const value = JSON.parse(raw || '{}') as Partial<CanvasDraft>; if (Array.isArray(value.nodes) && Array.isArray(value.edges)) return { id: value.id || id, version: value.version || version || 1, nodes: value.nodes.map((node, index) => ({ ...node, position: node.position || { x: 100 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 190 }, config: node.config || {} })) as EditorNode[], edges: value.edges as EditorEdge[] } } catch { /* use default below */ } return defaultCanvas(id) }
function summaryForNode(node: EditorNode): Array<[string, string]> { if (node.type === 'agent') return [['Agent', String(node.config.agent || 'claude_llm')], ['提示词', String(node.config.user_prompt || '{{input.message}}')]]; if (node.type === 'http') return [['Method', String(node.config.method || 'GET')], ['URL', String(node.config.url || '未配置')]]; if (node.type === 'condition') return [['分支', `${Array.isArray(node.config.cases) ? node.config.cases.length : 0} 条`]]; if (node.type === 'human') return [['动作', '等待人工']]; const rows: Array<[string, string]> = [['类型', node.type === 'transform' ? '数据转换' : node.type === 'start' ? '工作流入口' : node.type === 'end' ? '工作流出口' : '']]; return rows.filter((row) => row[1]) }
function runStatusLabel(value: string): string { return value === 'completed' ? '已完成' : value === 'failed' ? '失败' : value === 'waiting_for_user' ? '等待人工' : value === 'running' ? '运行中' : value || '未知' }
function runStatusColor(value: string): string { return value === 'completed' ? 'green' : value === 'failed' ? 'red' : value === 'waiting_for_user' ? 'orange' : 'blue' }
