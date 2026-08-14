import { FUNC_ADMIN_PAGE } from './buttonPermissions'
import {
  findFirstFuncMenuViewKey,
  findFuncUseMenu,
  isFuncMenuViewKey,
} from './funcMenus'
import {
  flattenMenus,
  isNavDirectory,
  nestMenusByParent,
  pickDefaultViewKey,
  resolveMenuViewKey,
  sortMenus,
} from './navMenus'
import type { SystemMenu } from '../types'
import { MENU_TYPE_MENU } from '../types'

export function matchFuncNavViewKey(viewKey: string, target: string) {
  return viewKey === target || viewKey.endsWith(`.${target}`)
}

export function isFuncUsePageView(viewKey: string) {
  return matchFuncNavViewKey(viewKey, 'published')
}

export function isFuncAdminPageView(viewKey: string) {
  return matchFuncNavViewKey(viewKey, FUNC_ADMIN_PAGE)
}

export function isFuncAdminPageMenu(menu: SystemMenu): boolean {
  const key = resolveMenuViewKey(menu)
  if (isFuncAdminPageView(key)) {
    return true
  }
  return menu.menuType === MENU_TYPE_MENU && (menu.code.endsWith('.functions') || menu.code.endsWith('.configs'))
}

/** 后台管理目录：包含后台页面或其子目录（如 后台管理 → 功能管理 → 功能列表） */
export function isFuncAdminNavContainer(menu: SystemMenu): boolean {
  if (!isNavDirectory(menu) || !menu.children?.length) {
    return false
  }
  return menu.children.some(
    (child) => isFuncAdminPageMenu(child) || isFuncAdminNavContainer(child),
  )
}

/** 用户侧导航：排除整个后台管理子树 */
export function getFuncUserNavMenus(menus: SystemMenu[]): SystemMenu[] {
  return sortMenus(menus).filter((menu) => !isFuncAdminPageMenu(menu) && !isFuncAdminNavContainer(menu))
}

/**
 * 用户侧侧边栏：展示「功能使用」下的目录与已发布功能菜单。
 * 若无子菜单则回退到功能使用锚点本身。
 */
export function getFuncUserSidebarNavMenus(menus: SystemMenu[]): SystemMenu[] {
  const userMenus = getFuncUserNavMenus(menus)
  const nested = ensureNestedMenus(userMenus)
  const funcUse = findFuncUseMenu(nested)
  if (funcUse?.children?.length) {
    return sortMenus(funcUse.children)
  }
  return []
}

/**
 * 管理后台侧边栏菜单。
 * 顶层入口目录（如「后台管理 / console.manager」）仅作跳转锚点，不在侧边栏展示，直接展开其子菜单。
 */
export function getFuncAdminNavMenus(menus: SystemMenu[]): SystemMenu[] {
  const nested = ensureNestedMenus(menus)
  const topLevelRoots = sortMenus(nested).filter(
    (menu) => isFuncAdminNavContainer(menu) || isFuncAdminPageMenu(menu),
  )

  if (topLevelRoots.length === 0) {
    return flattenMenus(nested).filter(isFuncAdminPageMenu)
  }

  return unwrapAdminEntryShell(topLevelRoots)
}

/** 去掉仅作入口的顶层后台目录，展示其下子菜单 */
function unwrapAdminEntryShell(menus: SystemMenu[]): SystemMenu[] {
  if (
    menus.length === 1 &&
    isFuncAdminNavContainer(menus[0]) &&
    !isFuncAdminPageMenu(menus[0]) &&
    menus[0].children?.length
  ) {
    return sortMenus(menus[0].children)
  }
  return menus
}

function ensureNestedMenus(menus: SystemMenu[]): SystemMenu[] {
  const flat = flattenMenus(menus)
  const hasParentReference = flat.some(
    (item) => item.parentId && flat.some((candidate) => candidate.id === item.parentId),
  )
  if (hasParentReference) {
    return nestMenusByParent(flat)
  }
  return menus
}

export function pickFuncUserDefaultViewKey(menus: SystemMenu[]): string {
  const sidebarMenus = getFuncUserSidebarNavMenus(menus)
  const funcViewKey = findFirstFuncMenuViewKey(sidebarMenus)
  if (funcViewKey) {
    return funcViewKey
  }
  return pickDefaultViewKey(getFuncUserNavMenus(menus), 'published')
}

export function pickFuncAdminDefaultViewKey(menus: SystemMenu[]): string {
  return pickDefaultViewKey(getFuncAdminNavMenus(menus), FUNC_ADMIN_PAGE)
}

export function resolveActiveFuncMenuViewKey(viewKey: string, sidebarMenus: SystemMenu[]): string {
  if (isFuncMenuViewKey(viewKey)) {
    return viewKey
  }
  const fallback = findFirstFuncMenuViewKey(sidebarMenus)
  return fallback || viewKey
}
