import { filterNavMenus, flattenMenus, resolveMenuViewKey, sortMenus } from './navMenus'
import type { SystemMenu } from '../types'
import { MENU_SOURCE_TYPE_GENERATED_FUNCTION, MENU_TYPE_DIRECTORY } from '../types'

export const FUNC_USE_MENU_CODE = 'func-operation.use'
export const FUNC_MENU_VIEW_PREFIX = 'func:'

export function buildFuncMenuViewKey(functionId: string): string {
  return `${FUNC_MENU_VIEW_PREFIX}${functionId}`
}

export function parseFuncMenuViewKey(viewKey: string): string {
  if (!viewKey.startsWith(FUNC_MENU_VIEW_PREFIX)) {
    return ''
  }
  return viewKey.slice(FUNC_MENU_VIEW_PREFIX.length).trim()
}

export function isFuncMenuViewKey(viewKey: string): boolean {
  return viewKey.startsWith(FUNC_MENU_VIEW_PREFIX)
}

export function isGeneratedFunctionMenu(menu: SystemMenu): boolean {
  if (menu.sourceType === MENU_SOURCE_TYPE_GENERATED_FUNCTION) {
    return true
  }
  return menu.code.startsWith('func-operation.app.')
}

export function findFuncUseMenu(menus: SystemMenu[]): SystemMenu | null {
  let found: SystemMenu | null = null

  const walk = (nodes: SystemMenu[]) => {
    for (const node of nodes) {
      if (node.code === FUNC_USE_MENU_CODE || resolveMenuViewKey(node) === 'published') {
        found = node
        return
      }
      if (node.children?.length) {
        walk(node.children)
        if (found) {
          return
        }
      }
    }
  }

  walk(menus)
  return found
}

export function collectFuncUseDirectories(menus: SystemMenu[]): SystemMenu[] {
  const funcUse = findFuncUseMenu(menus)
  if (!funcUse) {
    return []
  }
  const flat = flattenMenus(menus)
  const byId = new Map(flat.map((item) => [item.id, item]))

  const isUnderFuncUse = (menuId: string): boolean => {
    let currentId = menuId
    while (currentId) {
      if (currentId === funcUse.id) {
        return true
      }
      const current = byId.get(currentId)
      if (!current?.parentId) {
        return false
      }
      currentId = current.parentId
    }
    return false
  }

  return sortMenus(
    flat.filter(
      (item) =>
        item.menuType === MENU_TYPE_DIRECTORY &&
        item.id !== funcUse.id &&
        isUnderFuncUse(item.id),
    ),
  )
}

export function findFirstFuncMenuViewKey(menus: SystemMenu[]): string {
  let found = ''
  const walk = (nodes: SystemMenu[]) => {
    for (const node of nodes) {
      const viewKey = resolveMenuViewKey(node)
      if (isFuncMenuViewKey(viewKey)) {
        found = viewKey
        return
      }
      if (node.children?.length) {
        walk(node.children)
        if (found) {
          return
        }
      }
    }
  }
  walk(menus)
  return found
}

export function filterFuncSidebarMenus(menus: SystemMenu[], keyword: string): SystemMenu[] {
  return filterNavMenus(menus, keyword)
}

export function resolveDirectoryLabel(menus: SystemMenu[], directoryId: string): string {
  if (!directoryId) {
    return '未选择'
  }
  const matched = flattenMenus(menus).find((item) => item.id === directoryId)
  return matched?.name || directoryId
}
