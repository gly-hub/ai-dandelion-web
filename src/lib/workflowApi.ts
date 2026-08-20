import { requestJSON } from './api'
import type { WorkflowDefinition, WorkflowTrigger, WorkflowTriggerExecution } from '../types'

export interface WorkflowTriggerPayload {
  name: string
  type: string
  configJson: string
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const data = await requestJSON<{ workflows?: unknown[] }>('/ai-agent/workflows/')
  return Array.isArray(data.workflows) ? data.workflows.map(normalizeWorkflow).filter(Boolean) as WorkflowDefinition[] : []
}

export async function listWorkflowTriggers(workflowId: string): Promise<WorkflowTrigger[]> {
  const data = await requestJSON<{ triggers?: unknown[] }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}/triggers`)
  return Array.isArray(data.triggers) ? data.triggers.map(normalizeTrigger).filter(Boolean) as WorkflowTrigger[] : []
}

export async function createWorkflowTrigger(workflowId: string, payload: WorkflowTriggerPayload): Promise<WorkflowTrigger> {
  const data = await requestJSON<{ trigger?: unknown }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: payload.name, type: payload.type, configJson: payload.configJson }),
  })
  const trigger = normalizeTrigger(data.trigger)
  if (!trigger) throw new Error('触发器响应缺失')
  return trigger
}

export async function updateWorkflowTrigger(triggerId: string, payload: WorkflowTriggerPayload): Promise<WorkflowTrigger> {
  const data = await requestJSON<{ trigger?: unknown }>(`/ai-agent/workflow-triggers/${encodeURIComponent(triggerId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: payload.name, type: payload.type, configJson: payload.configJson }),
  })
  const trigger = normalizeTrigger(data.trigger)
  if (!trigger) throw new Error('触发器响应缺失')
  return trigger
}

export async function deleteWorkflowTrigger(triggerId: string): Promise<void> {
  await requestJSON(`/ai-agent/workflow-triggers/${encodeURIComponent(triggerId)}`, { method: 'DELETE' })
}

export async function setWorkflowTriggerEnabled(triggerId: string, enabled: boolean): Promise<WorkflowTrigger> {
  const action = enabled ? 'enable' : 'disable'
  const data = await requestJSON<{ trigger?: unknown }>(`/ai-agent/workflow-triggers/${encodeURIComponent(triggerId)}/${action}`, { method: 'POST' })
  const trigger = normalizeTrigger(data.trigger)
  if (!trigger) throw new Error('触发器响应缺失')
  return trigger
}

export async function listWorkflowTriggerExecutions(triggerId: string, limit = 30): Promise<WorkflowTriggerExecution[]> {
  const data = await requestJSON<{ executions?: unknown[] }>(`/ai-agent/workflow-triggers/${encodeURIComponent(triggerId)}/executions?limit=${limit}`)
  return Array.isArray(data.executions) ? data.executions.map(normalizeExecution).filter(Boolean) as WorkflowTriggerExecution[] : []
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value || 0) || 0 }
function booleanValue(value: unknown): boolean { return value === true || value === 1 || value === 'true' }

function normalizeWorkflow(raw: unknown): WorkflowDefinition {
  const data = record(raw)
  return {
    id: stringValue(data.id), name: stringValue(data.name), description: stringValue(data.description),
    status: stringValue(data.status), version: numberValue(data.version), definitionJson: stringValue(data.definitionJson ?? data.definition_json),
    createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeTrigger(raw: unknown): WorkflowTrigger {
  const data = record(raw)
  return {
    id: stringValue(data.id), workflowId: stringValue(data.workflowId ?? data.workflow_id), name: stringValue(data.name),
    type: stringValue(data.type), enabled: booleanValue(data.enabled), configJson: stringValue(data.configJson ?? data.config_json),
    lastRunAt: numberValue(data.lastRunAt ?? data.last_run_at), nextRunAt: numberValue(data.nextRunAt ?? data.next_run_at),
    createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeExecution(raw: unknown): WorkflowTriggerExecution {
  const data = record(raw)
  return {
    id: stringValue(data.id), triggerId: stringValue(data.triggerId ?? data.trigger_id),
    idempotencyKey: stringValue(data.idempotencyKey ?? data.idempotency_key), runId: stringValue(data.runId ?? data.run_id),
    status: stringValue(data.status), error: stringValue(data.error), createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}
