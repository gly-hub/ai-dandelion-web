import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useXChat, useXConversations } from '@ant-design/x-sdk'
import { Badge, Button, Dropdown, Empty, Input, Modal, Spin, Tabs, Tag, Tooltip } from 'antd'
import { Attachments, Bubble, Conversations, Prompts, Sender, Welcome } from '@ant-design/x'
import {
  AppstoreAddOutlined,
  ArrowDownOutlined,
  CheckOutlined,
  CheckCircleFilled,
  CloseOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  InboxOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SettingOutlined,
  SyncOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { SenderRef, SlotConfigType } from '@ant-design/x/es/sender'
import { useAuth } from '../../contexts/AuthContext'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { AgentMySpacePanel } from './AgentMySpacePanel'
import { AgentToolboxPanel } from './AgentToolboxPanel'
import { MessageBubble } from '../../components/MessageBubble'
import { ChatModelSelector, readAutoModelEnabled } from '../../components/ChatModelSelector'
import { SidebarSearchInput } from '../../components/SidebarSearchInput'
import { TodoDock } from '../../components/TodoDock'
import { createSession, deleteSession, listMessages, listSessions, updateSession, uploadChatFile } from '../../lib/api'
import {
  formatSkillLabel,
  listAgentSkillOptions,
  listUserAgentSkillOptions,
} from '../../lib/agentSkillApi'
import { formatMCPLabel, listAgentMCPServers, listUserAgentMCPServers } from '../../lib/agentMcpApi'
import { listAgentFunctionSkillOptions } from '../../lib/agentFunctionSkillApi'
import { buildBubbleItemKey } from '../../lib/chatBubble'
import { MAX_LIVE_CHAT_MESSAGES, releaseChatStore } from '../../lib/chatSession'
import {
  AiAgentStreamProvider,
  createAiAgentProvider,
  createChatMessage,
  normalizePersistedMessage,
  type ChatInput,
} from '../../lib/aiAgentProvider'
import {
  listAgentModelOptions,
  pickDefaultAgentModelId,
  resolveStreamModelId,
  setSelectedAgentModelId,
} from '../../lib/agentModelApi'
import { resolveMenuIcon } from '../../lib/menuIcons'
import { findNavMenuByViewKey, pickDefaultViewKey } from '../../lib/navMenus'
import { buildAiAgentPath, parseAiAgentPath } from '../../lib/routes'
import type { AgentFunctionSkillOption, AgentMCPServerOption, AgentModelOption, AgentSkillOption, ChatExtraItem, ChatMessage, ChatStatus, PersistedMessage, Session, StreamChunk, TodoTask } from '../../types'

const providerCache = new Map<string, AiAgentStreamProvider>()
const MESSAGE_PAGE_SIZE = 40
const HISTORY_LOAD_SCROLL_THRESHOLD = 48
const BOTTOM_SCROLL_THRESHOLD = 80
const EMPTY_SLOT_CONFIG: SlotConfigType[] = []
const SLASH_COMMAND_MATCHER = /(?:^|\s)(\/[^\s/]*)$/

const promptItems = [
  { key: '1', label: '帮我检查当前项目结构，并说明下一步' },
  { key: '2', label: '基于现有代码给我一个实现计划' },
  { key: '3', label: '继续上次上下文，优先处理阻塞项' },
]

const bubbleRoles = {
  assistant: {
    placement: 'start' as const,
    contentRender: (payload: BubblePayload) => <MessageBubble {...payload} />,
  },
  user: {
    placement: 'end' as const,
    contentRender: (payload: BubblePayload) => <MessageBubble {...payload} />,
  },
}

interface BubblePayload {
  message: ChatMessage
  status: ChatStatus
  messageKey: string | number
  sessionId?: string
}

interface PendingChatAttachment {
  uid: string
  fileUuid?: string
  name: string
  size: number
  type: string
  url?: string
  thumbUrl?: string
  percent: number
  status: 'uploading' | 'done'
}

export function AiAgentWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useAuth()
  const { getModuleNav } = useNavMenus()
  const navMenus = getModuleNav('ai-agent')
  const location = useLocation()
  const navigate = useNavigate()
  const { viewKey: urlViewKey, sessionId: urlSessionId } = parseAiAgentPath(location.pathname)
  const activeView = useMemo(() => {
    if (embedded) {
      return 'chat'
    }
    if (urlViewKey && findNavMenuByViewKey(navMenus, urlViewKey)) {
      return urlViewKey
    }
    return pickDefaultViewKey(navMenus, 'chat')
  }, [embedded, navMenus, urlViewKey])
  const sideNavMenus = useMemo(
    () => navMenus.filter((item) => item.viewKey !== 'chat'),
    [navMenus],
  )
  const [sessions, setSessions] = useState<Session[]>([])
  const [draft, setDraft] = useState('')
  const [chatAttachments, setChatAttachments] = useState<ChatMessage['parts']>([])
  const [pendingChatAttachments, setPendingChatAttachments] = useState<PendingChatAttachment[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState('')
  const [sessionKeyword, setSessionKeyword] = useState('')
  const [messagePageBySession, setMessagePageBySession] = useState<Record<string, { hasMore: boolean; nextBefore: string }>>({})
  const [loadingHistorySessionId, setLoadingHistorySessionId] = useState('')
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState('')
  const [deletingSessionId, setDeletingSessionId] = useState('')
  const [editingSessionId, setEditingSessionId] = useState('')
  const [editingSessionTitle, setEditingSessionTitle] = useState('')
  const [savingSessionId, setSavingSessionId] = useState('')
  const [modelOptions, setModelOptions] = useState<AgentModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [autoModel, setAutoModel] = useState(() => readAutoModelEnabled())
  const [skillOptions, setSkillOptions] = useState(() => listAgentSkillOptions())
  const [functionSkillOptions, setFunctionSkillOptions] = useState<AgentFunctionSkillOption[]>([])
  const [mcpServerOptions, setMCPServerOptions] = useState(() => listAgentMCPServers())
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedFunctionSkillIds, setSelectedFunctionSkillIds] = useState<string[]>([])
  const [selectedMCPIds, setSelectedMCPIds] = useState<string[]>([])
  const [slashCommand, setSlashCommand] = useState<{
    query: string
    replaceText: string
    source: 'input' | 'button'
    activeTab: 'skill' | 'mcp'
  } | null>(null)
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false)
  const [agentSettingsTab, setAgentSettingsTab] = useState('toolbox')
  const selectedModelIdRef = useRef('')
  const autoModelRef = useRef(autoModel)
  const activeSessionIdRef = useRef('')
  const composerRef = useRef<SenderRef | null>(null)
  const composerShellRef = useRef<HTMLElement | null>(null)
  const composerSlotConfigRef = useRef<SlotConfigType[]>([])
  const tokenSeedRef = useRef(0)
  const editingSessionIdRef = useRef('')

  const enabledSkillOptions = useMemo(
    () => skillOptions.filter((item) => item.enabled),
    [skillOptions],
  )

  const slashCommandSkills = useMemo(() => {
    if (!slashCommand) {
      return []
    }
    const keyword = slashCommand.query.trim().toLowerCase()
    if (!keyword) {
      return enabledSkillOptions
    }
    return enabledSkillOptions.filter((skill) => {
      const label = formatSkillLabel(skill).toLowerCase()
      const id = skill.id.toLowerCase()
      const description = (skill.description || '').toLowerCase()
      return label.includes(keyword) || id.includes(keyword) || description.includes(keyword)
    })
  }, [enabledSkillOptions, slashCommand])

  const slashCommandFunctionSkills = useMemo(() => {
    if (!slashCommand) return []
    const keyword = slashCommand.query.trim().toLowerCase()
    return functionSkillOptions.filter((skill) => !keyword || skill.name.toLowerCase().includes(keyword) || skill.id.toLowerCase().includes(keyword) || skill.description.toLowerCase().includes(keyword))
  }, [functionSkillOptions, slashCommand])

  const enabledMCPServerOptions = useMemo(
    () => mcpServerOptions.filter((item) => item.enabled),
    [mcpServerOptions],
  )

  const slashCommandMCPServers = useMemo(() => {
    if (!slashCommand) {
      return []
    }
    const keyword = slashCommand.query.trim().toLowerCase()
    if (!keyword) {
      return enabledMCPServerOptions
    }
    return enabledMCPServerOptions.filter((server) => {
      const label = formatMCPLabel(server).toLowerCase()
      const id = server.id.toLowerCase()
      const description = (server.description || '').toLowerCase()
      const type = server.type.toLowerCase()
      return label.includes(keyword) || id.includes(keyword) || description.includes(keyword) || type.includes(keyword)
    })
  }, [enabledMCPServerOptions, slashCommand])

  useEffect(() => {
    selectedModelIdRef.current = selectedModelId
  }, [selectedModelId])

  useEffect(() => {
    autoModelRef.current = autoModel
  }, [autoModel])

  useEffect(() => {
    if (!editingSessionId || savingSessionId) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.session-title-edit-control')) {
        return
      }
      cancelSessionTitleEdit()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [editingSessionId, savingSessionId])

  useEffect(() => {
    if (!slashCommand) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const shell = composerShellRef.current
      const target = event.target
      if (shell && target instanceof Node && shell.contains(target)) {
        return
      }
      setSlashCommand(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [slashCommand])

  useEffect(() => {
    void listAgentModelOptions()
      .then((items) => {
        setModelOptions(items)
        const nextId = pickDefaultAgentModelId(items)
        setSelectedModelId(nextId)
        setSelectedAgentModelId(nextId)
      })
      .catch(() => {
        setModelOptions([])
      })
  }, [])

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }
    void listUserAgentSkillOptions(currentUser.id)
      .then((items) => {
        setSkillOptions(items)
      })
      .catch(() => undefined)
  }, [currentUser?.id])

  useEffect(() => {
    void listAgentFunctionSkillOptions().then(setFunctionSkillOptions).catch(() => setFunctionSkillOptions([]))
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) {
      return
    }
    void listUserAgentMCPServers(currentUser.id)
      .then((items) => {
        setMCPServerOptions(items)
      })
      .catch(() => undefined)
  }, [currentUser?.id])

  useEffect(() => {
    if (navMenus.length === 0) {
      return
    }
    const defaultViewKey = pickDefaultViewKey(navMenus, 'chat')
    if (!embedded && (!urlViewKey || !findNavMenuByViewKey(navMenus, urlViewKey))) {
      navigate(buildAiAgentPath(defaultViewKey), { replace: true })
    }
  }, [embedded, navMenus, navigate, urlViewKey])
  const messageStageRef = useRef<HTMLDivElement | null>(null)
  const preserveScrollOnPrependRef = useRef(false)
  const switchedSessionRef = useRef(false)
  const isNearBottomRef = useRef(true)

  const {
    activeConversationKey,
    setActiveConversationKey,
    setConversations,
    addConversation,
    removeConversation,
  } = useXConversations({
    defaultConversations: [],
    defaultActiveConversationKey: '',
  })

  const activeConversationSessionId = String(activeConversationKey || '')
  const activeSessionId =
    activeView === 'chat' && urlSessionId ? urlSessionId : activeConversationSessionId
  const provider = useMemo(
    () => (activeSessionId ? getProvider(activeSessionId) : undefined),
    [activeSessionId],
  )

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  const {
    messages,
    onRequest,
    isRequesting,
    abort,
    queueRequest,
    isDefaultMessagesRequesting,
    setMessages,
  } = useXChat<ChatMessage, ChatMessage, ChatInput, StreamChunk>({
    provider,
    conversationKey: activeSessionId,
    defaultMessages: async (info?: { conversationKey?: string }) => {
      const conversationKey = String(info?.conversationKey || '')
      if (!conversationKey) {
        return []
      }

      const page = await listMessages(conversationKey, {
        limit: MAX_LIVE_CHAT_MESSAGES,
      })
      const scopedItems = scopeMessagesToSession(page.items, conversationKey)
      setMessagePageBySession((current) => ({
        ...current,
        [conversationKey]: {
          hasMore: scopedItems.length === page.items.length ? page.hasMore : false,
          nextBefore: page.nextBefore || '',
        },
      }))
      return scopedItems.slice().reverse().map((item) => ({
        id: item.id,
        status: 'success' as const,
        message: normalizePersistedMessage(item),
      }))
    },
    requestPlaceholder: () =>
      createChatMessage({
        role: 'assistant',
        content: '',
        parts: [],
      }),
    requestFallback: (requestParams, { error: requestError, messageInfo }) => {
      if (requestError.name === 'AbortError') {
        return messageInfo?.message || createChatMessage({ role: 'assistant', content: '' })
      }

      return createChatMessage({
        role: 'assistant',
        content: `请求失败：${requestError.message || requestParams.content || '请稍后重试'}`,
      })
    },
  })

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [activeSessionId, sessions],
  )
  const todoDockData = useMemo(
    () => buildTodoDockData(messages.map((item) => item.message)),
    [messages],
  )
  const todoStatusSummary = useMemo(
    () => buildTodoStatusSummary(todoDockData.tasks),
    [todoDockData.tasks],
  )
  const filteredConversations = useMemo(() => {
    const keyword = sessionKeyword.trim().toLowerCase()
    return sessions
      .filter((session) => !keyword || session.title.toLowerCase().includes(keyword))
      .map((session) => ({
        key: session.id,
        label: (
            <span className="agent-conversation-item-copy">
            <span className="agent-conversation-item-title-line">
              <strong>{session.title}</strong>
              <em>{formatSessionUpdatedAt(session.updatedAt)}</em>
              <span
                className="agent-conversation-item-actions"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'delete',
                        label: '删除会话',
                        icon: <DeleteOutlined />,
                        danger: true,
                        disabled: deletingSessionId === session.id,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'delete') {
                        setPendingDeleteSessionId(session.id)
                      }
                    },
                  }}
                  trigger={['click']}
                  placement="bottomLeft"
                  align={{ offset: [4, 4] }}
                  overlayClassName="agent-conversation-menu-overlay"
                >
                  <Button
                    type="text"
                    size="small"
                    className="agent-conversation-menu-trigger"
                    icon={<MoreOutlined />}
                    aria-label={`${session.title}操作菜单`}
                  />
                </Dropdown>
              </span>
            </span>
          </span>
        ),
      }))
  }, [deletingSessionId, sessions, sessionKeyword])
  const activeMessagePage = messagePageBySession[activeSessionId] || { hasMore: false, nextBefore: '' }
  const isLoadingHistory = loadingHistorySessionId === activeSessionId
  const pendingDeleteSession = useMemo(
    () => sessions.find((item) => item.id === pendingDeleteSessionId) || null,
    [pendingDeleteSessionId, sessions],
  )

  useEffect(() => {
    const chatKey = activeSessionId
    if (!chatKey) {
      return
    }
    return () => {
      releaseChatStore(chatKey)
    }
  }, [activeSessionId])

  const reloadSessionsEvent = useEffectEvent(reloadSessions)
  const handleCreateSessionEvent = useEffectEvent(handleCreateSession)
  const syncBottomStateEvent = useEffectEvent(syncBottomState)

  useEffect(() => {
    if (embedded || activeView !== 'chat' || booting || !urlSessionId) {
      return
    }
    if (urlSessionId !== activeSessionId) {
      setActiveConversationKey(urlSessionId)
    }
  }, [activeView, activeSessionId, booting, embedded, setActiveConversationKey, urlSessionId])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const nextSessions = await reloadSessionsEvent()
        if (cancelled) {
          return
        }
        if (nextSessions.length > 0) {
          const targetSessionId =
            urlSessionId && nextSessions.some((session) => session.id === urlSessionId)
              ? urlSessionId
              : nextSessions[0].id
          setActiveConversationKey(targetSessionId)
          if (!embedded && activeView === 'chat' && !urlSessionId) {
            navigate(buildAiAgentPath('chat', targetSessionId), { replace: true })
          }
        } else {
          await handleCreateSessionEvent()
        }
      } catch (err) {
        if (!cancelled) {
          setError(asError(err).message)
        }
      } finally {
        if (!cancelled) {
          setBooting(false)
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [activeView, embedded, navigate, setActiveConversationKey, urlSessionId])

  useEffect(() => {
    switchedSessionRef.current = true
  }, [activeSessionId])

  useEffect(() => {
    if (isDefaultMessagesRequesting || preserveScrollOnPrependRef.current || !switchedSessionRef.current) {
      return
    }
    const panel = messageStageRef.current
    if (!panel) {
      return
    }
    requestAnimationFrame(() => {
      panel.scrollTo({ top: panel.scrollHeight, behavior: 'auto' })
      syncBottomStateEvent(panel)
      switchedSessionRef.current = false
    })
  }, [messages, isDefaultMessagesRequesting])

  useEffect(() => {
    if (isDefaultMessagesRequesting || preserveScrollOnPrependRef.current || switchedSessionRef.current) {
      return
    }
    if (!isNearBottomRef.current) {
      return
    }
    const panel = messageStageRef.current
    if (!panel) {
      return
    }
    requestAnimationFrame(() => {
      panel.scrollTo({
        top: panel.scrollHeight,
        behavior: isRequesting ? 'smooth' : 'auto',
      })
      syncBottomStateEvent(panel)
    })
  }, [messages, isDefaultMessagesRequesting, isRequesting])

  async function reloadSessions() {
    const nextSessions = await listSessions()
    setSessions(nextSessions)
    setConversations(
      nextSessions.map((session) => ({
        key: session.id,
        label: session.title,
      })),
    )
    return nextSessions
  }

  async function handleCreateSession() {
    setError('')
    const session = await createSession('')
    releaseChatStore(session.id)
    setSessions((current) => [session, ...current])
    setMessagePageBySession((current) => ({
      ...current,
      [session.id]: { hasMore: false, nextBefore: '' },
    }))
    addConversation({ key: session.id, label: session.title }, 'prepend')
    setMessages([])
    setActiveConversationKey(session.id)
    if (!embedded) {
      navigate(buildAiAgentPath('chat', session.id))
    }
    setDraft('')
    setShowScrollToBottom(false)
    isNearBottomRef.current = true
    switchedSessionRef.current = true
    return session
  }

  function startSessionTitleEdit(session: Session) {
    if (savingSessionId) {
      return
    }
    editingSessionIdRef.current = session.id
    setEditingSessionId(session.id)
    setEditingSessionTitle(session.title)
  }

  function cancelSessionTitleEdit() {
    if (savingSessionId) {
      return
    }
    editingSessionIdRef.current = ''
    setEditingSessionId('')
    setEditingSessionTitle('')
  }

  async function handleSaveSessionTitle(session: Session) {
    if (editingSessionIdRef.current !== session.id || savingSessionId === session.id) {
      return
    }

    const title = editingSessionTitle.trim()
    if (!title) {
      setError('会话名称不能为空')
      return
    }
    if (title === session.title) {
      cancelSessionTitleEdit()
      return
    }

    setSavingSessionId(session.id)
    setError('')
    try {
      const updatedSession = await updateSession(session.id, title)
      setSessions((current) => current.map((item) => item.id === session.id ? updatedSession : item))
      editingSessionIdRef.current = ''
      setEditingSessionId('')
      setEditingSessionTitle('')
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setSavingSessionId('')
    }
  }

  async function handleConfirmDeleteSession() {
    if (!pendingDeleteSessionId) {
      return
    }

    const sessionId = pendingDeleteSessionId
    setDeletingSessionId(sessionId)
    setError('')

    try {
      await deleteSession(sessionId)
      const remainingSessions = sessions.filter((item) => item.id !== sessionId)
      setSessions(remainingSessions)
      removeConversation(sessionId)
      setMessagePageBySession((current) => {
        const next = { ...current }
        delete next[sessionId]
        return next
      })

      if (activeSessionId === sessionId) {
        setMessages([])
        const nextActiveSessionId = remainingSessions[0]?.id || ''
        setActiveConversationKey(nextActiveSessionId)
        if (!embedded && activeView === 'chat') {
          navigate(
            nextActiveSessionId
              ? buildAiAgentPath('chat', nextActiveSessionId)
              : buildAiAgentPath('chat'),
            { replace: true },
          )
        }
        setDraft('')
        setShowScrollToBottom(false)
        isNearBottomRef.current = true
        switchedSessionRef.current = Boolean(nextActiveSessionId)
        window.setTimeout(() => clearSessionClientCache(sessionId), 0)
      } else {
        clearSessionClientCache(sessionId)
      }

      setPendingDeleteSessionId('')
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setDeletingSessionId('')
    }
  }

  async function loadOlderMessages() {
    const sessionId = activeSessionId
    if (!sessionId || isLoadingHistory || !activeMessagePage.hasMore || !activeMessagePage.nextBefore) {
      return
    }

    const panel = messageStageRef.current
    const previousHeight = panel?.scrollHeight || 0
    const nextBefore = activeMessagePage.nextBefore
    setLoadingHistorySessionId(sessionId)
    setError('')

    try {
      const page = await listMessages(sessionId, {
        limit: MESSAGE_PAGE_SIZE,
        before: nextBefore,
      })
      if (activeSessionIdRef.current !== sessionId) {
        return
      }
      preserveScrollOnPrependRef.current = true
      const scopedItems = scopeMessagesToSession(page.items, sessionId)
      const olderMessages = scopedItems.slice().reverse().map((item) => ({
        id: item.id,
        status: 'success' as const,
        message: normalizePersistedMessage(item),
      }))
      setMessages((current) => [...olderMessages, ...current])
      setMessagePageBySession((current) => ({
        ...current,
        [sessionId]: {
          hasMore: scopedItems.length === page.items.length ? page.hasMore : false,
          nextBefore: page.nextBefore || '',
        },
      }))
      requestAnimationFrame(() => {
        if (!panel) {
          preserveScrollOnPrependRef.current = false
          return
        }
        const nextHeight = panel.scrollHeight
        panel.scrollTop += nextHeight - previousHeight
        syncBottomState(panel)
        preserveScrollOnPrependRef.current = false
      })
    } catch (err) {
      setError(asError(err).message)
      preserveScrollOnPrependRef.current = false
    } finally {
      setLoadingHistorySessionId('')
    }
  }

  function handleMessageStageScroll() {
    const panel = messageStageRef.current
    if (!panel) {
      return
    }

    syncBottomState(panel)
    if (panel.scrollTop > HISTORY_LOAD_SCROLL_THRESHOLD) {
      return
    }
    void loadOlderMessages()
  }

  function handleScrollToBottom() {
    const panel = messageStageRef.current
    if (!panel) {
      return
    }
    panel.scrollTo({
      top: panel.scrollHeight,
      behavior: 'smooth',
    })
    syncBottomState(panel)
  }

  async function handleSubmit(value?: string, slotConfig?: SlotConfigType[]) {
    const content = normalizeSubmitContent(value, slotConfig, draft)
    const messageParts = [...buildUserMessagePartsFromSlots(slotConfig, content), ...chatAttachments]
    const extra = buildExtraFromMessageParts(messageParts)
    if (!content && messageParts.length === 0) {
      return
    }

    const sessionId = activeSessionId
    if (!sessionId) {
      const session = await handleCreateSession()
      updateDefaultSessionTitle(session.id, content)
      queueRequest(session.id, { content, extra, messageParts })
      clearComposerDraft()
      clearComposerAttachments()
      setError('')
      return
    }
    if (!sessionId) {
      return
    }

    clearComposerDraft()
    clearComposerAttachments()
    setError('')
    updateDefaultSessionTitle(sessionId, content)
    onRequest({ content, extra, messageParts })
  }

  async function handleAttachmentUpload(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setError('聊天附件最大支持 16 MiB')
      return false
    }
    const isImage = file.type.startsWith('image/')
    const pendingAttachmentId = `upload-${Date.now()}-${tokenSeedRef.current++}`
    const localPreviewURL = isImage ? URL.createObjectURL(file) : undefined
    setPendingChatAttachments((current) => [...current, {
      uid: pendingAttachmentId,
      name: file.name,
      size: file.size,
      type: file.type,
      url: localPreviewURL,
      thumbUrl: localPreviewURL,
      percent: 0,
      status: 'uploading',
    }])
    setError('')
    setUploadingAttachment(true)
    let uploadSucceeded = false
    try {
      const uploaded = await uploadChatFile(file, (percent) => {
        setPendingChatAttachments((current) => current.map((attachment) => (
          attachment.uid === pendingAttachmentId
            ? { ...attachment, percent: Math.max(attachment.percent, percent) }
            : attachment
        )))
      })
      const type = uploaded.contentType.startsWith('image/') ? 'image' : uploaded.contentType === 'application/pdf' ? 'document' : 'file'
      const fileUrl = uploaded.url
      if (!fileUrl) throw new Error('附件预览地址缺失')
      setChatAttachments((current) => [...current, { type, fileUuid: uploaded.uuid, fileName: file.name, contentType: uploaded.contentType, fileSize: file.size, md5: uploaded.md5 || '', fileUrl }])
      setPendingChatAttachments((current) => current.map((attachment) => (
        attachment.uid === pendingAttachmentId
          ? { ...attachment, fileUuid: uploaded.uuid, percent: 100, status: 'done' }
          : attachment
      )))
      uploadSucceeded = true
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '附件上传失败')
    } finally {
      if (!uploadSucceeded) {
        setPendingChatAttachments((current) => current.filter((attachment) => attachment.uid !== pendingAttachmentId))
        if (localPreviewURL) {
          URL.revokeObjectURL(localPreviewURL)
        }
      }
      setUploadingAttachment(false)
    }
    return false
  }

  const uploadedAttachmentItems = pendingChatAttachments

  function clearComposerAttachments() {
    pendingChatAttachments.forEach((attachment) => {
      if (attachment.url?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.url)
      }
    })
    setPendingChatAttachments([])
    setChatAttachments([])
  }

  function removeComposerAttachment(uid: string) {
    const attachment = pendingChatAttachments.find((item) => item.uid === uid)
    if (!attachment) {
      return
    }
    if (attachment.url?.startsWith('blob:')) {
      URL.revokeObjectURL(attachment.url)
    }
    setPendingChatAttachments((current) => current.filter((item) => item.uid !== uid))
    if (attachment.fileUuid) {
      setChatAttachments((current) => current.filter((part) => !('fileUuid' in part) || part.fileUuid !== attachment.fileUuid))
    }
  }

  function updateDefaultSessionTitle(sessionId: string, content: string) {
    const title = sessionTitleFromContent(content)
    if (!title) {
      return
    }
    setSessions((current) => current.map((session) => (
      session.id === sessionId && session.title === 'New chat'
        ? { ...session, title }
        : session
    )))
  }

  function clearComposerDraft() {
    setDraft('')
    setSelectedSkillIds([])
    setSelectedFunctionSkillIds([])
    setSelectedMCPIds([])
    composerSlotConfigRef.current = []
    composerRef.current?.clear?.()
  }

  function extractSkillIdsFromSlots(slotConfig?: SlotConfigType[]) {
    return extractSkillMetaFromSlots(slotConfig).map((item) => item.id)
  }

  function extractMCPIdsFromSlots(slotConfig?: SlotConfigType[]) {
    return extractMCPMetaFromSlots(slotConfig).map((item) => item.id)
  }

  function extractSkillMetaFromSlots(slotConfig?: SlotConfigType[]) {
    return extractToolMetaFromSlots(slotConfig, 'skill')
  }

  function extractFunctionSkillMetaFromSlots(slotConfig?: SlotConfigType[]) {
    return extractToolMetaFromSlots(slotConfig, 'function_skill')
  }

  function extractMCPMetaFromSlots(slotConfig?: SlotConfigType[]) {
    return extractToolMetaFromSlots(slotConfig, 'mcp')
  }

  function extractToolMetaFromSlots(slotConfig: SlotConfigType[] | undefined, type: 'skill' | 'mcp' | 'function_skill') {
    const toolMap = new Map<string, string>()
    ;(slotConfig || [])
      .filter((item): item is Extract<SlotConfigType, { type: 'tag' }> =>
        item.type === 'tag' && typeof item.props?.value === 'string',
      )
      .forEach((item) => {
        const tokenType = isMCPSlot(item) ? 'mcp' : isFunctionSkillSlot(item) ? 'function_skill' : 'skill'
        if (tokenType !== type) {
          return
        }
        const id = String(item.props?.value || '').trim()
        if (!id) {
          return
        }
        const label = type === 'mcp' ? resolveMCPLabel(id, item.props?.label) : type === 'function_skill' ? resolveFunctionSkillLabel(id, item.props?.label) : resolveSkillLabel(id, item.props?.label)
        toolMap.set(id, label)
      })
    return Array.from(toolMap, ([id, label]) => ({ id, label }))
  }

  function resolveSkillLabel(skillId: string, labelNode: unknown) {
    if (typeof labelNode === 'string' && labelNode.trim()) {
      return labelNode.trim()
    }
    const skill = skillOptions.find((item) => item.id === skillId)
    return skill ? formatSkillLabel(skill) : skillId
  }

  function resolveMCPLabel(mcpId: string, labelNode: unknown) {
    if (typeof labelNode === 'string' && labelNode.trim()) {
      return labelNode.trim()
    }
    const server = mcpServerOptions.find((item) => item.id === mcpId)
    return server ? formatMCPLabel(server) : mcpId
  }

  function resolveFunctionSkillLabel(id: string, labelNode: unknown) {
    if (typeof labelNode === 'string' && labelNode.trim()) return labelNode.trim()
    return functionSkillOptions.find((item) => item.id === id)?.name || id
  }

  function normalizeSubmitContent(value?: string, slotConfig?: SlotConfigType[], fallback = '') {
    const text = extractTextFromSlots(slotConfig)
    return (text || value || fallback).trim()
  }

  function extractTextFromSlots(slotConfig?: SlotConfigType[]) {
    return (slotConfig || [])
      .filter((item): item is Extract<SlotConfigType, { type: 'text' }> => item.type === 'text')
      .map((item) => item.value || '')
      .join('')
      .trim()
  }

  function buildUserMessagePartsFromSlots(
    slotConfig: SlotConfigType[] | undefined,
    content: string,
  ): ChatMessage['parts'] {
    const parts: ChatMessage['parts'] = []
    ;(slotConfig || []).forEach((item) => {
      if (item.type === 'text') {
        const text = (item.value || '').trim()
        if (text) {
          parts.push({ type: 'text', text })
        }
        return
      }

      if (item.type === 'tag' && typeof item.props?.value === 'string') {
        const toolId = String(item.props.value || '').trim()
        if (!toolId) {
          return
        }
        if (isMCPSlot(item)) {
          parts.push({
            type: 'mcp',
            mcpId: toolId,
            label: resolveMCPLabel(toolId, item.props.label),
          })
        } else if (isFunctionSkillSlot(item)) {
          parts.push({ type: 'function_skill', skillId: toolId, label: resolveFunctionSkillLabel(toolId, item.props.label) })
        } else {
          parts.push({
            type: 'skill',
            skillId: toolId,
            label: resolveSkillLabel(toolId, item.props.label),
          })
        }
      }
    })

    return parts.length > 0 ? parts : [{ type: 'text', text: content }]
  }

  function buildExtraFromMessageParts(parts: ChatMessage['parts']): ChatExtraItem[] {
    const extra: ChatExtraItem[] = []
    parts.forEach((part, index) => {
      if (part.type === 'skill') {
        extra.push({
          type: 'skill',
          id: part.skillId,
          name: part.label,
          index,
        })
      }
      if (part.type === 'mcp') {
        extra.push({
          type: 'mcp',
          id: part.mcpId,
          name: part.label,
          index,
        })
      }
      if (part.type === 'function_skill') {
        extra.push({ type: 'function_skill', id: part.skillId, name: part.label, index })
      }
    })
    return extra
  }

  function insertSlashCommandSkillToken(skill: AgentSkillOption) {
    const replaceText = slashCommand?.replaceText || ''
    const key = nextTokenKey('skill', skill.id)
    composerRef.current?.insert?.([
      {
        type: 'tag',
        key,
        props: {
          label: renderComposerSkillToken(formatSkillLabel(skill), skill.id, key),
          value: skill.id,
        },
        formatResult: () => formatSkillLabel(skill),
      },
      {
        type: 'text',
        value: ' ',
      },
    ], 'cursor', replaceText || undefined)
    setSlashCommand(null)
    composerRef.current?.focus?.({ cursor: 'end' })
  }

  function insertSlashCommandFunctionSkillToken(skill: AgentFunctionSkillOption) {
    const replaceText = slashCommand?.replaceText || ''
    const key = nextTokenKey('function_skill', skill.id)
    composerRef.current?.insert?.([{ type: 'tag', key, props: { label: renderComposerSkillToken(skill.name, skill.id, key), value: skill.id }, formatResult: () => skill.name }, { type: 'text', value: ' ' }], 'cursor', replaceText || undefined)
    setSlashCommand(null)
    composerRef.current?.focus?.({ cursor: 'end' })
  }

  function insertSlashCommandMCPToken(server: AgentMCPServerOption) {
    const replaceText = slashCommand?.replaceText || ''
    const key = nextTokenKey('mcp', server.id)
    composerRef.current?.insert?.([
      {
        type: 'tag',
        key,
        props: {
          label: renderComposerSkillToken(formatMCPLabel(server), server.id, key),
          value: server.id,
        },
        formatResult: () => formatMCPLabel(server),
      },
      {
        type: 'text',
        value: ' ',
      },
    ], 'cursor', replaceText || undefined)
    setSlashCommand(null)
    composerRef.current?.focus?.({ cursor: 'end' })
  }

  function nextTokenKey(prefix: 'skill' | 'mcp' | 'function_skill', id: string) {
    tokenSeedRef.current += 1
    return `${prefix}:${id}:${tokenSeedRef.current}`
  }

  function isMCPSlot(item: Extract<SlotConfigType, { type: 'tag' }>) {
    return String(item.key || '').startsWith('mcp:')
  }

  function isFunctionSkillSlot(item: Extract<SlotConfigType, { type: 'tag' }>) {
    return String(item.key || '').startsWith('function_skill:')
  }

  function syncSlashCommand(value: string, slotConfig?: SlotConfigType[]) {
    const hasInlineToken = (slotConfig || []).some((item) => item.type === 'tag')
    if (hasInlineToken) {
      setSlashCommand(null)
      return
    }

    const match = value.match(SLASH_COMMAND_MATCHER)
    if (!match) {
      setSlashCommand(null)
      return
    }

    const replaceText = match[1]
    setSlashCommand({
      replaceText,
      query: replaceText.slice(1),
      source: 'input',
      activeTab: 'skill',
    })
  }

  function toggleSlashCommandPanel() {
    setSlashCommand((current) =>
      current?.source === 'button'
        ? null
        : {
            query: '',
            replaceText: '',
            source: 'button',
            activeTab: 'skill',
          },
    )
    composerRef.current?.focus?.({ cursor: 'end' })
  }

  function switchSlashCommandTab(activeTab: 'skill' | 'mcp') {
    setSlashCommand((current) => (current ? { ...current, activeTab } : current))
  }

  function renderHighlightedText(text: string, keyword: string) {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return text
    }

    const normalizedText = text.toLowerCase()
    const matchIndex = normalizedText.indexOf(normalizedKeyword)
    if (matchIndex < 0) {
      return text
    }

    const before = text.slice(0, matchIndex)
    const matched = text.slice(matchIndex, matchIndex + normalizedKeyword.length)
    const after = text.slice(matchIndex + normalizedKeyword.length)
    return (
      <>
        {before}
        <mark>{matched}</mark>
        {after}
      </>
    )
  }

  function renderComposerSkillToken(label: string, skillId: string, slotKey: string) {
    return (
      <span className="chat-sender-slot-skill-token">
        <span className="chat-sender-slot-skill-token-label">{label}</span>
        <button
          type="button"
          className="chat-sender-slot-skill-token-remove"
          aria-label={`移除${label}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            removeSkillToken(slotKey, skillId)
          }}
        >
          ×
        </button>
      </span>
    )
  }

  function removeSkillToken(slotKey: string, skillId: string) {
    const nextSlotConfig = composerSlotConfigRef.current.filter((item) => item.key !== slotKey)
    composerSlotConfigRef.current = nextSlotConfig
    setSelectedSkillIds((current) => current.filter((id) => id !== skillId))
    setSelectedFunctionSkillIds((current) => current.filter((id) => id !== skillId))
    composerRef.current?.clear?.()
    if (nextSlotConfig.length > 0) {
      composerRef.current?.insert?.(nextSlotConfig, 'end', undefined, true)
      composerRef.current?.focus?.({ cursor: 'end' })
    }
  }

  function handleAbort() {
    if (!activeSessionId) {
      return
    }
    abort()
  }

  return (
    <>
      <div className={`agent-layout-shell${embedded ? ' agent-layout-embedded' : ''}`}>
      <aside className="session-rail rail">
        {!embedded ? <nav className="agent-sidebar-nav" aria-label="Agent 功能">
          {sideNavMenus.map((item) => {
            const viewKey = item.viewKey || item.code
            return (
              <button
                key={item.id}
                type="button"
                className={`agent-sidebar-nav-item${activeView === viewKey ? ' active' : ''}`}
                aria-current={activeView === viewKey ? 'page' : undefined}
                title={item.remark || item.name}
                onClick={() => navigate(buildAiAgentPath(viewKey))}
              >
                <span className="agent-sidebar-nav-icon" aria-hidden="true">
                  {resolveMenuIcon(item.icon)}
                </span>
                <span>{item.name}</span>
              </button>
            )
          })}
        </nav> : null}

        <section className="agent-conversation-block" aria-label="对话">
          <div className="agent-conversation-block-head">
            <div className="agent-conversation-rail-header">
              <p className="agent-sidebar-section-title">会话</p>
              <Button
                size="small"
                icon={<PlusOutlined />}
                aria-label="新建对话"
                onClick={() => void handleCreateSession()}
                disabled={isRequesting}
              />
            </div>
            <div className="sidebar-searchbar agent-conversation-searchbar">
              <SidebarSearchInput
                value={sessionKeyword}
                aria-label="搜索会话"
                placeholder="搜索会话"
                onChange={setSessionKeyword}
              />
            </div>
          </div>

          <Conversations
          items={filteredConversations}
          activeKey={activeView === 'chat' ? activeConversationKey : undefined}
          onActiveChange={(key) => {
            setDraft('')
            const sessionId = String(key)
            if (!embedded) {
              navigate(buildAiAgentPath('chat', sessionId))
            }
            setActiveConversationKey(sessionId)
          }}
          className="conversation-list"
        />
        </section>
      </aside>

      {activeView === 'toolbox' ? (
        <AgentToolboxPanel
          skills={skillOptions}
          mcpServers={mcpServerOptions}
          userId={currentUser?.id}
          onSkillsChange={setSkillOptions}
          onMCPServersChange={setMCPServerOptions}
        />
      ) : activeView === 'my-space' ? (
        <AgentMySpacePanel />
      ) : activeView === 'chat' ? (
        <main className="agent-stage chat-stage">
          {embedded ? (
            <header className="agent-modal-chat-header">
              <div className="agent-modal-chat-title">
                <strong>{activeSession?.title || '新对话'}</strong>
              </div>
              <span className={`agent-modal-chat-status${isRequesting ? ' is-streaming' : ''}`}>
                <i aria-hidden="true" />
                {isRequesting ? '正在同步上下文' : '上下文已同步'}
              </span>
              <Tooltip title="工具箱与我的空间">
                <Button
                  type="text"
                  shape="circle"
                  className="agent-modal-header-settings-trigger"
                  icon={<SettingOutlined />}
                  aria-label="打开工具箱与我的空间"
                  onClick={() => setAgentSettingsOpen(true)}
                />
              </Tooltip>
            </header>
          ) : null}
          <section
            className="message-stage"
            aria-live="polite"
            ref={messageStageRef}
            onScroll={handleMessageStageScroll}
          >
            {booting || isDefaultMessagesRequesting ? (
              <div className="empty-stage">
                <Spin size="large" />
                <strong>加载中</strong>
                <p>正在恢复会话与消息记录。</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="welcome-wrap">
                <Welcome
                  title="开始一段新的 Agent 对话"
                  description="当前模块只承载 ai-agent 聊天能力：会话、历史消息、流式输出、思考过程与工具调用展示。"
                />
                <Prompts
                  items={promptItems}
                  onItemClick={(info) => {
                    const value = String(info.data.label)
                    setDraft(value)
                    void handleSubmit(value)
                  }}
                />
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择旧会话，或直接发起一个新问题。" />
              </div>
            ) : (
              <>
                {activeMessagePage.hasMore || isLoadingHistory ? (
                  <div className="message-history-bar">
                    <span>{isLoadingHistory ? '正在加载更早消息...' : '滚动到顶部以加载更早消息'}</span>
                  </div>
                ) : null}
                <Bubble.List
                  role={bubbleRoles}
                  items={messages.map(({ id, message, status }, index) => {
                    const bubbleKey = buildBubbleItemKey(id, message, index)
                    return {
                      key: bubbleKey,
                      role: message.role,
                      content: {
                        message,
                        status,
                        messageKey: bubbleKey,
                        sessionId: activeSessionId,
                      },
                      streaming: status === 'loading' || status === 'updating',
                      loading:
                        (status === 'loading' || status === 'updating') &&
                        message.parts.length === 0 &&
                        !message.content,
                    }
                  })}
                  className="bubble-list"
                />
              </>
            )}
          </section>

          <div className="composer-stack">
            {showScrollToBottom ? (
              <div className="scroll-to-bottom-wrap">
                <Button
                  type="text"
                  shape="circle"
                  className="scroll-to-bottom-button"
                  icon={<ArrowDownOutlined />}
                  aria-label="回到底部"
                  title="回到底部"
                  onClick={handleScrollToBottom}
                />
              </div>
            ) : null}
            {error ? <p className="error-banner inline-error">{error}</p> : null}

            <footer className="composer-shell" ref={composerShellRef}>
              <Sender
                ref={composerRef}
                value={draft}
                onChange={(value, _event, slotConfig) => {
                  composerSlotConfigRef.current = slotConfig || []
                  setDraft((current) => (current === value ? current : value))
                  syncSlashCommand(value, slotConfig)
                  const nextSkillIds = extractSkillIdsFromSlots(slotConfig)
                  const nextFunctionSkillIds = extractFunctionSkillMetaFromSlots(slotConfig).map((item) => item.id)
                  const nextMCPIds = extractMCPIdsFromSlots(slotConfig)
                  setSelectedSkillIds((current) =>
                    areStringArraysEqual(current, nextSkillIds) ? current : nextSkillIds,
                  )
                  setSelectedFunctionSkillIds((current) => areStringArraysEqual(current, nextFunctionSkillIds) ? current : nextFunctionSkillIds)
                  setSelectedMCPIds((current) =>
                    areStringArraysEqual(current, nextMCPIds) ? current : nextMCPIds,
                  )
                }}
                onSubmit={(value, slotConfig) => void handleSubmit(value, slotConfig)}
                onCancel={handleAbort}
                loading={isRequesting}
                disabled={booting || uploadingAttachment}
                placeholder="输入消息，按 Enter 发送，Shift + Enter 换行"
                autoSize={{ minRows: 3, maxRows: embedded ? 7 : 8 }}
                className={`chat-sender${selectedSkillIds.length > 0 || selectedFunctionSkillIds.length > 0 || selectedMCPIds.length > 0 ? ' has-selected-skill' : ''}`}
                slotConfig={EMPTY_SLOT_CONFIG}
                suffix={false}
                header={uploadedAttachmentItems.length > 0 ? (
                  <Attachments
                    items={uploadedAttachmentItems}
                    maxCount={uploadedAttachmentItems.length}
                    onRemove={(file) => removeComposerAttachment(String(file.uid))}
                    disabled={booting || isRequesting || uploadingAttachment}
                    rootClassName="chat-attachment-list"
                  />
                ) : null}
                footer={(actions) => (
                  <div className="chat-sender-toolbar">
                    <button
                      type="button"
                      className={`chat-skill-selector-trigger${slashCommand?.source === 'button' ? ' is-open' : ''}${selectedSkillIds.length > 0 || selectedFunctionSkillIds.length > 0 || selectedMCPIds.length > 0 ? ' has-selection' : ''}`}
                      disabled={booting || isRequesting}
                      onClick={toggleSlashCommandPanel}
                    >
                      /
                    </button>
                    <Attachments
                      rootClassName="chat-attachment-uploader"
                      beforeUpload={handleAttachmentUpload}
                      disabled={booting || isRequesting || uploadingAttachment}
                      getDropContainer={() => composerShellRef.current}
                      placeholder={{
                        icon: <InboxOutlined />,
                        title: '释放文件即可添加',
                        description: '最大 16 MiB',
                      }}
                    >
                      <button
                        type="button"
                        className="chat-attachment-trigger"
                        aria-label="添加附件"
                        title="添加附件"
                      >
                        <PaperClipOutlined />
                      </button>
                    </Attachments>
                    <ChatModelSelector
                      models={modelOptions}
                      selectedModelId={selectedModelId}
                      autoModel={autoModel}
                      disabled={booting}
                      loading={isRequesting}
                      getPopupContainer={(triggerNode) =>
                        composerShellRef.current || triggerNode?.ownerDocument.body || document.body
                      }
                      onModelsChange={setModelOptions}
                      onSelectedModelIdChange={setSelectedModelId}
                      onAutoModelChange={setAutoModel}
                    />
                    <div className="chat-sender-toolbar-actions">{actions}</div>
                  </div>
                )}
              />
              {slashCommand ? (
                <div className="chat-slash-command-panel">
                  <div className="chat-slash-command-tabs" role="tablist" aria-label="能力类型">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={slashCommand.activeTab === 'skill'}
                      className={slashCommand.activeTab === 'skill' ? 'is-active' : ''}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        switchSlashCommandTab('skill')
                      }}
                    >
                      技能
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={slashCommand.activeTab === 'mcp'}
                      className={slashCommand.activeTab === 'mcp' ? 'is-active' : ''}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        switchSlashCommandTab('mcp')
                      }}
                    >
                      MCP
                    </button>
                  </div>
                  <div className="chat-slash-command-list" role="listbox" aria-label="技能列表">
                    {slashCommand.activeTab === 'mcp' ? (
                      slashCommandMCPServers.length === 0 ? (
                        <div className="chat-slash-command-empty">暂无匹配 MCP</div>
                      ) : (
                        slashCommandMCPServers.map((server) => (
                          <button
                            key={server.id}
                            type="button"
                            role="option"
                            className="chat-slash-command-item"
                            onMouseDown={(event) => {
                              event.preventDefault()
                              insertSlashCommandMCPToken(server)
                            }}
                          >
                            <AppstoreAddOutlined aria-hidden="true" />
                            <span>{renderHighlightedText(formatMCPLabel(server), slashCommand.query)}</span>
                          </button>
                        ))
                      )
                    ) : slashCommandSkills.length === 0 && slashCommandFunctionSkills.length === 0 ? (
                      <div className="chat-slash-command-empty">暂无匹配技能</div>
                    ) : (
                      <>
                        {slashCommandSkills.length > 0 ? <div className="chat-slash-command-group-title">个人技能</div> : null}
                        {slashCommandSkills.map((skill) => (
                          <button key={skill.id} type="button" role="option" className="chat-slash-command-item" onMouseDown={(event) => { event.preventDefault(); insertSlashCommandSkillToken(skill) }}>
                            <AppstoreAddOutlined aria-hidden="true" />
                            <span>{renderHighlightedText(formatSkillLabel(skill), slashCommand.query)}</span>
                          </button>
                        ))}
                        {slashCommandFunctionSkills.length > 0 ? <div className="chat-slash-command-group-title">功能技能</div> : null}
                        {slashCommandFunctionSkills.map((skill) => (
                          <button key={skill.id} type="button" role="option" className="chat-slash-command-item" onMouseDown={(event) => { event.preventDefault(); insertSlashCommandFunctionSkillToken(skill) }}>
                            <ToolOutlined aria-hidden="true" />
                            <span>{renderHighlightedText(skill.name, slashCommand.query)}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </footer>
          </div>
        </main>
      ) : null}

      {activeView === 'chat' && embedded ? (
      <aside className="session-info-rail rail agent-modal-todo-rail">
        <header className="agent-modal-context-header">
          <Tooltip title="工具箱与我的空间">
            <Button
              type="text"
              shape="circle"
              className="agent-modal-settings-trigger"
              icon={<SettingOutlined />}
              aria-label="打开工具箱与我的空间"
              onClick={() => setAgentSettingsOpen(true)}
            />
          </Tooltip>
        </header>
        <section className="agent-modal-session-panel" aria-label="会话信息">
          <p className="agent-modal-session-panel-title">会话信息</p>
          <dl className="agent-modal-session-meta">
            <div>
              <dt>标题</dt>
              <dd>
                {activeSession && editingSessionId === activeSession.id ? (
                  <span className="session-title-edit-control">
                    <Input
                      size="small"
                      value={editingSessionTitle}
                      autoFocus
                      maxLength={200}
                      disabled={savingSessionId === activeSession.id}
                      aria-label="会话名称"
                      onChange={(event) => setEditingSessionTitle(event.target.value)}
                      onPressEnter={() => void handleSaveSessionTitle(activeSession)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelSessionTitleEdit()
                        }
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      className="session-title-edit-action confirm"
                      icon={<CheckOutlined />}
                      disabled={savingSessionId === activeSession.id}
                      aria-label="确认修改会话名称"
                      onClick={() => void handleSaveSessionTitle(activeSession)}
                    />
                    <Button
                      type="text"
                      size="small"
                      className="session-title-edit-action cancel"
                      icon={<CloseOutlined />}
                      disabled={savingSessionId === activeSession.id}
                      aria-label="取消修改会话名称"
                      onClick={cancelSessionTitleEdit}
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="session-title-display"
                    title="双击编辑会话名称"
                    onDoubleClick={() => activeSession && startSessionTitleEdit(activeSession)}
                  >
                    {activeSession?.title || '新对话'}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd className={isRequesting ? 'is-streaming' : ''}>{isRequesting ? '回复中' : '已就绪'}</dd>
            </div>
            <div>
              <dt>消息数</dt>
              <dd>{messages.length}</dd>
            </div>
            <div>
              <dt>最近更新</dt>
              <dd>{activeSession ? formatSessionUpdatedAt(activeSession.updatedAt) : '暂无消息'}</dd>
            </div>
          </dl>
        </section>
        <section className="agent-modal-todo-panel" aria-label="待办">
          <header className="agent-modal-todo-head">
            <span><UnorderedListOutlined aria-hidden="true" /> 待办</span>
            {todoStatusSummary.total > 0 ? (
              <strong className="agent-modal-todo-completion">
                已完成 {todoStatusSummary.completed}/{todoStatusSummary.total}
              </strong>
            ) : null}
          </header>
          {todoDockData.tasks.length === 0 ? (
            <p className="agent-modal-todo-empty">当前会话还没有待办事项</p>
          ) : (
            <>
              <section className="agent-modal-todo-overview" aria-label="待办状态概览">
                <div className="agent-modal-todo-progress-head">
                  <span>状态分布</span>
                  <em>{todoStatusSummary.total} 项</em>
                </div>
                <div className="agent-modal-todo-progress" role="img" aria-label={todoStatusSummary.chartLabel}>
                  {todoStatusSummary.segments
                    .filter((segment) => segment.count > 0)
                    .map((segment) => (
                      <i
                        key={segment.status}
                        className={segment.status}
                        style={{ flexGrow: segment.count }}
                        aria-hidden="true"
                      />
                    ))}
                </div>
                <div className="agent-modal-todo-legend">
                  {todoStatusSummary.segments.map((segment) => (
                    <span key={segment.status} className={segment.status}>
                      <i aria-hidden="true" />
                      <b>{segment.label}</b>
                      <em>{segment.count}</em>
                    </span>
                  ))}
                </div>
              </section>
              <div className="agent-modal-todo-list">
                {todoDockData.tasks.map((task) => (
                  <article key={task.taskId} className={`agent-modal-todo-item ${task.status}`}>
                    <span className="agent-modal-todo-state-marker" aria-hidden="true">
                      {renderTodoStatusIcon(task.status)}
                    </span>
                    <div className="agent-modal-todo-item-copy">
                      <strong>{task.title}</strong>
                      {task.description ? <span>{task.description}</span> : null}
                    </div>
                    <span className="agent-modal-todo-item-status">{todoStatusLabel(task.status)}</span>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </aside>
      ) : activeView === 'chat' ? (
      <aside className="session-info-rail rail">
        <div className="session-info-panel">
          <div className="session-info-card">
            <div className="session-info-copy">
              <p className="session-info-eyebrow">AI Agent</p>
              <strong>{activeSession?.title || 'New chat'}</strong>
            </div>
            <Tag className={`status-pill${isRequesting ? ' live' : ''}`} variant="filled">
              <Badge status={isRequesting ? 'processing' : 'success'} />
              {isRequesting ? 'Streaming' : 'Ready'}
            </Tag>
          </div>

          <div className="session-side-card">
            <p className="session-side-card-title">会话信息</p>
            <dl className="session-meta-list">
              <div>
                <dt>标题</dt>
                <dd>
                  {activeSession && editingSessionId === activeSession.id ? (
                    <span className="session-title-edit-control">
                      <Input
                        size="small"
                        value={editingSessionTitle}
                        autoFocus
                        maxLength={200}
                        disabled={savingSessionId === activeSession.id}
                        aria-label="会话名称"
                        onChange={(event) => setEditingSessionTitle(event.target.value)}
                        onPressEnter={() => void handleSaveSessionTitle(activeSession)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelSessionTitleEdit()
                          }
                        }}
                      />
                      <Button
                        type="text"
                        size="small"
                        className="session-title-edit-action confirm"
                        icon={<CheckOutlined />}
                        disabled={savingSessionId === activeSession.id}
                        aria-label="确认修改会话名称"
                        onClick={() => void handleSaveSessionTitle(activeSession)}
                      />
                      <Button
                        type="text"
                        size="small"
                        className="session-title-edit-action cancel"
                        icon={<CloseOutlined />}
                        disabled={savingSessionId === activeSession.id}
                        aria-label="取消修改会话名称"
                        onClick={cancelSessionTitleEdit}
                      />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="session-title-display"
                      title="双击编辑会话名称"
                      onDoubleClick={() => activeSession && startSessionTitleEdit(activeSession)}
                    >
                      {activeSession?.title || 'New chat'}
                    </button>
                  )}
                </dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{isRequesting ? '生成中' : '就绪'}</dd>
              </div>
              <div>
                <dt>消息数</dt>
                <dd>{messages.length}</dd>
              </div>
            </dl>
          </div>

          <div className="session-side-card session-side-card-muted">
            <TodoDock
              tasks={todoDockData.tasks}
              loading={isRequesting}
            />
          </div>
        </div>
      </aside>
      ) : null}
      </div>

      <Modal
        open={Boolean(pendingDeleteSession)}
        title="删除会话"
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: deletingSessionId === pendingDeleteSessionId }}
        onOk={() => void handleConfirmDeleteSession()}
        onCancel={() => {
          if (!deletingSessionId) {
            setPendingDeleteSessionId('')
          }
        }}
      >
        <p>确定要删除会话“{pendingDeleteSession?.title || 'New chat'}”吗？此操作不可恢复。</p>
      </Modal>

      {embedded ? (
        <Modal
          open={agentSettingsOpen}
          title="工具箱与我的空间"
          footer={null}
          width={1000}
          zIndex={1002}
          getContainer={false}
          className="agent-tools-settings-modal"
          onCancel={() => setAgentSettingsOpen(false)}
        >
          <div className="agent-tools-settings-content">
            <Tabs
              className="agent-tools-settings-tabs"
              activeKey={agentSettingsTab}
              tabPosition="left"
              onChange={setAgentSettingsTab}
              items={[
                {
                  key: 'toolbox',
                  label: (
                    <Tooltip title="工具箱" placement="right">
                      <span className="agent-tools-settings-tab-label" aria-label="工具箱">
                        <ToolOutlined />
                      </span>
                    </Tooltip>
                  ),
                  children: (
                    <div className="agent-tools-settings-tab-panel">
                      <AgentToolboxPanel
                        skills={skillOptions}
                        mcpServers={mcpServerOptions}
                        userId={currentUser?.id}
                        modalZIndex={1100}
                        onSkillsChange={setSkillOptions}
                        onMCPServersChange={setMCPServerOptions}
                      />
                    </div>
                  ),
                },
                {
                  key: 'my-space',
                  label: (
                    <Tooltip title="我的空间" placement="right">
                      <span className="agent-tools-settings-tab-label" aria-label="我的空间">
                        <UserOutlined />
                      </span>
                    </Tooltip>
                  ),
                  children: (
                    <div className="agent-tools-settings-tab-panel">
                      <AgentMySpacePanel />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </Modal>
      ) : null}
    </>
  )

  function getProvider(sessionId: string) {
    if (!providerCache.has(sessionId)) {
      providerCache.set(
        sessionId,
        createAiAgentProvider(
          sessionId,
          () => resolveStreamModelId(autoModelRef.current, selectedModelIdRef.current),
          () => ({}),
        ),
      )
    }
    return providerCache.get(sessionId)!
  }

  function syncBottomState(panel: HTMLElement) {
    const distanceToBottom = panel.scrollHeight - panel.clientHeight - panel.scrollTop
    const nextIsNearBottom = distanceToBottom <= BOTTOM_SCROLL_THRESHOLD
    isNearBottomRef.current = nextIsNearBottom
    setShowScrollToBottom(!nextIsNearBottom && messages.length > 0)
  }

  function clearSessionClientCache(sessionId: string) {
    providerCache.delete(sessionId)
    releaseChatStore(sessionId)
  }
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error('未知错误')
}

function scopeMessagesToSession(messages: PersistedMessage[], sessionId: string) {
  return messages.filter((message) => !message.sessionId || message.sessionId === sessionId)
}

function formatSessionUpdatedAt(timestamp: number): string {
  if (!timestamp) {
    return '暂无消息'
  }
  const seconds = timestamp / 1_000_000
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) {
    return '暂无消息'
  }
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildTodoDockData(messages: ChatMessage[]) {
  const tasksById = new Map<string, TodoTask>()
  const taskIdByToolId = new Map<string, string>()
  let order = 0

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue
    }

    // A TaskCreate in a new assistant message starts a fresh todo list.
    // Clear the previous list once, while keeping all TaskCreate parts in
    // this message so a multi-task plan is accumulated correctly.
    const startsNewTodoList = message.parts.some(
      (part) => part.type === 'tool' && part.toolName === 'TaskCreate',
    )
    if (startsNewTodoList) {
      tasksById.clear()
      taskIdByToolId.clear()
      order = 0
    }

    for (const part of message.parts) {
      if (part.type !== 'tool' || !isTaskTool(part.toolName)) {
        continue
      }

      order += 1
      applyTodoToolPart(part, order, tasksById, taskIdByToolId)
    }
  }

  return {
    tasks: Array.from(tasksById.values())
      .sort((left, right) => {
        if (left.status === 'in_progress' && right.status !== 'in_progress') {
          return -1
        }
        if (left.status !== 'in_progress' && right.status === 'in_progress') {
          return 1
        }
        return left.order - right.order
      }),
  }
}

function buildTodoStatusSummary(tasks: TodoTask[]) {
  const counts: Record<TodoTask['status'], number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
  }

  tasks.forEach((task) => {
    counts[task.status] += 1
  })

  const segments = [
    { status: 'completed' as const, label: '已完成', count: counts.completed },
    { status: 'in_progress' as const, label: '进行中', count: counts.in_progress },
    { status: 'pending' as const, label: '待处理', count: counts.pending },
    { status: 'failed' as const, label: '失败', count: counts.failed },
  ]

  return {
    total: tasks.length,
    completed: counts.completed,
    segments,
    chartLabel: segments.map((segment) => `${segment.label} ${segment.count} 项`).join('，'),
  }
}

function todoStatusLabel(status: TodoTask['status']) {
  if (status === 'completed') {
    return '已完成'
  }
  if (status === 'in_progress') {
    return '进行中'
  }
  if (status === 'failed') {
    return '失败'
  }
  return '待处理'
}

function renderTodoStatusIcon(status: TodoTask['status']) {
  if (status === 'completed') {
    return <CheckCircleFilled />
  }
  if (status === 'in_progress') {
    return <SyncOutlined spin />
  }
  if (status === 'failed') {
    return <CloseCircleOutlined />
  }
  return <ClockCircleOutlined />
}

function applyTodoToolPart(
  part: Extract<ChatMessage['parts'][number], { type: 'tool' }>,
  order: number,
  tasksById: Map<string, TodoTask>,
  taskIdByToolId: Map<string, string>,
) {
  const input = safeParseObject(part.input || '')
  const resultText = String(part.result || '')

  if (part.toolName === 'TaskCreate') {
    const taskId = firstNonEmpty(extractTaskIdFromResult(resultText), stringValue(input.taskId), part.toolId)
    const mappedTaskId = taskIdByToolId.get(part.toolId) || taskId
    const task = tasksById.get(mappedTaskId) || {
      taskId,
      title: firstNonEmpty(stringValue(input.subject), stringValue(input.activeForm), '未命名任务'),
      description: stringValue(input.description),
      status: 'pending' as const,
      order,
    }

    task.taskId = taskId
    task.title = firstNonEmpty(stringValue(input.subject), stringValue(input.activeForm), task.title)
    task.description = stringValue(input.description) || task.description || ''
    task.status = normalizeTodoStatus(task.status)
    task.order = Math.min(task.order, order)

    tasksById.set(mappedTaskId, task)
    taskIdByToolId.set(part.toolId, mappedTaskId)
    return
  }

  if (part.toolName === 'TaskUpdate') {
    const taskId = firstNonEmpty(stringValue(input.taskId), extractTaskIdFromResult(resultText))
    if (!taskId) {
      return
    }

    const task = tasksById.get(taskId) || {
      taskId,
      title: `任务 #${taskId}`,
      description: '',
      status: 'pending' as const,
      order,
    }

    task.status = normalizeTodoStatus(input.status || task.status)
    task.order = Math.min(task.order, order)
    tasksById.set(taskId, task)
    return
  }
}

function safeParseObject(value: string) {
  if (!value.trim()) {
    return {} as Record<string, unknown>
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function extractTaskIdFromResult(result: string) {
  const match = result.match(/task\s*#(\d+)/i)
  return match ? match[1] : ''
}

function normalizeTodoStatus(status: unknown): TodoTask['status'] {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') {
    return 'completed'
  }
  if (normalized === 'failed' || normalized === 'error') {
    return 'failed'
  }
  if (normalized === 'in_progress' || normalized === 'running') {
    return 'in_progress'
  }
  return 'pending'
}

function isTaskTool(toolName?: string) {
  return typeof toolName === 'string' && toolName.startsWith('Task')
}

function firstNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    const text = stringValue(value)
    if (text) {
      return text
    }
  }
  return ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function sessionTitleFromContent(content: string) {
  const title = content.trim()
  if (!title) {
    return ''
  }
  const chars = Array.from(title)
  return chars.length <= 28 ? title : `${chars.slice(0, 28).join('')}...`
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }
  return left.every((item, index) => item === right[index])
}
