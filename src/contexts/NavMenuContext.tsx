import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getNavMenus } from '../lib/systemApi'
import { ensureRealtimeConnection, subscribeRealtimeEvents } from '../lib/aiAgentProvider'
import { canAccessButton, getPageButtons } from '../lib/buttonPermissions'
import { getModuleNavMenus, resolveModuleKey, sortMenus } from '../lib/navMenus'
import type { ModuleKey, SystemMenu } from '../types'

type NavMenuContextValue = {
  loading: boolean
  navTree: SystemMenu[]
  error: string | null
  refresh: () => Promise<void>
  refreshSilently: () => Promise<void>
  getModuleNav: (module: ModuleKey) => SystemMenu[]
  getPlatformMenus: () => SystemMenu[]
  getPageButtons: (module: ModuleKey, pageViewKey: string) => SystemMenu[]
  hasPageButton: (module: ModuleKey, pageViewKey: string, buttonKey: string) => boolean
}

const NavMenuContext = createContext<NavMenuContextValue | null>(null)

export function NavMenuProvider({ children }: { children: ReactNode }) {
  const [navTree, setNavTree] = useState<SystemMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNavTree = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const items = await getNavMenus()
      setNavTree(items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载导航菜单失败')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [])

  const refresh = useCallback(() => fetchNavTree(true), [fetchNavTree])
  const refreshSilently = useCallback(() => fetchNavTree(false), [fetchNavTree])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void ensureRealtimeConnection().catch(() => undefined)
    return subscribeRealtimeEvents((event) => {
      if (
        event.type !== 'func-operation.function.version-published' &&
        event.type !== 'func-operation.function.unpublished'
      ) {
        return
      }
      // Refreshing the server-authoritative tree adds newly published menus
      // and removes unpublished ones across every module without interrupting
      // the page currently in use.
      void refreshSilently()
    })
  }, [refreshSilently])

  const value = useMemo<NavMenuContextValue>(
    () => ({
      loading,
      navTree,
      error,
      refresh,
      refreshSilently,
      getModuleNav: (module) => getModuleNavMenus(navTree, module),
      getPlatformMenus: () => sortMenus(navTree.filter((item) => resolveModuleKey(item) !== null)),
      getPageButtons: (module, pageViewKey) => getPageButtons(navTree, module, pageViewKey),
      hasPageButton: (module, pageViewKey, buttonKey) =>
        canAccessButton(getPageButtons(navTree, module, pageViewKey), buttonKey, {
          loading,
          hasNavMenus: navTree.length > 0,
        }),
    }),
    [error, loading, navTree, refresh, refreshSilently],
  )

  return <NavMenuContext.Provider value={value}>{children}</NavMenuContext.Provider>
}

export function useNavMenus() {
  const context = useContext(NavMenuContext)
  if (!context) {
    throw new Error('useNavMenus must be used within NavMenuProvider')
  }
  return context
}
