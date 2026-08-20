import { requestJSON } from './api'
import type { WorkflowDefinition, WorkflowRun, WorkflowRunEvent, WorkflowTrigger, WorkflowTriggerExecution } from '../types'

export interface WorkflowTriggerPayload {
  name: string
  type: string
  configJson: string
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const data = await requestJSON<{ workflows?: unknown[] }>('/ai-agent/workflows/')
  return Array.isArray(data.workflows) ? data.workflows.map(normalizeWorkflow).filter(Boolean) as WorkflowDefinition[] : []
}

export async function getWorkflow(workflowId: string): Promise<WorkflowDefinition> {
  const data = await requestJSON<{ workflow?: unknown }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}`)
  return normalizeWorkflow(data.workflow)
}

export async function createWorkflow(name: string, description: string, definitionJson: string): Promise<WorkflowDefinition> {
  const data = await requestJSON<{ workflow?: unknown }>('/ai-agent/workflows/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, definitionJson }),
  })
  return normalizeWorkflow(data.workflow)
}

export async function updateWorkflow(workflowId: string, name: string, description: string, definitionJson: string): Promise<WorkflowDefinition> {
  const data = await requestJSON<{ workflow?: unknown }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, definitionJson }),
  })
  return normalizeWorkflow(data.workflow)
}

export async function publishWorkflow(workflowId: string): Promise<WorkflowDefinition> {
  const data = await requestJSON<{ workflow?: unknown }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}/publish`, { method: 'POST' })
  return normalizeWorkflow(data.workflow)
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await requestJSON(`/ai-agent/workflows/${encodeURIComponent(workflowId)}`, { method: 'DELETE' })
}

export async function startWorkflow(workflowId: string, inputJson = '{}', message = ''): Promise<WorkflowRun> {
  const data = await requestJSON<{ run?: unknown }>(`/ai-agent/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputJson, message }),
  })
  return normalizeRun(data.run)
}

export async function getWorkflowRun(runId: string): Promise<WorkflowRun> {
  const data = await requestJSON<{ run?: unknown }>(`/ai-agent/workflow-runs/${encodeURIComponent(runId)}`)
  return normalizeRun(data.run)
}

export async function listWorkflowRunEvents(runId: string, afterSequence = 0, limit = 200): Promise<WorkflowRunEvent[]> {
  const query = new URLSearchParams({ after_sequence: String(afterSequence), limit: String(limit) })
  const data = await requestJSON<{ events?: unknown[] }>(`/ai-agent/workflow-runs/${encodeURIComponent(runId)}/events?${query.toString()}`)
  return Array.isArray(data.events) ? data.events.map(normalizeRunEvent).filter(Boolean) as WorkflowRunEvent[] : []
}

export async function resumeWorkflow(actionId: string, decisionJson = '{}'): Promise<WorkflowRun> {
  const data = await requestJSON<{ run?: unknown }>(`/ai-agent/workflow-actions/${encodeURIComponent(actionId)}/resume`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisionJson }),
  })
  return normalizeRun(data.run)
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

export function normalizeWorkflow(raw: unknown): WorkflowDefinition {
  const data = record(raw)
  return {
    id: stringValue(data.id), name: stringValue(data.name), description: stringValue(data.description),
    status: stringValue(data.status), version: numberValue(data.version), definitionJson: stringValue(data.definitionJson ?? data.definition_json),
    createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

export function normalizeRun(raw: unknown): WorkflowRun {
  const data = record(raw)
  return {
    id: stringValue(data.id), workflowId: stringValue(data.workflowId ?? data.workflow_id),
    workflowVersion: numberValue(data.workflowVersion ?? data.workflow_version), status: stringValue(data.status),
    inputJson: stringValue(data.inputJson ?? data.input_json), outputJson: stringValue(data.outputJson ?? data.output_json),
    error: stringValue(data.error), waitingActionId: stringValue(data.waitingActionId ?? data.waiting_action_id),
    createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeRunEvent(raw: unknown): WorkflowRunEvent {
  const data = record(raw)
  return {
    id: stringValue(data.id), runId: stringValue(data.runId ?? data.run_id), sequence: numberValue(data.sequence),
    type: stringValue(data.type), nodeId: stringValue(data.nodeId ?? data.node_id), dataJson: stringValue(data.dataJson ?? data.data_json),
    createdAt: numberValue(data.createdAt ?? data.created_at),
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
