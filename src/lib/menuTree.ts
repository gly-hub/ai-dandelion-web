import type { DataNode } from 'antd/es/tree'
import { flattenMenus, sortMenus } from './navMenus'
import type { SystemMenu } from '../types'
import { MENU_PLACEMENT_MODULE_NAV, MENU_PLACEMENT_PLATFORM, MENU_TYPE_BUTTON } from '../types'
import { isGeneratedFunctionMenu } from './funcMenus'

function nestMenus(items: SystemMenu[]): SystemMenu[] {
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

export function buildUnifiedMenuTree(menus: SystemMenu[]): SystemMenu[] {
  const flat = flattenMenus(menus)
  const platformMenus = flat.filter((item) => item.placement === MENU_PLACEMENT_PLATFORM)
  const moduleNavMenus = flat.filter((item) => item.placement === MENU_PLACEMENT_MODULE_NAV)

  const navByModule = new Map<string, SystemMenu[]>()
  moduleNavMenus.forEach((item) => {
    const key = item.module || 'default'
    const bucket = navByModule.get(key) ?? []
    bucket.push(item)
    navByModule.set(key, bucket)
  })

  const roots: SystemMenu[] = platformMenus
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
    .map((platform) => {
      const navChildren = nestMenus(navByModule.get(platform.module) ?? [])
      navByModule.delete(platform.module)
      return {
        ...platform,
        children: navChildren.length > 0 ? navChildren : undefined,
      }
    })

  navByModule.forEach((items) => {
    roots.push(...nestMenus(items))
  })

  return roots.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export function menusToTreeData(menus: SystemMenu[]): DataNode[] {
  return menus.map((menu) => {
    const generatedTag = isGeneratedFunctionMenu(menu) ? ' [生成]' : ''
    const buttonTag = menu.menuType === MENU_TYPE_BUTTON ? ' [按钮]' : ''
    return {
      key: menu.id,
      title: `${menu.name}${buttonTag}${generatedTag}`,
      children: menu.children?.length ? menusToTreeData(menu.children) : undefined,
    }
  })
}

