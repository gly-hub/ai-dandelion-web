import { AbstractChatProvider } from '@ant-design/x-sdk'
import type { TransformMessage, XRequestOptions } from '@ant-design/x-sdk'
import { AbstractXRequestClass } from '@ant-design/x-sdk'
import type { XRequestCallbacks } from '@ant-design/x-sdk'
import type { AgentEvent, ChatExtraItem, ChatMessage, MessagePart, PersistedMessage, StreamChunk } from '../types'
import { asRecord, authHeaders, normalizeMessage } from './api'

export interface ChatInput {
  content: string
  modelId?: string
  agentSessionConfigType?: string
  systemPrompt?: string
  permissionMode?: string
  maxTurns?: number
  extra?: ChatExtraItem[]
  messageParts?: MessagePart[]
}

export type AgentRuntimeConfig = Partial<
  Pick<ChatInput, 'agentSessionConfigType' | 'systemPrompt' | 'permissionMode' | 'maxTurns'>
>

export class AiAgentStreamProvider extends AbstractChatProvider<ChatMessage, ChatInput, StreamChunk> {
  private getModelId: () => string | undefined
  private getRuntimeConfig: () => AgentRuntimeConfig

  constructor(options: {
    request: ConstructorParameters<typeof AbstractChatProvider<ChatMessage, ChatInput, StreamChunk>>[0]['request']
    getModelId?: () => string | undefined
    getRuntimeConfig?: () => AgentRuntimeConfig
  }) {
    super({ request: options.request })
    this.getModelId = options.getModelId || (() => undefined)
    this.getRuntimeConfig = options.getRuntimeConfig || (() => ({}))
  }

  transformParams(
    requestParams: Partial<ChatInput>,
    options: XRequestOptions<ChatInput, StreamChunk, ChatMessage>,
  ): ChatInput {
    const modelId = requestParams.modelId || this.getModelId()
    const runtimeConfig = this.getRuntimeConfig()
    const agentSessionConfigType = requestParams.agentSessionConfigType || runtimeConfig.agentSessionConfigType
    const systemPrompt = requestParams.systemPrompt || runtimeConfig.systemPrompt
    const permissionMode = requestParams.permissionMode || runtimeConfig.permissionMode
    const maxTurns = requestParams.maxTurns || runtimeConfig.maxTurns
    const extra = normalizeExtra(requestParams.extra)
    return {
      ...(options.params || {}),
      content: requestParams.content || '',
      ...(agentSessionConfigType ? { agentSessionConfigType } : {}),
      ...(modelId ? { modelId } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(permissionMode ? { permissionMode } : {}),
      ...(maxTurns ? { maxTurns } : {}),
      ...(requestParams.messageParts ? { messageParts: requestParams.messageParts } : {}),
      ...(extra.length > 0 ? { extra } : {}),
    }
  }

  transformLocalMessage(requestParams: Partial<ChatInput>): ChatMessage {
    const content = requestParams.content || ''
    return createChatMessage({
      role: 'user',
      content,
      parts: normalizeMessageParts(requestParams.messageParts) || [
        ...buildSkillPartsFromExtra(requestParams.extra),
        ...(content ? [{ type: 'text' as const, text: content }] : []),
      ],
    })
  }

  transformMessage(info: TransformMessage<ChatMessage, StreamChunk>): ChatMessage {
    const chunk = info.chunk || info.chunks[info.chunks.length - 1]
    const message = info.originMessage || createChatMessage({ role: 'assistant', content: '', parts: [] })

    if (!chunk) {
      return message
    }

    if (info.originMessage) {
      applyStreamChunk(message, chunk)
      return message
    }

    const nextMessage = createChatMessage({ role: 'assistant', content: '', parts: [] })
    applyStreamChunk(nextMessage, chunk)
    return nextMessage
  }
}

function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
}

function normalizeExtra(value: unknown): ChatExtraItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const data = item && typeof item === 'object' ? (item as Partial<ChatExtraItem>) : {}
      const type = data.type === 'skill' || data.type === 'mcp' ? data.type : undefined
      const id = typeof data.id === 'string' ? data.id.trim() : ''
      const name = typeof data.name === 'string' ? data.name.trim() : ''
      if (!type || !id) {
        return null
      }
      return {
        type,
        id,
        name: name || id,
        ...(typeof data.index === 'number' && Number.isFinite(data.index) ? { index: data.index } : {}),
      } satisfies ChatExtraItem
    })
    .filter((item): item is ChatExtraItem => Boolean(item))
}

function buildSkillPartsFromExtra(extra?: ChatExtraItem[]): MessagePart[] {
  return normalizeExtra(extra)
    .map((item) => ({
      ...(item.type === 'mcp'
        ? { type: 'mcp' as const, mcpId: item.id, label: item.name || item.id }
        : { type: 'skill' as const, skillId: item.id, label: item.name || item.id }),
  }))
}

function buildSkillParts(skills?: string[], skillLabels?: Record<string, string>): MessagePart[] {
  return normalizeSkills(skills).map((skillId) => ({
    type: 'skill',
    skillId,
    label: skillLabels?.[skillId] || skillId,
  }))
}

function normalizeMessageParts(parts?: MessagePart[]) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return undefined
  }
  const nextParts = parts.filter((part) => {
    if (part.type === 'text') {
      return Boolean(part.text)
    }
    if (part.type === 'skill') {
      return Boolean(part.skillId && part.label)
    }
    if (part.type === 'mcp') {
      return Boolean(part.mcpId && part.label)
    }
    return true
  })
  return nextParts.length > 0 ? nextParts : undefined
}

function stripLeadingSkillLabels(content: string, skillParts: MessagePart[]) {
  let nextContent = content.trimStart()
  skillParts.forEach((part) => {
    if (part.type !== 'skill') {
      return
    }
    const label = part.label.trim()
    if (label && nextContent.startsWith(label)) {
      nextContent = nextContent.slice(label.length).trimStart()
    }
  })
  return nextContent
}

export function createAiAgentProvider(
  sessionId: string,
  getModelId?: () => string | undefined,
  getRuntimeConfig?: () => AgentRuntimeConfig,
) {
  return new AiAgentStreamProvider({
    getModelId,
    getRuntimeConfig,
    request: new RealtimeRequest('/realtime/ws', sessionId),
  })
}

type RealtimeEnvelope = {
  type?: string
  requestId?: string
  eventId?: string
  timestamp?: number
  payload?: unknown
}

export type RealtimeEvent = RealtimeEnvelope & { payload?: unknown; eventId?: string; timestamp?: number }
export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

let sharedSocket: WebSocket | null = null
let sharedSocketReady: Promise<void> | null = null
const sharedListeners = new Map<string, (event: MessageEvent<string>) => void>()
const sharedEventListeners = new Set<(event: RealtimeEvent) => void>()
const sharedConnectionListeners = new Set<(connected: boolean) => void>()
const sharedConnectionStatusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
const sharedPending = new Map<string, string>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let sharedConnectionStatus: RealtimeConnectionStatus = 'offline'
const realtimeCursorKey = 'ai-dandelion.realtime.last-event-id'

function setSharedConnectionStatus(status: RealtimeConnectionStatus) {
  if (sharedConnectionStatus === status) {
    return
  }
  sharedConnectionStatus = status
  sharedConnectionStatusListeners.forEach((listener) => listener(status))
  sharedConnectionListeners.forEach((listener) => listener(status === 'connected'))
}

function flushPendingMessages() {
  if (sharedSocket?.readyState !== WebSocket.OPEN) {
    return
  }
  sharedPending.forEach((payload) => sharedSocket?.send(payload))
}

function scheduleSharedSocketReconnect() {
  if (reconnectTimer) {
    return
  }
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000)
  reconnectAttempt += 1
  setSharedConnectionStatus('reconnecting')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensureRealtimeConnection().then(flushPendingMessages).catch(() => undefined)
  }, delay)
}

async function ensureSharedSocket() {
  if (sharedSocket?.readyState === WebSocket.OPEN) return
  if (sharedSocketReady) return sharedSocketReady
  setSharedConnectionStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
  const ticketResponse = await fetch('/realtime/ticket', { method: 'POST', headers: authHeaders() })
  let ticketPayload: { data?: { ticket?: string } }
  try {
    ticketPayload = (await ticketResponse.json()) as { data?: { ticket?: string } }
  } catch {
    throw new Error('实时连接凭证响应无效')
  }
  const ticket = ticketPayload.data?.ticket || ''
  if (!ticketResponse.ok || !ticket) throw new Error('实时连接凭证获取失败')
  sharedSocketReady = new Promise<void>((resolve, reject) => {
    let settled = false
    const finishResolve = () => { if (!settled) { settled = true; resolve() } }
    const finishReject = (error: Error) => { if (!settled) { settled = true; reject(error) } }
    const configuredRealtimeURL = (import.meta.env.VITE_REALTIME_WS_URL as string | undefined)?.trim()
    const defaultRealtimeURL = import.meta.env.DEV
      ? 'ws://127.0.0.1:8086/realtime/ws'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/realtime/ws`
    const cursor = window.localStorage.getItem(realtimeCursorKey) || ''
    const query = new URLSearchParams({ ticket })
    if (cursor) query.set('lastEventId', cursor)
    const socket = new WebSocket(`${configuredRealtimeURL || defaultRealtimeURL}?${query.toString()}`)
    sharedSocket = socket
    socket.onmessage = (event) => {
      let envelope: RealtimeEnvelope
      try { envelope = JSON.parse(event.data) as RealtimeEnvelope } catch { return }
      if (envelope.type === 'connection.ready') { reconnectAttempt = 0; setSharedConnectionStatus('connected'); finishResolve(); return }
      if (envelope.eventId) window.localStorage.setItem(realtimeCursorKey, envelope.eventId)
      if (envelope.requestId) sharedListeners.get(envelope.requestId)?.(event)
      sharedEventListeners.forEach((listener) => listener(envelope as RealtimeEvent))
    }
    socket.onerror = () => {
      finishReject(new Error('实时连接失败'))
      if (sharedSocket !== socket) return
      sharedSocketReady = null
      sharedSocket = null
      setSharedConnectionStatus('offline')
      scheduleSharedSocketReconnect()
    }
    socket.onclose = () => {
      finishReject(new Error('实时连接已关闭'))
      if (sharedSocket !== socket) return
      sharedSocketReady = null
      sharedSocket = null
      setSharedConnectionStatus('offline')
      scheduleSharedSocketReconnect()
    }
  })
  return sharedSocketReady
}

export async function ensureRealtimeConnection(): Promise<void> {
  try {
    await ensureSharedSocket()
  } catch (error) {
    setSharedConnectionStatus('offline')
    scheduleSharedSocketReconnect()
    throw error
  }
}

export function subscribeRealtimeEvents(listener: (event: RealtimeEvent) => void): () => void {
  sharedEventListeners.add(listener)
  return () => sharedEventListeners.delete(listener)
}

export function subscribeRealtimeConnection(listener: (connected: boolean) => void): () => void {
  sharedConnectionListeners.add(listener)
  listener(sharedConnectionStatus === 'connected')
  return () => sharedConnectionListeners.delete(listener)
}

export function subscribeRealtimeConnectionStatus(listener: (status: RealtimeConnectionStatus) => void): () => void {
  sharedConnectionStatusListeners.add(listener)
  listener(sharedConnectionStatus)
  return () => sharedConnectionStatusListeners.delete(listener)
}

export async function reconnectRealtimeConnection(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempt = 0
  const socket = sharedSocket
  sharedSocket = null
  sharedSocketReady = null
  socket?.close()
  await ensureRealtimeConnection()
}

export function stopRealtimeConnection() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempt = 0
  const socket = sharedSocket
  sharedSocket = null
  sharedSocketReady = null
  socket?.close()
  setSharedConnectionStatus('offline')
}

export async function sendRealtimeCommand(type: string, payload: unknown, requestId?: string): Promise<string> {
  await ensureRealtimeConnection()
  const id = requestId || `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const message = JSON.stringify({ protocolVersion: 1, type, requestId: id, payload })
  if (!sharedSocket || sharedSocket.readyState !== WebSocket.OPEN) throw new Error('实时连接不可用')
  sharedSocket.send(message)
  return id
}

class RealtimeRequest extends AbstractXRequestClass<ChatInput, StreamChunk, ChatMessage> {
  private requestId = ''
  private requesting = false
  private aborted = false

  private readonly sessionId: string

  constructor(baseURL: string, sessionId: string) {
    super(baseURL, { manual: true })
    this.sessionId = sessionId
  }

  get asyncHandler(): Promise<unknown> {
    return sharedSocketReady || Promise.resolve()
  }

  get isTimeout() { return false }
  get isStreamTimeout() { return false }
  get isRequesting() { return this.requesting }
  get manual() { return true }

  run(params?: ChatInput): boolean {
    if (this.requesting) return false
    this.requesting = true
    this.aborted = false
    this.requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const callbacks = this.options.callbacks as XRequestCallbacks<StreamChunk, ChatMessage> | undefined
    sharedListeners.set(this.requestId, (event) => this.handleEvent(event))
    void ensureRealtimeConnection().then(() => {
      if (this.aborted) return
      const payload = JSON.stringify({
        protocolVersion: 1,
        type: 'ai-agent.stream.start',
        requestId: this.requestId,
        payload: { ...(params || {}), sessionId: this.sessionId },
      })
      sharedPending.set(this.requestId, payload)
      sharedSocket?.send(payload)
    }).catch((error) => {
      sharedListeners.delete(this.requestId)
      sharedPending.delete(this.requestId)
      this.requesting = false
      callbacks?.onError(error)
    })
    return true
  }

  abort(): void {
    if (!this.requesting) return
    this.aborted = true
    const callbacks = this.options.callbacks as XRequestCallbacks<StreamChunk, ChatMessage> | undefined
    sharedSocket?.send(JSON.stringify({ protocolVersion: 1, type: 'ai-agent.stream.cancel', requestId: this.requestId, payload: { sessionId: this.sessionId } }))
    sharedListeners.delete(this.requestId)
    sharedPending.delete(this.requestId)
    this.requesting = false
    // Finish through onSuccess so X Chat keeps the accumulated partial message
    // and only clears its loading state. AbortError invokes requestFallback,
    // which would replace the content with a cancellation placeholder.
    callbacks?.onSuccess?.([], new Headers())
  }

  private handleEvent(event: MessageEvent<string>) {
    let envelope: RealtimeEnvelope
    try { envelope = JSON.parse(event.data) as RealtimeEnvelope } catch { return }
    if (envelope.type === 'connection.ready') return
    if (!envelope.requestId || envelope.requestId !== this.requestId) return
    const callbacks = this.options.callbacks as XRequestCallbacks<StreamChunk, ChatMessage> | undefined
    if (envelope.type === 'error') { sharedListeners.delete(this.requestId); sharedPending.delete(this.requestId); this.requesting = false; callbacks?.onError(new Error(String((envelope.payload as { message?: string })?.message || '实时请求失败'))); return }
    const payload = (envelope.payload || {}) as Record<string, unknown>
    const streamType = typeof payload.type === 'string' ? payload.type : envelope.type?.replace('ai-agent.stream.', '') || 'text_delta'
    const chunk = { event: streamType, data: normalizeStreamPayload(streamType, payload) } as StreamChunk
    callbacks?.onUpdate?.(chunk, new Headers())
    if (envelope.type === 'ai-agent.stream.done' || Boolean(payload.done)) {
      this.requesting = false
      sharedListeners.delete(this.requestId)
      sharedPending.delete(this.requestId)
      callbacks?.onSuccess?.([chunk], new Headers())
    }
  }
}

export function normalizePersistedMessage(message: PersistedMessage): ChatMessage {
  const skillParts = buildSkillPartsFromExtra(message.extra)
  const legacySkillParts = skillParts.length > 0 ? skillParts : buildSkillParts(message.skills, message.skillLabels)
  const textContent =
    message.role === 'user' && legacySkillParts.length > 0
      ? stripLeadingSkillLabels(message.content, legacySkillParts)
      : message.content
  const parts =
    Array.isArray(message.parts) && message.parts.length > 0
      ? message.parts
      : [
        ...legacySkillParts,
        ...(textContent ? [{ type: 'text' as const, text: textContent }] : []),
      ]

  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    parts,
  }
}

export function createChatMessage(input: {
  role: ChatMessage['role']
  content: string
  createdAt?: number
  parts?: MessagePart[]
}): ChatMessage {
  return {
    role: input.role,
    content: input.content,
    createdAt: input.createdAt || Date.now() * 1000,
    parts:
      input.parts ||
      (input.content ? [{ type: 'text' as const, text: input.content }] : []),
  }
}

function normalizeStreamPayload(event: string, payload: unknown): AgentEvent {
  const data = asRecord(payload)
  if (typeof data.close === 'boolean') {
    return { type: 'close' }
  }
  const type = typeof data.type === 'string' ? data.type : event
  const message = data.message ? normalizeMessage(data.message) : undefined

  return {
    type,
    text: stringOrUndefined(data.text),
    toolId: stringOrUndefined(data.toolId ?? data.tool_id),
    toolName: stringOrUndefined(data.toolName ?? data.tool_name),
    toolTitle: stringOrUndefined(data.toolTitle ?? data.tool_title),
    toolDescription: stringOrUndefined(data.toolDescription ?? data.tool_description),
    toolInput: stringOrUndefined(data.toolInput ?? data.tool_input),
    isError: Boolean(data.isError ?? data.is_error),
    resultText: stringOrUndefined(data.resultText ?? data.result_text),
    done: Boolean(data.done),
    message,
    agentSessionId: stringOrUndefined(data.agentSessionId ?? data.agent_session_id),
  }
}

function applyStreamChunk(message: ChatMessage, chunk: StreamChunk) {
  const data = chunk.data

  if (data.done && data.message) {
    const persisted = normalizePersistedMessage(data.message)
    const shouldKeepLocalParts =
      message.role === 'user' &&
      !hasPersistedParts(data.message) &&
      hasSkillPart(message.parts)
    message.id = persisted.id
    message.sessionId = persisted.sessionId
    message.role = persisted.role
    message.content = persisted.content
    message.createdAt = persisted.createdAt
    message.parts = shouldKeepLocalParts ? message.parts : persisted.parts
    return
  }

  if (data.type === 'text_delta') {
    applyTextAppend(message, data.text || '')
    return
  }
  if (data.type === 'thinking_start') {
    startThinkingPart(message)
    return
  }
  if (data.type === 'thinking_delta') {
    ensureActiveThinkingPart(message).text += data.text || ''
    return
  }
  if (data.type === 'thinking_stop') {
    const thinking = findActiveThinkingPart(message)
    if (thinking) {
      thinking.status = 'finished'
    }
    return
  }
  if (data.type === 'tool_start') {
    applyToolUpsert(message, data.toolId, {
      type: 'tool',
      toolId: data.toolId || '',
      toolName: data.toolName || 'tool',
      input: data.toolInput || '',
      result: '',
      status: 'running',
      isError: false,
    })
    return
  }
  if (data.type === 'tool_delta') {
    applyToolInput(message, data.toolId, data.toolInput || '')
    return
  }
  if (data.type === 'tool_stop') {
    const existing = findToolPart(message, data.toolId)
    if (existing?.status === 'waiting' || existing?.status === 'waiting_permission') {
      applyToolUpsert(message, data.toolId, {
        type: 'tool',
        toolId: data.toolId || '',
        input: data.toolInput || existing.input || '',
      })
      return
    }
    applyToolUpsert(message, data.toolId, {
      type: 'tool',
      toolId: data.toolId || '',
      input: data.toolInput || findToolPart(message, data.toolId)?.input || '',
      status: 'finished',
    })
    return
  }
  if (data.type === 'tool_result') {
    applyToolUpsert(message, data.toolId, {
      type: 'tool',
      toolId: data.toolId || '',
      result: data.resultText || '',
      status: data.isError ? 'error' : 'finished',
      isError: Boolean(data.isError),
    })
    return
  }
  if (data.type === 'ask_user_question') {
    applyToolUpsert(message, data.toolId, {
      type: 'tool',
      toolId: data.toolId || '',
      toolName: data.toolName || 'AskUserQuestion',
      input: data.toolInput || findToolPart(message, data.toolId)?.input || '',
      status: 'waiting',
      isError: false,
    })
    return
  }
  if (data.type === 'tool_permission_request') {
    applyToolUpsert(message, data.toolId, {
      type: 'tool',
      toolId: data.toolId || '',
      toolName: data.toolName || 'tool',
      toolTitle: data.toolTitle,
      toolDescription: data.toolDescription,
      input: data.toolInput || findToolPart(message, data.toolId)?.input || '',
      status: 'waiting_permission',
      isError: false,
    })
  }
}

function hasPersistedParts(message: PersistedMessage) {
  return Array.isArray(message.parts) && message.parts.length > 0
}

function hasSkillPart(parts: MessagePart[]) {
  return parts.some((part) => part.type === 'skill')
}

function applyTextAppend(message: ChatMessage, text: string) {
  if (!text) {
    return
  }
  message.content += text
  const lastPart = message.parts[message.parts.length - 1]
  if (lastPart?.type === 'text') {
    lastPart.text += text
    return
  }
  message.parts.push({ type: 'text', text })
}

function findToolPart(message: ChatMessage, toolId?: string) {
  const part = message.parts.find((item) => item.type === 'tool' && item.toolId === toolId)
  return part && part.type === 'tool' ? part : undefined
}

function findActiveThinkingPart(message: ChatMessage) {
  const part = [...message.parts].reverse().find(
    (item) => item.type === 'thinking' && item.status === 'running',
  )
  return part && part.type === 'thinking' ? part : undefined
}

function startThinkingPart(message: ChatMessage) {
  const thinking = { type: 'thinking' as const, text: '', status: 'running' as const }
  message.parts.push(thinking)
  return thinking
}

function ensureActiveThinkingPart(message: ChatMessage) {
  return findActiveThinkingPart(message) || startThinkingPart(message)
}

function applyToolUpsert(
  message: ChatMessage,
  toolId: string | undefined,
  patch: Extract<MessagePart, { type: 'tool' }>,
) {
  if (!toolId) {
    return
  }

  let tool = findToolPart(message, toolId)
  if (!tool) {
    tool = {
      type: 'tool',
      toolId,
      toolName: 'tool',
      input: '',
      result: '',
      status: 'running',
      isError: false,
    }
    message.parts.push(tool)
  }
  Object.assign(tool, patch)
}

function applyToolInput(message: ChatMessage, toolId: string | undefined, inputDelta: string) {
  if (!toolId || !inputDelta) {
    return
  }
  const tool = findToolPart(message, toolId)
  if (tool) {
    tool.input = `${tool.input || ''}${inputDelta}`
    return
  }
  applyToolUpsert(message, toolId, {
    type: 'tool',
    toolId,
    input: inputDelta,
    status: 'running',
  })
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
