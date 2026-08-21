import type { AuthSession, ChatExtraItem, MessagePage, PersistedMessage, Session } from '../types'

const SUCCESS_CODE = 20000
const AUTH_STORAGE_KEY = 'ai-dandelion-auth'

let refreshPromise: Promise<AuthSession | null> | null = null

interface ResponseEnvelope<T> {
  code?: number
  msg?: string
  data?: T
}

type RawRecord = Record<string, unknown>

export async function requestJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(url, options)
  const payload = (await response.json().catch(() => ({}))) as ResponseEnvelope<T>

  if (!response.ok) {
    throw new Error(payload.msg || `请求失败：${response.status}`)
  }
  if (typeof payload.code === 'number' && payload.code !== SUCCESS_CODE) {
    throw new Error(payload.msg || '请求失败')
  }
  return (payload.data ?? payload) as T
}

export function getAuthToken(): string {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return ''
    }
    const parsed = JSON.parse(raw) as { accessToken?: unknown; token?: unknown }
    if (typeof parsed.accessToken === 'string') return parsed.accessToken
    return typeof parsed.token === 'string' ? parsed.token : ''
  } catch {
    return ''
  }
}

export function authHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input)
  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, withAuthHeaders(options))
  if (response.status !== 401 || isAuthEndpoint(url)) {
    return response
  }
  const refreshed = await refreshAuthSession()
  if (!refreshed) {
    expireAuthSession()
    return response
  }
  return fetch(url, withAuthHeaders(options))
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const current = readAuthSession()
    if (!current?.refreshToken) return null
    let response: Response
    try {
      response = await fetch('/system/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      })
    } catch {
      return null
    }
    const payload = (await response.json().catch(() => ({}))) as ResponseEnvelope<RawRecord>
    if (!response.ok || (typeof payload.code === 'number' && payload.code !== SUCCESS_CODE)) return null
    const data = (payload.data ?? payload) as RawRecord
    const accessToken = stringValue(data.accessToken ?? data.access_token)
    const refreshToken = stringValue(data.refreshToken ?? data.refresh_token)
    const accessExpiresIn = numberValue(data.accessExpiresIn ?? data.access_expires_in)
    const refreshExpiresIn = numberValue(data.refreshExpiresIn ?? data.refresh_expires_in)
    if (!accessToken || !refreshToken || accessExpiresIn <= 0 || refreshExpiresIn <= 0) return null
    const now = Date.now()
    const active = readAuthSession()
    if (!active || active.refreshToken !== current.refreshToken) return null
    const next: AuthSession = {
      ...current,
      accessToken,
      refreshToken,
      accessExpiresIn,
      refreshExpiresIn,
      accessExpiresAt: now + accessExpiresIn * 1000,
      refreshExpiresAt: now + refreshExpiresIn * 1000,
    }
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('ai-dandelion-auth-updated', { detail: next }))
    return next
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export function readAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSession> & { token?: unknown; expiresIn?: unknown }
    const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken : typeof parsed.token === 'string' ? parsed.token : ''
    if (!accessToken || !parsed.user?.id) return null
    return {
      user: parsed.user,
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      accessExpiresIn: numberValue(parsed.accessExpiresIn ?? parsed.expiresIn),
      refreshExpiresIn: numberValue(parsed.refreshExpiresIn),
      accessExpiresAt: typeof parsed.accessExpiresAt === 'number' ? parsed.accessExpiresAt : undefined,
      refreshExpiresAt: typeof parsed.refreshExpiresAt === 'number' ? parsed.refreshExpiresAt : undefined,
    } as AuthSession
  } catch {
    return null
  }
}

export function expireAuthSession() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
  window.dispatchEvent(new Event('ai-dandelion-auth-expired'))
}

export function logoutAuthSession() {
  const refreshToken = readAuthSession()?.refreshToken
  expireAuthSession()
  if (!refreshToken) return
  void fetch('/system/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined)
}

function isAuthEndpoint(url: string): boolean {
  return url.endsWith('/system/auth/login') || url.endsWith('/system/auth/refresh') || url.endsWith('/system/auth/logout')
}

function withAuthHeaders(options: RequestInit): RequestInit {
  return {
    ...options,
    headers: authHeaders(options.headers),
  }
}

export async function listSessions(sessionType = 1): Promise<Session[]> {
  const params = new URLSearchParams()
  if (sessionType > 0) {
    params.set('session_type', String(sessionType))
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const data = await requestJSON<{ sessions?: unknown[] }>(`/ai-agent/session/${suffix}`)
  return Array.isArray(data.sessions) ? data.sessions.map(normalizeSession) : []
}

export async function createSession(title = '', sessionType = 1): Promise<Session> {
  const data = await requestJSON<{ session?: unknown }>('/ai-agent/session/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, session_type: sessionType }),
  })
  return normalizeSession(data.session)
}

export async function updateSession(sessionId: string, title: string): Promise<Session> {
  const data = await requestJSON<{ session?: unknown }>(`/ai-agent/session/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  return normalizeSession(data.session)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await requestJSON(`/ai-agent/session/${sessionId}`, { method: 'DELETE' })
}

export interface UploadSession {
  uuid: string
  uploadId?: string
  mode: 'put' | 'multipart'
  url?: string
  contentType: string
  partSize?: number
  totalParts?: number
  md5?: string
  status?: string
  reused?: boolean
  completedParts?: number[]
}

export async function getUploadDownloadURL(uuid: string, fileName: string): Promise<string> {
  const data = await requestJSON<{ url?: string }>(
    `/system/uploads/${encodeURIComponent(uuid)}/download?file_name=${encodeURIComponent(fileName)}`,
  )
  if (!data.url) {
    throw new Error('下载地址缺失')
  }
  return data.url
}

async function md5Hex(file: File): Promise<string> {
  const state = new MD5State()
  const chunkSize = 2 * 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    state.update(new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer()))
  }
  return state.digest()
}

class MD5State {
  private state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  private tail = new Uint8Array(0)
  private length = 0n

  update(input: Uint8Array) {
    this.length += BigInt(input.length)
    const data = new Uint8Array(this.tail.length + input.length)
    data.set(this.tail)
    data.set(input, this.tail.length)
    const limit = data.length - (data.length % 64)
    for (let offset = 0; offset < limit; offset += 64) this.process(data, offset)
    this.tail = data.slice(limit)
  }

  digest(): string {
    const bitLength = this.length * 8n
    const paddingLength = this.tail.length < 56 ? 56 - this.tail.length : 120 - this.tail.length
    const finalBlock = new Uint8Array(this.tail.length + paddingLength + 8)
    finalBlock.set(this.tail)
    finalBlock[this.tail.length] = 0x80
    const view = new DataView(finalBlock.buffer)
    view.setUint32(finalBlock.length - 8, Number(bitLength & 0xffffffffn), true)
    view.setUint32(finalBlock.length - 4, Number((bitLength >> 32n) & 0xffffffffn), true)
    for (let offset = 0; offset < finalBlock.length; offset += 64) this.process(finalBlock, offset)
    const output = new Uint8Array(16)
    const outputView = new DataView(output.buffer)
    this.state.forEach((value, index) => outputView.setUint32(index * 4, value >>> 0, true))
    return Array.from(output, (value) => value.toString(16).padStart(2, '0')).join('')
  }

  private process(data: Uint8Array, offset: number) {
    const view = new DataView(data.buffer, data.byteOffset + offset, 64)
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(index * 4, true))
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
    const rotate = (value: number, amount: number) => (value << amount) | (value >>> (32 - amount))
    let [a, b, c, d] = this.state
    const [aa, bb, cc, dd] = [a, b, c, d]
    for (let index = 0; index < 64; index += 1) {
      let f: number; let g: number
      if (index < 16) { f = (b & c) | (~b & d); g = index } else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16 } else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16 } else { f = c ^ (b | ~d); g = (7 * index) % 16 }
      f = (f + a + Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) + words[g]) | 0
      a = d; d = c; c = b; b = (b + rotate(f, shifts[Math.floor(index / 16) * 4 + (index % 4)])) | 0
    }
    this.state = [(aa + a) | 0, (bb + b) | 0, (cc + c) | 0, (dd + d) | 0]
  }
}

type UploadProgressHandler = (percent: number) => void

function uploadFileWithProgress(
  url: string,
  file: Blob,
  contentType: string | undefined,
  onProgress?: UploadProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    if (contentType) {
      request.setRequestHeader('Content-Type', contentType)
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    request.onerror = () => reject(new Error('文件上传失败：网络异常'))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve()
      } else {
        reject(new Error(`文件上传失败：${request.status}`))
      }
    }
    request.send(file)
  })
}

export async function uploadChatFile(file: File, onProgress?: UploadProgressHandler): Promise<UploadSession> {
  onProgress?.(0)
  const md5 = await md5Hex(file)
  const created = await requestJSON<{ upload?: UploadSession }>('/system/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileSize: file.size, fileName: file.name, contentType: file.type, md5 }),
  })
  const session = created.upload
  if (!session?.uuid) throw new Error('上传会话创建失败')
  if (session.reused) {
    onProgress?.(100)
    return session
  }
  if (session.mode === 'put') {
    if (!session.url) throw new Error('上传地址缺失')
    await uploadFileWithProgress(session.url, file, session.contentType, onProgress)
  } else {
    const partSize = session.partSize || 64 * 1024 * 1024
    const totalParts = session.totalParts || Math.ceil(file.size / partSize)
    const completed = new Set(session.completedParts || [])
    let uploadedBytes = Array.from(completed).reduce((total, part) => (
      total + Math.min(partSize, Math.max(0, file.size - (part - 1) * partSize))
    ), 0)
    onProgress?.(Math.min(99, Math.round((uploadedBytes / file.size) * 100)))
    for (let part = 1; part <= totalParts; part += 1) {
      if (completed.has(part)) continue
      const start = (part - 1) * partSize
      const partFile = file.slice(start, Math.min(file.size, start + partSize))
      const partURL = await requestJSON<{ url?: string }>(`/system/uploads/${encodeURIComponent(session.uuid)}/parts/${part}?upload_id=${encodeURIComponent(session.uploadId || '')}&file_size=${partFile.size}`)
      if (!partURL.url) throw new Error(`第 ${part} 个分片上传地址缺失`)
      await uploadFileWithProgress(partURL.url, partFile, undefined, (partPercent) => {
        onProgress?.(Math.min(99, Math.round(((uploadedBytes + partFile.size * partPercent / 100) / file.size) * 100)))
      })
      uploadedBytes += partFile.size
    }
  }
  const completed = await requestJSON<{ url?: string }>(`/system/uploads/${encodeURIComponent(session.uuid)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId: session.uploadId || '' }),
  })
  onProgress?.(100)
  return { ...session, url: completed.url || session.url, md5, status: 'completed' }
}

export async function listMessages(
  sessionId: string,
  options: { limit: number; before?: string },
): Promise<MessagePage> {
  const params = new URLSearchParams()
  params.set('limit', String(options.limit))
  if (options.before) {
    params.set('before', options.before)
  }

  const data = await requestJSON<{
    messages?: unknown[]
    hasMore?: boolean
    has_more?: boolean
    nextBefore?: string
    next_before?: string
  }>(`/ai-agent/session/${sessionId}/messages?${params.toString()}`)

  return {
    items: Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [],
    hasMore: Boolean(data.hasMore ?? data.has_more),
    nextBefore: String(data.nextBefore ?? data.next_before ?? ''),
  }
}

export async function submitAskUserQuestion(
  sessionId: string,
  toolId: string,
  answers: Record<string, string | string[]>,
  response = '',
): Promise<void> {
  await requestJSON(`/ai-agent/session/${sessionId}/tool-requests/${toolId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answersJson: JSON.stringify(answers), response }),
  })
}

export async function submitToolPermission(
  sessionId: string,
  toolId: string,
  allow: boolean,
  message = '',
): Promise<void> {
  await requestJSON(`/ai-agent/session/${sessionId}/tool-requests/${toolId}/permission`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allow, message }),
  })
}

export function normalizeSession(raw: unknown): Session {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    title: stringValue(data.title) || 'New chat',
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    sessionType: numberValue(data.sessionType ?? data.session_type),
  }
}

export function normalizeMessage(raw: unknown): PersistedMessage {
  const data = asRecord(raw)
  const content = stringValue(data.content)
  const parts = Array.isArray(data.parts) ? data.parts : undefined
  const skills = normalizeStringArray(data.skills ?? data.skill_ids ?? data.skillIds)
  const skillLabels = normalizeSkillLabels(data.skillLabels ?? data.skill_labels)
  const extra = normalizeExtra(data.extra, skills, skillLabels)

  return {
    id: stringValue(data.id),
    sessionId: stringValue(data.sessionId ?? data.session_id),
    role: normalizeRole(data.role),
    content,
    parts: parts as PersistedMessage['parts'],
    extra,
    skills,
    skillLabels,
    createdAt: numberValue(data.createdAt ?? data.created_at),
  }
}

export function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' ? (value as RawRecord) : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeRole(value: unknown): PersistedMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'system' ? value : 'assistant'
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function normalizeSkillLabels(value: unknown): Record<string, string> {
  const data = asRecord(value)
  return Object.fromEntries(
    Object.entries(data)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, label]) => [key, label.trim() || key]),
  )
}

function normalizeExtra(
  value: unknown,
  fallbackSkills: string[] = [],
  fallbackSkillLabels: Record<string, string> = {},
): ChatExtraItem[] {
  if (Array.isArray(value)) {
    const extra = value
      .map((item) => {
        const data = asRecord(item)
        const type = stringValue(data.type)
        const id = stringValue(data.id).trim()
        const name = stringValue(data.name).trim()
        if ((type !== 'skill' && type !== 'mcp' && type !== 'function_skill') || !id) {
          return null
        }
        return {
          type,
          id,
          name: name || fallbackSkillLabels[id] || id,
          ...(typeof data.index === 'number' && Number.isFinite(data.index) ? { index: data.index } : {}),
        } satisfies ChatExtraItem
      })
      .filter((item): item is ChatExtraItem => Boolean(item))
    if (extra.length > 0) {
      return extra
    }
  }

  return fallbackSkills.map((id) => ({
    type: 'skill',
    id,
    name: fallbackSkillLabels[id] || id,
  }))
}
