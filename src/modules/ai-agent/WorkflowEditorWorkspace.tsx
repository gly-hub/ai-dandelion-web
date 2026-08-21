import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import {
  ApiOutlined,
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckCircleFilled,
  CloseOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  DownOutlined,
  EditOutlined,
  PlayCircleFilled,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRunEvents,
  listWorkflows,
  publishWorkflow,
  resumeWorkflow,
  startWorkflow,
  updateWorkflow,
} from '../../lib/workflowApi'
import type { WorkflowDefinition, WorkflowRun, WorkflowRunEdgeStatus, WorkflowRunEvent, WorkflowRunNodeStatus } from '../../types'
import './WorkflowEditorWorkspace.css'

type CanvasNodeType = 'agent' | 'transform' | 'http' | 'condition' | 'human' | 'start' | 'end'
type EditorNode = { id: string; type: CanvasNodeType; title: string; position: { x: number; y: number }; config: Record<string, unknown> }
type EditorEdge = { id: string; source: string; target: string; when?: string; condition?: string }
type CanvasDraft = { id: string; version: number; nodes: EditorNode[]; edges: EditorEdge[] }
type ConnectingState = { sourceId: string; branchValue?: string; start: { x: number; y: number }; current: { x: number; y: number } }
type CreateValues = { name: string; description?: string }
type RunValues = { inputJson?: string; message?: string }
type NodeMeta = { type: CanvasNodeType; label: string; category: string; description: string; icon: React.ReactNode; color: string }

const NODE_META: NodeMeta[] = [
  { type: 'agent', label: 'Agent', category: '核心节点', description: '调用 Agent 模型处理输入', icon: <RobotOutlined />, color: '#25324a' },
  { type: 'transform', label: 'Transform', category: '数据节点', description: '整理、映射和转换数据', icon: <DeploymentUnitOutlined />, color: '#5b5bd6' },
  { type: 'http', label: 'HTTP', category: '集成节点', description: '调用外部 HTTP API', icon: <ApiOutlined />, color: '#087f78' },
  { type: 'condition', label: 'Condition', category: '逻辑节点', description: '根据条件选择执行分支', icon: <BranchesOutlined />, color: '#0b9a8d' },
  { type: 'human', label: 'Human', category: '人工节点', description: '暂停流程并等待人工决策', icon: <UserSwitchOutlined />, color: '#b06b1d' },
]
const NODE_WIDTH = 326
const NODE_HEIGHT = 146
const CANVAS_WIDTH = 3600
const CANVAS_HEIGHT = 1800

export function WorkflowEditorWorkspace() {
  const { message } = App.useApp()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [draft, setDraft] = useState<WorkflowDefinition | null>(null)
  const [canvas, setCanvas] = useState<CanvasDraft | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [connectingFrom, setConnectingFrom] = useState<ConnectingState | null>(null)
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [runLoading, setRunLoading] = useState(false)
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null)
  const [runEvents, setRunEvents] = useState<WorkflowRunEvent[]>([])
  const [runDrawerOpen, setRunDrawerOpen] = useState(false)
  const [decisionJson, setDecisionJson] = useState('{}')
  const [resuming, setResuming] = useState(false)
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false)
  const [nodeQuery, setNodeQuery] = useState('')
  const [canvasZoom, setCanvasZoom] = useState(0.9)
  const [createForm] = Form.useForm<CreateValues>()
  const [runForm] = Form.useForm<RunValues>()
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const eventCursorRef = useRef(0)

  const selectedNode = useMemo(() => canvas?.nodes.find((node) => node.id === selectedNodeId) || null, [canvas, selectedNodeId])
  const selectedEdge = useMemo(() => canvas?.edges.find((edge) => edge.id === selectedEdgeId) || null, [canvas, selectedEdgeId])
  const filteredNodeMeta = useMemo(() => NODE_META.filter((item) => `${item.label} ${item.category} ${item.description}`.toLowerCase().includes(nodeQuery.trim().toLowerCase())), [nodeQuery])
  const nodeStatuses = useMemo(() => getNodeStatuses(runEvents), [runEvents])
  const edgeStatuses = useMemo(() => getEdgeStatuses(runEvents), [runEvents])

  const loadWorkflows = useCallback(async () => {
    setLoading(true)
    try { setWorkflows(await listWorkflows()) } catch (error) { message.error(error instanceof Error ? error.message : '加载工作流失败') } finally { setLoading(false) }
  }, [message])

  useEffect(() => {
    // Initial synchronization with the workflow API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkflows()
  }, [loadWorkflows])

  const syncRun = useCallback(async (runID: string) => {
    const [run, events] = await Promise.all([getWorkflowRun(runID), listWorkflowRunEvents(runID, eventCursorRef.current)])
    setActiveRun(run)
    if (events.length === 0) return
    eventCursorRef.current = Math.max(eventCursorRef.current, ...events.map((event) => event.sequence))
    setRunEvents((current) => mergeRunEvents(current, events))
  }, [])

  useEffect(() => {
    if (!activeRun?.id || !['running', 'waiting_for_user'].includes(activeRun.status)) return undefined
    const timer = window.setInterval(() => {
      void syncRun(activeRun.id).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [activeRun?.id, activeRun?.status, syncRun])

  async function openEditor(item: WorkflowDefinition) {
    try {
      const loaded = item.definitionJson ? item : await getWorkflow(item.id)
      setDraft(loaded)
      setCanvas(parseCanvas(loaded.definitionJson, loaded.id, loaded.version))
      setSelectedNodeId('')
      setSelectedEdgeId('')
      setConnectingFrom(null)
      setActiveRun(null)
      setRunEvents([])
      eventCursorRef.current = 0
    } catch (error) { message.error(error instanceof Error ? error.message : '打开工作流失败') }
  }

  function closeEditor() { setDraft(null); setCanvas(null); setSelectedNodeId(''); setSelectedEdgeId(''); setConnectingFrom(null); setActiveRun(null); setRunEvents([]); eventCursorRef.current = 0; setRunDrawerOpen(false) }

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
      eventCursorRef.current = 0
      setRunEvents([])
      setActiveRun(run)
      setDecisionJson('{}')
      setRunDrawerOpen(true)
      message.success(`运行已启动：${run.id || '已提交'}`)
      setRunOpen(false)
    } catch (error) { message.error(error instanceof Error ? error.message : '启动运行失败') } finally { setRunLoading(false) }
  }

  async function refreshRun() {
    if (!activeRun?.id) return
    try { await syncRun(activeRun.id); message.success('运行状态已刷新') } catch (error) { message.error(error instanceof Error ? error.message : '刷新运行状态失败') }
  }

  async function resumeRun() {
    if (!activeRun?.waitingActionId) return
    try {
      JSON.parse(decisionJson || '{}')
      setResuming(true)
      const run = await resumeWorkflow(activeRun.waitingActionId, decisionJson || '{}')
      setActiveRun(run)
      await syncRun(run.id)
      message.success('人工决策已提交')
    } catch (error) { message.error(error instanceof Error ? error.message : '提交人工决策失败') } finally { setResuming(false) }
  }

  function updateMeta(patch: Partial<Pick<WorkflowDefinition, 'name' | 'description'>>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  function updateNode(id: string, patch: Partial<EditorNode>) { setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) } : current) }
  function updateNodeConfig(id: string, key: string, value: unknown) { setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, config: { ...node.config, [key]: value } } : node) } : current) }
  function updateEdge(id: string, patch: Partial<EditorEdge>) { setCanvas((current) => current ? { ...current, edges: current.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge) } : current) }
  function deleteEdge(id: string) { setCanvas((current) => current ? { ...current, edges: current.edges.filter((edge) => edge.id !== id) } : current); setSelectedEdgeId('') }
  function deleteNode(id: string) { setCanvas((current) => current ? { ...current, nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id) } : current); setSelectedNodeId(''); setSelectedEdgeId('') }
  function addNode(type: CanvasNodeType) {
    if (!canvas) return
    const meta = NODE_META.find((item) => item.type === type)!
    const node: EditorNode = { id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type, title: meta.label, position: { x: 520 + (canvas.nodes.length % 4) * 280, y: 120 + Math.floor(canvas.nodes.length / 4) * 190 }, config: defaultNodeConfig(type) }
    setCanvas({ ...canvas, nodes: [...canvas.nodes, node] }); setSelectedNodeId(node.id); setSelectedEdgeId(''); setNodeLibraryOpen(false)
  }

  function canvasPoint(event: { clientX: number; clientY: number }) {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: (event.clientX - rect.left + canvasRef.current.scrollLeft) / canvasZoom, y: (event.clientY - rect.top + canvasRef.current.scrollTop) / canvasZoom }
  }
  function startDrag(event: React.PointerEvent<HTMLDivElement>, node: EditorNode) {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ id: node.id, dx: (event.clientX - rect.left + canvasRef.current.scrollLeft) / canvasZoom - node.position.x, dy: (event.clientY - rect.top + canvasRef.current.scrollTop) / canvasZoom - node.position.y })
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (connectingFrom) {
      setConnectingFrom((current) => current ? { ...current, current: canvasPoint(event) } : current)
      return
    }
    if (!dragging || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(20, (event.clientX - rect.left + canvasRef.current.scrollLeft) / canvasZoom - dragging.dx)
    const y = Math.max(20, (event.clientY - rect.top + canvasRef.current.scrollTop) / canvasZoom - dragging.dy)
    setCanvas((current) => current ? { ...current, nodes: current.nodes.map((node) => node.id === dragging.id ? { ...node, position: { x, y } } : node) } : current)
  }
  function finishDrag() { setDragging(null) }
  function handleNodeClick(node: EditorNode) { setSelectedNodeId(node.id); setSelectedEdgeId(''); setConnectingFrom(null) }
  function handlePortClick(node: EditorNode, branchValue?: string, role: 'source' | 'target' = 'source') {
    if (role === 'source') {
      const start = { x: node.position.x + NODE_WIDTH, y: node.type === 'condition' ? conditionBranchPortY(node, branchValue) : node.position.y + NODE_HEIGHT / 2 }
      setConnectingFrom({ sourceId: node.id, branchValue, start, current: start }); setSelectedNodeId(node.id); setSelectedEdgeId(''); return
    }
    if (!connectingFrom || connectingFrom.sourceId === node.id || !canvas) { setConnectingFrom(null); return }
    const branchWhen = connectingFrom.branchValue ? edgeWhenFromBranch(connectingFrom.sourceId, connectingFrom.branchValue) : undefined
    if (!canvas.edges.some((edge) => edge.source === connectingFrom.sourceId && edge.target === node.id && edge.when === branchWhen)) {
      setCanvas({ ...canvas, edges: [...canvas.edges, { id: `edge-${crypto.randomUUID().slice(0, 8)}`, source: connectingFrom.sourceId, target: node.id, when: branchWhen }] })
    }
    setConnectingFrom(null)
  }

  function handleCanvasBlankClick() { setSelectedNodeId(''); setSelectedEdgeId(''); setConnectingFrom(null) }

  if (draft && canvas) {
    return <><WorkflowEditorCanvas draft={draft} canvas={canvas} selectedNode={selectedNode} selectedEdge={selectedEdge} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} connectingFrom={connectingFrom} saving={saving} canvasRef={canvasRef} nodeStatuses={nodeStatuses} edgeStatuses={edgeStatuses} filteredNodeMeta={filteredNodeMeta} nodeLibraryOpen={nodeLibraryOpen} nodeQuery={nodeQuery} canvasZoom={canvasZoom} onBack={closeEditor} onMetaChange={updateMeta} onSave={() => void saveDraft()} onPublish={() => void saveDraft(true)} onRun={() => { runForm.setFieldsValue({ inputJson: '{}', message: '' }); setRunOpen(true) }} onAddNode={addNode} onSelectNode={handleNodeClick} onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(''); setConnectingFrom(null) }} onDeleteNode={deleteNode} onDeleteEdge={deleteEdge} onUpdateNode={updateNode} onUpdateConfig={updateNodeConfig} onUpdateEdge={updateEdge} onStartDrag={startDrag} onMoveDrag={moveDrag} onFinishDrag={finishDrag} onPortClick={handlePortClick} onClearSelection={handleCanvasBlankClick} onZoom={setCanvasZoom} onNodeLibraryOpen={setNodeLibraryOpen} onNodeQuery={setNodeQuery} /><Modal open={runOpen} title="试运行工作流" okText="启动" cancelText="取消" confirmLoading={runLoading} onCancel={() => setRunOpen(false)} onOk={() => void handleRun()}><Form form={runForm} layout="vertical"><Form.Item name="inputJson" label="输入 JSON" rules={[{ required: true, message: '请输入 JSON 对象' }, { validator: (_, value) => { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Promise.resolve() : Promise.reject(new Error('请输入 JSON 对象')) } catch { return Promise.reject(new Error('JSON 格式不正确')) } } }]}><Input.TextArea rows={6} /></Form.Item><Form.Item name="message" label="启动消息"><Input.TextArea rows={2} /></Form.Item></Form></Modal><Drawer title="运行调试" open={runDrawerOpen} width={560} onClose={() => setRunDrawerOpen(false)} extra={<Button icon={<ThunderboltOutlined />} onClick={() => void refreshRun()}>刷新</Button>}>{activeRun ? <div className="workflow-run-detail"><div className="workflow-run-detail-status"><Tag color={runStatusColor(activeRun.status)}>{runStatusLabel(activeRun.status)}</Tag><code>{activeRun.id}</code></div><dl><dt>版本</dt><dd>{activeRun.workflowVersion || '-'}</dd><dt>输入</dt><dd><pre>{activeRun.inputJson || '{}'}</pre></dd><dt>输出</dt><dd><pre>{activeRun.outputJson || '-'}</pre></dd><dt>错误</dt><dd>{activeRun.error || '-'}</dd><dt>等待动作</dt><dd>{activeRun.waitingActionId || '-'}</dd></dl><section className="workflow-run-events"><strong>事件时间线</strong>{runEvents.length > 0 ? <ol>{runEvents.map((event) => <li key={event.id || event.sequence}><Tag>{runtimeEventLabel(event)}</Tag><span>{event.nodeId || '-'}</span><time>{formatEventTime(event.createdAt)}</time></li>)}</ol> : <span className="workflow-run-events-empty">暂无事件</span>}</section>{activeRun.waitingActionId ? <div className="workflow-run-decision"><label>人工决策 JSON</label><Input.TextArea rows={5} value={decisionJson} onChange={(event) => setDecisionJson(event.target.value)} /><Button type="primary" loading={resuming} onClick={() => void resumeRun()}>提交决策</Button></div> : null}</div> : <Empty description="暂无运行" />}</Drawer></>
  }

  return <section className="workflow-editor-workspace agent-panel-stage">
    <header className="agent-panel-header workflow-list-header"><div><p className="eyebrow">Agent</p><h1 className="agent-panel-title">工作流编排</h1><p className="agent-panel-desc">创建工作流、配置节点与连线，并发布给触发器调用。</p></div><Space><Tooltip title="刷新"><Button icon={<ThunderboltOutlined />} onClick={() => void loadWorkflows()} /></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建工作流</Button></Space></header>
    <div className="workflow-list-body">{loading ? <div className="workflow-editor-loading"><Spin /></div> : workflows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作流" /> : <div className="workflow-list-grid">{workflows.map((item) => <article key={item.id} className="workflow-list-item" onDoubleClick={() => void openEditor(item)}><div className="workflow-list-item-main"><div className="workflow-list-item-icon"><BranchesOutlined /></div><div><strong>{item.name}</strong><p>{item.description || '暂无描述'}</p></div></div><div className="workflow-list-item-footer"><Tag color={item.status === 'published' ? 'green' : 'default'}>{item.status === 'published' ? '已发布' : '草稿'}</Tag><Space size={2}><Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => void openEditor(item)} /></Tooltip><Popconfirm title="删除工作流" description={`确定删除“${item.name}”吗？`} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void handleDelete(item.id)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space></div></article>)}</div>}</div>
    <Modal open={createOpen} title="新建工作流" okText="创建" cancelText="取消" confirmLoading={creating} onCancel={() => setCreateOpen(false)} onOk={() => void handleCreate()}><Form form={createForm} layout="vertical"><Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入工作流名称' }]}><Input placeholder="例如：客户反馈处理" /></Form.Item><Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
  </section>
}

function WorkflowEditorCanvas(props: { draft: WorkflowDefinition; canvas: CanvasDraft; selectedNode: EditorNode | null; selectedNodeId: string; connectingFrom: ConnectingState | null; saving: boolean; canvasRef: React.RefObject<HTMLDivElement | null>; nodeStatuses: Record<string, WorkflowRunNodeStatus>; edgeStatuses: Record<string, WorkflowRunEdgeStatus>; onBack: () => void; onMetaChange: (patch: Partial<Pick<WorkflowDefinition, 'name' | 'description'>>) => void; onSave: () => void; onPublish: () => void; onRun: () => void; onAddNode: (type: CanvasNodeType) => void; onSelectNode: (node: EditorNode) => void; onDeleteNode: (id: string) => void; onUpdateNode: (id: string, patch: Partial<EditorNode>) => void; onUpdateConfig: (id: string, key: string, value: unknown) => void; onReplaceConfig?: (id: string, config: Record<string, unknown>) => void; onStartDrag: (event: React.PointerEvent<HTMLDivElement>, node: EditorNode) => void; onMoveDrag: (event: React.PointerEvent<HTMLDivElement>) => void; onFinishDrag: () => void; onPortClick: (node: EditorNode, branchValue?: string, role?: 'source' | 'target') => void; selectedEdge?: EditorEdge | null; selectedEdgeId?: string; onSelectEdge?: (id: string) => void; onDeleteEdge?: (id: string) => void; onUpdateEdge?: (id: string, patch: Partial<EditorEdge>) => void; filteredNodeMeta?: NodeMeta[]; nodeLibraryOpen?: boolean; nodeQuery?: string; canvasZoom?: number; onClearSelection?: () => void; onZoom?: (value: number) => void; onNodeLibraryOpen?: (open: boolean) => void; onNodeQuery?: (query: string) => void }) {
  // Keep a single canvas implementation so the editor cannot drift between two
  // independently maintained render trees.
  return <EnhancedWorkflowCanvas {...props} />
}

type EnhancedWorkflowCanvasProps = Parameters<typeof WorkflowEditorCanvas>[0]

function EnhancedWorkflowCanvas(props: EnhancedWorkflowCanvasProps) {
  const { draft, canvas, selectedNode, selectedEdge, selectedNodeId, selectedEdgeId, connectingFrom, nodeStatuses, edgeStatuses } = props
  const zoom = props.canvasZoom || 0.9
  const nodes = new Map(canvas.nodes.map((node) => [node.id, node]))
  const edgePath = (edge: EditorEdge) => {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    if (!source || !target) return ''
    const sx = source.position.x + NODE_WIDTH
    const branchValue = branchValueFromWhen(edge.when || edge.condition)
    const sy = source.type === 'condition' ? conditionBranchPortY(source, branchValue) : source.position.y + NODE_HEIGHT / 2
    const tx = target.position.x
    const ty = target.position.y + NODE_HEIGHT / 2
    const offset = Math.max(60, Math.abs(tx - sx) * .4)
    return `M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx - offset} ${ty}, ${tx} ${ty}`
  }
  const nodeMeta = (node: EditorNode) => node.type === 'start' || node.type === 'end'
    ? { label: node.type === 'start' ? '开始' : '结束', icon: <ThunderboltOutlined />, color: '#5663c5' }
    : NODE_META.find((item) => item.type === node.type)!
  const casesFor = (node: EditorNode) => Array.isArray(node.config.cases) ? node.config.cases as Array<Record<string, unknown>> : []
  return <section className="workflow-composer-stage">
    <header className="workflow-composer-topbar"><Space><Tooltip title="返回列表"><Button type="text" icon={<ArrowLeftOutlined />} onClick={props.onBack} /></Tooltip><span className="workflow-composer-logo"><BranchesOutlined /></span><div className="workflow-composer-meta"><Space size={6}><Input value={draft.name} variant="borderless" placeholder="Workflow 名称" onChange={(event) => props.onMetaChange({ name: event.target.value })} /><Tag color={draft.status === 'published' ? 'success' : 'default'}>{draft.status === 'published' ? 'published' : 'draft'}</Tag></Space><Input value={draft.description} variant="borderless" placeholder="填写 Workflow 描述" onChange={(event) => props.onMetaChange({ description: event.target.value })} /></div></Space><Space><Button icon={<PlayCircleFilled />} onClick={props.onRun}>试运行</Button><Button icon={<SaveOutlined />} loading={props.saving} onClick={props.onSave}>保存</Button><Button type="primary" icon={<CheckCircleFilled />} loading={props.saving} onClick={props.onPublish}>发布</Button></Space></header>
    <div className="workflow-composer-body"><div className="workflow-canvas-toolbar"><Select size="small" value={String(zoom)} className="workflow-zoom-select" options={['0.5', '0.75', '0.9', '1', '1.25'].map((value) => ({ value, label: `${Number(value) * 100}%` }))} onChange={(value) => props.onZoom?.(Number(value))} /><Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => props.onNodeLibraryOpen?.(true)}>添加节点</Button><Button size="small" type="primary" className="workflow-run-button" icon={<PlayCircleFilled />} onClick={props.onRun}>试运行</Button></div>
      <div className="workflow-canvas-shell" ref={props.canvasRef} onPointerMove={props.onMoveDrag} onPointerUp={props.onFinishDrag} onPointerLeave={props.onFinishDrag} onClick={(event) => { if (event.target === event.currentTarget) props.onClearSelection?.() }}><div className="workflow-canvas-scale-space" style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}><div className="workflow-canvas-inner workflow-canvas-scale-layer" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})` }} onClick={(event) => { if (event.target === event.currentTarget) props.onClearSelection?.() }}>
        <svg className="workflow-edge-layer" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}><defs><marker id="workflow-edge-arrow-enhanced" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto"><path d="M 3 2.5 L 9 6 L 3 9.5" /></marker></defs>{canvas.edges.map((edge) => { const path = edgePath(edge); if (!path) return null; const status = edgeStatuses[edge.id]; return <g key={edge.id}><path d={path} className={`workflow-edge-hit${selectedEdgeId === edge.id ? ' is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); props.onSelectEdge?.(edge.id) }} /><path d={path} className={`workflow-edge-path${selectedEdgeId === edge.id ? ' is-selected' : ''}${status ? ` is-run-${status}` : ''}`} markerEnd="url(#workflow-edge-arrow-enhanced)" /></g> })}{connectingFrom ? <path d={`M ${connectingFrom.start.x} ${connectingFrom.start.y} C ${connectingFrom.start.x + 70} ${connectingFrom.start.y}, ${connectingFrom.current.x - 70} ${connectingFrom.current.y}, ${connectingFrom.current.x} ${connectingFrom.current.y}`} className="workflow-edge-path is-preview" markerEnd="url(#workflow-edge-arrow-enhanced)" /> : null}</svg>
        {canvas.nodes.map((node) => { const meta = nodeMeta(node); const runtimeStatus = nodeStatuses[node.id]; const cases = casesFor(node); return <div key={node.id} className={`workflow-editor-node${selectedNodeId === node.id ? ' is-selected' : ''}${connectingFrom?.sourceId === node.id ? ' is-connecting' : ''}${runtimeStatus ? ` is-run-${runtimeStatus}` : ''}`} style={{ left: node.position.x, top: node.position.y, borderTopColor: meta.color }} onClick={(event) => { event.stopPropagation(); props.onSelectNode(node) }} onPointerDown={(event) => props.onStartDrag(event, node)}>
          {node.type !== 'start' ? <button type="button" className="workflow-node-port workflow-node-port-in" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => { event.stopPropagation(); props.onPortClick(node, undefined, 'target') }} onMouseUp={(event) => { event.stopPropagation(); props.onPortClick(node, undefined, 'target') }} aria-label={`连接到${node.title}`} /> : null}
          <div className="workflow-editor-node-head"><span style={{ background: meta.color }}>{meta.icon}</span><strong>{node.title}</strong><small>{meta.label}</small></div>
          {node.type === 'condition' ? <div className="workflow-condition-body">{cases.map((item, index) => { const branchValue = String(item.value || item.label || `分支 ${index + 1}`); return <div key={`${branchValue}-${index}`}><span>{String(item.label || `分支 ${index + 1}`)}</span><em>{branchValue}</em><button type="button" className="workflow-condition-port" onPointerDown={(event) => { event.stopPropagation(); props.onPortClick(node, branchValue, 'source') }} onMouseDown={(event) => { event.stopPropagation(); props.onPortClick(node, branchValue, 'source') }} aria-label={`从${node.title}的${branchValue}分支连线`} /></div> })}</div> : <div className="workflow-editor-node-summary">{summaryForNode(node).map((row) => <div key={row[0]}><span>{row[0]}</span><em>{row[1]}</em></div>)}</div>}
          {runtimeStatus ? <div className="workflow-node-run-state"><Tag color={runtimeStatus === 'success' ? 'success' : runtimeStatus === 'running' ? 'processing' : runtimeStatus === 'failed' ? 'error' : 'warning'} icon={<CheckCircleFilled />}>{runtimeStatus}</Tag><DownOutlined /></div> : null}
          {node.type !== 'condition' && node.type !== 'end' ? <button type="button" className="workflow-node-port workflow-node-port-out" onPointerDown={(event) => { event.stopPropagation(); props.onPortClick(node, undefined, 'source') }} onMouseDown={(event) => { event.stopPropagation(); props.onPortClick(node, undefined, 'source') }} aria-label={`从${node.title}连线`} /> : null}
        </div> })}
      </div></div></div>
      {props.nodeLibraryOpen ? <><button type="button" className="workflow-node-library-backdrop" aria-label="关闭节点库" onClick={() => props.onNodeLibraryOpen?.(false)} /><aside className="workflow-node-library"><div className="workflow-node-library-head"><Input prefix={<SearchOutlined />} value={props.nodeQuery || ''} onChange={(event) => props.onNodeQuery?.(event.target.value)} placeholder="搜索节点、插件、工作流" /><Button type="text" icon={<CloseOutlined />} onClick={() => props.onNodeLibraryOpen?.(false)} /></div>{Array.from(new Set((props.filteredNodeMeta || []).map((item) => item.category))).map((category) => <section key={category}><Typography.Text type="secondary">{category}</Typography.Text><div className="workflow-node-library-grid">{(props.filteredNodeMeta || []).filter((item) => item.category === category).map((item) => <button type="button" key={item.type} onClick={() => props.onAddNode(item.type)}><span style={{ background: item.color }}>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div></section>)}</aside></> : null}
      {selectedEdge ? <WorkflowEdgeInspector edge={selectedEdge} nodes={canvas.nodes} onDelete={() => props.onDeleteEdge?.(selectedEdge.id)} onUpdate={(patch) => props.onUpdateEdge?.(selectedEdge.id, patch)} /> : selectedNode ? <WorkflowInspector node={selectedNode} onDelete={() => props.onDeleteNode(selectedNode.id)} onUpdateTitle={(title) => props.onUpdateNode(selectedNode.id, { title })} onUpdateConfig={(key, value) => props.onUpdateConfig(selectedNode.id, key, value)} onReplaceConfig={(config) => props.onReplaceConfig?.(selectedNode.id, config)} /> : <aside className="workflow-inspector workflow-inspector-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择节点或连线查看配置" /></aside>}
    </div>
  </section>
}

function WorkflowEdgeInspector({ edge, nodes, onDelete, onUpdate }: { edge: EditorEdge; nodes: EditorNode[]; onDelete: () => void; onUpdate: (patch: Partial<EditorEdge>) => void }) {
  return <aside className="workflow-inspector"><div className="workflow-inspector-head"><div><span className="workflow-inspector-icon" style={{ background: '#64748b' }}><BranchesOutlined /></span><div><strong>连线配置</strong><small>{edge.id}</small></div></div><Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete} /></div><label>起点</label><Select className="workflow-inspector-full" value={edge.source} options={nodes.map((node) => ({ value: node.id, label: node.title }))} onChange={(source) => onUpdate({ source })} /><label>终点</label><Select className="workflow-inspector-full" value={edge.target} options={nodes.map((node) => ({ value: node.id, label: node.title }))} onChange={(target) => onUpdate({ target })} /><label>条件表达式</label><Input value={edge.when || edge.condition || ''} placeholder="可选，例如 equals yes" onChange={(event) => onUpdate({ when: event.target.value, condition: '' })} /><p className="workflow-inspector-note">选中连线后可调整起点、终点和条件分支。</p></aside>
}

function WorkflowInspector({ node, onDelete, onUpdateTitle, onUpdateConfig, onReplaceConfig }: { node: EditorNode; onDelete: () => void; onUpdateTitle: (value: string) => void; onUpdateConfig: (key: string, value: unknown) => void; onReplaceConfig?: (config: Record<string, unknown>) => void }) {
  const meta = NODE_META.find((item) => item.type === node.type)
  return <aside className="workflow-inspector"><div className="workflow-inspector-head"><div><span className="workflow-inspector-icon" style={{ background: meta?.color || '#5663c5' }}>{meta?.icon || <ThunderboltOutlined />}</span><div><strong>{node.title}</strong><small>{meta?.label || (node.type === 'start' ? '开始' : '结束')}</small></div></div><Button type="text" danger icon={<DeleteOutlined />} onClick={onDelete} /></div><label>节点名称</label><Input prefix={<EditOutlined />} value={node.title} onChange={(event) => onUpdateTitle(event.target.value)} /> <EnhancedNodeConfigFields node={node} onUpdate={onUpdateConfig} onReplaceConfig={onReplaceConfig} /></aside>
}

function EnhancedNodeConfigFields({ node, onUpdate, onReplaceConfig }: { node: EditorNode; onUpdate: (key: string, value: unknown) => void; onReplaceConfig?: (config: Record<string, unknown>) => void }) {
  const config = node.config
  const text = (key: string, fallback = '') => String(config[key] ?? fallback)
  const json = (key: string, fallback: unknown) => JSON.stringify(config[key] ?? fallback, null, 2)
  const setJSON = (key: string, value: string) => { try { onUpdate(key, JSON.parse(value || '{}')) } catch { /* keep editing until valid */ } }
  if (node.type === 'start') return <><label>入参字段</label><Input.TextArea rows={5} value={json('fields', [{ name: 'query', type: 'string', required: true }])} onChange={(event) => setJSON('fields', event.target.value)} /><p className="workflow-inspector-note">工作流输入会作为 workflow input 传入后续节点。</p><label>高级 JSON</label><Input.TextArea rows={5} value={JSON.stringify(config, null, 2)} onChange={(event) => { try { onReplaceConfig?.(JSON.parse(event.target.value || '{}')) } catch { /* keep editing until valid */ } }} /></>
  if (node.type === 'end') return <><label>输出映射</label><Input.TextArea rows={5} value={json('output', { result: '{{input}}' })} onChange={(event) => setJSON('output', event.target.value)} /><p className="workflow-inspector-note">结束节点输出将作为工作流运行结果返回。</p></>
  if (node.type === 'agent') return <><label>模型</label><Select className="workflow-inspector-full" value={text('model', text('agent', 'claude_llm'))} options={[{ label: 'Claude Agent', value: 'claude_llm' }, { label: 'Claude Opus', value: 'claude-opus-4-6' }, { label: 'Claude Haiku', value: 'claude-3-5-haiku-20241022' }]} onChange={(value) => onUpdate('model', value)} /><label>输入变量 JSON</label><Input.TextArea rows={4} value={json('input_variables', [{ name: 'input', value: '{{input.message}}' }])} onChange={(event) => setJSON('input_variables', event.target.value)} /><label>系统提示词</label><Input.TextArea rows={4} value={text('system_prompt', '你是一个可靠的中文助手。')} onChange={(event) => onUpdate('system_prompt', event.target.value)} /><label>用户提示词</label><Input.TextArea rows={5} value={text('user_prompt', '{{input.message}}')} placeholder="使用 {{变量}} 引用输入变量" onChange={(event) => onUpdate('user_prompt', event.target.value)} /><label>输出映射</label><Input.TextArea rows={4} value={json('output', { text: 'text', model: 'model' })} onChange={(event) => setJSON('output', event.target.value)} /><label>最大轮次</label><InputNumber min={1} max={100} className="workflow-inspector-full" value={Number(config.max_turns ?? 10)} onChange={(value) => onUpdate('max_turns', value || 10)} /><label>允许工具 JSON</label><Input.TextArea rows={3} value={json('allowed_tools', [])} onChange={(event) => setJSON('allowed_tools', event.target.value)} /></>
  if (node.type === 'transform') return <><label>转换操作</label><Select className="workflow-inspector-full" value={text('operation', 'template')} options={[{ label: '模板映射', value: 'template' }, { label: '字段选择', value: 'pick' }, { label: '合并对象', value: 'merge' }, { label: '表达式', value: 'expression' }]} onChange={(value) => onUpdate('operation', value)} /><label>输入模板</label><Input.TextArea rows={5} value={text('input', '{{input}}')} onChange={(event) => onUpdate('input', event.target.value)} /><label>字段/表达式 JSON</label><Input.TextArea rows={5} value={json('fields', {})} onChange={(event) => setJSON('fields', event.target.value)} /><label>输出映射</label><Input.TextArea rows={4} value={json('output', {})} onChange={(event) => setJSON('output', event.target.value)} /></>
  if (node.type === 'condition') return <EnhancedConditionNodeConfig node={node} onUpdate={onUpdate} />
  if (node.type === 'http') return <><label>请求</label><div className="workflow-inspector-two-col"><Select value={text('method', 'GET')} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value }))} onChange={(value) => onUpdate('method', value)} /><InputNumber min={100} step={1000} addonAfter="ms" value={Number(config.timeout_ms ?? 30000)} onChange={(value) => onUpdate('timeout_ms', value || 30000)} /></div><Input value={text('url')} placeholder="https://api.example.com 或 {{nodes.xxx.output.url}}" onChange={(event) => onUpdate('url', event.target.value)} /><label>请求头 JSON</label><Input.TextArea rows={4} value={json('headers', {})} onChange={(event) => setJSON('headers', event.target.value)} /><label>请求体</label><Select className="workflow-inspector-full" value={text('body_type', 'json')} options={[{ label: 'JSON', value: 'json' }, { label: '原始文本', value: 'raw' }]} onChange={(value) => onUpdate('body_type', value)} /><Input.TextArea rows={5} value={text('body', '{}')} onChange={(event) => onUpdate('body', event.target.value)} /><label>输出映射 JSON</label><Input.TextArea rows={4} value={json('output', { status: 'status', status_code: 'status_code', ok: 'ok', response_json: 'response_json' })} onChange={(event) => setJSON('output', event.target.value)} /></>
  return <><label>确认标题</label><Input value={text('title', node.title)} onChange={(event) => onUpdate('title', event.target.value)} /><label>确认文案</label><Input.TextArea rows={4} value={text('message', '请确认是否继续执行后续节点。')} onChange={(event) => onUpdate('message', event.target.value)} /><label>操作选项 JSON</label><Input.TextArea rows={5} value={json('options', [{ label: '通过', value: 'approve' }, { label: '拒绝', value: 'reject' }])} onChange={(event) => setJSON('options', event.target.value)} /><label>输入字段 JSON</label><Input.TextArea rows={6} value={json('fields', [])} onChange={(event) => setJSON('fields', event.target.value)} /></>
}

function EnhancedConditionNodeConfig({ node, onUpdate }: { node: EditorNode; onUpdate: (key: string, value: unknown) => void }) {
  const input = String(node.config.input || '{{input}}')
  const cases = Array.isArray(node.config.cases) ? node.config.cases as Array<Record<string, unknown>> : []
  const rows = cases.length > 0 ? cases : [{ label: '如果', value: 'yes', when: `${input} == "yes"` }]
  const parseRule = (item: Record<string, unknown>) => {
    const expression = String(item.when || '')
    const matched = expression.match(/^(.*?)\s+(contains|not contains|==|!=|>=|<=|>|<)\s+["']?(.*?)["']?$/)
    return { operator: matched?.[2] || '==', match: matched?.[3]?.replace(/["']$/, '') || String(item.value || '') }
  }
  const updateRow = (index: number, patch: Record<string, unknown>) => {
    const next = rows.map((item, rowIndex) => {
      if (rowIndex !== index) return item
      const current = { ...item, ...patch }
      const rule = parseRule(current)
      const value = String(current.value || current.label || `分支 ${index + 1}`)
      const operator = String(current.operator || rule.operator)
      const match = String(current.match ?? rule.match)
      const when = operator === 'contains' || operator === 'not contains' ? `${input.includes('{{') ? input : '{{input}}'} ${operator} "${match}"` : `${input} ${operator} ${JSON.stringify(match)}`
      return { ...current, value, when }
    })
    onUpdate('cases', next)
  }
  return <><label>判断输入</label><Input value={input} onChange={(event) => onUpdate('input', event.target.value)} /><label>条件分支</label><div className="workflow-config-list">{rows.map((item, index) => { const rule = parseRule(item); return <div className="workflow-condition-editor" key={`condition-editor-${index}`}><div className="workflow-config-row"><Input placeholder="分支名称" value={String(item.label || `分支 ${index + 1}`)} onChange={(event) => updateRow(index, { label: event.target.value })} /><Input placeholder="分支值" value={String(item.value || '')} onChange={(event) => updateRow(index, { value: event.target.value })} /><Select value={rule.operator} options={['==', '!=', 'contains', 'not contains', '>', '>=', '<', '<='].map((value) => ({ value, label: value }))} onChange={(operator) => updateRow(index, { operator })} /><Button size="small" danger icon={<DeleteOutlined />} disabled={rows.length === 1} onClick={() => onUpdate('cases', rows.filter((_, rowIndex) => rowIndex !== index))} /></div><Input placeholder="匹配值" value={rule.match} onChange={(event) => updateRow(index, { match: event.target.value })} /></div> })}</div><Button icon={<PlusOutlined />} onClick={() => onUpdate('cases', [...rows, { label: `否则如果 ${rows.length}`, value: `branch-${rows.length + 1}`, when: `${input} == ""` }])}>添加分支</Button><label>否则分支</label><Input value={String(node.config.default || '否则')} onChange={(event) => onUpdate('default', event.target.value)} /><p className="workflow-inspector-note">每条出边可选择一个分支；未匹配时使用“否则”分支。</p></>
}

function edgeWhenFromBranch(nodeId: string, branchValue: string): string {
  return `{{nodes.${nodeId}.output.value}} == ${JSON.stringify(branchValue.trim())}`
}

function branchValueFromWhen(value?: string): string | undefined {
  if (!value) return undefined
  const matched = value.match(/==\s*["']([^"']+)["']\s*$/)
  return matched?.[1]
}

function conditionBranchPortY(node: EditorNode, branchValue?: string): number {
  const cases = Array.isArray(node.config.cases) ? node.config.cases as Array<Record<string, unknown>> : []
  const index = branchValue ? Math.max(0, cases.findIndex((item) => String(item.value || item.label || '') === branchValue)) : 0
  return node.position.y + 58 + index * 30
}

function defaultNodeConfig(type: CanvasNodeType): Record<string, unknown> {
  if (type === 'agent') return { agent: 'claude_llm', input: { message: '{{input.message}}' }, user_prompt: '{{input.message}}', max_turns: 10 }
  if (type === 'http') return { method: 'GET', url: '', body: '{}' }
  if (type === 'condition') return { input: '{{input}}', cases: [{ label: '如果', when: '{{input}} == "yes"', value: 'yes' }], default: 'default' }
  if (type === 'human') return { title: '需要人工确认', fields: [] }
  return { input: '{{input}}', output: '{{input}}' }
}
function defaultCanvas(id: string): CanvasDraft { return { id, version: 1, nodes: [{ id: 'start', type: 'start', title: '开始', position: { x: 80, y: 270 }, config: {} }, { id: 'agent-1', type: 'agent', title: 'Agent', position: { x: 420, y: 270 }, config: defaultNodeConfig('agent') }, { id: 'end', type: 'end', title: '结束', position: { x: 800, y: 270 }, config: {} }], edges: [{ id: 'edge-start-agent', source: 'start', target: 'agent-1' }, { id: 'edge-agent-end', source: 'agent-1', target: 'end' }] } }
function parseCanvas(raw: string, id: string, version: number): CanvasDraft { try { const value = JSON.parse(raw || '{}') as Partial<CanvasDraft>; if (Array.isArray(value.nodes) && Array.isArray(value.edges)) return { id: value.id || id, version: value.version || version || 1, nodes: value.nodes.map((node, index) => ({ ...node, position: node.position || { x: 100 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 190 }, config: node.config || {} })) as EditorNode[], edges: value.edges as EditorEdge[] } } catch { /* use default below */ } return defaultCanvas(id) }
function summaryForNode(node: EditorNode): Array<[string, string]> { if (node.type === 'agent') return [['Agent', String(node.config.agent || 'claude_llm')], ['提示词', String(node.config.user_prompt || '{{input.message}}')]]; if (node.type === 'http') return [['Method', String(node.config.method || 'GET')], ['URL', String(node.config.url || '未配置')]]; if (node.type === 'condition') return [['分支', `${Array.isArray(node.config.cases) ? node.config.cases.length : 0} 条`]]; if (node.type === 'human') return [['动作', '等待人工']]; const rows: Array<[string, string]> = [['类型', node.type === 'transform' ? '数据转换' : node.type === 'start' ? '工作流入口' : node.type === 'end' ? '工作流出口' : '']]; return rows.filter((row) => row[1]) }
function runStatusLabel(value: string): string { return value === 'completed' ? '已完成' : value === 'failed' ? '失败' : value === 'waiting_for_user' ? '等待人工' : value === 'running' ? '运行中' : value || '未知' }
function runStatusColor(value: string): string { return value === 'completed' ? 'green' : value === 'failed' ? 'red' : value === 'waiting_for_user' ? 'orange' : 'blue' }

function mergeRunEvents(current: WorkflowRunEvent[], incoming: WorkflowRunEvent[]): WorkflowRunEvent[] {
  const bySequence = new Map(current.map((event) => [event.sequence, event]))
  incoming.forEach((event) => bySequence.set(event.sequence, event))
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}

function parseEventData(event: WorkflowRunEvent): Record<string, unknown> {
  try {
    const data = JSON.parse(event.dataJson || '{}')
    return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
  } catch { return {} }
}

function getNodeStatuses(events: WorkflowRunEvent[]): Record<string, WorkflowRunNodeStatus> {
  return events.reduce<Record<string, WorkflowRunNodeStatus>>((statuses, event) => {
    if (!event.nodeId) return statuses
    if (event.type === 'node.ready') statuses[event.nodeId] = 'pending'
    if (event.type === 'node.started') statuses[event.nodeId] = 'running'
    if (event.type === 'human.required' || event.type === 'run.waiting') statuses[event.nodeId] = 'waiting'
    if (event.type === 'node.finished') {
      const status = String(parseEventData(event).status || '')
      if (status === 'success' || status === 'failed' || status === 'waiting' || status === 'skipped') statuses[event.nodeId] = status
    }
    return statuses
  }, {})
}

function getEdgeStatuses(events: WorkflowRunEvent[]): Record<string, WorkflowRunEdgeStatus> {
  return events.reduce<Record<string, WorkflowRunEdgeStatus>>((statuses, event) => {
    if (event.type !== 'edge.updated') return statuses
    const data = parseEventData(event)
    const edgeID = typeof data.edge_id === 'string' ? data.edge_id : ''
    const status = typeof data.status === 'string' ? data.status : ''
    if (edgeID && (status === 'inactive' || status === 'active' || status === 'skipped')) statuses[edgeID] = status
    return statuses
  }, {})
}

function runtimeEventLabel(event: WorkflowRunEvent): string {
  return ({ 'run.started': '已启动', 'run.resumed': '已恢复', 'run.finished': '已完成', 'run.failed': '运行失败', 'node.ready': '待执行', 'node.started': '执行中', 'node.retrying': '重试中', 'node.finished': '节点完成', 'edge.updated': '连线更新', 'human.required': '等待人工', 'run.waiting': '已暂停' }[event.type] || event.type)
}

function formatEventTime(value: number): string {
  if (!value) return '-'
  const milliseconds = value < 100_000_000_000 ? value * 1000 : value
  return new Date(milliseconds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
