import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LeftOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { ConsoleTabBar } from '../../components/ConsoleTabBar'
import { ModuleSidebarNav } from '../../components/ModuleSidebarNav'
import { SidebarSearchInput } from '../../components/SidebarSearchInput'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { filterNavMenus, findNavMenuByViewKey, pickDefaultViewKey } from '../../lib/navMenus'
import { buildFuncPublishedPath, buildSystemPath, parseSystemPath } from '../../lib/routes'
import { ensureAgentSessionConfigMenus } from '../../lib/systemMenuBootstrap'
import { AgentConfigManagementWorkspace } from './AgentConfigManagementWorkspace'
import { AgentModelManagementWorkspace } from './AgentModelManagementWorkspace'
import { AgentSessionConfigManagementWorkspace } from './AgentSessionConfigManagementWorkspace'
import { MenuManagementWorkspace } from './MenuManagementWorkspace'
import { OperationLogWorkspace } from './OperationLogWorkspace'
import { NotificationManagementWorkspace } from './NotificationManagementWorkspace'
import { RoleManagementWorkspace } from './RoleManagementWorkspace'
import { UserManagementWorkspace } from './UserManagementWorkspace'

const viewComponents: Record<string, () => ReactNode> = {
  users: () => <UserManagementWorkspace />,
  menus: () => <MenuManagementWorkspace />,
  roles: () => <RoleManagementWorkspace />,
  'operation-logs': () => <OperationLogWorkspace />,
  notifications: () => <NotificationManagementWorkspace />,
  'agent-config': () => <AgentConfigManagementWorkspace />,
  'agent-session-configs': () => <AgentSessionConfigManagementWorkspace />,
  'agent-models': () => <AgentModelManagementWorkspace />,
}

function resolveViewComponent(viewKey: string) {
  const normalizedKey = viewKey.trim()
  return viewComponents[normalizedKey] || (normalizedKey === 'system.notifications' ? viewComponents.notifications : undefined)
}

export function SystemWorkspace() {
  const { loading, getModuleNav, refresh } = useNavMenus()
  const navMenus = getModuleNav('system')
  const location = useLocation()
  const navigate = useNavigate()
  const { viewKey: urlViewKey } = parseSystemPath(location.pathname)
  const [menuKeyword, setMenuKeyword] = useState('')

  useEffect(() => {
    void ensureAgentSessionConfigMenus()
      .then((changed) => {
        if (changed) {
          return refresh()
        }
        return undefined
      })
      .catch(() => {
        // 菜单初始化失败时不阻断系统页，已有权限菜单仍按后端返回渲染。
      })
  }, [refresh])

  const filteredNavMenus = useMemo(
    () => filterNavMenus(navMenus, menuKeyword),
    [menuKeyword, navMenus],
  )

  const activeViewKey = useMemo(() => {
    if (urlViewKey && findNavMenuByViewKey(navMenus, urlViewKey)) {
      return urlViewKey
    }
    return pickDefaultViewKey(navMenus, 'users')
  }, [navMenus, urlViewKey])

  useEffect(() => {
    if (loading || navMenus.length === 0) {
      return
    }
    const defaultViewKey = pickDefaultViewKey(navMenus, 'users')
    if (!urlViewKey || !findNavMenuByViewKey(navMenus, urlViewKey)) {
      navigate(buildSystemPath(defaultViewKey), { replace: true })
    }
  }, [loading, navMenus, navigate, urlViewKey])

  const activeMenu = findNavMenuByViewKey(navMenus, activeViewKey)
  const activeComponent = resolveViewComponent(activeViewKey)
    || (activeMenu ? resolveViewComponent(activeMenu.code) : undefined)
  const activeContent = (activeComponent?.() ?? (
    <div className="system-user-panel">
      <p>未配置页面：{activeViewKey}</p>
    </div>
  ))

  return (
    <div className="system-console-shell">
      <aside className="module-sidebar" aria-label="系统菜单">
        <div className="sidebar-searchbar system-sidebar-searchbar">
          <SidebarSearchInput
            value={menuKeyword}
            placeholder="搜索菜单"
            aria-label="搜索系统菜单"
            onChange={setMenuKeyword}
          />
        </div>
        <ModuleSidebarNav
          menus={filteredNavMenus}
          activeViewKey={activeViewKey}
          onSelect={(viewKey) => navigate(buildSystemPath(viewKey))}
          loading={loading}
          ariaLabel="系统菜单"
          searchKeyword={menuKeyword}
          emptyText={menuKeyword.trim() ? '未找到匹配的菜单' : '暂无可用菜单'}
        />
        <div className="system-sidebar-footer">
          <Button icon={<LeftOutlined />} block onClick={() => navigate(buildFuncPublishedPath())}>
            返回工作台
          </Button>
        </div>
      </aside>

      <main className="system-main-body">
        <ConsoleTabBar />
        <div className="system-main-content">{activeContent}</div>
      </main>
    </div>
  )
}
