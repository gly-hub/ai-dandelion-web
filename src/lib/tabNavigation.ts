import { getFuncAdminNavMenus, getFuncUserSidebarNavMenus } from './funcNavMenus'
import { buildFuncMenuViewKey } from './funcMenus'
import {
  buildMenuBreadcrumbTrail,
  buildModuleLabelMap,
  findNavMenuByViewKey,
  getModuleLabel,
  getModuleNavMenus,
  pickDefaultViewKey,
} from './navMenus'
import {
  buildFuncAdminPath,
  buildFuncPublishedPath,
  buildModulePath,
  getModuleFromPath,
  parseFuncOperationPath,
  parseSystemPath,
} from './routes'
import type { ModuleKey, SystemMenu } from '../types'

export type TabRecord = {
  path: string
  title: string
}

/** 标签作用域：功能模块内「使用侧」与「管理侧」分开维护 */
export type TabScope = 'system' | 'func-published' | 'func-admin'

export type TabScopeState = Partial<Record<TabScope, TabRecord[]>>

export const TAB_STORAGE_KEY = 'ai-dandelion-console-tabs'
export const MAX_TABS_PER_MODULE = 24

export function normalizeTabPath(path: string): string {
  const pathname = path.split('?')[0].split('#')[0]
  if (!pathname || pathname === '/') {
    return '/'
  }
  return pathname.replace(/\/+$/, '')
}

const TAB_ENABLED_MODULES = new Set<ModuleKey>(['system', 'func-operation'])

export function isTabModuleEnabled(module: ModuleKey | null): module is ModuleKey {
  return module !== null && TAB_ENABLED_MODULES.has(module)
}

export function resolveTabScope(pathname: string): TabScope | null {
  const path = normalizeTabPath(pathname)
  const module = getModuleFromPath(path)
  if (module === 'system') {
    return 'system'
  }
  if (module !== 'func-operation') {
    return null
  }

  const route = parseFuncOperationPath(path)
  if (route.isEditor || route.mode === 'admin') {
    return null
  }
  if (route.mode === 'published' && route.functionId) {
    return 'func-published'
  }
  return null
}

export function isTabbablePath(pathname: string): boolean {
  return resolveTabScope(pathname) !== null
}

export function sanitizeScopeTabs(scope: TabScope, tabs: TabRecord[]): TabRecord[] {
  return tabs.filter((tab) => resolveTabScope(normalizeTabPath(tab.path)) === scope)
}

export function resolveTabTitle(pathname: string, navTree: SystemMenu[]): string {
  const path = normalizeTabPath(pathname)
  const scope = resolveTabScope(path)
  if (!scope) {
    return '首页'
  }

  const labelMap = buildModuleLabelMap(navTree)

  switch (scope) {
    case 'system':
      return resolveSystemTabTitle(path, navTree, getModuleLabel('system', labelMap))
    case 'func-published':
      return resolveFuncPublishedTabTitle(path, navTree)
    case 'func-admin':
      return resolveFuncAdminTabTitle(path, navTree)
  }
}

function resolveSystemTabTitle(path: string, navTree: SystemMenu[], moduleLabel: string): string {
  const navMenus = getModuleNavMenus(navTree, 'system')
  const { viewKey } = parseSystemPath(path)
  if (!viewKey) {
    return moduleLabel
  }
  const trail = buildMenuBreadcrumbTrail(navMenus, viewKey)
  if (trail.length > 0) {
    return trail[trail.length - 1].name
  }
  const page = findNavMenuByViewKey(navMenus, viewKey)
  return page?.name || viewKey
}

function resolveFuncPublishedTabTitle(path: string, navTree: SystemMenu[]): string {
  const funcNavMenus = getModuleNavMenus(navTree, 'func-operation')
  const userSidebarMenus = getFuncUserSidebarNavMenus(funcNavMenus)
  const route = parseFuncOperationPath(path)

  if (!route.functionId) {
    return '功能'
  }

  const viewKey = buildFuncMenuViewKey(route.functionId)
  const trail = buildMenuBreadcrumbTrail(userSidebarMenus, viewKey)
  if (trail.length > 0) {
    return trail[trail.length - 1].name
  }
  const page = findNavMenuByViewKey(userSidebarMenus, viewKey)
  return page?.name || '功能详情'
}

function resolveFuncAdminTabTitle(_path: string, navTree: SystemMenu[]): string {
  const funcNavMenus = getModuleNavMenus(navTree, 'func-operation')
  const adminNavMenus = getFuncAdminNavMenus(funcNavMenus)
  const trail = buildMenuBreadcrumbTrail(adminNavMenus, 'admin-functions')
  return trail[trail.length - 1]?.name || '功能管理'
}

export function getTabScopeDefaultPath(scope: TabScope, navTree: SystemMenu[]): string {
  switch (scope) {
    case 'system':
      return getModuleDefaultPath('system', navTree)
    case 'func-published':
      return buildFuncPublishedPath()
    case 'func-admin':
      return buildFuncAdminPath()
  }
}
export function getModuleDefaultPath(module: ModuleKey, navTree: SystemMenu[]): string {
  const defaultViewKey =
    module === 'system'
      ? pickDefaultViewKey(getModuleNavMenus(navTree, 'system'), 'users')
      : module === 'ai-agent'
        ? pickDefaultViewKey(getModuleNavMenus(navTree, 'ai-agent'), 'chat')
        : undefined
  return buildModulePath(module, defaultViewKey)
}

export function upsertModuleTab(
  tabs: TabRecord[],
  path: string,
  title: string,
): TabRecord[] {
  const normalized = normalizeTabPath(path)
  const existingIndex = tabs.findIndex((tab) => normalizeTabPath(tab.path) === normalized)
  if (existingIndex >= 0) {
    const current = tabs[existingIndex]
    if (current.title === title && normalizeTabPath(current.path) === normalized) {
      return tabs
    }
    const next = [...tabs]
    next[existingIndex] = { path: normalized, title }
    return next
  }

  const next = [...tabs, { path: normalized, title }]
  if (next.length <= MAX_TABS_PER_MODULE) {
    return next
  }
  return next.slice(next.length - MAX_TABS_PER_MODULE)
}
