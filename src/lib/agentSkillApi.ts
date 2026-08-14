import type { AgentSkillOption } from '../types'
import { requestJSON } from './api'

const AGENT_SKILLS_STORAGE_KEY = 'ai-agent-personal-skills'
const SELECTED_AGENT_SKILL_IDS_STORAGE_KEY = 'ai-agent-selected-skill-ids'

const DEFAULT_SKILLS: AgentSkillOption[] = [
  {
    id: 'webnovel-writing',
    name: '网文写作',
    description: '用于小说策划、续写、润色与长篇连载管理。',
    source: 'personal',
    enabled: true,
    updatedAt: Date.now(),
  },
  {
    id: 'humanizer-zh',
    name: '中文去 AI 味',
    description: '让中文文本更自然，减少模板感和机械连接词。',
    source: 'personal',
    enabled: true,
    updatedAt: Date.now(),
  },
]

export function listAgentSkillOptions(): AgentSkillOption[] {
  const stored = safeParseSkills(localStorage.getItem(AGENT_SKILLS_STORAGE_KEY))
  if (stored.length > 0) {
    return stored
  }
  persistAgentSkillOptions(DEFAULT_SKILLS)
  return DEFAULT_SKILLS
}

export async function listUserAgentSkillOptions(userId: string): Promise<AgentSkillOption[]> {
  if (!userId) {
    return listAgentSkillOptions()
  }
  const data = await requestJSON<{ skills?: unknown[] }>('/ai-agent/skills')
  const skills = Array.isArray(data.skills)
    ? data.skills.map((item) => normalizeSkill(item)).filter((item): item is AgentSkillOption => Boolean(item))
    : []
  if (skills.length > 0) {
    persistAgentSkillOptions(skills)
    return skills
  }
  return skills
}

export async function importUserAgentSkillPackage(userId: string, file: File): Promise<AgentSkillOption> {
  if (!userId) {
    throw new Error('请先登录后再导入技能包')
  }
  const formData = new FormData()
  formData.append('file', file)
  const data = await requestJSON<{ skill?: unknown }>('/ai-agent/skills/import', {
    method: 'POST',
    body: formData,
  })
  const skill = normalizeSkill(data.skill)
  if (!skill) {
    throw new Error('导入技能包失败')
  }
  persistAgentSkillOptions(upsertSkillInList(listAgentSkillOptions(), skill))
  return skill
}

export async function updateUserAgentSkillOption(
  userId: string,
  input: AgentSkillOption,
): Promise<AgentSkillOption> {
  if (!userId) {
    const next = upsertAgentSkillOption(input)
    const skill = next.find((item) => item.id === input.id)
    if (!skill) {
      throw new Error('保存技能失败')
    }
    return skill
  }
  const data = await requestJSON<{ skill?: unknown }>(`/ai-agent/skills/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill: input,
    }),
  })
  const skill = normalizeSkill(data.skill)
  if (!skill) {
    throw new Error('保存技能失败')
  }
  persistAgentSkillOptions(upsertSkillInList(listAgentSkillOptions(), skill))
  return skill
}

export async function deleteUserAgentSkillOption(userId: string, skillId: string): Promise<AgentSkillOption[]> {
  if (!userId) {
    return deleteAgentSkillOption(skillId)
  }
  await requestJSON(`/ai-agent/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' })
  const next = listAgentSkillOptions().filter((item) => item.id !== skillId)
  persistAgentSkillOptions(next)
  setSelectedAgentSkillIds(getSelectedAgentSkillIds().filter((id) => id !== skillId))
  return next
}

export function upsertAgentSkillOption(input: AgentSkillOption): AgentSkillOption[] {
  const now = Date.now()
  const skill = {
    ...input,
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    source: input.source.trim() || 'personal',
    updatedAt: now,
  }
  const current = listAgentSkillOptions()
  const next = upsertSkillInList(current, skill)
  persistAgentSkillOptions(next)
  return next
}

export function deleteAgentSkillOption(skillId: string): AgentSkillOption[] {
  const next = listAgentSkillOptions().filter((item) => item.id !== skillId)
  persistAgentSkillOptions(next)
  setSelectedAgentSkillIds(getSelectedAgentSkillIds().filter((id) => id !== skillId))
  return next
}

export function getSelectedAgentSkillIds(): string[] {
  const parsed = safeParseStringArray(localStorage.getItem(SELECTED_AGENT_SKILL_IDS_STORAGE_KEY))
  const availableIds = new Set(listAgentSkillOptions().filter((item) => item.enabled).map((item) => item.id))
  return parsed.filter((id) => availableIds.has(id))
}

export function setSelectedAgentSkillIds(skillIds: string[]) {
  const uniqueIds = Array.from(new Set(skillIds.map((id) => id.trim()).filter(Boolean)))
  localStorage.setItem(SELECTED_AGENT_SKILL_IDS_STORAGE_KEY, JSON.stringify(uniqueIds))
}

export function formatSkillLabel(skill: AgentSkillOption) {
  return skill.name.trim() || skill.id
}

function persistAgentSkillOptions(skills: AgentSkillOption[]) {
  localStorage.setItem(AGENT_SKILLS_STORAGE_KEY, JSON.stringify(skills))
}

function upsertSkillInList(current: AgentSkillOption[], skill: AgentSkillOption) {
  const exists = current.some((item) => item.id === skill.id)
  return exists
    ? current.map((item) => (item.id === skill.id ? { ...item, ...skill } : item))
    : [skill, ...current]
}

function safeParseSkills(value: string | null): AgentSkillOption[] {
  const parsed = safeParse(value)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((item) => normalizeSkill(item))
    .filter((item): item is AgentSkillOption => Boolean(item))
}

function normalizeSkill(value: unknown): AgentSkillOption | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  const id = stringValue(data.id)
  if (!id) {
    return null
  }

  return {
    id,
    name: stringValue(data.name) || id,
    description: stringValue(data.description),
    source: stringValue(data.source) || 'personal',
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    updatedAt: numberValue(data.updatedAt),
  }
}

function safeParseStringArray(value: string | null): string[] {
  const parsed = safeParse(value)
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
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
