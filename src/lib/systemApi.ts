import type {
  AuthSession,
  AgentBot,
  AgentBotCapability,
  AgentBotChannel,
  AgentModel,
  AgentModelThinkConfig,
  AgentSessionConfig,
  AgentSessionConfigType,
  AgentSystemConfig,
  SystemMenu,
	SystemOperationLog,
  SystemOperationLogPage,
	SystemNotification,
  SystemRole,
  SystemUser,
} from '../types'
import {
  AGENT_BOT_CAPABILITY_ENABLED,
  AGENT_BOT_CHANNEL_STATUS_ENABLED,
  AGENT_BOT_STATUS_ENABLED,
  AGENT_MODEL_STATUS_ENABLED,
  MENU_STATUS_ENABLED,
  MENU_TYPE_MENU,
  MENU_VISIBLE_YES,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '../types'
import { asRecord, requestJSON } from './api'

export async function listSystemMenus(options?: {
  module?: string
  placement?: string
  tree?: boolean
  status?: number
}): Promise<SystemMenu[]> {
  const params = new URLSearchParams()
  if (options?.module) {
    params.set('module', options.module)
  }
  if (options?.placement) {
    params.set('placement', options.placement)
  }
  if (options?.tree) {
    params.set('tree', '1')
  }
  if (options?.status && options.status > 0) {
    params.set('status', String(options.status))
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const data = await requestJSON<{ menus?: unknown[] }>(`/system/menus/${suffix}`)
  return Array.isArray(data.menus) ? data.menus.map(normalizeSystemMenu) : []
}

export async function getNavMenus(options?: { module?: string }): Promise<SystemMenu[]> {
  const params = new URLSearchParams()
  if (options?.module) {
    params.set('module', options.module)
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const data = await requestJSON<{ menus?: unknown[] }>(`/system/menus/nav${suffix}`)
  return Array.isArray(data.menus) ? data.menus.map(normalizeSystemMenu) : []
}

export async function loginSystem(input: {
  username: string
  password: string
}): Promise<AuthSession> {
  const data = await requestJSON<{ user?: unknown; roles?: unknown[]; accessToken?: unknown; access_token?: unknown; refreshToken?: unknown; refresh_token?: unknown; accessExpiresIn?: unknown; access_expires_in?: unknown; refreshExpiresIn?: unknown; refresh_expires_in?: unknown }>('/system/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
    }),
  })
  const accessExpiresIn = numberValue(data.accessExpiresIn ?? data.access_expires_in)
  const refreshExpiresIn = numberValue(data.refreshExpiresIn ?? data.refresh_expires_in)
  const accessToken = stringValue(data.accessToken ?? data.access_token)
  const refreshToken = stringValue(data.refreshToken ?? data.refresh_token)
  const now = Date.now()
  return {
    user: normalizeSystemUser(data.user),
    roles: Array.isArray(data.roles) ? data.roles.map(normalizeSystemRole) : [],
    accessToken,
    refreshToken,
    accessExpiresIn,
    refreshExpiresIn,
    accessExpiresAt: accessExpiresIn > 0 ? now + accessExpiresIn * 1000 : undefined,
    refreshExpiresAt: refreshExpiresIn > 0 ? now + refreshExpiresIn * 1000 : undefined,
  }
}

export async function listSystemRoles(): Promise<SystemRole[]> {
  const data = await requestJSON<{ roles?: unknown[] }>('/system/roles/')
  return Array.isArray(data.roles) ? data.roles.map(normalizeSystemRole) : []
}

export async function listSystemOperationLogs(options?: {
  module?: string
  action?: string
  resourceType?: string
  resourceId?: string
  operatorId?: string
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<SystemOperationLogPage> {
  const params = new URLSearchParams()
  if (options?.module) params.set('module', options.module)
  if (options?.action) params.set('action', options.action)
  if (options?.resourceType) params.set('resourceType', options.resourceType)
  if (options?.resourceId) params.set('resourceId', options.resourceId)
  if (options?.operatorId) params.set('operatorId', options.operatorId)
  if (options?.keyword) params.set('keyword', options.keyword)
  params.set('page', String(options?.page || 1))
  params.set('pageSize', String(options?.pageSize || 20))
  const data = await requestJSON<{ logs?: unknown[]; total?: unknown }>(`/system/operation-logs/?${params.toString()}`)
  return {
    logs: Array.isArray(data.logs) ? data.logs.map(normalizeSystemOperationLog) : [],
    total: numberValue(data.total),
  }
}

export async function listSystemNotifications(options?: { page?: number; pageSize?: number; unreadOnly?: boolean }): Promise<{ notifications: SystemNotification[]; total: number; unreadCount: number }> {
  const params = new URLSearchParams({ page: String(options?.page || 1), pageSize: String(options?.pageSize || 20) })
  if (options?.unreadOnly) params.set('unreadOnly', 'true')
  const data = await requestJSON<{ notifications?: unknown[]; total?: unknown; unreadCount?: unknown }>(`/system/notifications/?${params.toString()}`)
  return { notifications: Array.isArray(data.notifications) ? data.notifications.map(normalizeSystemNotification) : [], total: numberValue(data.total), unreadCount: numberValue(data.unreadCount) }
}

export async function sendSystemNotification(input: { title: string; content: string; displayType: string; level: string; userIds?: string[] }): Promise<SystemNotification> {
  const data = await requestJSON<{ notification?: unknown }>('/system/notifications/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return normalizeSystemNotification(data.notification)
}

export async function readSystemNotification(id: string): Promise<void> {
  await requestJSON(`/system/notifications/${id}/read`, { method: 'POST' })
}

export async function createSystemRole(input: {
  name: string
  code: string
  status?: number
  remark?: string
  sort?: number
}): Promise<SystemRole> {
  const data = await requestJSON<{ role?: unknown }>('/system/roles/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      status: input.status ?? ROLE_STATUS_ENABLED,
      remark: input.remark || '',
      sort: input.sort ?? 0,
    }),
  })
  return normalizeSystemRole(data.role)
}

export async function updateSystemRole(
  id: string,
  input: {
    name: string
    code: string
    status?: number
    remark?: string
    sort?: number
  },
): Promise<SystemRole> {
  const data = await requestJSON<{ role?: unknown }>(`/system/roles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      code: input.code,
      status: input.status ?? ROLE_STATUS_ENABLED,
      remark: input.remark || '',
      sort: input.sort ?? 0,
    }),
  })
  return normalizeSystemRole(data.role)
}

export async function deleteSystemRole(id: string): Promise<void> {
  await requestJSON(`/system/roles/${id}`, { method: 'DELETE' })
}

export async function enableSystemRole(id: string): Promise<SystemRole> {
  const data = await requestJSON<{ role?: unknown }>(`/system/roles/${id}/enable`, { method: 'POST' })
  return normalizeSystemRole(data.role)
}

export async function disableSystemRole(id: string): Promise<SystemRole> {
  const data = await requestJSON<{ role?: unknown }>(`/system/roles/${id}/disable`, { method: 'POST' })
  return normalizeSystemRole(data.role)
}

export async function getRoleMenus(roleId: string): Promise<string[]> {
  const data = await requestJSON<{ menuIds?: unknown[] }>(`/system/roles/${roleId}/menus`)
  return Array.isArray(data.menuIds) ? data.menuIds.map((item) => stringValue(item)) : []
}

export async function setRoleMenus(roleId: string, menuIds: string[]): Promise<string[]> {
  const data = await requestJSON<{ menuIds?: unknown[] }>(`/system/roles/${roleId}/menus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuIds }),
  })
  return Array.isArray(data.menuIds) ? data.menuIds.map((item) => stringValue(item)) : []
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const data = await requestJSON<{ roleIds?: unknown[] }>(`/system/users/${userId}/roles`)
  return Array.isArray(data.roleIds) ? data.roleIds.map((item) => stringValue(item)) : []
}

export async function setUserRoles(userId: string, roleIds: string[]): Promise<string[]> {
  const data = await requestJSON<{ roleIds?: unknown[] }>(`/system/users/${userId}/roles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleIds }),
  })
  return Array.isArray(data.roleIds) ? data.roleIds.map((item) => stringValue(item)) : []
}

export async function createSystemMenu(input: {
  parentId?: string
  module: string
  placement: string
  name: string
  code: string
  viewKey?: string
  icon?: string
  menuType?: number
  sort?: number
  status?: number
  visible?: number
  isDefault?: boolean
  remark?: string
}): Promise<SystemMenu> {
  const data = await requestJSON<{ menu?: unknown }>('/system/menus/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentId: input.parentId || '',
      module: input.module,
      placement: input.placement,
      name: input.name,
      code: input.code,
      viewKey: input.viewKey || input.code,
      icon: input.icon || '',
      menuType: input.menuType ?? MENU_TYPE_MENU,
      sort: input.sort ?? 0,
      status: input.status ?? MENU_STATUS_ENABLED,
      visible: input.visible ?? MENU_VISIBLE_YES,
      isDefault: Boolean(input.isDefault),
      remark: input.remark || '',
    }),
  })
  return normalizeSystemMenu(data.menu)
}

export async function updateSystemMenu(
  id: string,
  input: {
    parentId?: string
    module: string
    placement: string
    name: string
    code: string
    viewKey?: string
    icon?: string
    menuType?: number
    sort?: number
    status?: number
    visible?: number
    isDefault?: boolean
    remark?: string
  },
): Promise<SystemMenu> {
  const data = await requestJSON<{ menu?: unknown }>(`/system/menus/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentId: input.parentId || '',
      module: input.module,
      placement: input.placement,
      name: input.name,
      code: input.code,
      viewKey: input.viewKey || input.code,
      icon: input.icon || '',
      menuType: input.menuType ?? MENU_TYPE_MENU,
      sort: input.sort ?? 0,
      status: input.status ?? MENU_STATUS_ENABLED,
      visible: input.visible ?? MENU_VISIBLE_YES,
      isDefault: Boolean(input.isDefault),
      remark: input.remark || '',
    }),
  })
  return normalizeSystemMenu(data.menu)
}

export async function deleteSystemMenu(id: string): Promise<void> {
  await requestJSON(`/system/menus/${id}`, { method: 'DELETE' })
}

export async function enableSystemMenu(id: string): Promise<SystemMenu> {
  const data = await requestJSON<{ menu?: unknown }>(`/system/menus/${id}/enable`, { method: 'POST' })
  return normalizeSystemMenu(data.menu)
}

export async function disableSystemMenu(id: string): Promise<SystemMenu> {
  const data = await requestJSON<{ menu?: unknown }>(`/system/menus/${id}/disable`, { method: 'POST' })
  return normalizeSystemMenu(data.menu)
}

export async function getAgentConfig(): Promise<AgentSystemConfig> {
  const data = await requestJSON<{ config?: unknown }>('/system/agent-config/')
  return normalizeAgentSystemConfig(data.config)
}

export async function updateAgentConfig(input: {
  systemPrompt: string
  permissionMode: string
  maxTurns: number
  imageToolEnabled?: boolean
  imageModelId?: string
}): Promise<AgentSystemConfig> {
  const data = await requestJSON<{ config?: unknown }>('/system/agent-config/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: input.systemPrompt,
      permissionMode: input.permissionMode,
      maxTurns: input.maxTurns,
      imageToolEnabled: Boolean(input.imageToolEnabled),
      imageModelId: input.imageModelId || '',
    }),
  })
  return normalizeAgentSystemConfig(data.config)
}

export async function listAgentSessionConfigs(): Promise<AgentSessionConfig[]> {
  const data = await requestJSON<{ configs?: unknown[] }>('/system/agent-session-configs/')
  const configs = Array.isArray(data.configs) ? data.configs.map(normalizeAgentSessionConfig) : []
  return mergeAgentSessionConfigDefaults(configs)
}

export async function updateAgentSessionConfig(
  sessionType: AgentSessionConfigType,
  input: {
    systemPrompt: string
    permissionMode: string
    maxTurns: number
    modelId: string
    enabled?: boolean
  },
): Promise<AgentSessionConfig> {
  const data = await requestJSON<{ config?: unknown }>(`/system/agent-session-configs/${sessionType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionType,
      systemPrompt: input.systemPrompt,
      permissionMode: input.permissionMode,
      maxTurns: input.maxTurns,
      modelId: input.modelId,
      enabled: input.enabled ?? true,
    }),
  })
  return normalizeAgentSessionConfig({
    ...findAgentSessionConfigDefault(sessionType),
    ...asRecord(data.config),
    sessionType,
  })
}

export async function listAgentModels(): Promise<AgentModel[]> {
  const data = await requestJSON<{ models?: unknown[] }>('/system/agent-models/')
  return Array.isArray(data.models) ? data.models.map(normalizeAgentModel) : []
}

export async function createAgentModel(input: {
  name: string
  model: string
  baseUrl?: string
  authToken?: string
  thinkConfig?: Partial<AgentModelThinkConfig>
  status?: number
  isDefault?: boolean
  sort?: number
  remark?: string
  type?: string
}): Promise<AgentModel> {
  const data = await requestJSON<{ model?: unknown }>('/system/agent-models/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      model: input.model,
      baseUrl: input.baseUrl || '',
      authToken: input.authToken || '',
      thinkConfig: normalizeThinkConfigPayload(input.thinkConfig),
      status: input.status ?? AGENT_MODEL_STATUS_ENABLED,
      isDefault: Boolean(input.isDefault),
      sort: input.sort ?? 0,
      remark: input.remark || '',
      type: input.type || 'chat',
    }),
  })
  return normalizeAgentModel(data.model)
}

export async function updateAgentModel(
  id: string,
  input: {
    name: string
    model: string
    baseUrl?: string
    authToken?: string
    thinkConfig?: Partial<AgentModelThinkConfig>
    status?: number
    isDefault?: boolean
    sort?: number
    remark?: string
    type?: string
  },
): Promise<AgentModel> {
  const data = await requestJSON<{ model?: unknown }>(`/system/agent-models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      model: input.model,
      baseUrl: input.baseUrl || '',
      authToken: input.authToken || '',
      thinkConfig: normalizeThinkConfigPayload(input.thinkConfig),
      status: input.status ?? AGENT_MODEL_STATUS_ENABLED,
      isDefault: Boolean(input.isDefault),
      sort: input.sort ?? 0,
      remark: input.remark || '',
      type: input.type || 'chat',
    }),
  })
  return normalizeAgentModel(data.model)
}

export async function deleteAgentModel(id: string): Promise<void> {
  await requestJSON(`/system/agent-models/${id}`, { method: 'DELETE' })
}

export async function enableAgentModel(id: string): Promise<AgentModel> {
  const data = await requestJSON<{ model?: unknown }>(`/system/agent-models/${id}/enable`, { method: 'POST' })
  return normalizeAgentModel(data.model)
}

export async function disableAgentModel(id: string): Promise<AgentModel> {
  const data = await requestJSON<{ model?: unknown }>(`/system/agent-models/${id}/disable`, { method: 'POST' })
  return normalizeAgentModel(data.model)
}

export async function listAgentBots(): Promise<AgentBot[]> {
  const data = await requestJSON<{ bots?: unknown[] }>('/ai-agent/agent-bots/')
  return Array.isArray(data.bots) ? data.bots.map(normalizeAgentBot) : []
}

export async function createAgentBot(input: AgentBotPayload): Promise<AgentBot> {
  const data = await requestJSON<{ bot?: unknown }>('/ai-agent/agent-bots/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeAgentBotPayload(input)),
  })
  return normalizeAgentBot(data.bot)
}

export async function updateAgentBot(id: string, input: AgentBotPayload): Promise<AgentBot> {
  const data = await requestJSON<{ bot?: unknown }>(`/ai-agent/agent-bots/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeAgentBotPayload(input)),
  })
  return normalizeAgentBot(data.bot)
}

export async function deleteAgentBot(id: string): Promise<void> {
  await requestJSON(`/ai-agent/agent-bots/${id}`, { method: 'DELETE' })
}

export async function enableAgentBot(id: string): Promise<AgentBot> {
  const data = await requestJSON<{ bot?: unknown }>(`/ai-agent/agent-bots/${id}/enable`, { method: 'POST' })
  return normalizeAgentBot(data.bot)
}

export async function disableAgentBot(id: string): Promise<AgentBot> {
  const data = await requestJSON<{ bot?: unknown }>(`/ai-agent/agent-bots/${id}/disable`, { method: 'POST' })
  return normalizeAgentBot(data.bot)
}

export function normalizeAgentModel(raw: unknown): AgentModel {
  const data = asRecord(raw)
  const thinkConfig = asRecord(data.thinkConfig ?? data.think_config)
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    model: stringValue(data.model),
    baseUrl: stringValue(data.baseUrl ?? data.base_url),
    authToken: stringValue(data.authToken ?? data.auth_token) || undefined,
    thinkConfig: {
      mode: stringValue(thinkConfig.mode),
      budgetTokens: numberValue(thinkConfig.budgetTokens ?? thinkConfig.budget_tokens),
      display: stringValue(thinkConfig.display),
      maxThinkingTokens: numberValue(thinkConfig.maxThinkingTokens ?? thinkConfig.max_thinking_tokens),
    },
    status: numberValue(data.status),
    isDefault: Boolean(data.isDefault ?? data.is_default),
    sort: numberValue(data.sort),
    remark: stringValue(data.remark),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    type: stringValue(data.type) || 'chat',
  }
}

export type AgentBotPayload = Omit<AgentBot, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

function normalizeAgentBotPayload(input: AgentBotPayload) {
  return {
    name: input.name,
    code: input.code,
    status: input.status || AGENT_BOT_STATUS_ENABLED,
    description: input.description || '',
    businessScene: input.businessScene || '',
    welcomeMessage: input.welcomeMessage || '',
    modelId: input.modelId || '',
    systemPrompt: input.systemPrompt || '',
    permissionMode: input.permissionMode || 'bypassPermissions',
    maxTurns: input.maxTurns || 20,
    channels: input.channels.map((channel) => ({
      id: channel.id || '',
      channel: channel.channel,
      name: channel.name,
      status: channel.status || AGENT_BOT_CHANNEL_STATUS_ENABLED,
      externalBotId: channel.externalBotId,
      secret: channel.secret || '',
      endpointUrl: channel.endpointUrl || '',
      configJson: channel.configJson || '',
    })),
    capabilities: input.capabilities.map((capability) => ({
      id: capability.id || '',
      capabilityType: capability.capabilityType,
      capabilityId: capability.capabilityId,
      name: capability.name,
      enabled: capability.enabled || AGENT_BOT_CAPABILITY_ENABLED,
    })),
  }
}

export function normalizeAgentBot(raw: unknown): AgentBot {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    code: stringValue(data.code),
    status: numberValue(data.status) || AGENT_BOT_STATUS_ENABLED,
    description: stringValue(data.description),
    businessScene: stringValue(data.businessScene ?? data.business_scene),
    welcomeMessage: stringValue(data.welcomeMessage ?? data.welcome_message),
    modelId: stringValue(data.modelId ?? data.model_id),
    systemPrompt: stringValue(data.systemPrompt ?? data.system_prompt),
    permissionMode: stringValue(data.permissionMode ?? data.permission_mode) || 'bypassPermissions',
    maxTurns: numberValue(data.maxTurns ?? data.max_turns) || 20,
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    channels: Array.isArray(data.channels) ? data.channels.map(normalizeAgentBotChannel) : [],
    capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(normalizeAgentBotCapability) : [],
  }
}

function normalizeAgentBotChannel(raw: unknown): AgentBotChannel {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    botId: stringValue(data.botId ?? data.bot_id),
    channel: stringValue(data.channel) || 'wecom',
    name: stringValue(data.name),
    status: numberValue(data.status) || AGENT_BOT_CHANNEL_STATUS_ENABLED,
    externalBotId: stringValue(data.externalBotId ?? data.external_bot_id),
    secret: stringValue(data.secret) || undefined,
    endpointUrl: stringValue(data.endpointUrl ?? data.endpoint_url),
    configJson: stringValue(data.configJson ?? data.config_json),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeAgentBotCapability(raw: unknown): AgentBotCapability {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    botId: stringValue(data.botId ?? data.bot_id),
    capabilityType: stringValue(data.capabilityType ?? data.capability_type) as AgentBotCapability['capabilityType'],
    capabilityId: stringValue(data.capabilityId ?? data.capability_id),
    name: stringValue(data.name),
    enabled: numberValue(data.enabled) || AGENT_BOT_CAPABILITY_ENABLED,
    createdAt: numberValue(data.createdAt ?? data.created_at),
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

function normalizeThinkConfigPayload(input?: Partial<AgentModelThinkConfig>) {
  return {
    mode: input?.mode || 'adaptive',
    budgetTokens: input?.budgetTokens ?? 4096,
    display: input?.display || 'summarized',
    maxThinkingTokens: input?.maxThinkingTokens ?? 0,
  }
}

export function normalizeAgentSystemConfig(raw: unknown): AgentSystemConfig {
  const data = asRecord(raw)
  return {
    systemPrompt: stringValue(data.systemPrompt ?? data.system_prompt),
    permissionMode: stringValue(data.permissionMode ?? data.permission_mode) || 'bypassPermissions',
    maxTurns: numberValue(data.maxTurns ?? data.max_turns) || 20,
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
    imageToolEnabled: Boolean(data.imageToolEnabled ?? data.image_tool_enabled),
    imageModelId: stringValue(data.imageModelId ?? data.image_model_id),
  }
}

export const AGENT_SESSION_CONFIG_DEFAULTS: AgentSessionConfig[] = [
  {
    sessionType: 'func_product',
    name: '产品方案',
    description: '用于功能搭建的产品目标、页面范围与业务流程梳理。',
    systemPrompt: '你是功能搭建流程中的产品负责人。你的任务是把用户的想法整理成可评审、可实现、可验收的产品需求，不写代码、不设计数据库和具体接口。只依据用户输入和已有业务上下文，不凭空添加规则、角色、字段或外部服务；缺少会改变范围的关键信息时先澄清。围绕真实操作闭环明确页面、业务对象、字段、筛选、状态流转、权限边界及加载/空/错误状态，区分只读操作与受控操作。输出结构固定为：业务目标与成功标准、目标用户与场景、核心流程、页面与交互、业务对象与字段、操作与权限、状态与异常、范围边界、验收标准。不要输出 SQL、代码、伪造 API 地址、密钥或实现细节。',
    permissionMode: 'bypassPermissions',
    maxTurns: 20,
    modelId: '',
    enabled: true,
    updatedAt: 0,
  },
  {
    sessionType: 'func_technical',
    name: '技术方案',
    description: '用于基于产品方案设计数据模型、接口契约和实现计划。',
    systemPrompt: '你是功能搭建流程中的技术负责人。请基于已采用的产品方案，产出供页面生成直接执行的实现合同，不写最终业务代码。不要改变产品范围、字段语义或流程；明确页面组件、数据模型、查询、状态变更 action、请求/响应、校验、权限、异常恢复和响应式布局。所有 action 名称在页面、API、后端 dispatch、manifest 和 App Skill 中保持一致；外部接口只能使用已有 API 客户端，公共选项只能引用明确 config_key。业务请求使用 context.invokeData 或 context.invoke，说明 iframe 滚动、权限透传、日志和脱敏要求。输出模块拆分、页面与组件、数据模型、API/action、状态校验、异常恢复、权限、验收和可观测性。',
    permissionMode: 'bypassPermissions',
    maxTurns: 20,
    modelId: '',
    enabled: true,
    updatedAt: 0,
  },
  {
    sessionType: 'func_generation',
    name: '页面生成',
    description: '用于根据产品与技术方案生成、修复和刷新可操作页面。',
    systemPrompt: '你是功能搭建流程中的资深实现工程师。请根据已采用的产品方案和技术方案，生成或修改真正可操作的业务页面与后端能力，不要把方案文字拼成说明页。先读取文档并检查现有应用，严格遵守字段、action、权限和响应合同；完整实现真实业务闭环、加载/空/校验/错误/成功状态，不用静态假数据或占位按钮掩盖未完成能力。业务请求只能通过 context.invokeData 或 context.invoke，manifest.actions 的受控操作必须在所有界面调用 context.can 并在事件中再次校验。适配 390x844、768x1024 和桌面端，避免固定宽度、横向溢出、文字重叠和 iframe 滚动问题。完成前检查导入导出、权限、action 对齐、错误恢复和响应式布局，并运行构建或自检；未实际验证不得声称完成。',
    permissionMode: 'bypassPermissions',
    maxTurns: 30,
    modelId: '',
    enabled: true,
    updatedAt: 0,
  },
]

export function normalizeAgentSessionConfig(raw: unknown): AgentSessionConfig {
  const data = asRecord(raw)
  const sessionType = normalizeAgentSessionConfigType(data.sessionType ?? data.session_type)
  const defaults = findAgentSessionConfigDefault(sessionType)
  return {
    ...defaults,
    sessionType,
    name: stringValue(data.name) || defaults.name,
    description: stringValue(data.description) || defaults.description,
    systemPrompt: stringValue(data.systemPrompt ?? data.system_prompt) || defaults.systemPrompt,
    permissionMode: stringValue(data.permissionMode ?? data.permission_mode) || defaults.permissionMode,
    maxTurns: numberValue(data.maxTurns ?? data.max_turns) || defaults.maxTurns,
    modelId: stringValue(data.modelId ?? data.model_id),
    enabled: typeof data.enabled === 'boolean' ? data.enabled : defaults.enabled,
    updatedAt: numberValue(data.updatedAt ?? data.updated_at),
  }
}

export function normalizeSystemMenu(raw: unknown): SystemMenu {
  const data = asRecord(raw)
  const children = Array.isArray(data.children) ? data.children.map(normalizeSystemMenu) : undefined
  return {
    id: stringValue(data.id),
    parentId: stringValue(data.parentId ?? data.parent_id),
    module: stringValue(data.module),
    placement: stringValue(data.placement),
    name: stringValue(data.name),
    code: stringValue(data.code),
    viewKey: stringValue(data.viewKey ?? data.view_key),
    icon: stringValue(data.icon),
    menuType: numberValue(data.menuType ?? data.menu_type),
    sort: numberValue(data.sort),
    status: numberValue(data.status),
    visible: numberValue(data.visible),
    isDefault: Boolean(data.isDefault ?? data.is_default),
    remark: stringValue(data.remark),
    sourceType: stringValue(data.sourceType ?? data.source_type) || undefined,
    sourceId: stringValue(data.sourceId ?? data.source_id) || undefined,
    createdAt: numberValue(data.createdAt ?? data.created_at),
    children,
  }
}

export async function listSystemUsers(): Promise<SystemUser[]> {
  const data = await requestJSON<{ users?: unknown[] }>('/system/users/')
  return Array.isArray(data.users) ? data.users.map(normalizeSystemUser) : []
}

export async function createSystemUser(input: {
  username: string
  email: string
  password: string
  phone?: string
  status?: number
}): Promise<SystemUser> {
  const data = await requestJSON<{ user?: unknown }>('/system/users/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      password: input.password,
      phone: input.phone || '',
      status: input.status ?? USER_STATUS_ENABLED,
    }),
  })
  return normalizeSystemUser(data.user)
}

export async function updateSystemUser(
  id: string,
  input: {
    username: string
    email: string
    password?: string
    phone?: string
    status?: number
  },
): Promise<SystemUser> {
  const data = await requestJSON<{ user?: unknown }>(`/system/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      password: input.password || '',
      phone: input.phone || '',
      status: input.status ?? USER_STATUS_ENABLED,
    }),
  })
  return normalizeSystemUser(data.user)
}

export async function deleteSystemUser(id: string): Promise<void> {
  await requestJSON(`/system/users/${id}`, { method: 'DELETE' })
}

export async function enableSystemUser(id: string): Promise<SystemUser> {
  const data = await requestJSON<{ user?: unknown }>(`/system/users/${id}/enable`, {
    method: 'POST',
  })
  return normalizeSystemUser(data.user)
}

export async function disableSystemUser(id: string): Promise<SystemUser> {
  const data = await requestJSON<{ user?: unknown }>(`/system/users/${id}/disable`, {
    method: 'POST',
  })
  return normalizeSystemUser(data.user)
}

export function normalizeSystemUser(raw: unknown): SystemUser {
  const data = asRecord(raw)
  const roleIds = Array.isArray(data.roleIds)
    ? data.roleIds.map((item) => stringValue(item))
    : Array.isArray(data.role_ids)
      ? data.role_ids.map((item) => stringValue(item))
      : undefined
  return {
    id: stringValue(data.id),
    username: stringValue(data.username),
    email: stringValue(data.email),
    phone: stringValue(data.phone),
    status: numberValue(data.status),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    roleIds,
  }
}

export function normalizeSystemRole(raw: unknown): SystemRole {
  const data = asRecord(raw)
  const menuIds = Array.isArray(data.menuIds)
    ? data.menuIds.map((item) => stringValue(item))
    : Array.isArray(data.menu_ids)
      ? data.menu_ids.map((item) => stringValue(item))
      : undefined
  return {
    id: stringValue(data.id),
    name: stringValue(data.name),
    code: stringValue(data.code),
    status: numberValue(data.status),
    remark: stringValue(data.remark),
    sort: numberValue(data.sort),
    createdAt: numberValue(data.createdAt ?? data.created_at),
    menuIds,
  }
}

export function normalizeSystemOperationLog(raw: unknown): SystemOperationLog {
  const data = asRecord(raw)
  return {
    id: stringValue(data.id),
    module: stringValue(data.module),
    action: stringValue(data.action),
    actionLabel: stringValue(data.actionLabel ?? data.action_label),
    resourceType: stringValue(data.resourceType ?? data.resource_type),
    resourceId: stringValue(data.resourceId ?? data.resource_id),
    resourceName: stringValue(data.resourceName ?? data.resource_name),
    operatorId: stringValue(data.operatorId ?? data.operator_id),
    operatorName: stringValue(data.operatorName ?? data.operator_name),
    summary: stringValue(data.summary),
    beforeData: stringValue(data.beforeData ?? data.before_data),
    afterData: stringValue(data.afterData ?? data.after_data),
    createdAt: numberValue(data.createdAt ?? data.created_at),
  }
}

export function normalizeSystemNotification(raw: unknown): SystemNotification {
  const data = asRecord(raw)
  const displayType = stringValue(data.displayType ?? data.display_type)
  const level = stringValue(data.level)
  return {
    id: stringValue(data.id),
    title: stringValue(data.title),
    content: stringValue(data.content),
    displayType: displayType === 'modal' ? 'modal' : 'toast',
    level: level === 'success' || level === 'warning' || level === 'error' ? level : 'info',
    targetUserId: stringValue(data.targetUserId ?? data.target_user_id),
    targetUserName: stringValue(data.targetUserName ?? data.target_user_name),
    read: Boolean(data.read),
    createdAt: numberValue(data.createdAt ?? data.created_at),
  }
}

function mergeAgentSessionConfigDefaults(configs: AgentSessionConfig[]): AgentSessionConfig[] {
  return AGENT_SESSION_CONFIG_DEFAULTS.map((defaults) => {
    const matched = configs.find((item) => item.sessionType === defaults.sessionType)
    return matched ? { ...defaults, ...matched } : defaults
  })
}

function findAgentSessionConfigDefault(sessionType: AgentSessionConfigType): AgentSessionConfig {
  return AGENT_SESSION_CONFIG_DEFAULTS.find((item) => item.sessionType === sessionType) || AGENT_SESSION_CONFIG_DEFAULTS[0]
}

function normalizeAgentSessionConfigType(value: unknown): AgentSessionConfigType {
  if (value === 'func_technical' || value === 'func_generation') {
    return value
  }
  return 'func_product'
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
