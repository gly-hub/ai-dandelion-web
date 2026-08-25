import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { BugOutlined, CloseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Modal, Pagination, Spin, Tag, Tooltip, Typography } from 'antd'
import { getFunctionExecutionLog, listFunctionExecutionLogs } from '../../lib/funcOperationApi'
import type { FunctionExecutionLog, FunctionExecutionLogEvent } from '../../types'

interface PreviewDebugLogFloatProps {
  functionId: string
  functionName?: string
  previewSessionKey: string
}

interface Position { left: number; top: number }

const PAGE_SIZE = 20

export function PreviewDebugLogFloat({ functionId, functionName, previewSessionKey }: PreviewDebugLogFloatProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const pageRef = useRef(1)
  const queryRef = useRef('')
  const sessionStartedAtRef = useRef(0)
  const [position, setPosition] = useState<Position>({ left: 0, top: 0 })
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<FunctionExecutionLog[]>([])
  const [selected, setSelected] = useState<FunctionExecutionLog | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (nextPage = page) => {
    if (!functionId) return
    setLoading(true)
    try {
      const result = await listFunctionExecutionLogs(functionId, { page: nextPage, limit: PAGE_SIZE, query: queryRef.current, invocationType: 'preview', startTime: sessionStartedAtRef.current })
      setLogs(result.logs)
      setTotal(result.total)
      setPage(nextPage)
      pageRef.current = nextPage
      setSelected((current) => current ? result.logs.find((item) => item.id === current.id) || current : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    sessionStartedAtRef.current = Date.now() * 1000
    setLogs([])
    setTotal(0)
    setPage(1)
    pageRef.current = 1
    setSelected(null)
  }, [previewSessionKey, functionId])

  useEffect(() => {
    void load(open ? pageRef.current : 1)
    const timer = window.setInterval(() => void load(open ? pageRef.current : 1), 5000)
    return () => window.clearInterval(timer)
  }, [open, functionId, previewSessionKey])

  queryRef.current = query

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left - position.left, offsetY: event.clientY - rect.top - position.top, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    const container = containerRef.current
    if (!drag || !container || drag.pointerId !== event.pointerId) return
    const rect = container.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.width - 52, event.clientX - rect.left - drag.offsetX))
    const top = Math.max(8, Math.min(rect.height - 52, event.clientY - rect.top - drag.offsetY))
    if (Math.abs(left - position.left) > 3 || Math.abs(top - position.top) > 3) drag.moved = true
    setPosition({ left, top })
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.moved) setOpen(true)
  }

  const openDetail = async (item: FunctionExecutionLog) => {
    if (selected?.id === item.id) return setSelected(null)
    setSelected(item)
    try { setSelected(await getFunctionExecutionLog(functionId, item.id)) } catch { /* retain row data */ }
  }

  return <div ref={containerRef} className="preview-debug-log-layer">
    <Tooltip title="打开调试日志">
      <button type="button" className="preview-debug-log-fab" style={{ left: position.left || undefined, top: position.top || undefined }} aria-label="打开调试日志" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        <BugOutlined />
        {total > 0 ? <span className="preview-debug-log-fab-count">{total > 99 ? '99+' : total}</span> : null}
      </button>
    </Tooltip>
    <Modal title={<span className="preview-debug-log-title"><BugOutlined /> 调试日志{functionName ? ` · ${functionName}` : ''}</span>} open={open} onCancel={() => setOpen(false)} footer={null} width={860} destroyOnHidden>
      <div className="preview-debug-log-modal">
        <div className="preview-debug-log-toolbar">
          <Input value={query} allowClear prefix={<SearchOutlined />} placeholder="搜索调试日志" onChange={(event) => setQuery(event.target.value)} onPressEnter={() => void load(1)} />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void load(1)}>查询</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load(page)} aria-label="刷新调试日志" />
        </div>
        {loading && !logs.length ? <div className="preview-debug-log-loading"><Spin size="small" /></div> : null}
        {!loading && !logs.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调试日志" /> : null}
        {logs.length ? <div className="preview-debug-log-list">{logs.map((item) => <div className={`preview-debug-log-entry ${selected?.id === item.id ? 'is-expanded' : ''}`} key={item.id}>
          <button type="button" className="preview-debug-log-row" aria-expanded={selected?.id === item.id} onClick={() => void openDetail(item)}>
            <Tag color={item.status === 'succeeded' ? 'green' : 'red'}>{item.status === 'succeeded' ? '成功' : '失败'}</Tag>
            <span className="preview-debug-log-row-message">{item.errorMessage || firstLogLine(item.logs) || '执行完成'}</span>
            <time>{formatTime(item.createdAt)}</time><span>{item.durationMs} ms</span>
          </button>
          {selected?.id === item.id ? <PreviewDebugLogDetail item={selected} onClose={() => setSelected(null)} /> : null}
        </div>)}</div> : null}
        {total > PAGE_SIZE ? <div className="preview-debug-log-pagination"><Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} showTotal={(count) => `共 ${count} 条`} onChange={(nextPage) => void load(nextPage)} /></div> : null}
      </div>
    </Modal>
  </div>
}

function PreviewDebugLogDetail({ item, onClose }: { item: FunctionExecutionLog; onClose: () => void }) {
  const events = businessLogEvents(item.logs)
  return <section className="preview-debug-log-detail"><header><Typography.Text strong>日志详情</Typography.Text><Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="收起日志详情" /></header><Typography.Text type="secondary">{formatTime(item.createdAt)} · {item.durationMs} ms · Request ID {item.requestId || '未记录'}</Typography.Text><div className="function-log-console" role="log" aria-label="调试控制台日志">{events.length ? events.map((event, index) => <div className={`function-log-console-line ${event.stream === 'stderr' ? 'stderr' : 'stdout'}`} key={`${event.timestamp}-${index}`}><time>{formatConsoleTime(event.timestamp)}</time><Tag>{event.stream || 'runtime'}</Tag><code>{event.content}</code></div>) : <div className="function-log-console-empty">该次调试尚未输出业务日志</div>}</div></section>
}

function firstLogLine(events: FunctionExecutionLogEvent[]): string { return businessLogEvents(events).map((event) => event.content.trim()).find(Boolean) || '' }
function businessLogEvents(events: FunctionExecutionLogEvent[]): FunctionExecutionLogEvent[] { return events.filter((event) => !/^WASM invocation (started|completed|failed)/.test(event.content.trim())) }
function formatConsoleTime(timestamp: number): string { return timestamp ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(new Date(Math.floor(timestamp / 1000))) : '--:--:--.---' }
function formatTime(timestamp: number): string { return timestamp ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(Math.floor(timestamp / 1000))) : '-' }
