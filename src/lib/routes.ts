import type { ModuleKey } from '../types'

export type EditorStep = 'product' | 'technical' | 'code' | 'preview'

const EDITOR_STEPS = new Set<EditorStep>(['product', 'technical', 'code', 'preview'])

export const ROUTES = {
  login: '/login',
  root: '/',
} as const

export function getModuleFromPath(pathname: string): ModuleKey | null {
  const segment = pathname.split('/').filter(Boolean)[0]
  if (segment === 'system' || segment === 'ai-agent' || segment === 'func-operation') {
    return segment
  }
  return null
}

export function buildSystemPath(viewKey: string): string {
  return `/system/${viewKey}`
}

export function buildAiAgentPath(viewKey: string, sessionId?: string): string {
  if (viewKey === 'chat') {
    return sessionId ? `/ai-agent/chat/${sessionId}` : '/ai-agent/chat'
  }
  return `/ai-agent/${viewKey}`
}

export function buildFuncPublishedPath(functionId?: string): string {
  return functionId ? `/func-operation/published/${functionId}` : '/func-operation/published'
}

export function buildFuncAdminPath(viewKey?: string): string {
  return viewKey ? `/func-operation/admin/${viewKey}` : '/func-operation/admin'
}

export function buildFuncEditorPath(functionId: string, step?: EditorStep): string {
  return step
    ? `/func-operation/admin/editor/${functionId}/${step}`
    : `/func-operation/admin/editor/${functionId}`
}

export function buildModulePath(module: ModuleKey, defaultViewKey?: string): string {
  switch (module) {
    case 'system':
      return defaultViewKey ? buildSystemPath(defaultViewKey) : '/system'
    case 'ai-agent':
      return defaultViewKey ? buildAiAgentPath(defaultViewKey) : '/ai-agent/chat'
    case 'func-operation':
      return buildFuncPublishedPath()
  }
}

export function parseSystemPath(pathname: string): { viewKey: string | null } {
  const match = pathname.match(/^\/system(?:\/([^/]+))?\/?$/)
  return { viewKey: match?.[1] ?? null }
}

export function parseAiAgentPath(pathname: string): { viewKey: string | null; sessionId: string | null } {
  const chatMatch = pathname.match(/^\/ai-agent\/chat(?:\/([^/]+))?\/?$/)
  if (chatMatch) {
    return { viewKey: 'chat', sessionId: chatMatch[1] ?? null }
  }
  const viewMatch = pathname.match(/^\/ai-agent\/([^/]+)\/?$/)
  return { viewKey: viewMatch?.[1] ?? null, sessionId: null }
}

export function parseFuncOperationPath(pathname: string): {
  mode: 'published' | 'admin' | null
  functionId: string | null
  step: EditorStep | null
  isEditor: boolean
  adminViewKey: string | null
} {
  const editorMatch = pathname.match(/^\/func-operation\/admin\/editor\/([^/]+)(?:\/([^/]+))?\/?$/)
  if (editorMatch) {
    const rawStep = editorMatch[2]
    const step = rawStep && EDITOR_STEPS.has(rawStep as EditorStep) ? (rawStep as EditorStep) : null
    return {
      mode: 'admin',
      functionId: editorMatch[1],
      step,
      isEditor: true,
      adminViewKey: null,
    }
  }
  const adminMatch = pathname.match(/^\/func-operation\/admin(?:\/([^/]+))?\/?$/)
  if (adminMatch) {
    return {
      mode: 'admin',
      functionId: null,
      step: null,
      isEditor: false,
      adminViewKey: adminMatch[1] ?? null,
    }
  }
  const publishedMatch = pathname.match(/^\/func-operation\/published(?:\/([^/]+))?\/?$/)
  if (publishedMatch) {
    return {
      mode: 'published',
      functionId: publishedMatch[1] ?? null,
      step: null,
      isEditor: false,
      adminViewKey: null,
    }
  }
  if (/^\/func-operation\/?$/.test(pathname)) {
    return { mode: null, functionId: null, step: null, isEditor: false, adminViewKey: null }
  }
  return { mode: null, functionId: null, step: null, isEditor: false, adminViewKey: null }
}

export function isAppPath(pathname: string): boolean {
  return getModuleFromPath(pathname) !== null
}

/** 功能编辑页全屏沉浸：隐藏左侧模块导航栏 */
export function isFuncEditorImmersivePath(pathname: string): boolean {
  const route = parseFuncOperationPath(pathname)
  return route.isEditor && Boolean(route.functionId)
}
