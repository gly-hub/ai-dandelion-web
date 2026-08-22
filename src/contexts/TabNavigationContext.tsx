import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNavMenus } from './NavMenuContext'
import {
  getTabScopeDefaultPath,
  isTabbablePath,
  normalizeTabPath,
  resolveTabScope,
  resolveTabTitle,
  sanitizeScopeTabs,
  upsertModuleTab,
  type TabRecord,
  type TabScope,
  type TabScopeState,
} from '../lib/tabNavigation'
import { getModuleFromPath } from '../lib/routes'
import type { ModuleKey } from '../types'

type TabNavigationContextValue = {
  tabs: TabRecord[]
  activePath: string
  activeTabScope: TabScope | null
  tabBarVisible: boolean
  switchTab: (path: string) => void
  closeTab: (path: string) => void
  closeOtherTabs: (path: string) => void
  closeAllTabs: () => void
  resetTabsOnModuleSwitch: (nextModule: ModuleKey) => void
}

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null)

export function TabNavigationProvider({ children }: { children: ReactNode }) {
  const { navTree } = useNavMenus()
  const location = useLocation()
  const navigate = useNavigate()
  const activePath = normalizeTabPath(location.pathname)
  const activeModule = getModuleFromPath(activePath)
  const activeTabScope = resolveTabScope(activePath)
  const previousModuleRef = useRef<ModuleKey | null>(null)

  const [tabsByScope, setTabsByScope] = useState<TabScopeState>({})

  useEffect(() => {
    if (!activeModule) {
      previousModuleRef.current = null
      return
    }
    if (previousModuleRef.current && previousModuleRef.current !== activeModule) {
      setTabsByScope({})
    }
    previousModuleRef.current = activeModule
  }, [activeModule])

  const persistScopeTabs = useCallback((scope: TabScope, updater: (tabs: TabRecord[]) => TabRecord[]) => {
    setTabsByScope((current) => {
      const scopeTabs = sanitizeScopeTabs(scope, current[scope] || [])
      const nextTabs = sanitizeScopeTabs(scope, updater(scopeTabs))
      if (nextTabs === scopeTabs) {
        return current
      }
      return { ...current, [scope]: nextTabs }
    })
  }, [])

  useEffect(() => {
    if (!activeTabScope || !isTabbablePath(activePath)) {
      return
    }
    const title = resolveTabTitle(activePath, navTree)
    persistScopeTabs(activeTabScope, (tabs) => upsertModuleTab(tabs, activePath, title))
  }, [activePath, activeTabScope, navTree, persistScopeTabs])

  const tabs = useMemo(() => {
    if (!activeTabScope || !isTabbablePath(activePath)) {
      return []
    }
    const scopeTabs = sanitizeScopeTabs(activeTabScope, tabsByScope[activeTabScope] || [])
    const title = resolveTabTitle(activePath, navTree)
    return sanitizeScopeTabs(activeTabScope, upsertModuleTab(scopeTabs, activePath, title))
  }, [activePath, activeTabScope, navTree, tabsByScope])

  const tabBarVisible = activeTabScope !== null && tabs.length > 0

  const resetTabsOnModuleSwitch = useCallback(() => {
    setTabsByScope({})
  }, [])

  const switchTab = useCallback(
    (path: string) => {
      const normalized = normalizeTabPath(path)
      if (normalized !== activePath) {
        navigate(normalized)
      }
    },
    [activePath, navigate],
  )

  const closeTab = useCallback(
    (path: string) => {
      const normalized = normalizeTabPath(path)
      const scope = resolveTabScope(normalized)
      if (!scope) {
        return
      }

      const scopeTabs = sanitizeScopeTabs(scope, tabsByScope[scope] || [])
      const displayTabs = sanitizeScopeTabs(
        scope,
        upsertModuleTab(scopeTabs, activePath, resolveTabTitle(activePath, navTree)),
      )
      const nextTabs = displayTabs.filter((tab) => normalizeTabPath(tab.path) !== normalized)
      if (nextTabs.length === displayTabs.length) {
        return
      }

      if (normalized === activePath) {
        const closedIndex = displayTabs.findIndex((tab) => normalizeTabPath(tab.path) === normalized)
        const fallbackTab = nextTabs[closedIndex] || nextTabs[closedIndex - 1]
        navigate(fallbackTab?.path || getTabScopeDefaultPath(scope, navTree))
      }

      setTabsByScope((current) => ({ ...current, [scope]: nextTabs }))
    },
    [activePath, navTree, navigate, tabsByScope],
  )

  const closeOtherTabs = useCallback(
    (path: string) => {
      const normalized = normalizeTabPath(path)
      const scope = resolveTabScope(normalized)
      if (!scope) {
        return
      }
      const kept = [{ path: normalized, title: resolveTabTitle(normalized, navTree) }]
      setTabsByScope((current) => ({ ...current, [scope]: kept }))
      if (normalized !== activePath) {
        navigate(normalized)
      }
    },
    [activePath, navTree, navigate],
  )

  const closeAllTabs = useCallback(() => {
    if (!activeTabScope) {
      return
    }
    const fallback = getTabScopeDefaultPath(activeTabScope, navTree)
    setTabsByScope((current) => ({ ...current, [activeTabScope]: [] }))
    navigate(fallback)
  }, [activeTabScope, navTree, navigate])

  const value = useMemo<TabNavigationContextValue>(
    () => ({
      tabs,
      activePath,
      activeTabScope,
      tabBarVisible,
      switchTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      resetTabsOnModuleSwitch,
    }),
    [
      activePath,
      activeTabScope,
      closeAllTabs,
      closeOtherTabs,
      closeTab,
      resetTabsOnModuleSwitch,
      switchTab,
      tabBarVisible,
      tabs,
    ],
  )

  return <TabNavigationContext.Provider value={value}>{children}</TabNavigationContext.Provider>
}

export function useTabNavigation() {
  const context = useContext(TabNavigationContext)
  if (!context) {
    throw new Error('useTabNavigation must be used within TabNavigationProvider')
  }
  return context
}
