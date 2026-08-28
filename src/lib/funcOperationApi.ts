import type {
  FunctionCodeState,
  FunctionDocument,
  FunctionDataForm,
  FunctionReadiness,
  FunctionExecutionLog,
  FunctionExecutionLogEvent,
  FunctionExecutionLogPage,
  FunctionConversationOperation,
  GeneratedApp,
  GeneratedAppInvokeResult,
  OperationFunction,
  PublicConfig,
  PublicConfigVersion,
  ExternalAPIClient,
  ExternalAPI,
  ExternalAPIGroup,
  ExternalAPIImportResult,
} from '../types'
import { GeneratedAppInvokeError } from '../types'
import { asRecord, fetchWithAuth, requestJSON } from './api'

export async function listOperationFunctions(): Promise<OperationFunction[]> {
  const data = await requestJSON<{ functions?: unknown[] }>('/func-operation/functions/')
  return Array.isArray(data.functions) ? data.functions.map(normalizeOperationFunction) : []
}

export async function createOperationFunction(input: {
  name: string
  description: string
  menuParentId?: string
}): Promise<OperationFunction> {
  const data = await requestJSON<{ function?: unknown }>('/func-operation/functions/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return normalizeOperationFunction(data.function)
}

export async function updateOperationFunction(
  id: string,
  input: {
    name: string
    description: string
    status: string
    workflowStage: string
    productDoc: string
    technicalDoc: string
    entry?: string
    generatedAppId?: string
    menuParentId?: string
  },
): Promise<OperationFunction> {
  const data = await requestJSON<{ function?: unknown }>(`/func-operation/functions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      status: input.status,
      workflowStage: input.workflowStage,
      productDoc: input.productDoc,
      technicalDoc: input.technicalDoc,
      entry: input.entry || '',
      generatedAppId: input.generatedAppId || '',
      menuParentId: input.menuParentId || '',
    }),
  })
  return normalizeOperationFunction(data.function)
}

export async function materializeOperationFunctionApp(id: string): Promise<{
  function: OperationFunction
  app: GeneratedApp
}> {
  const data = await requestJSON<{ function?: unknown; app?: unknown }>(
    `/func-operation/functions/${id}/materialize`,
    {
      method: 'POST',
    },
  )
  return {
    function: normalizeOperationFunction(data.function),
    app: normalizeGeneratedApp(data.app),
  }
}

export async function loadOperationFunctionDocument(
  id: string,
  input: { docType: string; source?: string },
): Promise<FunctionDocument> {
  const data = await requestJSON<{ document?: unknown }>(`/func-operation/functions/${id}/documents/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docType: input.docType,
      source: input.source || 'applied',
    }),
  })
  return normalizeFunctionDocument(data.document)
}

export async function commitOperationFunctionDocument(
  id: string,
  input: { docType: string },
): Promise<{ function: OperationFunction; document: FunctionDocument }> {
  const data = await requestJSON<{ function?: unknown; document?: unknown }>(`/func-operation/functions/${id}/documents/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docType: input.docType,
    }),
  })
  return {
    function: normalizeOperationFunction(data.function),
    document: normalizeFunctionDocument(data.document),
  }
}


export async function listFunctionDataForms(id: string): Promise<FunctionDataForm[]> {
  const data = await requestJSON<{ forms?: unknown[] }>(`/func-operation/functions/${id}/data-forms`)
  return Array.isArray(data.forms) ? data.forms.map(normalizeFunctionDataForm) : []
}

export async function deleteFunctionDataForm(id: string, name: string): Promise<FunctionDataForm[]> {
  const data = await requestJSON<{ forms?: unknown[] }>(`/func-operation/functions/${id}/data-forms/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  return Array.isArray(data.forms) ? data.forms.map(normalizeFunctionDataForm) : []
}

export async function loadFunctionCodeState(id: string): Promise<FunctionCodeState> {
  const data = await requestJSON<{ state?: unknown }>(`/func-operation/functions/${id}/code/load`, {
    method: 'POST',
  })
  return normalizeFunctionCodeState(data.state)
}

export async function touchFunctionCodeDraft(id: string): Promise<{
  function: OperationFunction
  state: FunctionCodeState
}> {
  const data = await requestJSON<{ function?: unknown; state?: unknown }>(`/func-operation/functions/${id}/code/draft`, {
    method: 'POST',
  })
  return {
    function: normalizeOperationFunction(data.function),
    state: normalizeFunctionCodeState(data.state),
  }
}

export async function applyFunctionCode(id: string): Promise<{
  function: OperationFunction
  app: GeneratedApp
  state: FunctionCodeState
}> {
  const data = await requestJSON<{ function?: unknown; app?: unknown; state?: unknown }>(`/func-operation/functions/${id}/code/apply`, {
    method: 'POST',
  })
  return {
    function: normalizeOperationFunction(data.function),
    app: normalizeGeneratedApp(data.app),
    state: normalizeFunctionCodeState(data.state),
  }
}

export async function ensureOperationFunctionSession(
  id: string,
  conversation: 'product' | 'technical' | 'generation',
): Promise<{ function: OperationFunction; sessionId: string; created: boolean }> {
  const data = await requestJSON<{ function?: unknown; sessionId?: string; created?: boolean }>(
    `/func-operation/functions/${id}/sessions/ensure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation }),
    },
  )
  return {
    function: normalizeOperationFunction(data.function),
    sessionId: stringValue(data.sessionId),
    created: Boolean(data.created),
  }
}

export async function startFunctionConversationOperation(
  id: string,
  conversation: 'product' | 'technical' | 'generation',
  operationId?: string,
): Promise<FunctionConversationOperation> {
  const data = await requestJSON<{ operation?: unknown }>(`/func-operation/functions/${id}/conversation-operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation, ...(operationId ? { operationId } : {}) }),
  })
  return normalizeFunctionConversationOperation(data.operation)
}

export async function getLatestFunctionConversationOperation(
  id: string,
  conversation: 'product' | 'technical' | 'generation',
): Promise<FunctionConversationOperation | null> {
  const data = await requestJSON<{ operation?: unknown }>(
    `/func-operation/functions/${id}/conversation-operations/latest?conversation=${encodeURIComponent(conversation)}`,
  )
  return data.operation ? normalizeFunctionConversationOperation(data.operation) : null
}

export async function deleteOperationFunction(id: string): Promise<void> {
  await requestJSON(`/func-operation/functions/${id}`, { method: 'DELETE' })
}

export async function listPublicConfigs(): Promise<PublicConfig[]> {
  const data = await requestJSON<{ configs?: unknown[] }>('/func-operation/configs/')
  return Array.isArray(data.configs) ? data.configs.map(normalizePublicConfig) : []
}

export async function createPublicConfig(input: {
  configKey: string
  name?: string
  description?: string
  valueJson: string
}): Promise<PublicConfig> {
  const data = await requestJSON<{ config?: unknown }>('/func-operation/configs/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return normalizePublicConfig(data.config)
}

export async function updatePublicConfig(configKey: string, input: {
  name?: string
  description?: string
  valueJson: string
}): Promise<PublicConfig> {
  const data = await requestJSON<{ config?: unknown }>(`/func-operation/configs/${encodeURIComponent(configKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return normalizePublicConfig(data.config)
}

export async function listPublicConfigVersions(configKey: string): Promise<PublicConfigVersion[]> {
  const data = await requestJSON<{ versions?: unknown[] }>(`/func-operation/configs/${encodeURIComponent(configKey)}/versions`)
  return Array.isArray(data.versions) ? data.versions.map(normalizePublicConfigVersion) : []
}

export async function rollbackPublicConfig(configKey: string, version: number): Promise<PublicConfig> {
  const data = await requestJSON<{ config?: unknown }>(`/func-operation/configs/${encodeURIComponent(configKey)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
  return normalizePublicConfig(data.config)
}

export async function rotatePublicConfigImportKey(): Promise<string> {
  const data = await requestJSON<{ importKey?: unknown }>('/func-operation/configs/import-key/rotate', { method: 'POST' })
  return stringValue(data.importKey)
}

export async function listExternalAPIClients(): Promise<ExternalAPIClient[]> {
  const data = await requestJSON<{ clients?: unknown[] }>('/func-operation/external-api-clients/')
  return Array.isArray(data.clients) ? data.clients.map(normalizeExternalAPIClient) : []
}

export async function createExternalAPIClient(input: Omit<ExternalAPIClient, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'swaggerImportKey' | 'swaggerImportKeyConfigured'>): Promise<ExternalAPIClient> {
  const data = await requestJSON<{ client?: unknown }>('/func-operation/external-api-clients/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return normalizeExternalAPIClient(data.client)
}

export async function updateExternalAPIClient(clientKey: string, input: Omit<ExternalAPIClient, 'id' | 'clientKey' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'swaggerImportKey' | 'swaggerImportKeyConfigured'>): Promise<ExternalAPIClient> {
  const data = await requestJSON<{ client?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return normalizeExternalAPIClient(data.client)
}

export async function deleteExternalAPIClient(clientKey: string): Promise<void> {
  await requestJSON(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}`, { method: 'DELETE' })
}

export async function rotateExternalAPIImportKey(clientKey: string): Promise<string> {
  const data = await requestJSON<{ swaggerImportKey?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/import-key/rotate`, { method: 'POST' })
  return stringValue(data.swaggerImportKey)
}

export async function listDeletedExternalAPIClients(): Promise<ExternalAPIClient[]> {
  const data = await requestJSON<{ clients?: unknown[] }>('/func-operation/external-api-clients/recycle-bin')
  return Array.isArray(data.clients) ? data.clients.map(normalizeExternalAPIClient) : []
}

export async function purgeExternalAPIClient(clientKey: string): Promise<void> {
  await requestJSON(`/func-operation/external-api-clients/recycle-bin/${encodeURIComponent(clientKey)}`, { method: 'DELETE' })
}

export async function listExternalAPIs(clientKey: string): Promise<ExternalAPI[]> {
  const data = await requestJSON<{ apis?: unknown[] }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/apis`)
  return Array.isArray(data.apis) ? data.apis.map(normalizeExternalAPI) : []
}

export async function listExternalAPIGroups(clientKey: string): Promise<ExternalAPIGroup[]> {
  const data = await requestJSON<{ groups?: unknown[] }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/groups`)
  return Array.isArray(data.groups) ? data.groups.map(normalizeExternalAPIGroup) : []
}

export async function createExternalAPIGroup(clientKey: string, input: {
  name: string
  parentId?: string
  description?: string
  sort?: number
}): Promise<ExternalAPIGroup> {
  const data = await requestJSON<{ group?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return normalizeExternalAPIGroup(data.group)
}

export async function importExternalAPIDocument(clientKey: string, documentJson: string): Promise<ExternalAPIImportResult> {
  const data = await requestJSON<{ createdCount?: unknown; updatedCount?: unknown; groups?: unknown[]; apis?: unknown[] }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentJson, mode: 'upsert' }),
  })
  return {
    createdCount: numberValue(data.createdCount),
    updatedCount: numberValue(data.updatedCount),
    groups: Array.isArray(data.groups) ? data.groups.map(normalizeExternalAPIGroup) : [],
    apis: Array.isArray(data.apis) ? data.apis.map(normalizeExternalAPI) : [],
  }
}

export async function createExternalAPI(clientKey: string, input: {
  apiKey?: string
  groupId?: string
  name: string
  method: string
  path: string
  headersJson?: string
  requestSchemaJson?: string
  responseSchemaJson?: string
  description?: string
}): Promise<ExternalAPI> {
  const data = await requestJSON<{ api?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return normalizeExternalAPI(data.api)
}

export async function updateExternalAPI(clientKey: string, apiKey: string, input: Omit<ExternalAPI, 'id' | 'clientKey' | 'apiKey' | 'createdAt' | 'updatedAt'>): Promise<ExternalAPI> {
  const data = await requestJSON<{ api?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/apis/${encodeURIComponent(apiKey)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return normalizeExternalAPI(data.api)
}

export async function deleteExternalAPI(clientKey: string, apiKey: string): Promise<void> {
  await requestJSON(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/apis/${encodeURIComponent(apiKey)}`, { method: 'DELETE' })
}

export async function testExternalAPI(clientKey: string, apiKey: string, input: {
  queryJson?: string
  headersJson?: string
  bodyJson?: string
}): Promise<{ statusCode: number; responseHeadersJson: string; responseBodyJson: string; durationMs: number }> {
  const data = await requestJSON<{ statusCode?: unknown; responseHeadersJson?: unknown; responseBodyJson?: unknown; durationMs?: unknown }>(`/func-operation/external-api-clients/${encodeURIComponent(clientKey)}/apis/${encodeURIComponent(apiKey)}/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  return { statusCode: numberValue(data.statusCode), responseHeadersJson: stringValue(data.responseHeadersJson), responseBodyJson: stringValue(data.responseBodyJson), durationMs: numberValue(data.durationMs) }
}

export async function listGeneratedApps(): Promise<GeneratedApp[]> {
  const data = await requestJSON<{ apps?: unknown[] }>('/func-operation/generated-apps/')
  return Array.isArray(data.apps) ? data.apps.map(normalizeGeneratedApp) : []
}

export async function reloadGeneratedApps(): Promise<GeneratedApp[]> {
  const data = await requestJSON<{ apps?: unknown[] }>('/func-operation/generated-apps/reload', {
    method: 'POST',
  })
  return Array.isArray(data.apps) ? data.apps.map(normalizeGeneratedApp) : []
}

export async function cleanupGeneratedFunctionMenus(): Promise<{ removedCount: number }> {
  const data = await requestJSON<{ removedCount?: unknown }>('/func-operation/generated-apps/cleanup-menus', {
    method: 'POST',
  })
  return {
    removedCount: numberValue(data.removedCount),
  }
}

export function resolveOperationPreviewApp(
  functionItem: OperationFunction,
  generatedApps: GeneratedApp[],
): GeneratedApp | null {
  const appId = functionItem.generatedAppId.trim()
  if (!appId) {
    return null
  }
  const matched = generatedApps.find((item) => item.id === appId)
  if (matched) {
    return matched
  }
  return {
    id: appId,
    name: functionItem.name,
    version: '',
    description: functionItem.description,
    export: 'handle',
    frontendEntry: functionItem.entry || `/func-operation/generated-apps/${appId}/frontend.js`,
    backendSource: 'backend',
    backendModule: 'backend.wasm',
    tablePrefix: '',
    createdAt: functionItem.createdAt,
    updatedAt: functionItem.updatedAt,
  }
}

export function resolveGeneratedAppFrontendUrl(
  app: Pick<GeneratedApp, 'id' | 'frontendEntry' | 'updatedAt' | 'version'>,
  options?: { cacheBust?: string | number },
): string {
  const entry = app.frontendEntry.trim() || `/func-operation/generated-apps/${app.id}/frontend.js`
  const absolute = entry.startsWith('http://') || entry.startsWith('https://')
    ? entry
    : new URL(entry, window.location.origin).href
  const version = options?.cacheBust ?? app.updatedAt ?? app.version ?? app.id
  return `${absolute}${absolute.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`
}

function normalizeGeneratedAppModuleUrl(url: URL): string {
  return `${url.origin}${url.pathname}`
}

export async function loadGeneratedAppModuleSourceGraph(
  app: GeneratedApp,
  options?: { cacheBust?: string | number; signal?: AbortSignal },
): Promise<{ entry: string; modules: Record<string, string> }> {
  const entry = app.frontendEntry.trim() || `/func-operation/generated-apps/${app.id}/frontend.js`
  const entryUrl = entry.startsWith('http://') || entry.startsWith('https://')
    ? new URL(entry)
    : new URL(entry, window.location.origin)
  const cacheBust = options?.cacheBust ?? app.updatedAt ?? app.version ?? app.id
  const bundleUrl = new URL(entryUrl)
  bundleUrl.pathname = bundleUrl.pathname.replace(/\/frontend\.js$/, '/bundle')
  bundleUrl.searchParams.set('v', String(cacheBust))
  const response = await fetchWithAuth(bundleUrl.toString(), {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options?.signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`加载前端代码失败（HTTP ${response.status}）`)
  }
  const envelope = asRecord(payload)
  const data = asRecord(envelope.data ?? payload)
  const bundle = asRecord(data.bundle ?? data)
  const rawModules = asRecord(bundle.modules)
  const baseUrl = new URL('./', entryUrl)
  const modules = Object.fromEntries(
    Object.entries(rawModules)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([path, source]) => [normalizeGeneratedAppModuleUrl(new URL(path, baseUrl)), source]),
  )
  const bundleEntry = stringValue(bundle.entry) || 'frontend.js'
  const resolvedEntry = normalizeGeneratedAppModuleUrl(new URL(bundleEntry, baseUrl))
  if (!modules[resolvedEntry]) {
    throw new Error('加载前端代码失败：模块包缺少入口文件')
  }
  return {
    entry: resolvedEntry,
    modules,
  }
}

export function invalidateGeneratedAppModuleCache(appId?: string) {
  // Generated modules are deliberately never imported into the host window.
  // Reloading the sandbox always fetches a fresh, authenticated source graph.
  void appId
}

export async function invokeGeneratedApp(
  appId: string,
  payload?: unknown,
): Promise<GeneratedAppInvokeResult> {
  const data = await requestJSON<{
    appId?: string
    version?: string
    export?: string
    result?: number
    response?: string
    duration?: string
    runtime?: string
    moduleLen?: number
    backendSource?: string
    backendModule?: string
    errorCode?: string
    errorMessage?: string
    stage?: string
    hint?: string
	    executionLogId?: string
  }>(`/func-operation/generated-apps/${appId}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: payload || {} }),
  })

	return normalizeGeneratedAppInvokeResult(data)
}

export async function invokeFunctionPreview(functionId: string, payload?: unknown): Promise<GeneratedAppInvokeResult> {
  const data = await requestJSON<{
    appId?: string; version?: string; export?: string; result?: number; response?: string; duration?: string
	    runtime?: string; moduleLen?: number; backendSource?: string; backendModule?: string
	    errorCode?: string; errorMessage?: string; stage?: string; hint?: string; executionLogId?: string
  }>(`/func-operation/functions/${functionId}/preview/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: payload || {} }),
  })
	return normalizeGeneratedAppInvokeResult(data)
}

export async function listFunctionExecutionLogs(functionId: string, options: {
  limit?: number
  page?: number
  query?: string
	requestId?: string
  status?: string
  invocationType?: string
  startTime?: number
  endTime?: number
} = {}): Promise<FunctionExecutionLogPage> {
  const params = new URLSearchParams()
  params.set('limit', String(Math.min(Math.max(options.limit || 20, 1), 100)))
  params.set('page', String(Math.max(options.page || 1, 1)))
  if (options.query?.trim()) params.set('query', options.query.trim())
	if (options.requestId?.trim()) params.set('requestId', options.requestId.trim())
  if (options.status) params.set('status', options.status)
  if (options.invocationType) params.set('invocationType', options.invocationType)
  if (options.startTime) params.set('startTime', String(options.startTime))
  if (options.endTime) params.set('endTime', String(options.endTime))
  const data = await requestJSON<{ logs?: unknown[]; total?: unknown }>(`/func-operation/functions/${encodeURIComponent(functionId)}/execution-logs?${params.toString()}`)
  return {
    logs: Array.isArray(data.logs) ? data.logs.map(normalizeFunctionExecutionLog) : [],
    total: numberValue(data.total),
  }
}

export async function getFunctionExecutionLog(functionId: string, logId: string): Promise<FunctionExecutionLog> {
  const data = await requestJSON<{ log?: unknown }>(`/func-operation/functions/${encodeURIComponent(functionId)}/execution-logs/${encodeURIComponent(logId)}`)
  return normalizeFunctionExecutionLog(data.log)
}

export function unwrapGeneratedAppInvokeData(result: GeneratedAppInvokeResult): unknown {
  if (result.response !== undefined) {
    return result.response
  }
  return result.result
}

export function mergeOperationFunction(
  previous: OperationFunction | null | undefined,
  next: OperationFunction,
): OperationFunction {
  if (!previous || previous.id !== next.id) {
    return next
  }
  return {
    ...next,
    productSessionId: next.productSessionId || previous.productSessionId,
    technicalSessionId: next.technicalSessionId || previous.technicalSessionId,
    generationSessionId: next.generationSessionId || previous.generationSessionId,
  }
}

function normalizeOperationFunction(raw: unknown): OperationFunction {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    description: stringValue(data.description),
    status: stringValue(data.status) || 'draft',
    workflowStage: stringValue(data.workflowStage ?? data.workflow_stage) || 'product_doc',
    productDoc: stringValue(data.productDoc ?? data.product_doc),
    technicalDoc: stringValue(data.technicalDoc ?? data.technical_doc),
    productDocPath: stringValue(data.productDocPath ?? data.product_doc_path),
    technicalDocPath: stringValue(data.technicalDocPath ?? data.technical_doc_path),
    appDir: stringValue(data.appDir ?? data.app_dir),
    productDraftDocPath: stringValue(data.productDraftDocPath ?? data.product_draft_doc_path),
    technicalDraftDocPath: stringValue(data.technicalDraftDocPath ?? data.technical_draft_doc_path),
    entry: stringValue(data.entry),
    productSessionId: stringValue(data.productSessionId ?? data.product_session_id),
    technicalSessionId: stringValue(data.technicalSessionId ?? data.technical_session_id),
    generationSessionId: stringValue(data.generationSessionId ?? data.generation_session_id),
    generatedAppId: stringValue(data.generatedAppId ?? data.generated_app_id),
    functionVersion: numberValue(data.functionVersion ?? data.function_version),
    productDocVersion: numberValue(data.productDocVersion ?? data.product_doc_version),
    productDraftVersion: numberValue(data.productDraftVersion ?? data.product_draft_version),
    technicalDocVersion: numberValue(data.technicalDocVersion ?? data.technical_doc_version),
    technicalDraftVersion: numberValue(data.technicalDraftVersion ?? data.technical_draft_version),
    codeVersion: numberValue(data.codeVersion ?? data.code_version),
    codeDraftVersion: numberValue(data.codeDraftVersion ?? data.code_draft_version),
    productDraftReady: Boolean(data.productDraftReady ?? data.product_draft_ready),
    technicalDraftReady: Boolean(data.technicalDraftReady ?? data.technical_draft_ready),
    technicalStale: Boolean(data.technicalStale ?? data.technical_stale),
    codeStale: Boolean(data.codeStale ?? data.code_stale),
    codeDraftReady: Boolean(data.codeDraftReady ?? data.code_draft_ready),
    numericId: numberValue(data.numericId ?? data.numeric_id),
    menuParentId: stringValue(data.menuParentId ?? data.menu_parent_id),
    menuId: stringValue(data.menuId ?? data.menu_id),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    readiness: normalizeFunctionReadiness(data.readiness),
  }
}

function normalizeFunctionConversationOperation(raw: unknown): FunctionConversationOperation {
  const data = asRecord(raw)
  const conversation = stringValue(data.conversation) as FunctionConversationOperation['conversation']
  return {
    id: stringValue(data.id),
    functionId: stringValue(data.functionId ?? data.function_id),
    sessionId: stringValue(data.sessionId ?? data.session_id),
    conversation: conversation === 'product' || conversation === 'technical' || conversation === 'generation' ? conversation : 'product',
    state: stringValue(data.state),
    terminalStatus: stringValue(data.terminalStatus ?? data.terminal_status),
    terminalReason: stringValue(data.terminalReason ?? data.terminal_reason),
    outcome: stringValue(data.outcome),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    finishedAt: numberValue(data.finishedAt ?? data.finished_at),
  }
}

function normalizeFunctionReadiness(raw: unknown): FunctionReadiness | undefined {
  const data = asRecord(raw)
  if (!data.label && !data.nextAction && !data.next_action) {
    return undefined
  }
  const nextAction = stringValue(data.nextAction ?? data.next_action)
  return {
    label: stringValue(data.label),
    nextAction: nextAction as FunctionReadiness['nextAction'],
    blockingReason: stringValue(data.blockingReason ?? data.blocking_reason),
    hasPendingProductDraft: Boolean(data.hasPendingProductDraft ?? data.has_pending_product_draft),
    hasPendingTechnicalDraft: Boolean(data.hasPendingTechnicalDraft ?? data.has_pending_technical_draft),
    hasPendingCodeDraft: Boolean(data.hasPendingCodeDraft ?? data.has_pending_code_draft),
  }
}

function normalizeFunctionDocument(raw: unknown): FunctionDocument {
  const data = asRecord(raw)
  return {
    docType: stringValue(data.docType ?? data.doc_type),
    source: stringValue(data.source),
    path: stringValue(data.path),
    content: stringValue(data.content),
    exists: Boolean(data.exists),
    version: numberValue(data.version),
  }
}


function normalizeFunctionDataForm(raw: unknown): FunctionDataForm {
  const data = asRecord(raw)
  return {
    name: stringValue(data.name),
    label: stringValue(data.label),
    fieldCount: numberValue(data.fieldCount ?? data.field_count),
    rowCount: numberValue(data.rowCount ?? data.row_count),
    tableName: stringValue(data.tableName ?? data.table_name),
  }
}

function normalizePublicConfig(raw: unknown): PublicConfig {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    configKey: stringValue(data.configKey ?? data.config_key),
    name: stringValue(data.name),
    description: stringValue(data.description),
    valueJson: stringValue(data.valueJson ?? data.value_json),
    version: numberValue(data.version),
    updatedBy: stringValue(data.updatedBy ?? data.updated_by),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizePublicConfigVersion(raw: unknown): PublicConfigVersion {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    configKey: stringValue(data.configKey ?? data.config_key),
    version: numberValue(data.version),
    valueJson: stringValue(data.valueJson ?? data.value_json),
    operatorId: stringValue(data.operatorId ?? data.operator_id),
    source: stringValue(data.source),
    createdAt: numberValue(data.createdAt ?? data.created_at),
  }
}

function normalizeExternalAPIClient(raw: unknown): ExternalAPIClient {
  const data = asRecord(raw)
  return { id: stringValue(data.id), clientKey: stringValue(data.clientKey ?? data.client_key), name: stringValue(data.name), baseUrl: stringValue(data.baseUrl ?? data.base_url), defaultHeadersJson: stringValue(data.defaultHeadersJson ?? data.default_headers_json), preRequestScript: stringValue(data.preRequestScript ?? data.pre_request_script), postResponseScript: stringValue(data.postResponseScript ?? data.post_response_script), swaggerImportKeyConfigured: Boolean(data.swaggerImportKeyConfigured ?? data.swagger_import_key_configured), description: stringValue(data.description), status: stringValue(data.status) || 'enabled', createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at), deletedAt: numberValue(data.deletedAt ?? data.deleted_at), swaggerImportKey: stringValue(data.swaggerImportKey ?? data.swagger_import_key) || undefined }
}

function normalizeExternalAPI(raw: unknown): ExternalAPI {
  const data = asRecord(raw)
  return { id: stringValue(data.id), apiKey: stringValue(data.apiKey ?? data.api_key), clientKey: stringValue(data.clientKey ?? data.client_key), groupId: stringValue(data.groupId ?? data.group_id), name: stringValue(data.name), method: stringValue(data.method), path: stringValue(data.path), headersJson: stringValue(data.headersJson ?? data.headers_json), requestSchemaJson: stringValue(data.requestSchemaJson ?? data.request_schema_json), responseSchemaJson: stringValue(data.responseSchemaJson ?? data.response_schema_json), description: stringValue(data.description), status: stringValue(data.status) || 'enabled', createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at) }
}

function normalizeExternalAPIGroup(raw: unknown): ExternalAPIGroup {
  const data = asRecord(raw)
  return { id: stringValue(data.id), clientKey: stringValue(data.clientKey ?? data.client_key), parentId: stringValue(data.parentId ?? data.parent_id), name: stringValue(data.name), description: stringValue(data.description), sort: numberValue(data.sort), createdAt: numberValue(data.createdAt ?? data.created_at), updatedAt: numberValue(data.updatedAt ?? data.updated_at) }
}

function normalizeFunctionCodeState(raw: unknown): FunctionCodeState {
  const data = asRecord(raw)
  return {
    appId: stringValue(data.appId ?? data.app_id),
    appliedVersion: numberValue(data.appliedVersion ?? data.applied_version),
    draftVersion: numberValue(data.draftVersion ?? data.draft_version),
    draftReady: Boolean(data.draftReady ?? data.draft_ready),
    appExists: Boolean(data.appExists ?? data.app_exists),
    draftExists: Boolean(data.draftExists ?? data.draft_exists),
    appliedAppVersion: stringValue(data.appliedAppVersion ?? data.applied_app_version),
    draftAppVersion: stringValue(data.draftAppVersion ?? data.draft_app_version),
    appliedUpdatedAt: numberValue(data.appliedUpdatedAt ?? data.applied_updated_at),
    draftUpdatedAt: numberValue(data.draftUpdatedAt ?? data.draft_updated_at),
    summary: stringValue(data.summary),
  }
}

function normalizeGeneratedApp(raw: unknown): GeneratedApp {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    version: stringValue(data.version),
    description: stringValue(data.description),
    export: stringValue(data.export),
    frontendEntry: stringValue(data.frontendEntry ?? data.frontend_entry),
    backendSource: stringValue(data.backendSource ?? data.backend_source),
    backendModule: stringValue(data.backendModule ?? data.backend_module),
    tablePrefix: stringValue(data.tablePrefix ?? data.table_prefix),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeGeneratedAppInvokeResult(raw: Record<string, unknown>): GeneratedAppInvokeResult {
	const errorCode = stringValue(raw.errorCode ?? raw.error_code)
	if (errorCode) {
		throw new GeneratedAppInvokeError(stringValue(raw.errorMessage ?? raw.error_message) || '功能运行失败', {
			errorCode,
			stage: stringValue(raw.stage),
			hint: stringValue(raw.hint),
		})
	}
	return {
		appId: stringValue(raw.appId ?? raw.app_id),
		version: stringValue(raw.version),
		export: stringValue(raw.export),
		result: numberValue(raw.result),
		response: parseMaybeJSON(raw.response),
		duration: stringValue(raw.duration),
		runtime: stringValue(raw.runtime),
		moduleLen: numberValue(raw.moduleLen ?? raw.module_len),
		backendSource: stringValue(raw.backendSource ?? raw.backend_source),
		backendModule: stringValue(raw.backendModule ?? raw.backend_module),
		executionLogId: stringValue(raw.executionLogId ?? raw.execution_log_id),
	}
}

function normalizeFunctionExecutionLog(raw: unknown): FunctionExecutionLog {
	const data = asRecord(raw)
	const events = Array.isArray(data.logs) ? data.logs.map((item): FunctionExecutionLogEvent => {
		const event = asRecord(item)
		return { stream: stringValue(event.stream), content: stringValue(event.content), timestamp: numberValue(event.timestamp) }
	}) : []
	return {
		id: stringValue(data.id), functionId: stringValue(data.functionId ?? data.function_id), appId: stringValue(data.appId ?? data.app_id), userId: stringValue(data.userId ?? data.user_id), requestId: stringValue(data.requestId ?? data.request_id),
		invocationType: stringValue(data.invocationType ?? data.invocation_type), version: stringValue(data.version), status: stringValue(data.status), stage: stringValue(data.stage),
		errorCode: stringValue(data.errorCode ?? data.error_code), errorMessage: stringValue(data.errorMessage ?? data.error_message), inputJson: stringValue(data.inputJson ?? data.input_json), outputJson: stringValue(data.outputJson ?? data.output_json),
		logs: events, logsTruncated: Boolean(data.logsTruncated ?? data.logs_truncated), durationMs: numberValue(data.durationMs ?? data.duration_ms), createdAt: numberValue(data.createdAt ?? data.created_at),
	}
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

function parseMaybeJSON(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  if (value.trim() === '') {
    return undefined
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
