export type ModuleKey = 'ai-agent' | 'func-operation' | 'system'

export type SystemMenuKey = 'users' | 'menus' | 'roles' | 'operation-logs' | 'notifications' | 'agent-config' | 'agent-session-configs' | 'agent-models'

export const MENU_TYPE_DIRECTORY = 1
export const MENU_TYPE_MENU = 2
export const MENU_TYPE_BUTTON = 3

export const MENU_STATUS_ENABLED = 1
export const MENU_STATUS_DISABLED = 2

export const MENU_VISIBLE_YES = 1
export const MENU_VISIBLE_NO = 0

export const MENU_PLACEMENT_PLATFORM = 'platform'
export const MENU_PLACEMENT_MODULE_NAV = 'module_nav'

export const MENU_MODULE_SYSTEM = 'system'
export const MENU_MODULE_FUNC_OPERATION = 'func-operation'
export const MENU_MODULE_AI_AGENT = 'ai-agent'

export const MENU_SOURCE_TYPE_STATIC = 'static'
export const MENU_SOURCE_TYPE_GENERATED_FUNCTION = 'generated_function'

export interface SystemMenu {
  id: string
  parentId: string
  module: string
  placement: string
  name: string
  code: string
  viewKey: string
  icon: string
  menuType: number
  sort: number
  status: number
  visible: number
  isDefault: boolean
  remark: string
  sourceType?: string
  sourceId?: string
  createdAt: number
  children?: SystemMenu[]
}

export type NotificationDisplayType = 'modal' | 'toast'
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
export interface SystemNotification {
  id: string
  title: string
  content: string
  displayType: NotificationDisplayType
  level: NotificationLevel
  targetUserId: string
  targetUserName: string
  read: boolean
  createdAt: number
}

export type Role = 'user' | 'assistant' | 'system'
export type ChatStatus = 'local' | 'loading' | 'updating' | 'success' | 'error' | 'abort'
export type ChatExtraType = 'skill' | 'mcp' | 'function_skill'

export interface ChatExtraItem {
  type: ChatExtraType
  id: string
  name: string
  index?: number
}

export type MessagePart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'skill'
      skillId: string
      label: string
    }
  | {
      type: 'function_skill'
      skillId: string
      label: string
    }
  | {
      type: 'mcp'
      mcpId: string
      label: string
    }
  | {
      type: 'file' | 'image' | 'document'
      fileUuid: string
      fileName: string
      contentType: string
      fileSize: number
      md5: string
      fileUrl: string
    }
  | {
      type: 'thinking'
      text: string
      status: 'running' | 'finished'
    }
  | {
      type: 'tool'
      toolId: string
      toolName?: string
	      toolTitle?: string
	      toolDescription?: string
      input?: string
      result?: string
      status?: 'running' | 'waiting' | 'waiting_permission' | 'finished' | 'error'
      isError?: boolean
    }

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  sessionType?: number
}

export interface PersistedMessage {
  id: string
  sessionId: string
  role: Role
  content: string
  parts?: MessagePart[]
  extra?: ChatExtraItem[]
  skills?: string[]
  skillLabels?: Record<string, string>
  createdAt: number
}

export interface MessagePage {
  items: PersistedMessage[]
  hasMore: boolean
  nextBefore?: string
}

export interface ChatMessage {
  role: Role
  content: string
  parts: MessagePart[]
  createdAt: number
  sessionId?: string
  id?: string
}

export interface AgentEvent {
  type: string
  text?: string
  toolId?: string
  toolName?: string
	toolTitle?: string
	toolDescription?: string
  toolInput?: string
  isError?: boolean
  resultText?: string
  done?: boolean
  message?: PersistedMessage
  agentSessionId?: string
}

export interface StreamChunk {
  event: string
  data: AgentEvent
}

export interface AgentSkillOption {
  id: string
  name: string
  description: string
  source: string
  enabled: boolean
  updatedAt: number
}

export interface AgentFunctionSkillOption {
  id: string
  functionId: string
  name: string
  description: string
  toolPrefix: string
  updatedAt: number
}

export type AgentMCPServerType = 'stdio' | 'http' | 'sse'

export interface AgentMCPKeyValue {
  key: string
  value: string
}

export interface AgentMCPServerOption {
  id: string
  name: string
  description: string
  type: AgentMCPServerType
  enabled: boolean
  configJson: string
  command: string
  args: string[]
  env: AgentMCPKeyValue[]
  url: string
  headers: AgentMCPKeyValue[]
  updatedAt: number
}

export type TodoTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface TodoTask {
  taskId: string
  title: string
  description: string
  status: TodoTaskStatus
  order: number
}

export interface OperationFunction {
  id: string
  name: string
  description: string
  status: string
  workflowStage: string
  productDoc: string
  technicalDoc: string
  productDocPath: string
  technicalDocPath: string
  appDir: string
  productDraftDocPath: string
  technicalDraftDocPath: string
  entry: string
  productSessionId: string
  technicalSessionId: string
  generationSessionId: string
  generatedAppId: string
  functionVersion: number
  productDocVersion: number
  productDraftVersion: number
  technicalDocVersion: number
  technicalDraftVersion: number
  codeVersion: number
  codeDraftVersion: number
  productDraftReady: boolean
  technicalDraftReady: boolean
  technicalStale: boolean
  codeStale: boolean
  codeDraftReady: boolean
  numericId: number
  menuParentId: string
  menuId: string
  createdAt: number
  updatedAt: number
  readiness?: FunctionReadiness
}

export type FunctionNextAction =
  | 'generate_product_doc'
  | 'adopt_product_doc'
  | 'generate_technical_doc'
  | 'adopt_technical_doc'
  | 'generate_page'
  | 'preview_latest_page'
  | 'refresh_and_preview'
  | 'adopt_latest_page'
  | 'publish_function'
  | 'open_published_function'

export interface FunctionReadiness {
  label: string
  nextAction: FunctionNextAction | ''
  blockingReason: string
  hasPendingProductDraft: boolean
  hasPendingTechnicalDraft: boolean
  hasPendingCodeDraft: boolean
}


export interface FunctionDataForm {
  name: string
  label: string
  fieldCount: number
  rowCount: number
  tableName: string
}

export interface PublicConfig {
  id: string
  configKey: string
  name: string
  description: string
  valueJson: string
  version: number
  updatedBy: string
  createdAt: number
  updatedAt: number
}

export interface PublicConfigVersion {
  id: string
  configKey: string
  version: number
  valueJson: string
  operatorId: string
  source: string
  createdAt: number
}

export interface ExternalAPIClient {
  id: string
  clientKey: string
  name: string
  baseUrl: string
  defaultHeadersJson: string
  preRequestScript: string
  postResponseScript: string
  swaggerImportKeyConfigured: boolean
  description: string
  status: string
  createdAt: number
  updatedAt: number
  deletedAt: number
  swaggerImportKey?: string
}

export interface ExternalAPI {
  id: string
  apiKey: string
  clientKey: string
  groupId: string
  name: string
  method: string
  path: string
  headersJson: string
  requestSchemaJson: string
  responseSchemaJson: string
  description: string
  status: string
  createdAt: number
  updatedAt: number
}

export interface ExternalAPIGroup {
  id: string
  clientKey: string
  parentId: string
  name: string
  description: string
  sort: number
  createdAt: number
  updatedAt: number
}

export interface ExternalAPIImportResult {
  createdCount: number
  updatedCount: number
  groups: ExternalAPIGroup[]
  apis: ExternalAPI[]
}

export interface FunctionCodeState {
  appId: string
  appliedVersion: number
  draftVersion: number
  draftReady: boolean
  appExists: boolean
  draftExists: boolean
  appliedAppVersion: string
  draftAppVersion: string
  appliedUpdatedAt: number
  draftUpdatedAt: number
  summary: string
}

export interface FunctionDocument {
  docType: string
  source: string
  path: string
  content: string
  exists: boolean
  version: number
}

export interface GeneratedApp {
  id: string
  name: string
  version: string
  description: string
  export: string
  frontendEntry: string
  backendSource: string
  backendModule: string
  tablePrefix: string
  createdAt: number
  updatedAt: number
}

export interface GeneratedAppInvokeResult {
  appId: string
  version: string
  export: string
  result: number
  response?: unknown
  duration: string
  runtime: string
  moduleLen: number
  backendSource: string
  backendModule: string
  errorCode?: string
  errorMessage?: string
  stage?: string
  hint?: string
}

export class GeneratedAppInvokeError extends Error {
  errorCode: string
  stage: string
  hint: string

  constructor(message: string, detail: { errorCode?: string; stage?: string; hint?: string }) {
    super(message)
    this.name = 'GeneratedAppInvokeError'
    this.errorCode = detail.errorCode || 'invoke_failed'
    this.stage = detail.stage || 'invoke'
    this.hint = detail.hint || '功能运行失败，请查看错误详情或让 AI 修复页面'
  }
}

export interface GeneratedAppRenderContext {
  app: GeneratedApp
  permissions: {
    controlledActions: string[]
    actions: string[]
  }
  can: (actionKey: string) => boolean
  isControlled: (actionKey: string) => boolean
  invoke: (appId?: string, payload?: unknown) => Promise<GeneratedAppInvokeResult>
  invokeData: (appId?: string, payload?: unknown) => Promise<unknown>
  unwrap: (result: GeneratedAppInvokeResult) => unknown
}

export const USER_STATUS_ENABLED = 1
export const USER_STATUS_DISABLED = 2

export const ROLE_STATUS_ENABLED = 1
export const ROLE_STATUS_DISABLED = 2

export interface SystemRole {
  id: string
  name: string
  code: string
  status: number
  remark: string
  sort: number
  createdAt: number
  menuIds?: string[]
}

export interface SystemOperationLog {
  id: string
  module: string
  action: string
  actionLabel: string
  resourceType: string
  resourceId: string
  resourceName: string
  operatorId: string
  operatorName: string
  summary: string
  beforeData: string
  afterData: string
  createdAt: number
}

export interface SystemOperationLogPage {
  logs: SystemOperationLog[]
  total: number
}

export interface AuthSession {
  user: SystemUser
  roles: SystemRole[]
  accessToken: string
  refreshToken: string
  accessExpiresIn: number
  refreshExpiresIn: number
  accessExpiresAt?: number
  refreshExpiresAt?: number
}

export interface SystemUser {
  id: string
  username: string
  email: string
  phone: string
  status: number
  createdAt: number
  roleIds?: string[]
}

export const AGENT_MODEL_STATUS_ENABLED = 1
export const AGENT_MODEL_STATUS_DISABLED = 2

export interface AgentModelThinkConfig {
  mode: string
  budgetTokens: number
  display: string
  maxThinkingTokens: number
}

export interface AgentModel {
  id: string
  name: string
  model: string
  baseUrl: string
  authToken?: string
  thinkConfig: AgentModelThinkConfig
  status: number
  isDefault: boolean
  sort: number
  remark: string
  createdAt: number
  updatedAt: number
}

export interface AgentSystemConfig {
  systemPrompt: string
  permissionMode: string
  maxTurns: number
  updatedAt: number
}

export type AgentSessionConfigType = 'func_product' | 'func_technical' | 'func_generation'

export interface AgentSessionConfig {
  sessionType: AgentSessionConfigType
  name: string
  description: string
  systemPrompt: string
  permissionMode: string
  maxTurns: number
  modelId: string
  enabled: boolean
  updatedAt: number
}

export interface AgentModelOption {
  id: string
  name: string
  model: string
  isDefault: boolean
}

export const AGENT_BOT_STATUS_ENABLED = 1
export const AGENT_BOT_STATUS_DISABLED = 2

export const AGENT_BOT_CHANNEL_STATUS_ENABLED = 1
export const AGENT_BOT_CHANNEL_STATUS_DISABLED = 2

export const AGENT_BOT_CAPABILITY_ENABLED = 1
export const AGENT_BOT_CAPABILITY_DISABLED = 2

export type AgentBotChannelType = 'wecom' | 'feishu' | 'dingtalk' | 'web' | string
export type AgentBotCapabilityType = 'skill' | 'mcp' | 'knowledge' | 'function'

export interface AgentBotChannel {
  id: string
  botId: string
  channel: AgentBotChannelType
  name: string
  status: number
  externalBotId: string
  secret?: string
  endpointUrl: string
  configJson: string
  createdAt: number
  updatedAt: number
}

export interface AgentBotCapability {
  id: string
  botId: string
  capabilityType: AgentBotCapabilityType
  capabilityId: string
  name: string
  enabled: number
  createdAt: number
  updatedAt: number
}

export interface AgentBot {
  id: string
  name: string
  code: string
  status: number
  description: string
  businessScene: string
  welcomeMessage: string
  modelId: string
  systemPrompt: string
  permissionMode: string
  maxTurns: number
  createdAt: number
  updatedAt: number
  channels: AgentBotChannel[]
  capabilities: AgentBotCapability[]
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  status: string
  version: number
  definitionJson: string
  createdAt: number
  updatedAt: number
}

export interface WorkflowTrigger {
  id: string
  workflowId: string
  name: string
  type: 'event' | 'schedule' | string
  enabled: boolean
  configJson: string
  lastRunAt: number
  nextRunAt: number
  createdAt: number
  updatedAt: number
}

export interface WorkflowTriggerExecution {
  id: string
  triggerId: string
  idempotencyKey: string
  runId: string
  status: string
  error: string
  createdAt: number
  updatedAt: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowVersion: number
  status: string
  inputJson: string
  outputJson: string
  error: string
  waitingActionId: string
  createdAt: number
  updatedAt: number
}

export type WorkflowRunNodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'waiting' | 'skipped'
export type WorkflowRunEdgeStatus = 'inactive' | 'active' | 'skipped'

export interface WorkflowRunEvent {
  id: string
  runId: string
  sequence: number
  type: string
  nodeId: string
  dataJson: string
  createdAt: number
}
