import type { AgentModelOption } from '../types'
import { asRecord, requestJSON } from './api'

const SELECTED_MODEL_STORAGE_KEY = 'ai-agent:selected-model-id'
const AUTO_MODEL_STORAGE_KEY = 'ai-agent:auto-model'

export async function listAgentModelOptions(): Promise<AgentModelOption[]> {
  const data = await requestJSON<{ models?: unknown[] }>('/ai-agent/models')
  return Array.isArray(data.models) ? data.models.map(normalizeAgentModelOption) : []
}

export function getSelectedAgentModelId(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.sessionStorage.getItem(SELECTED_MODEL_STORAGE_KEY) || ''
}

export function setSelectedAgentModelId(modelId: string) {
  if (typeof window === 'undefined') {
    return
  }
  if (modelId) {
    window.sessionStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId)
    return
  }
  window.sessionStorage.removeItem(SELECTED_MODEL_STORAGE_KEY)
}

export function getAutoModelEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  const stored = window.sessionStorage.getItem(AUTO_MODEL_STORAGE_KEY)
  if (stored === null) {
    return true
  }
  return stored === '1'
}

export function setAutoModelEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return
  }
  window.sessionStorage.setItem(AUTO_MODEL_STORAGE_KEY, enabled ? '1' : '0')
}

export function resolveStreamModelId(autoModel: boolean, selectedModelId: string): string | undefined {
  if (autoModel) {
    return undefined
  }
  return selectedModelId || undefined
}

export function pickDefaultAgentModelId(models: AgentModelOption[]): string {
  if (models.length === 0) {
    return ''
  }
  const stored = getSelectedAgentModelId()
  if (stored && models.some((item) => item.id === stored)) {
    return stored
  }
  const defaultModel = models.find((item) => item.isDefault)
  return defaultModel?.id || models[0].id
}

function normalizeAgentModelOption(raw: unknown): AgentModelOption {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    model: stringValue(data.model),
    isDefault: Boolean(data.isDefault ?? data.is_default),
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
