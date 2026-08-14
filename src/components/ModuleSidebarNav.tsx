import { useEffect, useState } from 'react'
import { DownOutlined, RightOutlined } from '@ant-design/icons'
import { Spin } from 'antd'
import { resolveMenuIcon } from '../lib/menuIcons'
import {
  findAncestorDirectoryIds,
  hasActiveNavDescendant,
  hasNavChildren,
  isNavDirectory,
  resolveMenuViewKey,
  sortMenus,
} from '../lib/navMenus'
import type { SystemMenu } from '../types'
import { MENU_TYPE_BUTTON } from '../types'

type ModuleSidebarNavProps = {
  menus: SystemMenu[]
  activeViewKey: string
  onSelect: (viewKey: string) => void
  loading?: boolean
  emptyText?: string
  ariaLabel?: string
  /** 有搜索词时自动展开所有目录，便于查看过滤结果 */
  searchKeyword?: string
}

export function ModuleSidebarNav({
  menus,
  activeViewKey,
  onSelect,
  loading = false,
  emptyText = '暂无可用菜单',
  ariaLabel = '模块菜单',
  searchKeyword = '',
}: ModuleSidebarNavProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(findAncestorDirectoryIds(menus, activeViewKey)),
  )

  useEffect(() => {
    const keyword = searchKeyword.trim()
    if (keyword) {
      setExpandedIds(new Set(collectDirectoryIds(menus)))
      return
    }
    setExpandedIds(new Set(findAncestorDirectoryIds(menus, activeViewKey)))
  }, [menus, activeViewKey, searchKeyword])

  if (loading) {
    return (
      <nav className="module-sidebar-nav" aria-label={ariaLabel}>
        <div className="module-sidebar-nav-loading">
          <Spin size="small" />
        </div>
      </nav>
    )
  }

  if (menus.length === 0) {
    return (
      <nav className="module-sidebar-nav" aria-label={ariaLabel}>
        <div className="module-sidebar-nav-empty">{emptyText}</div>
      </nav>
    )
  }

  return (
    <nav className="module-sidebar-nav" aria-label={ariaLabel}>
      <ModuleSidebarNavList
        menus={menus}
        depth={0}
        activeViewKey={activeViewKey}
        expandedIds={expandedIds}
        onToggleExpanded={(id) => {
          setExpandedIds((current) => {
            const next = new Set(current)
            if (next.has(id)) {
              next.delete(id)
            } else {
              next.add(id)
            }
            return next
          })
        }}
        onSelect={onSelect}
      />
    </nav>
  )
}

function ModuleSidebarNavList({
  menus,
  depth,
  activeViewKey,
  expandedIds,
  onToggleExpanded,
  onSelect,
}: {
  menus: SystemMenu[]
  depth: number
  activeViewKey: string
  expandedIds: Set<string>
  onToggleExpanded: (id: string) => void
  onSelect: (viewKey: string) => void
}) {
  return (
    <>
      {sortMenus(menus).map((item) => {
        if (item.menuType === MENU_TYPE_BUTTON) {
          return null
        }

        if (isNavDirectory(item) || hasNavChildren(item)) {
          const expanded = expandedIds.has(item.id)
          const highlighted = hasActiveNavDescendant(item, activeViewKey)

          return (
            <div
              key={item.id}
              className={`module-sidebar-nav-group${expanded ? ' is-expanded' : ''}${highlighted ? ' is-highlighted' : ''}`}
            >
              <button
                type="button"
                className="module-sidebar-nav-group-head"
                aria-expanded={expanded}
                onClick={() => onToggleExpanded(item.id)}
              >
                <span className="module-sidebar-nav-icon">{resolveMenuIcon(item.icon)}</span>
                <span className="module-sidebar-nav-label">{item.name}</span>
                <span className="module-sidebar-nav-chevron" aria-hidden="true">
                  {expanded ? <DownOutlined /> : <RightOutlined />}
                </span>
              </button>
              {expanded && item.children?.length ? (
                <div className="module-sidebar-nav-children">
                  <ModuleSidebarNavList
                    menus={item.children}
                    depth={depth + 1}
                    activeViewKey={activeViewKey}
                    expandedIds={expandedIds}
                    onToggleExpanded={onToggleExpanded}
                    onSelect={onSelect}
                  />
                </div>
              ) : null}
            </div>
          )
        }

        const viewKey = resolveMenuViewKey(item)
        const active = activeViewKey === viewKey

        if (depth > 0) {
          return (
            <button
              key={item.id}
              type="button"
              className={`module-sidebar-nav-subitem${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.remark || item.name}
              onClick={() => onSelect(viewKey)}
            >
              {item.name}
            </button>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            className={`module-sidebar-nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            title={item.remark || item.name}
            onClick={() => onSelect(viewKey)}
          >
            <span className="module-sidebar-nav-icon">{resolveMenuIcon(item.icon)}</span>
            <span className="module-sidebar-nav-label">{item.name}</span>
          </button>
        )
      })}
    </>
  )
}

function collectDirectoryIds(menus: SystemMenu[]): string[] {
  const ids: string[] = []

  const walk = (nodes: SystemMenu[]) => {
    for (const node of nodes) {
      if (isNavDirectory(node) || hasNavChildren(node)) {
        ids.push(node.id)
        if (node.children?.length) {
          walk(node.children)
        }
      }
    }
  }

  walk(menus)
  return ids
}
