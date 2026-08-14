import type { ModuleKey, SystemMenu } from '../types'
import {
  MENU_PLACEMENT_MODULE_NAV,
  MENU_PLACEMENT_PLATFORM,
  MENU_TYPE_BUTTON,
  MENU_TYPE_DIRECTORY,
  MENU_TYPE_MENU,
} from '../types'

export type ModuleLabelMap = Record<string, string>

export function buildModuleLabelMap(menus: SystemMenu[]): ModuleLabelMap {
	const map: ModuleLabelMap = {}
  const flat = flattenMenus(menus)
  flat
    .filter((item) => item.placement === MENU_PLACEMENT_PLATFORM && item.module)
    .forEach((item) => {
      map[item.module] = item.name
    })
  flat
    .filter((item) => item.placement === MENU_PLACEMENT_MODULE_NAV && item.module && !map[item.module])
    .forEach((item) => {
      map[item.module] = item.module === 'func-operation' ? '功能' : item.module
    })
  return map
}

export function buildModuleOptions(labelMap: ModuleLabelMap): { value: string; label: string }[] {
  return Object.entries(labelMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label }))
}

export function getModuleLabel(module: string, labelMap: ModuleLabelMap): string {
  return labelMap[module] || module
}

export function resolveMenuViewKey(menu: SystemMenu): string {
  return menu.viewKey || menu.code
}

export function isNavDirectory(menu: SystemMenu): boolean {
  return menu.menuType === MENU_TYPE_DIRECTORY
}

export function isNavPageMenu(menu: SystemMenu): boolean {
  return menu.menuType === MENU_TYPE_MENU
}

export function hasNavChildren(menu: SystemMenu): boolean {
  return Boolean(menu.children?.some((child) => child.menuType !== MENU_TYPE_BUTTON))
}

export function nestMenusByParent(items: SystemMenu[]): SystemMenu[] {
  const byId = new Map<string, SystemMenu>()
  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [] })
  })

  const roots: SystemMenu[] = []
  byId.forEach((menu) => {
    const parentId = menu.parentId
    if (!parentId || !byId.has(parentId)) {
      roots.push(menu)
      return
    }
    const parent = byId.get(parentId)!
    parent.children = parent.children || []
    parent.children.push(menu)
  })

  const sortTree = (nodes: SystemMenu[]) => {
    const sorted = sortMenus(nodes)
    nodes.splice(0, nodes.length, ...sorted)
    nodes.forEach((node) => {
      if (node.children?.length) {
        sortTree(node.children)
      } else {
        delete node.children
      }
    })
  }
  sortTree(roots)
  return roots
}

function walkNavMenus(menus: SystemMenu[], visit: (menu: SystemMenu) => void) {
  sortMenus(menus).forEach((menu) => {
    visit(menu)
    if (menu.children?.length) {
      walkNavMenus(menu.children, visit)
    }
  })
}

export function findNavMenuByViewKey(menus: SystemMenu[], viewKey: string): SystemMenu | null {
  let found: SystemMenu | null = null
  walkNavMenus(menus, (menu) => {
    if (!found && isNavPageMenu(menu) && resolveMenuViewKey(menu) === viewKey) {
      found = menu
    }
  })
  return found
}

export function findFirstNavPageMenu(menus: SystemMenu[]): SystemMenu | null {
  for (const menu of sortMenus(menus)) {
    if (isNavPageMenu(menu)) {
      return menu
    }
    if (menu.children?.length) {
      const nested = findFirstNavPageMenu(menu.children)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

export function buildMenuBreadcrumbTrail(menus: SystemMenu[], viewKey: string): SystemMenu[] {
  const trail: SystemMenu[] = []

  const walk = (nodes: SystemMenu[], ancestors: SystemMenu[]): boolean => {
    for (const menu of sortMenus(nodes)) {
      if (menu.menuType === MENU_TYPE_BUTTON) {
        continue
      }
      if (resolveMenuViewKey(menu) === viewKey) {
        trail.push(...ancestors, menu)
        return true
      }
      if (menu.children?.length) {
        const nextAncestors =
          isNavDirectory(menu) || hasNavChildren(menu) ? [...ancestors, menu] : ancestors
        if (walk(menu.children, nextAncestors)) {
          return true
        }
      }
    }
    return false
  }

  walk(menus, [])
  return trail
}

export function findAncestorDirectoryIds(menus: SystemMenu[], viewKey: string): string[] {
  const ids: string[] = []

  const walk = (nodes: SystemMenu[], ancestors: string[]): boolean => {
    for (const menu of sortMenus(nodes)) {
      if (isNavPageMenu(menu) && resolveMenuViewKey(menu) === viewKey) {
        ids.push(...ancestors)
        return true
      }
      if (menu.children?.length) {
        const nextAncestors = isNavDirectory(menu) ? [...ancestors, menu.id] : ancestors
        if (walk(menu.children, nextAncestors)) {
          return true
        }
      }
    }
    return false
  }

  walk(menus, [])
  return ids
}

export function hasActiveNavDescendant(menu: SystemMenu, activeViewKey: string): boolean {
  if (isNavPageMenu(menu) && resolveMenuViewKey(menu) === activeViewKey) {
    return true
  }
  return (menu.children ?? []).some((child) => hasActiveNavDescendant(child, activeViewKey))
}

export function flattenMenus(items: SystemMenu[]): SystemMenu[] {
  const result: SystemMenu[] = []
  const walk = (nodes: SystemMenu[]) => {
    nodes.forEach((node) => {
      const { children, ...rest } = node
      result.push(rest)
      if (children?.length) {
        walk(children)
      }
    })
  }
  walk(items)
  return result
}

export function sortMenus(items: SystemMenu[]): SystemMenu[] {
  return [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function isModuleKey(value: string): value is ModuleKey {
  return value === 'system' || value === 'func-operation' || value === 'ai-agent'
}

export function resolveModuleKey(menu: SystemMenu): ModuleKey | null {
  const key = menu.viewKey || menu.code.replace(/^platform\./, '')
  return isModuleKey(key) ? key : isModuleKey(menu.module) ? menu.module : null
}

export function findPlatformMenu(navTree: SystemMenu[], module: ModuleKey): SystemMenu | null {
  return navTree.find((item) => resolveModuleKey(item) === module) || null
}

function hasNestedParentReference(items: SystemMenu[]): boolean {
  const ids = new Set(items.map((item) => item.id))
  return items.some((item) => item.parentId && ids.has(item.parentId))
}

export function getModuleNavMenus(navTree: SystemMenu[], module: ModuleKey): SystemMenu[] {
  const platform = findPlatformMenu(navTree, module)
  if (platform?.children?.length) {
    const navItems = platform.children.filter((item) => item.menuType !== MENU_TYPE_BUTTON)
    if (hasNestedParentReference(navItems)) {
      return nestMenusByParent(navItems)
    }
    return sortMenus(navItems)
  }
  const flat = flattenMenus(navTree).filter(
    (item) =>
      item.module === module &&
      item.placement === MENU_PLACEMENT_MODULE_NAV &&
      item.menuType !== MENU_TYPE_BUTTON,
  )
  return nestMenusByParent(flat)
}

export function collectMenuDescendantIds(menus: SystemMenu[], rootId: string): Set<string> {
  const flat = flattenMenus(menus)
  const ids = new Set<string>([rootId])
  let updated = true
  while (updated) {
    updated = false
    for (const item of flat) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id)
        updated = true
      }
    }
  }
  return ids
}

export type ParentDirectoryTreeNode = {
  value: string
  title: string
  children?: ParentDirectoryTreeNode[]
}

export function buildParentDirectoryTreeData(
  menus: SystemMenu[],
  options: {
    module?: string
    placement?: string
    excludeMenuId?: string
  },
): ParentDirectoryTreeNode[] {
  if (!options.module || !options.placement) {
    return []
  }

  const excludeIds = options.excludeMenuId
    ? collectMenuDescendantIds(menus, options.excludeMenuId)
    : new Set<string>()

  let directories = flattenMenus(menus).filter(
    (item) => item.menuType === MENU_TYPE_DIRECTORY && !excludeIds.has(item.id),
  )

  if (options.module) {
    directories = directories.filter((item) => item.module === options.module)
  }
  if (options.placement) {
    directories = directories.filter((item) => item.placement === options.placement)
  }

  const toTreeData = (nodes: SystemMenu[]): ParentDirectoryTreeNode[] =>
    sortMenus(nodes).map((node) => ({
      value: node.id,
      title: `${node.name} (${node.code})`,
      children: node.children?.length ? toTreeData(node.children) : undefined,
    }))

  return toTreeData(nestMenusByParent(directories))
}

export function pickDefaultViewKey(menus: SystemMenu[], fallback: string): string {
  let defaultMenu: SystemMenu | null = null
  walkNavMenus(menus, (menu) => {
    if (!defaultMenu && menu.isDefault && isNavPageMenu(menu)) {
      defaultMenu = menu
    }
  })
  if (defaultMenu) {
    return resolveMenuViewKey(defaultMenu)
  }
  const firstPage = findFirstNavPageMenu(menus)
  return firstPage ? resolveMenuViewKey(firstPage) : fallback
}

export function filterNavMenus(menus: SystemMenu[], keyword: string): SystemMenu[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return menus
  }

  const filterTree = (nodes: SystemMenu[]): SystemMenu[] => {
    const result: SystemMenu[] = []
    for (const node of nodes) {
      const children = node.children?.length ? filterTree(node.children) : []
      const selfMatch = [node.name, node.code, resolveMenuViewKey(node)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized))
      if (!selfMatch && children.length === 0) {
        continue
      }
      result.push({
        ...node,
        children: children.length > 0 ? children : undefined,
      })
    }
    return result
  }

  return filterTree(menus)
}
