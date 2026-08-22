import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, Avatar, Badge, Button, Dropdown, Empty, List, Popover, Space, Spin, Tag, Tooltip } from 'antd'
import { BellOutlined, CloudSyncOutlined, DragOutlined, ExpandOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, QuestionCircleOutlined, ReloadOutlined, ShrinkOutlined } from '@ant-design/icons'
import { XProvider } from '@ant-design/x'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TabNavigationProvider } from './contexts/TabNavigationContext'
import { NavMenuProvider, useNavMenus } from './contexts/NavMenuContext'
import { LoginPage } from './modules/system/LoginPage'
import { AiAgentWorkspace } from './modules/ai-agent/AiAgentWorkspace'
import { FuncOperationWorkspace } from './modules/func-operation/FuncOperationWorkspace'
import {
  disposeAllAiAgentSessionProviders,
  ensureRealtimeConnection,
  reconnectRealtimeConnection,
  stopRealtimeConnection,
  subscribeRealtimeConnectionStatus,
  subscribeRealtimeEvents,
  type RealtimeConnectionStatus,
} from './lib/aiAgentProvider'
import { listSystemNotifications, normalizeSystemNotification, readSystemNotification } from './lib/systemApi'
import type { SystemNotification } from './types'
import { buildFuncAdminPath, buildFuncPublishedPath, getModuleFromPath, isFuncEditorImmersivePath, ROUTES } from './lib/routes'
import './App.css'
import './console-prototype.css'
import './workspace-shell.css'
import './modules/func-operation/FuncAdminList.css'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }
  if (!currentUser) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />
  }
  return children
}

function DefaultModuleRedirect() {
  const { loading, navTree } = useNavMenus()

  if (loading) {
    return (
      <div className="console-no-access">
        <Spin size="large" />
      </div>
    )
  }

  if (navTree.length === 0) {
    return (
      <div className="console-no-access">
        <Empty description="暂无可用模块权限，请联系管理员分配角色" />
      </div>
    )
  }

  return <Navigate to={buildFuncPublishedPath()} replace />
}

function ConsoleAppContent() {
  const { currentUser, logout } = useAuth()
  const { message: toastMessage, modal } = AntApp.useApp()
  const { loading, navTree } = useNavMenus()
  const location = useLocation()
  const navigate = useNavigate()
  const activeModule = getModuleFromPath(location.pathname)
  const immersiveFuncEditor = isFuncEditorImmersivePath(location.pathname)
  const [chatMode, setChatMode] = useState<'large' | 'compact' | null>(null)
  const [chatSessionId, setChatSessionId] = useState('')
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('connecting')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const handledNotificationIdsRef = useRef(new Set<string>())
  const handledNotificationEventsRef = useRef(new Set<string>())
  const [viewportSize, setViewportSize] = useState(() => getViewportSize())
  const closeAgentChat = useCallback(() => {
    disposeAllAiAgentSessionProviders()
    setChatMode(null)
  }, [])
  const refreshNotifications = useCallback(async () => {
    if (!currentUser?.id) return
    try {
      const result = await listSystemNotifications({ page: 1, pageSize: 30 })
      result.notifications.forEach((item) => handledNotificationIdsRef.current.add(item.id))
      setNotifications(result.notifications)
      setUnreadNotificationCount(result.unreadCount)
    } catch {
      // Realtime delivery remains usable if the consistency refresh is temporarily unavailable.
    }
  }, [currentUser?.id])
  const immersiveViewportStyle = useMemo<ImmersiveViewportStyle | undefined>(() => {
    if (!immersiveFuncEditor) {
      return undefined
    }

    return {
      width: `${viewportSize.width}px`,
      height: `${viewportSize.height}px`,
      '--immersive-viewport-width': `${viewportSize.width}px`,
      '--immersive-viewport-height': `${viewportSize.height}px`,
    }
  }, [immersiveFuncEditor, viewportSize.height, viewportSize.width])

  useLayoutEffect(() => {
    if (!immersiveFuncEditor) {
      return
    }

    function syncViewportSize() {
      setViewportSize(getViewportSize())
    }

    syncViewportSize()
    window.addEventListener('resize', syncViewportSize)
    window.visualViewport?.addEventListener('resize', syncViewportSize)

    return () => {
      window.removeEventListener('resize', syncViewportSize)
      window.visualViewport?.removeEventListener('resize', syncViewportSize)
    }
  }, [immersiveFuncEditor])

  useEffect(() => {
    if (!chatMode) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAgentChat()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatMode, closeAgentChat])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!currentUser?.id) return undefined
    void ensureRealtimeConnection().catch(() => undefined)
    void refreshNotifications()
    return subscribeRealtimeEvents((event) => {
      if (event.type !== 'system.notification') return
      const notification = normalizeSystemNotification(event.payload)
      if (!notification.id) return
      if (event.eventId && handledNotificationEventsRef.current.has(event.eventId)) return
      if (event.eventId) handledNotificationEventsRef.current.add(event.eventId)
      if (handledNotificationIdsRef.current.has(notification.id)) return
      handledNotificationIdsRef.current.add(notification.id)
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 30))
      setUnreadNotificationCount((count) => count + 1)
      if (notification.displayType === 'modal') {
        modal.info({ title: notification.title, content: notification.content, okText: '知道了', onOk: () => { void readSystemNotification(notification.id); setUnreadNotificationCount((count) => Math.max(0, count - 1)); setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item)) } })
      } else {
        const method = notification.level === 'success' ? toastMessage.success : notification.level === 'warning' ? toastMessage.warning : notification.level === 'error' ? toastMessage.error : toastMessage.info
        method({ content: `${notification.title}：${notification.content}`, duration: 5 })
      }
    })
  }, [currentUser?.id, modal, refreshNotifications, toastMessage])

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined
    }
    return subscribeRealtimeConnectionStatus(setRealtimeStatus)
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id || realtimeStatus !== 'connected') return
    void refreshNotifications()
  }, [currentUser?.id, realtimeStatus, refreshNotifications])

  function handleLogout() {
    stopRealtimeConnection()
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  const realtimeStatusLabel = realtimeStatus === 'connected'
    ? '实时已连接'
    : realtimeStatus === 'connecting'
      ? '正在连接'
      : realtimeStatus === 'reconnecting'
        ? '正在重连'
        : '实时离线'

  const reconnectRealtime = () => {
    void reconnectRealtimeConnection().catch(() => undefined)
  }

  const handleNotificationClick = (item: SystemNotification) => {
    if (item.read) return
    void readSystemNotification(item.id).catch(() => undefined)
    setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry))
    setUnreadNotificationCount((count) => Math.max(0, count - 1))
  }

  const handleModuleNavigationCapture = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const sidebar = target.closest('.module-sidebar')
    if (!sidebar) {
      return
    }
    if (target.closest('button:not(.module-sidebar-nav-group-head), a')) {
      setMobileNavOpen(false)
    }
  }

  return (
    <div className="console-app">
      <main
        className={`console-workspace${immersiveFuncEditor ? ' immersive-func-editor' : ''}${mobileNavOpen ? ' mobile-nav-open' : ''}`}
        style={immersiveViewportStyle}
        onClickCapture={handleModuleNavigationCapture}
      >
        {immersiveFuncEditor ? null : (
          <header className="workspace-topbar">
            <div className="workspace-brand" aria-label="AiDandelion">
              <img className="workspace-brand-logo" src="/ai-dandelion-logo.png" alt="AiDandelion" />
            </div>
            <div className="workspace-topbar-actions">
              <Tooltip title="打开导航">
                <Button
                  type="text"
                  shape="circle"
                  className="workspace-mobile-nav-trigger"
                  icon={<MenuOutlined />}
                  aria-label="打开导航"
                  aria-expanded={mobileNavOpen}
                  onClick={() => setMobileNavOpen((open) => !open)}
                />
              </Tooltip>
              <Tooltip title="帮助中心"><Button type="text" shape="circle" className="workspace-help-button" icon={<QuestionCircleOutlined />} /></Tooltip>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'large', icon: <ExpandOutlined />, label: '大屏' },
                    { key: 'compact', icon: <DragOutlined />, label: '小屏' },
                  ],
                  onClick: ({ key }) => setChatMode(key as 'large' | 'compact'),
                }}
              >
                <Tooltip title="打开 Agent 对话"><Button type="text" shape="circle" icon={<MessageOutlined />} /></Tooltip>
              </Dropdown>
              <Popover
                trigger="click"
                placement="bottomRight"
                title="实时连接"
                content={(
                  <div className="workspace-realtime-popover">
                    <div className="workspace-realtime-popover-status">
                      <span className={`workspace-realtime-dot is-${realtimeStatus}`} />
                      <div><strong>{realtimeStatusLabel}</strong><span>WebSocket</span></div>
                    </div>
                    <div className="workspace-realtime-auto"><span>自动重连</span><b>已开启</b></div>
                    <Button block icon={<ReloadOutlined />} loading={realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting'} onClick={reconnectRealtime}>立即重连</Button>
                  </div>
                )}
              >
                <Tooltip title={realtimeStatusLabel}>
                  <Button type="text" shape="circle" aria-label={realtimeStatusLabel} className={`workspace-realtime-status is-${realtimeStatus}`} icon={<CloudSyncOutlined />} />
                </Tooltip>
              </Popover>
              <Popover trigger="click" placement="bottomRight" title="通知" content={<div style={{ width: 360 }}><List size="small" dataSource={notifications} locale={{ emptyText: '暂无通知' }} renderItem={(item) => <List.Item onClick={() => handleNotificationClick(item)} style={{ cursor: item.read ? 'default' : 'pointer', opacity: item.read ? 0.65 : 1 }}><List.Item.Meta title={<Space size={6}><span>{item.title}</span>{!item.read ? <Tag color="blue">未读</Tag> : null}</Space>} description={<span>{item.content}</span>} /></List.Item>} /></div>}><Badge count={unreadNotificationCount} size="small"><Tooltip title="通知"><Button type="text" shape="circle" icon={<BellOutlined />} /></Tooltip></Badge></Popover>
              <Popover
                trigger="click"
                placement="bottomRight"
                content={(
                  <div className="workspace-user-popover">
                    <strong>{currentUser?.username || '用户'}</strong>
                    <Button type="text" danger size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出登录</Button>
                  </div>
                )}
              >
                <Avatar className="workspace-user-avatar">{currentUser?.username?.slice(0, 1).toUpperCase() || 'U'}</Avatar>
              </Popover>
            </div>
          </header>
        )}

        {mobileNavOpen && !immersiveFuncEditor ? (
          <button
            type="button"
            className="workspace-mobile-nav-scrim"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <section
          className={`console-module${
            activeModule === 'func-operation'
              ? ` func-layout${immersiveFuncEditor ? ' func-immersive-layout' : ''}`
              : ''
          }`}
        >
          {loading ? (
            <div className="console-no-access">
              <Spin size="large" />
            </div>
          ) : navTree.length === 0 ? (
            <div className="console-no-access">
              <Empty description="暂无可用模块权限，请联系管理员分配角色" />
              <Button type="primary" icon={<LogoutOutlined />} onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          ) : (
            <Outlet />
          )}
        </section>
      </main>

      {chatMode === 'large' ? (
        <div
          className="agent-chat-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAgentChat()
            }
          }}
        >
          <section className="agent-chat-modal" role="dialog" aria-modal="true" aria-label="AI 对话，大屏模式">
            <div className="agent-chat-modal-shell">
              <Tooltip title="切换为小屏模式">
                <Button
                  type="text"
                  shape="circle"
                  className="agent-chat-modal-mode-button"
                  icon={<ShrinkOutlined />}
                  aria-label="切换为小屏模式"
                  onClick={() => setChatMode('compact')}
                />
              </Tooltip>
              <button type="button" className="agent-chat-modal-close" aria-label="关闭 Agent 对话" onClick={closeAgentChat}>×</button>
              <AiAgentWorkspace
                embedded
                preferredSessionId={chatSessionId}
                onActiveSessionChange={setChatSessionId}
              />
            </div>
          </section>
        </div>
      ) : null}

      {chatMode === 'compact' ? (
        <FloatingAgentChat
          onClose={closeAgentChat}
          onOpenLarge={() => setChatMode('large')}
          preferredSessionId={chatSessionId}
          onActiveSessionChange={setChatSessionId}
        />
      ) : null}
    </div>
  )
}

interface FloatingAgentChatProps {
  onClose: () => void
  onOpenLarge: () => void
  preferredSessionId: string
  onActiveSessionChange: (sessionId: string) => void
}

const COMPACT_CHAT_WIDTH = 441
const COMPACT_CHAT_HEIGHT = 798
const COMPACT_CHAT_MARGIN = 12
const COMPACT_CHAT_INITIAL_TOP = 70
const COMPACT_CHAT_INITIAL_RIGHT = 24

function FloatingAgentChat({
  onClose,
  onOpenLarge,
  preferredSessionId,
  onActiveSessionChange,
}: FloatingAgentChatProps) {
  const [position, setPosition] = useState(() => getCompactChatInitialPosition())
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)

  useLayoutEffect(() => {
    const clampPosition = () => setPosition((current) => clampCompactChatPosition(current))
    clampPosition()
    window.addEventListener('resize', clampPosition)
    window.visualViewport?.addEventListener('resize', clampPosition)
    return () => {
      window.removeEventListener('resize', clampPosition)
      window.visualViewport?.removeEventListener('resize', clampPosition)
    }
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (!target.closest('.agent-compact-drag-handle') || event.button !== 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    setPosition(clampCompactChatPosition({
      left: event.clientX - drag.offsetX,
      top: event.clientY - drag.offsetY,
    }))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="agent-chat-floating-layer" aria-live="polite">
      <section
        className="agent-chat-floating"
        role="dialog"
        aria-modal="false"
        aria-label="AI 对话，小屏模式"
        style={{ transform: `translate3d(${position.left}px, ${position.top}px, 0)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <AiAgentWorkspace
          compact
          preferredSessionId={preferredSessionId}
          onActiveSessionChange={onActiveSessionChange}
          onCloseCompact={onClose}
          onOpenLarge={onOpenLarge}
        />
      </section>
    </div>
  )
}

function getCompactChatInitialPosition() {
  const viewport = getViewportSize()
  return clampCompactChatPosition({
    left: viewport.width - COMPACT_CHAT_WIDTH - COMPACT_CHAT_INITIAL_RIGHT,
    top: COMPACT_CHAT_INITIAL_TOP,
  })
}

function clampCompactChatPosition(position: { left: number; top: number }) {
  const viewport = getViewportSize()
  const width = Math.min(COMPACT_CHAT_WIDTH, Math.max(0, viewport.width - COMPACT_CHAT_MARGIN * 2))
  const height = Math.min(COMPACT_CHAT_HEIGHT, Math.max(0, viewport.height - COMPACT_CHAT_MARGIN * 2))
  return {
    left: Math.min(Math.max(COMPACT_CHAT_MARGIN, position.left), Math.max(COMPACT_CHAT_MARGIN, viewport.width - width - COMPACT_CHAT_MARGIN)),
    top: Math.min(Math.max(COMPACT_CHAT_MARGIN, position.top), Math.max(COMPACT_CHAT_MARGIN, viewport.height - height - COMPACT_CHAT_MARGIN)),
  }
}

type ImmersiveViewportStyle = CSSProperties & {
  '--immersive-viewport-width': string
  '--immersive-viewport-height': string
}

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 }
  }

  return {
    width: Math.max(0, Math.round(window.visualViewport?.width ?? window.innerWidth)),
    height: Math.max(0, Math.round(window.visualViewport?.height ?? window.innerHeight)),
  }
}

function ConsoleApp() {
  return (
    <TabNavigationProvider>
      <ConsoleAppContent />
    </TabNavigationProvider>
  )
}

function LoginRoute() {
  const { currentUser, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return null
  }
  if (currentUser) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== ROUTES.login ? from : ROUTES.root} replace />
  }
  return <LoginPage />
}

function AuthenticatedShell() {
  return (
    <NavMenuProvider>
      <ConsoleApp />
    </NavMenuProvider>
  )
}

function App() {
  return (
    <XProvider>
      <AntApp>
        <AuthProvider>
          <Routes>
            <Route path={ROUTES.login} element={<LoginRoute />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AuthenticatedShell />
                </RequireAuth>
              }
            >
              <Route index element={<DefaultModuleRedirect />} />
              <Route path="system/*" element={<Navigate to={buildFuncAdminPath('users')} replace />} />
              <Route path="ai-agent/*" element={<AiAgentWorkspace />} />
              <Route path="func-operation/*" element={<FuncOperationWorkspace />} />
            </Route>
            <Route path="*" element={<Navigate to={ROUTES.root} replace />} />
          </Routes>
        </AuthProvider>
      </AntApp>
    </XProvider>
  )
}

export default App
