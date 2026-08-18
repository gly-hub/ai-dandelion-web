import type { AgentFunctionSkillOption } from '../types'
import { requestJSON } from './api'

export async function listAgentFunctionSkillOptions(): Promise<AgentFunctionSkillOption[]> {
  const data = await requestJSON<{ skills?: unknown[] }>('/ai-agent/function-skills')
  if (!Array.isArray(data.skills)) return []
  return data.skills.map(normalize).filter((item): item is AgentFunctionSkillOption => Boolean(item))
}

function normalize(value: unknown): AgentFunctionSkillOption | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!id || !name) return null
  return {
    id,
    functionId: typeof item.functionId === 'string' ? item.functionId : '',
    name,
    description: typeof item.description === 'string' ? item.description : '',
    toolPrefix: typeof item.toolPrefix === 'string' ? item.toolPrefix : '',
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
  }
}
