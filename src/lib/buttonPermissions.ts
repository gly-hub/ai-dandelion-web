import type { ModuleKey, SystemMenu } from '../types'
import { MENU_TYPE_BUTTON, MENU_TYPE_DIRECTORY, MENU_TYPE_MENU } from '../types'
import { findPlatformMenu, flattenMenus } from './navMenus'

export function isNavPageMenu(menu: SystemMenu): boolean {
  return menu.menuType === MENU_TYPE_DIRECTORY || menu.menuType === MENU_TYPE_MENU
}

export function isButtonMenu(menu: SystemMenu): boolean {
  return menu.menuType === MENU_TYPE_BUTTON
}

export function findPageMenu(
  navTree: SystemMenu[],
  module: ModuleKey,
  pageViewKey: string,
): SystemMenu | null {
  const platform = findPlatformMenu(navTree, module)
  const roots = platform?.children ?? flattenMenus(navTree).filter((item) => item.module === module)

  const findInTree = (menus: SystemMenu[]): SystemMenu | null => {
    for (const item of menus) {
      if (item.viewKey === pageViewKey || item.code.endsWith(`.${pageViewKey}`)) {
        return item
      }
      if (item.children?.length) {
        const nested = findInTree(item.children)
        if (nested) {
          return nested
        }
      }
    }
    return null
  }

  return findInTree(roots)
}

export function getPageButtons(navTree: SystemMenu[], module: ModuleKey, pageViewKey: string): SystemMenu[] {
  const page = findPageMenu(navTree, module, pageViewKey)
  if (!page?.children?.length) {
    return []
  }
  return page.children
    .filter(isButtonMenu)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function resolveButtonKey(menu: SystemMenu): string {
  return menu.viewKey || menu.code.split('.').pop() || menu.code
}

export function hasConfiguredButtons(buttons: SystemMenu[]): boolean {
  return buttons.length > 0
}

export function canAccessButton(
  buttons: SystemMenu[],
  buttonKey: string,
  options: { loading: boolean; hasNavMenus: boolean },
): boolean {
  if (options.loading) {
    return false
  }
  if (!options.hasNavMenus) {
    return false
  }
  if (!hasConfiguredButtons(buttons)) {
    return false
  }
  return buttons.some((item) => resolveButtonKey(item) === buttonKey)
}

export const FUNC_ADMIN_PAGE = 'admin-functions'
export const FUNC_USE_PAGE = 'published'

export const FUNC_ADMIN_BUTTON = {
  create: 'create',
  edit: 'edit',
  publish: 'publish',
  unpublish: 'unpublish',
  delete: 'delete',
} as const

export const FUNC_USE_BUTTON = {
  create: 'create',
} as const
