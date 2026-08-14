import type { AgentMCPKeyValue, AgentMCPServerOption, AgentMCPServerType } from '../types'
import { requestJSON } from './api'

const AGENT_MCP_STORAGE_KEY = 'ai-agent-personal-mcp-servers'

export async function listUserAgentMCPServers(userId: string): Promise<AgentMCPServerOption[]> {
  if (!userId) {
    return listAgentMCPServers()
  }
  const data = await requestJSON<{ servers?: unknown[] }>('/ai-agent/mcp-servers')
  const servers = Array.isArray(data.servers)
    ? data.servers.map((item) => normalizeMCPServer(item)).filter((item): item is AgentMCPServerOption => Boolean(item))
    : []
  persistAgentMCPServers(servers)
  return servers
}

export function listAgentMCPServers(): AgentMCPServerOption[] {
  return safeParseMCPServers(localStorage.getItem(AGENT_MCP_STORAGE_KEY))
}

export async function saveUserAgentMCPServer(
  userId: string,
  input: AgentMCPServerOption,
  editing = false,
): Promise<AgentMCPServerOption> {
  const server = normalizeMCPServer(input)
  if (!server) {
    throw new Error('MCP 配置不完整')
  }
  if (!userId) {
    persistAgentMCPServers(upsertMCPServerInList(listAgentMCPServers(), server))
    return server
  }
  const data = await requestJSON<{ server?: unknown }>(
    editing ? `/ai-agent/mcp-servers/${encodeURIComponent(server.id)}` : '/ai-agent/mcp-servers',
    {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server }),
    },
  )
  const saved = normalizeMCPServer(data.server)
  if (!saved) {
    throw new Error('保存 MCP 失败')
  }
  persistAgentMCPServers(upsertMCPServerInList(listAgentMCPServers(), saved))
  return saved
}

export async function deleteUserAgentMCPServer(userId: string, serverId: string): Promise<AgentMCPServerOption[]> {
  if (userId) {
    await requestJSON(`/ai-agent/mcp-servers/${encodeURIComponent(serverId)}`, { method: 'DELETE' })
  }
  const next = listAgentMCPServers().filter((item) => item.id !== serverId)
  persistAgentMCPServers(next)
  return next
}

export function formatMCPLabel(server: AgentMCPServerOption) {
  return server.name.trim() || server.id
}

export function emptyMCPServer(): AgentMCPServerOption {
  return {
    id: '',
    name: '',
    description: '',
    type: 'stdio',
    enabled: true,
    configJson: '{\n  "type": "stdio",\n  "command": "npx",\n  "args": [\n    "-y",\n    "@modelcontextprotocol/server-filesystem",\n    "/tmp"\n  ]\n}',
    command: '',
    args: [],
    env: [],
    url: '',
    headers: [],
    updatedAt: Date.now(),
  }
}

export function normalizeMCPServer(value: unknown): AgentMCPServerOption | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  const id = stringValue(data.id)
  if (!id) {
    return null
  }
  const type = normalizeMCPType(data.type)
  const configJson = stringValue(data.configJson) || buildMCPConfigJSON(data, type)
  return {
    id,
    name: stringValue(data.name) || id,
    description: stringValue(data.description),
    type,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    configJson,
    command: stringValue(data.command),
    args: normalizeStringArray(data.args),
    env: normalizeKeyValueList(data.env),
    url: stringValue(data.url),
    headers: normalizeKeyValueList(data.headers),
    updatedAt: numberValue(data.updatedAt),
  }
}

function persistAgentMCPServers(servers: AgentMCPServerOption[]) {
  localStorage.setItem(AGENT_MCP_STORAGE_KEY, JSON.stringify(servers))
}

function upsertMCPServerInList(current: AgentMCPServerOption[], server: AgentMCPServerOption) {
  const exists = current.some((item) => item.id === server.id)
  const next = exists
    ? current.map((item) => (item.id === server.id ? { ...item, ...server } : item))
    : [server, ...current]
  return next.sort((a, b) => b.updatedAt - a.updatedAt)
}

function safeParseMCPServers(value: string | null): AgentMCPServerOption[] {
  const parsed = safeParse(value)
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
    .map((item) => normalizeMCPServer(item))
    .filter((item): item is AgentMCPServerOption => Boolean(item))
}

function normalizeMCPType(value: unknown): AgentMCPServerType {
  return value === 'http' || value === 'sse' ? value : 'stdio'
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function normalizeKeyValueList(value: unknown): AgentMCPKeyValue[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const data = item as Record<string, unknown>
      const key = stringValue(data.key)
      if (!key) {
        return null
      }
      return { key, value: stringValue(data.value) }
    })
    .filter((item): item is AgentMCPKeyValue => Boolean(item))
}

function buildMCPConfigJSON(data: Record<string, unknown>, type: AgentMCPServerType) {
  const config: Record<string, unknown> = { type }
  if (type === 'stdio') {
    config.command = stringValue(data.command)
    const args = normalizeStringArray(data.args)
    if (args.length > 0) {
      config.args = args
    }
    const env = keyValueListToRecord(normalizeKeyValueList(data.env))
    if (Object.keys(env).length > 0) {
      config.env = env
    }
  } else {
    config.url = stringValue(data.url)
    const headers = keyValueListToRecord(normalizeKeyValueList(data.headers))
    if (Object.keys(headers).length > 0) {
      config.headers = headers
    }
  }
  return JSON.stringify(config, null, 2)
}

function keyValueListToRecord(items: AgentMCPKeyValue[]) {
  return items.reduce<Record<string, string>>((record, item) => {
    record[item.key] = item.value
    return record
  }, {})
}

function safeParse(value: string | null): unknown {
  if (!value) {
    return null
  }
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}
