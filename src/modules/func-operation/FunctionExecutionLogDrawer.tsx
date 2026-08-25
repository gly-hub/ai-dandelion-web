import { useEffect, useMemo, useState } from 'react'
import { CloseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Drawer, Empty, Input, Pagination, Select, Spin, Tag, Tooltip, Typography } from 'antd'
import { getFunctionExecutionLog, listFunctionExecutionLogs } from '../../lib/funcOperationApi'
import type { FunctionExecutionLog, FunctionExecutionLogEvent, OperationFunction } from '../../types'

interface FunctionExecutionLogDrawerProps {
  functionItem: OperationFunction | null
  open: boolean
  onClose: () => void
}

export function FunctionExecutionLogDrawer({ functionItem, open, onClose }: FunctionExecutionLogDrawerProps) {
  const [logs, setLogs] = useState<FunctionExecutionLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<FunctionExecutionLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
	const [requestId, setRequestId] = useState('')
  const [status, setStatus] = useState('')
  const [invocationType, setInvocationType] = useState('')

  const load = async (nextPage = 1) => {
    if (!functionItem) return
    setLoading(true)
    setSelected(null)
    try {
      const result = await listFunctionExecutionLogs(functionItem.id, { page: nextPage, limit: 20, query, requestId, status, invocationType })
      setLogs(result.logs)
      setTotal(result.total)
      setPage(nextPage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open, functionItem?.id])

  const events = useMemo(() => selected ? businessLogEvents(selected.logs) : [], [selected])
  const openDetail = async (item: FunctionExecutionLog) => {
    if (selected?.id === item.id) {
      setSelected(null)
      return
    }
    setSelected(item)
    if (!functionItem) return
    try {
      setSelected(await getFunctionExecutionLog(functionItem.id, item.id))
    } catch {
      // Keep the complete list entry visible when a detail fetch races with cleanup.
    }
  }

  return <Drawer title={`运行日志${functionItem ? ` · ${functionItem.name}` : ''}`} open={open} onClose={onClose} width={920} destroyOnHidden>
    <div className="function-log-explorer">
      <div className="function-log-explorer-query">
        <Input value={query} allowClear placeholder="搜索日志内容、错误代码或错误信息" prefix={<SearchOutlined />} onChange={(event) => setQuery(event.target.value)} onPressEnter={() => void load(1)} />
		<Input value={requestId} allowClear placeholder="按 Request ID 精确查询" onChange={(event) => setRequestId(event.target.value)} onPressEnter={() => void load(1)} />
        <Select value={status} onChange={setStatus} options={[{ value: '', label: '全部状态' }, { value: 'succeeded', label: '成功' }, { value: 'failed', label: '失败' }]} />
        <Select value={invocationType} onChange={setInvocationType} options={[{ value: '', label: '全部调用' }, { value: 'published', label: '正式运行' }, { value: 'preview', label: '预览运行' }]} />
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void load(1)}>查询</Button>
		<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load(page)} aria-label="刷新日志" />
      </div>
      {loading && !logs.length ? <div className="function-log-explorer-loading"><Spin size="small" /></div> : null}
      {!loading && !logs.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的运行日志" /> : null}
      {logs.length ? <div className="function-log-explorer-list">
        {logs.map((item) => <div className={`function-log-explorer-entry ${selected?.id === item.id ? 'is-expanded' : ''}`} key={item.id}>
          <button className="function-log-explorer-row" type="button" aria-expanded={selected?.id === item.id} onClick={() => void openDetail(item)}>
            <span className="function-log-explorer-row-summary"><Tag color={item.status === 'succeeded' ? 'green' : 'red'}>{item.status === 'succeeded' ? '成功' : '失败'}</Tag><strong>{item.invocationType === 'preview' ? '预览运行' : '正式运行'}</strong><time>{formatTime(item.createdAt)}</time></span>
            <span className="function-log-explorer-row-message">{item.errorMessage || firstLogLine(item.logs) || '执行完成'}</span>
			<span className="function-log-explorer-row-request-id" title={item.requestId}>{item.requestId || '-'}</span>
			<span className="function-log-explorer-row-duration">{item.durationMs} ms</span>
          </button>
          {selected?.id === item.id ? <LogDetail item={selected} events={events} onClose={() => setSelected(null)} /> : null}
        </div>)}
      </div> : null}
      {total > 20 ? <div className="function-log-explorer-pagination"><Pagination current={page} pageSize={20} total={total} showSizeChanger={false} showTotal={(count) => `共 ${count} 条`} onChange={(nextPage) => void load(nextPage)} /></div> : null}
    </div>
  </Drawer>
}

interface LogDetailProps {
  item: FunctionExecutionLog
  events: FunctionExecutionLogEvent[]
  onClose: () => void
}

function LogDetail({ item, events, onClose }: LogDetailProps) {
  return <section className="function-log-explorer-detail" aria-label="日志详情">
    <header><Typography.Text strong>日志详情</Typography.Text><Tooltip title="收起详情"><Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} aria-label="收起日志详情" /></Tooltip></header>
    <div className="function-log-explorer-detail-meta"><Tag color={item.status === 'succeeded' ? 'green' : 'red'}>{item.status === 'succeeded' ? '成功' : '失败'}</Tag><Typography.Text type="secondary">{formatTime(item.createdAt)} · {item.durationMs} ms · {item.version || '未标记版本'}</Typography.Text></div>
	<div className="function-log-explorer-request-id"><Typography.Text type="secondary">Request ID</Typography.Text><Typography.Text code copyable={item.requestId ? { text: item.requestId } : false}>{item.requestId || '未记录（历史执行）'}</Typography.Text></div>
    {item.errorMessage ? <Typography.Paragraph type="danger">{item.errorMessage}</Typography.Paragraph> : null}
	<div className="function-log-console" role="log" aria-label="WASM 控制台日志">
		{events.length ? events.map((event, index) => <div className={`function-log-console-line ${event.stream === 'stderr' ? 'stderr' : 'stdout'}`} key={`${event.timestamp}-${index}`}><time>{formatConsoleTime(event.timestamp)}</time><Tag>{event.stream || 'runtime'}</Tag><code>{event.content}</code></div>) : <div className="function-log-console-empty">该版本尚未输出业务日志</div>}
	</div>
    {item.logsTruncated ? <Typography.Text type="warning">日志已达到单次保留上限，内容已截断。</Typography.Text> : null}
  </section>
}

function firstLogLine(events: FunctionExecutionLogEvent[]): string {
  return businessLogEvents(events).map((event) => event.content.trim()).find(Boolean) || ''
}

function businessLogEvents(events: FunctionExecutionLogEvent[]): FunctionExecutionLogEvent[] {
  return events.filter((event) => !/^WASM invocation (started|completed|failed)/.test(event.content.trim()))
}

function formatConsoleTime(timestamp: number): string {
  return timestamp ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(new Date(Math.floor(timestamp / 1000))) : '--:--:--.---'
}

function formatTime(timestamp: number): string {
  return timestamp ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(Math.floor(timestamp / 1000))) : '-'
}
