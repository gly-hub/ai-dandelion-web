import { isFuncMenuViewKey } from './funcMenus'
import {
  buildMenuBreadcrumbTrail,
  findNavMenuByViewKey,
  pickDefaultViewKey,
} from './navMenus'
import {
  buildFuncAdminPath,
  buildFuncEditorPath,
  buildFuncPublishedPath,
  buildSystemPath,
  type EditorStep,
} from './routes'
import type { SystemMenu } from '../types'

export type BreadcrumbNavItem = {
  label: string
  path?: string
}

const EDITOR_STEP_LABELS: Record<EditorStep, string> = {
  product: '产品方案',
  technical: '技术方案',
  code: '页面生成',
  preview: '预览确认',
}

export function getEditorStepLabel(step: EditorStep): string {
  return EDITOR_STEP_LABELS[step]
}

export function buildSystemBreadcrumbs(
  moduleLabel: string,
  navMenus: SystemMenu[],
  activeViewKey: string,
): BreadcrumbNavItem[] {
  const defaultViewKey = pickDefaultViewKey(navMenus, 'users')
  const trail = buildMenuBreadcrumbTrail(navMenus, activeViewKey)
  const items: BreadcrumbNavItem[] = [{ label: moduleLabel, path: buildSystemPath(defaultViewKey) }]

  if (trail.length === 0) {
    const page = findNavMenuByViewKey(navMenus, activeViewKey)
    items.push({ label: page?.name || activeViewKey })
    return items
  }

  trail.forEach((menu) => {
    items.push({ label: menu.name })
  })

  return items
}

export function buildFuncPublishedBreadcrumbs(
  moduleLabel: string,
  sidebarMenus: SystemMenu[],
  activeViewKey: string,
  functionName?: string,
): BreadcrumbNavItem[] {
  const items: BreadcrumbNavItem[] = [
    { label: moduleLabel, path: buildFuncPublishedPath() },
    { label: '功能使用', path: buildFuncPublishedPath() },
  ]

  if (!isFuncMenuViewKey(activeViewKey)) {
    items.push({ label: '功能面板' })
    return items
  }

  const trail = buildMenuBreadcrumbTrail(sidebarMenus, activeViewKey)
  if (trail.length > 1) {
    trail.slice(0, -1).forEach((menu) => {
      items.push({ label: menu.name })
    })
  }

  items.push({ label: functionName || trail[trail.length - 1]?.name || '功能详情' })
  return items
}

export function buildFuncAdminBreadcrumbs(
  moduleLabel: string,
  adminNavMenus: SystemMenu[],
  activeAdminNavViewKey: string,
  options?: {
    functionName?: string
    functionId?: string
    step?: EditorStep | null
  },
): BreadcrumbNavItem[] {
  const items: BreadcrumbNavItem[] = [
    { label: moduleLabel, path: buildFuncPublishedPath() },
    { label: '管理后台', path: buildFuncAdminPath() },
  ]

  if (options?.functionId) {
    const adminPageMenu = findNavMenuByViewKey(adminNavMenus, activeAdminNavViewKey)
    items.push({
      label: adminPageMenu?.name || '功能管理',
      path: buildFuncAdminPath(),
    })
    items.push({
      label: options.functionName || '功能编辑',
      path: buildFuncEditorPath(options.functionId),
    })
    if (options.step) {
      items.push({ label: getEditorStepLabel(options.step) })
    }
    return items
  }

  const trail = buildMenuBreadcrumbTrail(adminNavMenus, activeAdminNavViewKey)
  if (trail.length > 0) {
    trail.forEach((menu) => {
      items.push({ label: menu.name })
    })
    return items
  }

  items.push({ label: '功能管理' })
  return items
}
