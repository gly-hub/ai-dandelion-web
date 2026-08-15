import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConsoleTabBar } from '../../components/ConsoleTabBar'
import { ModuleSidebarNav } from '../../components/ModuleSidebarNav'
import { SidebarSearchInput } from '../../components/SidebarSearchInput'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { FuncEditorLayout } from './FuncEditorLayout'
import './FuncEditorLayout.css'
import { PlatformWorkbench } from '../workbench/PlatformWorkbench'
import {
  FUNC_ADMIN_BUTTON,
  FUNC_ADMIN_PAGE,
  FUNC_USE_PAGE,
} from '../../lib/buttonPermissions'
import {
  getFuncAdminNavMenus,
  getFuncUserSidebarNavMenus,
  isFuncAdminPageView,
  pickFuncAdminDefaultViewKey,
  pickFuncUserDefaultViewKey,
  resolveActiveFuncMenuViewKey,
} from '../../lib/funcNavMenus'
import {
  buildFuncAdminPath,
  buildFuncEditorPath,
  buildFuncPublishedPath,
  parseFuncOperationPath,
} from '../../lib/routes'
import {
  buildFuncMenuViewKey,
  collectFuncUseDirectories,
  filterFuncSidebarMenus,
  parseFuncMenuViewKey,
  resolveDirectoryLabel,
} from '../../lib/funcMenus'
import { listSystemMenus } from '../../lib/systemApi'
import { useXChat } from '@ant-design/x-sdk'
import {
  AppstoreOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { App as AntApp, Button, Empty, Form, Input, Modal, Select, Spin, Tabs, Tag } from 'antd'
import { Welcome } from '@ant-design/x'
import {
  commitOperationFunctionDocument,
  createOperationFunction,
  deleteOperationFunction,
  deleteFunctionDataForm,
  ensureOperationFunctionSession,
  applyFunctionCode,
  invokeGeneratedApp,
  invokeFunctionPreview,
  listFunctionDataForms,
  listGeneratedApps,
  listOperationFunctions,
  loadFunctionCodeState,
  loadOperationFunctionDocument,
  materializeOperationFunctionApp,
  mergeOperationFunction,
  reloadGeneratedApps,
  invalidateGeneratedAppModuleCache,
  cleanupGeneratedFunctionMenus,
  listPublicConfigs,
  resolveOperationPreviewApp,
  updateOperationFunction,
} from '../../lib/funcOperationApi'
import { listMessages } from '../../lib/api'
import { MAX_LIVE_CHAT_MESSAGES, releaseChatStore, releaseChatStoresByPrefix } from '../../lib/chatSession'
import {
  createAiAgentProvider,
  createChatMessage,
  normalizePersistedMessage,
  ensureRealtimeConnection,
  subscribeRealtimeEvents,
  type ChatInput,
} from '../../lib/aiAgentProvider'
import {
  listAgentModelOptions,
} from '../../lib/agentModelApi'
import { listAgentSessionConfigs } from '../../lib/systemApi'
import type {
  AgentModelOption,
  AgentSessionConfig,
  AgentSessionConfigType,
  ChatMessage,
  FunctionDocument,
  FunctionCodeState,
  FunctionDataForm,
  GeneratedApp,
  OperationFunction,
  PublicConfig,
  StreamChunk,
  SystemMenu,
} from '../../types'
import { MENU_MODULE_FUNC_OPERATION } from '../../types'
import { FunctionDocumentViewer } from './FunctionDocumentViewer'
import { AgentConfigManagementWorkspace } from '../system/AgentConfigManagementWorkspace'
import { AgentModelManagementWorkspace } from '../system/AgentModelManagementWorkspace'
import { AgentSessionConfigManagementWorkspace } from '../system/AgentSessionConfigManagementWorkspace'
import { MenuManagementWorkspace } from '../system/MenuManagementWorkspace'
import { OperationLogWorkspace } from '../system/OperationLogWorkspace'
import { NotificationManagementWorkspace } from '../system/NotificationManagementWorkspace'
import { RoleManagementWorkspace } from '../system/RoleManagementWorkspace'
import { UserManagementWorkspace } from '../system/UserManagementWorkspace'
import type { ConversationNotice } from './FunctionGenerationConsole'
import { GeneratedAppPreviewCanvas } from './GeneratedAppPreviewCanvas'
import type { PreviewErrorState } from './GeneratedAppPreviewCanvas'
import { PublicConfigManagementWorkspace } from './PublicConfigManagementWorkspace'
import { ExternalAPIManagementWorkspace } from './ExternalAPIManagementWorkspace'
import { UploadKeyManagementWorkspace } from './UploadKeyManagementWorkspace'
import {
  canGenerateProductDoc,
  canGenerateTechnicalDoc,
  canShowAdoptDraftButton,
  getNextActionLabel,
  hasGenerationConversationStarted,
  hasGeneratedPage,
  resolveFunctionReadiness,
  resolveStepPrimaryAction,
  shouldShowRefreshAndPreview,
} from './functionReadiness'
import type { FunctionNextAction } from '../../types'
import {
  buildDocumentFailedTag,
  buildDocumentReadyTag,
  buildGeneratedAppFailedTag,
  buildGeneratedAppReadyTag,
  extractConversationFailureMessage,
  extractDocumentFailedTag,
  extractDocumentReadyTag,
  extractGeneratedAppFailedFunctionId,
  extractGeneratedAppReadyFunctionId,
  conversationTurnHasOutcomeTag,
  findLatestTurnAssistantMessage,
} from './funcOperationTags'

type ViewMode = 'published' | 'admin'
type AdminPage = 'functions' | 'editor'
type EditorConversation = 'product' | 'technical' | 'generation'
type EditorStep = 'product' | 'technical' | 'code' | 'preview'
type DocSourceTab = 'applied' | 'draft'
type PlanningDocType = 'product' | 'technical'

const systemAdminViewComponents: Record<string, () => ReactNode> = {
  'public-configs': () => <PublicConfigManagementWorkspace />,
  'external-api-clients': () => <ExternalAPIManagementWorkspace />,
  'upload-keys': () => <UploadKeyManagementWorkspace />,
  users: () => <UserManagementWorkspace />,
  menus: () => <MenuManagementWorkspace />,
  roles: () => <RoleManagementWorkspace />,
  'operation-logs': () => <OperationLogWorkspace />,
  notifications: () => <NotificationManagementWorkspace />,
  'system.notifications': () => <NotificationManagementWorkspace />,
  'agent-config': () => <AgentConfigManagementWorkspace />,
  'agent-session-configs': () => <AgentSessionConfigManagementWorkspace />,
  'agent-models': () => <AgentModelManagementWorkspace />,
}

const EDITOR_STEPS = [
  { id: 'product' as const, label: '产品方案', hint: '明确目标与页面范围' },
  { id: 'technical' as const, label: '技术方案', hint: '对齐数据模型与接口' },
  { id: 'code' as const, label: '页面生成', hint: '让 AI 生成可操作页面' },
  { id: 'preview' as const, label: '预览确认', hint: '检查页面是否能完成业务动作' },
]

const FUNCTION_STATUS = {
  draft: 'draft',
  published: 'published',
} as const

const FUNCTION_WORKFLOW_STAGE = {
  productDoc: 'product_doc',
  technicalDoc: 'technical_doc',
  codeGeneration: 'code_generation',
  codeGenerated: 'code_generated',
} as const

const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  failed: '失败',
}

const workflowStageLabels: Record<string, string> = {
  [FUNCTION_WORKFLOW_STAGE.productDoc]: '待完善产品方案',
  [FUNCTION_WORKFLOW_STAGE.technicalDoc]: '待完善技术方案',
  [FUNCTION_WORKFLOW_STAGE.codeGeneration]: '待生成页面',
  [FUNCTION_WORKFLOW_STAGE.codeGenerated]: '页面已就绪',
}

interface WorkspaceConversationNotice extends ConversationNotice {
  conversation: EditorConversation
}

interface PendingConversationSend {
  functionId: string
  conversation: EditorConversation
  sessionId: string
  content: string
  token: number
}

export function FuncOperationWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const { modal } = AntApp.useApp()
  const route = parseFuncOperationPath(location.pathname)
  const { loading: navLoading, refresh: refreshNavMenus, navTree, hasPageButton, getModuleNav } = useNavMenus()
  const funcNavMenus = getModuleNav('func-operation')
  const userSidebarNavMenus = useMemo(() => getFuncUserSidebarNavMenus(funcNavMenus), [funcNavMenus])
  const adminNavMenus = useMemo(() => getFuncAdminNavMenus(funcNavMenus), [funcNavMenus])
  const canAccessAdminHome = adminNavMenus.length > 0
  const canAdminCreate = hasPageButton('func-operation', FUNC_ADMIN_PAGE, FUNC_ADMIN_BUTTON.create)
  const canAdminEdit = hasPageButton('func-operation', FUNC_ADMIN_PAGE, FUNC_ADMIN_BUTTON.edit)
  const canAdminPublish = hasPageButton('func-operation', FUNC_ADMIN_PAGE, FUNC_ADMIN_BUTTON.publish)
  const canAdminUnpublish = hasPageButton('func-operation', FUNC_ADMIN_PAGE, FUNC_ADMIN_BUTTON.unpublish)
  const canAdminDelete = hasPageButton('func-operation', FUNC_ADMIN_PAGE, FUNC_ADMIN_BUTTON.delete)
  const [activeUserNavViewKey, setActiveUserNavViewKey] = useState(FUNC_USE_PAGE)
  const [activeAdminNavViewKey, setActiveAdminNavViewKey] = useState(FUNC_ADMIN_PAGE)
  const resolvedAdminNavViewKey = route.mode === 'admin' && !route.isEditor && route.adminViewKey
    ? route.adminViewKey
    : activeAdminNavViewKey
  const [viewMode, setViewMode] = useState<ViewMode>('published')
  const resolvedViewMode: ViewMode = route.mode === 'admin'
    ? 'admin'
    : route.mode === 'published'
      ? 'published'
      : viewMode
  const [adminPage, setAdminPage] = useState<AdminPage>('functions')
  const [functions, setFunctions] = useState<OperationFunction[]>([])
  const [generatedApps, setGeneratedApps] = useState<GeneratedApp[]>([])
  const [publicConfigCatalog, setPublicConfigCatalog] = useState<PublicConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [allFuncMenus, setAllFuncMenus] = useState<SystemMenu[]>([])
  const [directoryMenusLoading, setDirectoryMenusLoading] = useState(false)
  const directoryMenus = useMemo(() => collectFuncUseDirectories(allFuncMenus), [allFuncMenus])
  const [deletingId, setDeletingId] = useState('')
  const [activeAdminId, setActiveAdminId] = useState('')
  const [editorConversation, setEditorConversation] = useState<EditorConversation>('product')
  const [editorStep, setEditorStep] = useState<EditorStep>('product')
  const isEditorRoute = route.isEditor && Boolean(route.functionId)
  const resolvedAdminId = (isEditorRoute && route.functionId) ? route.functionId : activeAdminId
  const resolvedEditorStep: EditorStep = (isEditorRoute && route.step) ? route.step : editorStep
  const resolvedEditorConversation: EditorConversation = conversationFromEditorStep(resolvedEditorStep)
  const [docSourceTab, setDocSourceTab] = useState<DocSourceTab>('applied')
  const [draftDocuments, setDraftDocuments] = useState<Partial<Record<PlanningDocType, FunctionDocument>>>({})
  const [draftLoadingKey, setDraftLoadingKey] = useState('')
  const [codeState, setCodeState] = useState<FunctionCodeState | null>(null)
  const [codeStateLoading, setCodeStateLoading] = useState(false)
  const [dataForms, setDataForms] = useState<FunctionDataForm[]>([])
  const [dataFormsLoading, setDataFormsLoading] = useState(false)
  const [deletingDataFormName, setDeletingDataFormName] = useState('')
  const [openedGenerationIds, setOpenedGenerationIds] = useState<string[]>([])
  const [statusUpdatingId, setStatusUpdatingId] = useState('')
  const [cleanupMenusLoading, setCleanupMenusLoading] = useState(false)
  const [adminKeyword, setAdminKeyword] = useState('')
  const [savingFunctionId, setSavingFunctionId] = useState('')
  const [previewPreparingId, setPreviewPreparingId] = useState('')
  const [conversationSendTick, setConversationSendTick] = useState(0)
  const [previewError, setPreviewError] = useState<PreviewErrorState | null>(null)
  const [previewReloadToken, setPreviewReloadToken] = useState(0)
  const [generationPreviewReadyIds, setGenerationPreviewReadyIds] = useState<string[]>([])
  const [generationLaunchingIds, setGenerationLaunchingIds] = useState<string[]>([])
  const [conversationOutboundPending, setConversationOutboundPending] = useState(false)
  const [conversationNotice, setConversationNotice] = useState<WorkspaceConversationNotice | null>(null)
  const [editorSessionNonce, setEditorSessionNonce] = useState(0)
  const [modelOptions, setModelOptions] = useState<AgentModelOption[]>([])
  const [sessionConfigs, setSessionConfigs] = useState<AgentSessionConfig[]>([])
  const sessionConfigsRef = useRef<AgentSessionConfig[]>([])
  const [form] = Form.useForm<{ name: string; description: string; menuParentId?: string }>()
  const handledReadyTagsRef = useRef<Set<string>>(new Set())
  const handledDocumentReadyTagsRef = useRef<Set<string>>(new Set())
  const handledDocumentFailedTagsRef = useRef<Set<string>>(new Set())
  const handledGeneratedAppFailedTagsRef = useRef<Set<string>>(new Set())
  const handledContinuePromptsRef = useRef<Set<string>>(new Set())
  const handledReleaseEventsRef = useRef<Set<string>>(new Set())
  const loadedDraftKeyRef = useRef('')
  const loadedCodeStateKeyRef = useRef('')
  const loadedDataFormsKeyRef = useRef('')
  const dataFormsRequestSequenceRef = useRef(0)
  const pendingConversationSendRef = useRef<PendingConversationSend | null>(null)
  const conversationSendTokenRef = useRef(0)
  const flushedConversationSendTokenRef = useRef(0)
  const chatDispatchInFlightRef = useRef(false)
  const startGenerationInFlightRef = useRef(false)
  const previewPreparingRef = useRef(false)
  const onRequestRef = useRef<(params: ChatInput) => void>(() => {})
  const draftDocumentsRef = useRef<Partial<Record<PlanningDocType, FunctionDocument>>>({})
  draftDocumentsRef.current = draftDocuments

  useEffect(() => {
    sessionConfigsRef.current = sessionConfigs
  }, [sessionConfigs])

  useEffect(() => {
    void Promise.all([listAgentModelOptions(), listAgentSessionConfigs()])
      .then(([items, configs]) => {
        setModelOptions(items)
        setSessionConfigs(fillSessionConfigModelFallback(configs, items))
      })
      .catch(() => {
        setModelOptions([])
        setSessionConfigs([])
      })
  }, [])

  const publishedFunctions = useMemo(
    () => functions.filter((item) => item.status === FUNCTION_STATUS.published && item.generatedAppId),
    [functions],
  )
  const filteredUserSidebarNavMenus = useMemo(
    () => filterFuncSidebarMenus(userSidebarNavMenus, adminKeyword),
    [adminKeyword, userSidebarNavMenus],
  )
  const filteredAdminFunctions = useMemo(() => {
    const keyword = adminKeyword.trim().toLowerCase()
    if (!keyword) {
      return functions
    }
    return functions.filter((item) =>
      [item.name, item.description, item.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword)),
    )
  }, [adminKeyword, functions])
  const activePublishedFunction = useMemo(() => {
    const functionId = parseFuncMenuViewKey(activeUserNavViewKey)
    if (!functionId) {
      return null
    }
    return (
      publishedFunctions.find((item) => item.id === functionId) ||
      functions.find((item) => item.id === functionId) ||
      null
    )
  }, [activeUserNavViewKey, functions, publishedFunctions])
  const activeAdminFunction = useMemo(() => {
    if (resolvedAdminId) {
      return functions.find((item) => item.id === resolvedAdminId) ?? null
    }
    return functions[0] || null
  }, [resolvedAdminId, functions])

  useEffect(() => {
    // A notification is only relevant while the browser is actually on a
    // specific published function route. The published landing page may have
    // a sidebar selection, but it is not an active function runtime.
    const currentFunctionID = route.functionId || ''
    if (route.mode !== 'published' || !currentFunctionID) {
      return undefined
    }
    void ensureRealtimeConnection().catch(() => undefined)
    return subscribeRealtimeEvents((event) => {
      const isPublished = event.type === 'func-operation.function.version-published'
      const isUnpublished = event.type === 'func-operation.function.unpublished'
      if (!isPublished && !isUnpublished) {
        return
      }
      const eventKey = event.eventId || `${event.type}:${currentFunctionID}:${event.timestamp || 0}`
      if (handledReleaseEventsRef.current.has(eventKey)) {
        return
      }
      const payload = event.payload && typeof event.payload === 'object'
        ? event.payload as { functionId?: unknown; functionName?: unknown; version?: unknown }
        : {}
      if (String(payload.functionId || '').trim() !== currentFunctionID) {
        return
      }
      handledReleaseEventsRef.current.add(eventKey)
      const functionName = String(payload.functionName || '当前功能').trim() || '当前功能'
      const version = Number(payload.version)
      modal.confirm({
        title: isPublished ? '功能已更新' : '功能已下架',
        content: isPublished
          ? `${functionName} 已发布新版本${Number.isFinite(version) && version > 0 ? `（v${version}）` : ''}，请刷新页面后继续使用。`
          : `${functionName} 已下架，请刷新页面后继续使用其他功能。`,
        okText: '刷新页面',
        okCancel: false,
        closable: false,
        maskClosable: false,
        keyboard: false,
        onOk: () => window.location.reload(),
      })
    })
  }, [modal, route.functionId, route.mode])

  const activeSessionId = useMemo(() => {
    if (viewMode !== 'admin' || !activeAdminFunction) {
      return ''
    }
    return getFunctionConversationSessionId(activeAdminFunction, resolvedEditorConversation)
  }, [viewMode, activeAdminFunction, resolvedEditorConversation])
  const activeChatKey = useMemo(() => {
    if (viewMode !== 'admin' || !activeAdminFunction) {
      return ''
    }
    const sessionId = getFunctionConversationSessionId(activeAdminFunction, resolvedEditorConversation)
    return `${activeAdminFunction.id}:${resolvedEditorConversation}:${sessionId || 'pending'}:${editorSessionNonce}`
  }, [
    viewMode,
    activeAdminFunction,
    resolvedEditorConversation,
    editorSessionNonce,
    activeAdminFunction?.productSessionId,
    activeAdminFunction?.technicalSessionId,
    activeAdminFunction?.generationSessionId,
  ])
  const conversationScopeKey = useMemo(() => {
    if (viewMode !== 'admin' || !activeAdminFunction) {
      return ''
    }
    return `${activeAdminFunction.id}:${resolvedEditorConversation}:${editorSessionNonce}`
  }, [viewMode, activeAdminFunction?.id, resolvedEditorConversation, editorSessionNonce])
  const provider = useMemo(
    () =>
      activeSessionId
        ? createAiAgentProvider(activeSessionId, () =>
          resolveFunctionConversationModelId(
            sessionConfigsRef.current,
            resolvedEditorConversation,
            modelOptions,
          ),
          () => resolveFunctionConversationRuntimeConfig(
            sessionConfigsRef.current,
            resolvedEditorConversation,
          ),
        )
        : undefined,
    [activeSessionId, modelOptions, resolvedEditorConversation],
  )

  const {
    messages,
    onRequest,
    isRequesting,
    abort,
    isDefaultMessagesRequesting,
    setMessages,
  } = useXChat<ChatMessage, ChatMessage, ChatInput, StreamChunk>({
    provider,
    conversationKey: activeChatKey,
    defaultMessages: async () => {
      if (!activeSessionId) {
        return []
      }
      const page = await listMessages(activeSessionId, { limit: MAX_LIVE_CHAT_MESSAGES })
      return page.items.slice().reverse().map((item) => ({
        id: item.id,
        status: 'success' as const,
        message: normalizePersistedMessage(item),
      }))
    },
    requestPlaceholder: () => createChatMessage({ role: 'assistant', content: '', parts: [] }),
    requestFallback: (requestParams, { error: requestError, messageInfo }) => {
      if (requestError.name === 'AbortError') {
        return messageInfo?.message || createChatMessage({ role: 'assistant', content: '' })
      }
      return createChatMessage({
        role: 'assistant',
        content: `生成失败：${requestError.message || requestParams.content || '请稍后重试'}`,
      })
    },
  })

  onRequestRef.current = onRequest
  const abortRef = useRef(abort)
  abortRef.current = abort
  const isRequestingRef = useRef(isRequesting)
  isRequestingRef.current = isRequesting

  function safeAbortChatRequest() {
    if (!isRequestingRef.current) {
      return
    }
    try {
      abortRef.current()
    } catch {
      // x-sdk abort() requires an in-flight request with AbortController
    }
  }

  function handleUserNavSelect(viewKey: string) {
    const functionId = parseFuncMenuViewKey(viewKey)
    navigate(functionId ? buildFuncPublishedPath(functionId) : buildFuncPublishedPath())
    setActiveUserNavViewKey(viewKey)
  }

  function openWorkspace() {
    navigate(buildFuncPublishedPath())
    setActiveUserNavViewKey(FUNC_USE_PAGE)
  }

  function handleAdminNavSelect(viewKey: string) {
    setActiveAdminNavViewKey(viewKey)
    navigate(buildFuncAdminPath(viewKey))
  }

  useEffect(() => {
    if (route.mode === 'published') {
      setViewMode('published')
      if (route.functionId) {
        setActiveUserNavViewKey(buildFuncMenuViewKey(route.functionId))
      } else {
        setActiveUserNavViewKey(FUNC_USE_PAGE)
      }
      return
    }
    if (route.mode === 'admin') {
      setViewMode('admin')
      if (route.isEditor && route.functionId) {
        setAdminPage('editor')
        setActiveAdminId(route.functionId)
        if (route.step) {
          setEditorStep(route.step)
          setEditorConversation(conversationFromEditorStep(route.step))
        }
      } else {
        setAdminPage('functions')
        if (route.adminViewKey) {
          setActiveAdminNavViewKey(route.adminViewKey)
        }
      }
    }
  }, [location.pathname, route.adminViewKey, route.functionId, route.isEditor, route.mode, route.step])

  useEffect(() => {
    const chatKey = activeChatKey
    if (!chatKey) {
      return
    }
    return () => {
      safeAbortChatRequest()
      releaseChatStore(chatKey)
    }
  }, [activeChatKey])

  useEffect(() => {
    if (isRequesting || messages.length <= MAX_LIVE_CHAT_MESSAGES) {
      return
    }
    setMessages((current) => (
      current.length > MAX_LIVE_CHAT_MESSAGES
        ? current.slice(-MAX_LIVE_CHAT_MESSAGES)
        : current
    ))
  }, [isRequesting, messages.length, setMessages])

  useEffect(() => {
    if (!conversationScopeKey) {
      setMessages([])
    }
    flushedConversationSendTokenRef.current = 0
    handledReadyTagsRef.current.clear()
    handledDocumentReadyTagsRef.current.clear()
    handledDocumentFailedTagsRef.current.clear()
    handledGeneratedAppFailedTagsRef.current.clear()
    handledContinuePromptsRef.current.clear()
    setConversationOutboundPending(false)
    setGenerationLaunchingIds([])
    setConversationNotice(null)
  }, [conversationScopeKey, setMessages])

  useEffect(() => {
    if (!isRequesting) {
      chatDispatchInFlightRef.current = false
    }
  }, [isRequesting])

  useEffect(() => {
    const pending = pendingConversationSendRef.current
    if (!pending || !activeAdminFunction) {
      return
    }
    if (pending.functionId !== activeAdminFunction.id) {
      return
    }
    if (pending.conversation !== editorConversation) {
      return
    }
    if (!activeSessionId || pending.sessionId !== activeSessionId) {
      return
    }
    if (isDefaultMessagesRequesting) {
      return
    }
    if (chatDispatchInFlightRef.current) {
      return
    }
    if (flushedConversationSendTokenRef.current === pending.token) {
      pendingConversationSendRef.current = null
      return
    }

    const content = pending.content
    flushedConversationSendTokenRef.current = pending.token
    pendingConversationSendRef.current = null
    chatDispatchInFlightRef.current = true
    onRequestRef.current({ content })
  }, [
    activeSessionId,
    activeAdminFunction?.id,
    editorConversation,
    isDefaultMessagesRequesting,
    conversationSendTick,
  ])

  async function reloadFunctions() {
    setLoading(true)
    setError('')
    try {
      const items = await listOperationFunctions()
      setFunctions(items)
      try {
        setPublicConfigCatalog(await listPublicConfigs())
      } catch {
        setPublicConfigCatalog([])
      }
      setActiveAdminId((current) => {
        if (route.functionId && items.some((item) => item.id === route.functionId)) {
          return route.functionId
        }
        return keepOrFirst(current, items)
      })
      return items
    } catch (err) {
      setFunctions([])
      setActiveAdminId('')
      setError(asError(err).message)
      return []
    } finally {
      setLoading(false)
    }
  }

  function resetEditorSessionCache(functionId?: string) {
    if (functionId) {
      releaseChatStoresByPrefix(`${functionId}:`)
    }
    setDraftDocuments({})
    setCodeState(null)
    setDraftLoadingKey('')
    setDocSourceTab('applied')
    pendingConversationSendRef.current = null
    conversationSendTokenRef.current = 0
    flushedConversationSendTokenRef.current = 0
    chatDispatchInFlightRef.current = false
    startGenerationInFlightRef.current = false
    setPreviewError(null)
    loadedDraftKeyRef.current = ''
    loadedCodeStateKeyRef.current = ''
    handledReadyTagsRef.current.clear()
    handledDocumentReadyTagsRef.current.clear()
  }

  function leaveEditor() {
    resetEditorSessionCache(activeAdminId)
    navigate(buildFuncAdminPath())
    void reloadFunctions()
  }

  function exitToPublished() {
    resetEditorSessionCache(activeAdminId)
    navigate(buildFuncPublishedPath())
    setActiveUserNavViewKey(pickFuncUserDefaultViewKey(funcNavMenus))
    void reloadFunctions()
    void loadGeneratedApps()
  }

  async function loadGeneratedApps(options?: { reload?: boolean }) {
    try {
      setGeneratedApps(options?.reload ? await reloadGeneratedApps() : await listGeneratedApps())
    } catch {
      setGeneratedApps([])
    }
  }

  async function handleOpenCreateModal() {
    setCreateOpen(true)
    setDirectoryMenusLoading(true)
    setError('')
    try {
      setAllFuncMenus(await listSystemMenus({ module: MENU_MODULE_FUNC_OPERATION, tree: true }))
    } catch (err) {
      setError(`刷新功能目录失败：${asError(err).message}`)
    } finally {
      setDirectoryMenusLoading(false)
    }
  }

  async function handleCreate() {
    const values = await form.validateFields()
    setCreating(true)
    setError('')
    try {
      const next = await createOperationFunction({
        name: String(values.name ?? '').trim(),
        description: String(values.description ?? '').trim(),
        menuParentId: String(values.menuParentId ?? '').trim(),
      })
      setFunctions((current) => [next, ...current])
      resetEditorSessionCache(activeAdminId)
      setEditorSessionNonce((current) => current + 1)
      setActiveAdminId(next.id)
      setEditorConversation('product')
      setEditorStep('product')
      navigate(buildFuncEditorPath(next.id, 'product'))
      setCreateOpen(false)
      form.resetFields()
      await ensureFunctionConversation(next, 'product')
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setCreating(false)
    }
  }

  async function saveFunctionPatch(functionItem: OperationFunction, patch: Partial<OperationFunction>) {
    setSavingFunctionId(functionItem.id)
    setError('')
    try {
      const updated = await updateOperationFunction(functionItem.id, {
        name: patch.name ?? functionItem.name,
        description: patch.description ?? functionItem.description,
        status: patch.status ?? functionItem.status,
        workflowStage: patch.workflowStage ?? functionItem.workflowStage,
        productDoc: patch.productDoc ?? functionItem.productDoc,
        technicalDoc: patch.technicalDoc ?? functionItem.technicalDoc,
        entry: patch.entry ?? functionItem.entry,
        generatedAppId: patch.generatedAppId ?? functionItem.generatedAppId,
        menuParentId: patch.menuParentId ?? functionItem.menuParentId,
      })
      setFunctions((current) => upsertFunctionItem(current, updated))
      if (updated.status === FUNCTION_STATUS.published) {
        await refreshNavMenus()
      }
      return updated
    } catch (err) {
      setError(asError(err).message)
      return null
    } finally {
      setSavingFunctionId('')
    }
  }

  async function handleGeneratePage(id: string) {
    setError('')
    try {
      const result = await materializeOperationFunctionApp(id)
      setFunctions((current) => upsertFunctionItem(current, result.function))
      setGeneratedApps((current) => upsertApp(current, result.app))
      setActiveAdminId(result.function.id)
      return result
    } catch (err) {
      setError(asError(err).message)
      return null
    }
  }

  function beginPageGenerationUI(functionItem: OperationFunction) {
    setGenerationLaunchingIds((current) => (
      current.includes(functionItem.id) ? current : [...current, functionItem.id]
    ))
    setOpenedGenerationIds((current) => (
      current.includes(functionItem.id) ? current : [...current, functionItem.id]
    ))
    navigate(buildFuncEditorPath(functionItem.id, 'code'))
    setEditorStep('code')
    setEditorConversation('generation')
    setConversationOutboundPending(true)
    setFunctions((current) => current.map((item) => (
      item.id === functionItem.id
        ? { ...item, workflowStage: FUNCTION_WORKFLOW_STAGE.codeGeneration }
        : item
    )))
    setConversationNotice({
      conversation: 'generation',
      type: 'info',
      message: '正在启动页面生成，请稍候…',
    })
  }

  async function handleStartGenerateFunction(functionItem: OperationFunction) {
    if (startGenerationInFlightRef.current || generationLaunchingIds.includes(functionItem.id)) {
      return
    }
    if (!functionItem.productDoc.trim()) {
      setError('请先生成并确认产品文档。')
      return
    }
    if (!functionItem.technicalDoc.trim()) {
      setError('请先生成并确认研发文档。')
      return
    }
    if (functionItem.technicalStale) {
      setError('研发文档与产品文档不同步，请重新生成并应用研发文档。')
      return
    }

    startGenerationInFlightRef.current = true
    beginPageGenerationUI(functionItem)
    try {
      const staged = await saveFunctionPatch(functionItem, {
        workflowStage: FUNCTION_WORKFLOW_STAGE.codeGeneration,
      })
      if (!staged) {
        setGenerationLaunchingIds((current) => current.filter((id) => id !== functionItem.id))
        setConversationOutboundPending(false)
        return
      }

      let targetFunction = staged
      let targetApp = generatedApps.find((item) => item.id === staged.generatedAppId) || null
      if (!targetApp) {
        const materialized = await handleGeneratePage(staged.id)
        if (!materialized?.app) {
          setGenerationLaunchingIds((current) => current.filter((id) => id !== functionItem.id))
          setConversationOutboundPending(false)
          return
        }
        targetFunction = materialized.function
        targetApp = materialized.app
      }

      const queued = await queueConversationRequest(
        targetFunction,
        'generation',
        buildGeneratedAppBuilderPrompt(targetFunction, targetApp, publicConfigCatalog),
        { step: 'code' },
      )
      if (!queued) {
        setGenerationLaunchingIds((current) => current.filter((id) => id !== functionItem.id))
        setConversationOutboundPending(false)
      }
      void refreshCodeState(targetFunction, { silent: true })
    } catch {
      setGenerationLaunchingIds((current) => current.filter((id) => id !== functionItem.id))
      setConversationOutboundPending(false)
    } finally {
      startGenerationInFlightRef.current = false
    }
  }

  async function handleStatusChange(functionItem: OperationFunction, status: string) {
    if (status === FUNCTION_STATUS.published) {
      if (!hasGeneratedPage(functionItem)) {
        setError('请先生成这个功能的页面，再发布到功能列表。')
        return
      }
      if (!functionItem.menuParentId) {
        setError('请先选择功能所属目录，再发布。')
        return
      }
      if (functionItem.technicalStale) {
        setError('技术方案需要同步，请重新生成并采用技术方案后再发布。')
        return
      }
    }
    setStatusUpdatingId(functionItem.id)
    try {
      const updated = await saveFunctionPatch(functionItem, { status })
      if (updated?.status === FUNCTION_STATUS.published) {
        if (updated.generatedAppId) {
          invalidateGeneratedAppModuleCache(updated.generatedAppId)
          await loadGeneratedApps({ reload: true })
        }
        navigate(buildFuncPublishedPath(updated.id))
      }
    } finally {
      setStatusUpdatingId('')
    }
  }

  async function ensureFunctionConversation(
    functionItem: OperationFunction,
    conversation: EditorConversation,
  ): Promise<OperationFunction | null> {
    setError('')
    try {
      const result = await ensureOperationFunctionSession(functionItem.id, conversation)
      setFunctions((current) => upsertFunctionItem(current, result.function))
      return result.function
    } catch (err) {
      setError(asError(err).message)
      return null
    }
  }

  async function queueConversationRequest(
    functionItem: OperationFunction,
    conversation: EditorConversation,
    content: string,
    options?: { step?: EditorStep; workflowStage?: string },
  ): Promise<boolean> {
    if (isRequesting || chatDispatchInFlightRef.current) {
      setError('上一条消息还在处理中，请稍候。')
      return false
    }

    if (options?.step) {
      setEditorStep(options.step)
    }
    setEditorConversation(conversation)
    setConversationOutboundPending(true)

    const ready = await ensureFunctionConversation(functionItem, conversation)
    if (!ready) {
      setConversationOutboundPending(false)
      return false
    }

    let target = ready
    if (options?.workflowStage) {
      const updated = await saveFunctionPatch(ready, { workflowStage: options.workflowStage })
      if (!updated) {
        setConversationOutboundPending(false)
        return false
      }
      target = updated
    }

    const sessionId = getFunctionConversationSessionId(target, conversation)
    if (!sessionId) {
      setError('会话尚未就绪，请稍后重试。')
      setConversationOutboundPending(false)
      return false
    }

    const pending = pendingConversationSendRef.current
    if (
      pending?.functionId === target.id &&
      pending.conversation === conversation &&
      pending.sessionId === sessionId &&
      pending.content === content
    ) {
      return true
    }

    conversationSendTokenRef.current += 1
    setConversationNotice(null)
    pendingConversationSendRef.current = {
      functionId: target.id,
      conversation,
      sessionId,
      content,
      token: conversationSendTokenRef.current,
    }
    setConversationSendTick((tick) => tick + 1)
    return true
  }

  async function handleContinueConversation(functionItem: OperationFunction) {
    if (!functionItem || isRequesting || conversationOutboundPending || chatDispatchInFlightRef.current) {
      return
    }
    setConversationNotice(null)
    await queueConversationRequest(functionItem, editorConversation, '继续')
  }

  async function handleGenerateProductDoc(functionItem: OperationFunction) {
    await queueConversationRequest(functionItem, 'product', buildProductDocPrompt(functionItem, publicConfigCatalog), {
      step: 'product',
      workflowStage: FUNCTION_WORKFLOW_STAGE.productDoc,
    })
  }

  async function handleGenerateTechnicalDoc(functionItem: OperationFunction) {
    if (!functionItem.productDoc.trim()) {
      setError('请先补充或确认产品文档，再生成研发文档。')
      return
    }
    await queueConversationRequest(functionItem, 'technical', buildTechnicalDocPrompt(functionItem, publicConfigCatalog), {
      step: 'technical',
      workflowStage: FUNCTION_WORKFLOW_STAGE.technicalDoc,
    })
  }

  function patchFunctionDraftMeta(functionId: string, docType: PlanningDocType, document: FunctionDocument) {
    if (!document.exists) {
      return
    }
    setFunctions((current) => current.map((item) => {
      if (item.id !== functionId) {
        return item
      }
      if (docType === 'product') {
        const appliedContent = item.productDoc.trim()
        const contentDiffers = document.content.trim() !== appliedContent
        const draftVersion = contentDiffers
          ? Math.max(document.version, item.productDocVersion + 1)
          : (document.version || item.productDraftVersion)
        return {
          ...item,
          productDraftVersion: Math.max(draftVersion, item.productDraftVersion),
          productDraftReady: draftVersion > item.productDocVersion,
        }
      }
      const appliedContent = item.technicalDoc.trim()
      const contentDiffers = document.content.trim() !== appliedContent
      const draftVersion = contentDiffers
        ? Math.max(document.version, item.technicalDocVersion + 1)
        : (document.version || item.technicalDraftVersion)
      return {
        ...item,
        technicalDraftVersion: Math.max(draftVersion, item.technicalDraftVersion),
        technicalDraftReady: draftVersion > item.technicalDocVersion,
      }
    }))
  }

  async function refreshDraftDocument(
    functionItem: OperationFunction,
    docType: PlanningDocType,
    options?: { switchToDraft?: boolean; silent?: boolean; force?: boolean },
  ) {
    if (!options?.force) {
      const cached = draftDocumentsRef.current[docType]
      if (cached?.exists) {
        if (options?.switchToDraft) {
          setDocSourceTab('draft')
        }
        return cached
      }
    }

    const loadingKey = `${functionItem.id}:${docType}`
    setDraftLoadingKey(loadingKey)
    setError('')
    try {
      const document = await loadOperationFunctionDocument(functionItem.id, {
        docType,
        source: 'draft',
      })
      const appliedContent = docType === 'product' ? functionItem.productDoc : functionItem.technicalDoc
      const appliedVersion = docType === 'product' ? functionItem.productDocVersion : functionItem.technicalDocVersion
      const contentDiffers = document.exists && document.content.trim() !== appliedContent.trim()
      const resolvedDocument = contentDiffers
        ? {
            ...document,
            version: Math.max(document.version, appliedVersion + 1),
          }
        : document
      setDraftDocuments((current) => ({ ...current, [docType]: resolvedDocument }))
      patchFunctionDraftMeta(functionItem.id, docType, resolvedDocument)
      if (!document.exists && !options?.silent) {
        setError('最新生成版本还不存在，请等待 AI 完成文档写入。')
      }
      if (options?.switchToDraft && document.exists) {
        setDocSourceTab('draft')
      }
      return document
    } catch (err) {
      if (!options?.silent) {
        setError(asError(err).message)
      }
      return null
    } finally {
      setDraftLoadingKey('')
    }
  }

  async function handleApplyDraftDocument(functionItem: OperationFunction, docType: PlanningDocType) {
    const draft = draftDocuments[docType]
    if (!draft?.exists || !draft.content.trim()) {
      setError('没有可应用的最新生成版本。')
      return
    }
    await handleCommitDocument(functionItem, docType)
    setDraftDocuments((current) => {
      const next = { ...current }
      delete next[docType]
      return next
    })
    loadedDraftKeyRef.current = ''
    setDocSourceTab('applied')
  }


  async function refreshDataForms(functionItem: OperationFunction, options?: { silent?: boolean; force?: boolean }) {
    const appKey = `${functionItem.id}:${functionItem.generatedAppId}:${functionItem.codeVersion}`
    if (!options?.force && loadedDataFormsKeyRef.current === appKey) {
      return dataForms
    }
    const requestSequence = ++dataFormsRequestSequenceRef.current
    loadedDataFormsKeyRef.current = appKey
    setDataForms([])
    setDataFormsLoading(true)
    if (!options?.silent) {
      setError('')
    }
    try {
      const forms = await listFunctionDataForms(functionItem.id)
      if (requestSequence !== dataFormsRequestSequenceRef.current) {
        return []
      }
      setDataForms(forms)
      return forms
    } catch (err) {
      if (requestSequence === dataFormsRequestSequenceRef.current && !options?.silent) {
        setError(asError(err).message)
      }
      return []
    } finally {
      if (requestSequence === dataFormsRequestSequenceRef.current) {
        setDataFormsLoading(false)
      }
    }
  }

  async function handleDeleteDataForm(functionItem: OperationFunction, form: FunctionDataForm) {
    Modal.confirm({
      title: `删除数据库表单「${form.label || form.name}」？`,
      content: `将同时移除功能配置中的表单定义，并删除数据库中的物理表 ${form.tableName || form.name}。当前数据量 ${form.rowCount} 条，此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        dataFormsRequestSequenceRef.current += 1
        setDeletingDataFormName(form.name)
        setError('')
        try {
          const forms = await deleteFunctionDataForm(functionItem.id, form.name)
          setDataForms(forms)
          loadedDataFormsKeyRef.current = `${functionItem.id}:${functionItem.generatedAppId}:${functionItem.codeVersion}`
          invalidateGeneratedAppModuleCache(functionItem.generatedAppId)
          await loadGeneratedApps({ reload: true })
        } catch (err) {
          setError(asError(err).message)
        } finally {
          setDeletingDataFormName('')
        }
      },
    })
  }

  async function refreshCodeState(functionItem: OperationFunction, options?: { silent?: boolean; force?: boolean }) {
    const cacheKey = `${functionItem.id}:${functionItem.generatedAppId}:${functionItem.codeVersion}`
    if (!options?.force && loadedCodeStateKeyRef.current === cacheKey && codeState) {
      return codeState
    }

    loadedCodeStateKeyRef.current = cacheKey
    setCodeStateLoading(true)
    setError('')
    try {
      const state = await loadFunctionCodeState(functionItem.id)
      setCodeState(state)
      loadedCodeStateKeyRef.current = cacheKey
      return state
    } catch (err) {
      if (!options?.silent) {
        setError(asError(err).message)
      }
      return null
    } finally {
      setCodeStateLoading(false)
    }
  }

  async function applyLatestGeneratedCode(functionItem: OperationFunction, options?: { silent?: boolean }) {
    if (!functionItem.generatedAppId) {
      return null
    }
    setSavingFunctionId(functionItem.id)
    if (!options?.silent) {
      setError('')
    }
    try {
      const result = await applyFunctionCode(functionItem.id)
      setFunctions((current) => upsertFunctionItem(current, result.function))
      setGeneratedApps((current) => upsertApp(current, result.app))
      setCodeState(result.state)
      loadedCodeStateKeyRef.current = `${result.function.id}:${result.function.generatedAppId}:${result.function.codeVersion}`
      return result.function
    } catch (err) {
      if (!options?.silent) {
        setError(asError(err).message)
      }
      return null
    } finally {
      setSavingFunctionId('')
    }
  }

  async function handleCommitDocument(functionItem: OperationFunction, docType: 'product' | 'technical') {
    setSavingFunctionId(functionItem.id)
    setError('')
    try {
      const result = await commitOperationFunctionDocument(functionItem.id, { docType })
      const updated = result.function
      setFunctions((current) => upsertFunctionItem(current, updated))
      if (docType === 'product') {
        setDraftDocuments((current) => {
          const next = { ...current }
          delete next.product
          delete next.technical
          return next
        })
        loadedDraftKeyRef.current = ''
        navigate(buildFuncEditorPath(functionItem.id, 'technical'))
        setEditorStep('technical')
        setEditorConversation('technical')
        setDocSourceTab('applied')
        return
      }

      navigate(buildFuncEditorPath(functionItem.id, 'code'))
      setEditorStep('code')
      setEditorConversation('generation')
      setDocSourceTab('applied')
      setDraftDocuments((current) => {
        const next = { ...current }
        delete next.technical
        return next
      })
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setSavingFunctionId('')
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError('')
    try {
      await deleteOperationFunction(id)
      await refreshNavMenus()
      setFunctions((current) => {
        const next = current.filter((item) => item.id !== id)
        setActiveAdminId((currentId) => keepOrFirst(currentId === id ? '' : currentId, next))
        return next
      })
      if (parseFuncMenuViewKey(activeUserNavViewKey) === id) {
        setActiveUserNavViewKey(pickFuncUserDefaultViewKey(funcNavMenus))
      }
      if (activeAdminId === id) {
        leaveEditor()
      }
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setDeletingId('')
    }
  }

  function openAdminHome() {
    resetEditorSessionCache(activeAdminId)
    setActiveAdminNavViewKey(pickFuncAdminDefaultViewKey(funcNavMenus))
    navigate(buildFuncAdminPath())
    void reloadFunctions()
  }

  async function openEditor(id: string) {
    resetEditorSessionCache(activeAdminId)
    setEditorSessionNonce((current) => current + 1)
    setActiveAdminId(id)
    navigate(buildFuncEditorPath(id))
    setError('')

    try {
      const items = await listOperationFunctions()
      setFunctions(items)
      const target = items.find((item) => item.id === id)
      if (target) {
        const conversation = getDefaultConversation(target)
        const step = editorStepFromConversation(conversation)
        setEditorConversation(conversation)
        setEditorStep(step)
        setActiveAdminId(target.id)
        navigate(buildFuncEditorPath(target.id, step))
        await ensureFunctionConversation(target, conversation)
      }
    } catch (err) {
      setError(asError(err).message)
    }
  }

  function selectEditorStep(functionItem: OperationFunction, stepId: EditorStep) {
    if (stepId === 'technical' && !functionItem.productDoc.trim()) {
      setError('请先完成产品方案。')
      return
    }
    if (stepId === 'code' && (!functionItem.productDoc.trim() || !functionItem.technicalDoc.trim())) {
      setError('请先完成产品方案和技术方案。')
      return
    }
    if (stepId === 'preview' && !isEditorStepAccessible(functionItem, 'preview', openedGenerationIds)) {
      setError('请先生成页面后再预览。')
      return
    }
    navigate(buildFuncEditorPath(functionItem.id, stepId))
    setEditorStep(stepId)
    setEditorConversation(conversationFromEditorStep(stepId))
    setDocSourceTab('applied')
  }

  async function handleReadinessAction(functionItem: OperationFunction, action?: FunctionNextAction | '') {
    const nextAction = action || resolveFunctionReadiness(functionItem).nextAction
    if (!nextAction) {
      return
    }

    switch (nextAction) {
      case 'generate_product_doc':
        navigate(buildFuncEditorPath(functionItem.id, 'product'))
        setEditorStep('product')
        setEditorConversation('product')
        await handleGenerateProductDoc(functionItem)
        return
      case 'adopt_product_doc':
        await handleApplyDraftDocument(functionItem, 'product')
        return
      case 'generate_technical_doc':
        navigate(buildFuncEditorPath(functionItem.id, 'technical'))
        setEditorStep('technical')
        setEditorConversation('technical')
        await handleGenerateTechnicalDoc(functionItem)
        return
      case 'adopt_technical_doc':
        await handleApplyDraftDocument(functionItem, 'technical')
        return
      case 'generate_page':
        navigate(buildFuncEditorPath(functionItem.id, 'code'))
        setEditorStep('code')
        setEditorConversation('generation')
        await handleStartGenerateFunction(functionItem)
        return
      case 'preview_latest_page':
        invalidateGeneratedAppModuleCache(functionItem.generatedAppId)
        setPreviewReloadToken((current) => current + 1)
        setPreviewError(null)
        navigate(buildFuncEditorPath(functionItem.id, 'preview'))
        setEditorStep('preview')
        setEditorConversation('generation')
        return
      case 'refresh_and_preview':
        await handleRefreshAndPreview(functionItem)
        return
      case 'publish_function':
        await handleStatusChange(functionItem, FUNCTION_STATUS.published)
        return
      case 'open_published_function':
        setActiveUserNavViewKey(buildFuncMenuViewKey(functionItem.id))
        exitToPublished()
        return
      default:
        return
    }
  }

  async function handleReloadPreviewApps(appId?: string) {
    if (appId) {
      invalidateGeneratedAppModuleCache(appId)
    } else {
      invalidateGeneratedAppModuleCache()
    }
    setPreviewReloadToken((current) => current + 1)
    setGeneratedApps(await reloadGeneratedApps())
    setPreviewError(null)
  }

  async function handleRefreshAndPreview(functionItem: OperationFunction) {
    if (previewPreparingRef.current) {
      return
    }
    previewPreparingRef.current = true
    setPreviewPreparingId(functionItem.id)
    setError('')
    try {
      setGenerationPreviewReadyIds((current) => current.filter((id) => id !== functionItem.id))
      const previewFunction = functionItem.codeStale
        ? (await applyLatestGeneratedCode(functionItem)) || functionItem
        : functionItem
      invalidateGeneratedAppModuleCache(previewFunction.generatedAppId)
      setPreviewReloadToken((current) => current + 1)
      setPreviewError(null)
      navigate(buildFuncEditorPath(previewFunction.id, 'preview'))
      setEditorStep('preview')
      setEditorConversation('generation')
      void refreshCodeState(previewFunction, { silent: true, force: true })
    } catch (err) {
      setError(asError(err).message)
    } finally {
      previewPreparingRef.current = false
      setPreviewPreparingId('')
    }
  }

  function handleFixPreviewWithAI(functionItem: OperationFunction) {
    navigate(buildFuncEditorPath(functionItem.id, 'code'))
    setEditorConversation('generation')
    setEditorStep('code')
    void ensureFunctionConversation(functionItem, 'generation')
  }

  async function runFunction(appId: string, payload?: unknown) {
    if (!appId) {
      throw new Error('这个功能还没有可运行页面')
    }

    setError('')
    try {
      return await invokeGeneratedApp(appId, payload)
    } catch (err) {
      setError(asError(err).message)
      throw err
    }
  }

  async function handleCleanupOrphanMenus() {
    setCleanupMenusLoading(true)
    setError('')
    try {
      const result = await cleanupGeneratedFunctionMenus()
      await refreshNavMenus()
      setError(result.removedCount > 0 ? `已清理 ${result.removedCount} 个孤儿功能菜单` : '未发现需要清理的孤儿功能菜单')
    } catch (err) {
      setError(asError(err).message)
    } finally {
      setCleanupMenusLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void reloadFunctions()
      void loadGeneratedApps()
      void listSystemMenus({ module: MENU_MODULE_FUNC_OPERATION, tree: true })
        .then(setAllFuncMenus)
        .catch(() => setAllFuncMenus([]))
    })
  }, [])

  useEffect(() => {
    if (viewMode !== 'published' || !activePublishedFunction?.generatedAppId) {
      return
    }
    invalidateGeneratedAppModuleCache(activePublishedFunction.generatedAppId)
  }, [viewMode, activePublishedFunction?.id, activePublishedFunction?.generatedAppId, activePublishedFunction?.codeVersion])

  useEffect(() => {
    if (navLoading || (route.mode === 'published' && !route.functionId)) {
      return
    }
    const nextViewKey = resolveActiveFuncMenuViewKey(activeUserNavViewKey, userSidebarNavMenus)
    if (nextViewKey !== activeUserNavViewKey) {
      setActiveUserNavViewKey(nextViewKey)
    }
  }, [activeUserNavViewKey, navLoading, route.functionId, route.mode, userSidebarNavMenus])

  useEffect(() => {
    if (loading || route.mode !== null) {
      return
    }
    const published = functions.filter((item) => item.status === FUNCTION_STATUS.published && item.generatedAppId)
    if (published.length > 0) {
      const defaultFunctionId = parseFuncMenuViewKey(pickFuncUserDefaultViewKey(funcNavMenus))
      navigate(
        defaultFunctionId ? buildFuncPublishedPath(defaultFunctionId) : buildFuncPublishedPath(),
        { replace: true },
      )
      return
    }
    if (functions.length > 0) {
      const id = keepOrFirst('', functions)
      navigate(buildFuncEditorPath(id), { replace: true })
      return
    }
    navigate(buildFuncAdminPath(), { replace: true })
  }, [funcNavMenus, functions, loading, navigate, route.mode])

  useEffect(() => {
    if (adminPage !== 'editor' || !activeAdminFunction) {
      return
    }
    const sessionId = getFunctionConversationSessionId(activeAdminFunction, editorConversation)
    if (sessionId) {
      return
    }
    void ensureFunctionConversation(activeAdminFunction, editorConversation)
  }, [
    adminPage,
    activeAdminFunction?.id,
    editorConversation,
    activeAdminFunction?.productSessionId,
    activeAdminFunction?.technicalSessionId,
    activeAdminFunction?.generationSessionId,
  ])

  useEffect(() => {
    if (isRequesting) {
      setConversationNotice(null)
      setConversationOutboundPending(false)
      setGenerationLaunchingIds([])
    }
  }, [isRequesting])

  useEffect(() => {
    if (isRequesting || messages.length === 0) {
      return
    }
    const latestAssistant = findLatestTurnAssistantMessage(messages)
    if (!latestAssistant) {
      return
    }
    if (latestAssistant.status === 'loading' || latestAssistant.status === 'updating') {
      return
    }

    if (editorConversation === 'generation') {
      const readyFunctionId = extractGeneratedAppReadyFunctionId(latestAssistant.message.content)
      const readyTagKey = `${latestAssistant.id}:${readyFunctionId}`
      if (readyFunctionId && functions.some((item) => item.id === readyFunctionId) && !handledReadyTagsRef.current.has(readyTagKey)) {
        handledReadyTagsRef.current.add(readyTagKey)
        setGenerationPreviewReadyIds((current) => (
          current.includes(readyFunctionId) ? current : [...current, readyFunctionId]
        ))
        setConversationNotice({
          conversation: 'generation',
          type: 'success',
          message: '页面已生成完成，可点击「刷新并预览」查看最新效果。',
        })
        queueMicrotask(() => {
          const target = functions.find((item) => item.id === readyFunctionId)
          if (!target || target.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGenerated) {
            return
          }
          void (async () => {
            invalidateGeneratedAppModuleCache(target.generatedAppId)
            setPreviewReloadToken((current) => current + 1)
            const updated = await applyLatestGeneratedCode(target, { silent: true })
              || await saveFunctionPatch(target, { workflowStage: FUNCTION_WORKFLOW_STAGE.codeGenerated })
              || target
            await refreshCodeState(updated, { silent: true, force: true })
          })()
        })
        return
      }

      const failedFunctionId = extractGeneratedAppFailedFunctionId(latestAssistant.message.content)
      const failedTagKey = `${latestAssistant.id}:${failedFunctionId}`
      if (
        failedFunctionId &&
        failedFunctionId === activeAdminFunction?.id &&
        !handledGeneratedAppFailedTagsRef.current.has(failedTagKey)
      ) {
        handledGeneratedAppFailedTagsRef.current.add(failedTagKey)
        setConversationNotice({
          conversation: 'generation',
          type: 'error',
          message: extractConversationFailureMessage(
            latestAssistant.message.content,
            '页面生成未完成，请查看下方回复中的阻塞原因。',
          ),
        })
        return
      }

      if (shouldPromptContinueConversation(
        activeAdminFunction,
        'generation',
        latestAssistant.message.content,
        generationPreviewReadyIds,
        openedGenerationIds,
      )) {
        const continueKey = `${latestAssistant.id}:${activeAdminFunction?.id}:generation`
        if (activeAdminFunction?.id && !handledContinuePromptsRef.current.has(continueKey)) {
          handledContinuePromptsRef.current.add(continueKey)
          setConversationNotice({
            conversation: 'generation',
            type: 'warning',
            message: '本轮对话已结束，但页面尚未生成完成。请点击「继续」让 AI 接着完成。',
            actionLabel: '继续',
          })
        }
      }
      return
    }

    const ready = extractDocumentReadyTag(latestAssistant.message.content)
    if (ready && ready.functionId === activeAdminFunction?.id) {
      const conversationMatches = (ready.docType === 'product' && editorConversation === 'product')
        || (ready.docType === 'technical' && editorConversation === 'technical')
      const stepMatches = editorStep === ready.docType
      if (conversationMatches || stepMatches) {
        const tagKey = `${latestAssistant.id}:${ready.functionId}:${ready.docType}`
        if (!handledDocumentReadyTagsRef.current.has(tagKey)) {
          handledDocumentReadyTagsRef.current.add(tagKey)
          loadedDraftKeyRef.current = ''
          setConversationNotice({
            conversation: ready.docType,
            type: 'success',
            message: ready.docType === 'product'
              ? '产品方案已写入 AI 最新版本，请在左侧查看。'
              : '技术方案已写入 AI 最新版本，请在左侧查看。',
          })
          queueMicrotask(() => {
            if (!activeAdminFunction) {
              return
            }
            void (async () => {
              await refreshDraftDocument(activeAdminFunction, ready.docType, { switchToDraft: true, silent: true, force: true })
              await reloadFunctions()
            })()
          })
        }
      }
    }

    const failed = extractDocumentFailedTag(latestAssistant.message.content)
    if (failed && failed.functionId === activeAdminFunction?.id) {
      const conversationMatches = (failed.docType === 'product' && editorConversation === 'product')
        || (failed.docType === 'technical' && editorConversation === 'technical')
      const stepMatches = editorStep === failed.docType
      if (conversationMatches || stepMatches) {
        const tagKey = `${latestAssistant.id}:${failed.functionId}:${failed.docType}`
        if (!handledDocumentFailedTagsRef.current.has(tagKey)) {
          handledDocumentFailedTagsRef.current.add(tagKey)
          setConversationNotice({
            conversation: failed.docType,
            type: 'error',
            message: extractConversationFailureMessage(
              latestAssistant.message.content,
              `文档生成失败：${failed.docType === 'product' ? '产品文档' : '研发文档'}阶段未完成，请查看下方回复中的阻塞原因。`,
            ),
          })
        }
      }
    }

    if (
      (editorConversation === 'product' || editorConversation === 'technical')
      && shouldPromptContinueConversation(
        activeAdminFunction,
        editorConversation,
        latestAssistant.message.content,
        generationPreviewReadyIds,
        openedGenerationIds,
      )
    ) {
      const continueKey = `${latestAssistant.id}:${activeAdminFunction?.id}:${editorConversation}`
      if (activeAdminFunction?.id && !handledContinuePromptsRef.current.has(continueKey)) {
        handledContinuePromptsRef.current.add(continueKey)
        setConversationNotice({
          conversation: editorConversation,
          type: 'warning',
          message: editorConversation === 'product'
            ? '本轮对话已结束，但产品方案尚未写入。请点击「继续」让 AI 接着完成。'
            : '本轮对话已结束，但技术方案尚未写入。请点击「继续」让 AI 接着完成。',
          actionLabel: '继续',
        })
      }
    }
  }, [
    isRequesting,
    messages,
    editorConversation,
    editorStep,
    activeAdminFunction?.id,
    activeAdminFunction?.workflowStage,
    functions,
    generationPreviewReadyIds,
    openedGenerationIds,
  ])

  useEffect(() => {
    if (adminPage !== 'editor' || !activeAdminFunction) {
      return
    }
    if (editorStep !== 'product' && editorStep !== 'technical') {
      return
    }
    const key = `${activeAdminFunction.id}:${editorStep}`
    if (loadedDraftKeyRef.current === key) {
      return
    }
    loadedDraftKeyRef.current = key
    void refreshDraftDocument(activeAdminFunction, editorStep, { silent: true, force: true })
  }, [adminPage, activeAdminFunction?.id, editorStep, activeAdminFunction?.productDraftReady, activeAdminFunction?.technicalDraftReady, activeAdminFunction?.productDraftVersion, activeAdminFunction?.technicalDraftVersion])

  useEffect(() => {
    if (adminPage !== 'editor' || !activeAdminFunction || editorStep !== 'code') {
      return
    }
    const key = `${activeAdminFunction.id}:${activeAdminFunction.generatedAppId}:${activeAdminFunction.codeVersion}`
    if (loadedCodeStateKeyRef.current === key) {
      return
    }
    void refreshCodeState(activeAdminFunction, { silent: true })
    void refreshDataForms(activeAdminFunction, { silent: true })
  }, [adminPage, activeAdminFunction?.id, editorStep, activeAdminFunction?.generatedAppId, activeAdminFunction?.codeVersion])

  const activeConversationNotice = conversationNotice?.conversation === editorConversation
    ? {
      type: conversationNotice.type,
      message: conversationNotice.message,
      actionLabel: conversationNotice.actionLabel === '继续' ? conversationNotice.actionLabel : undefined,
    }
    : null

  function handleConversationRequest(params: { content: string }) {
    setConversationNotice(null)
    onRequest(params)
  }

  function handleNoticeAction() {
    if (!activeAdminFunction || !conversationNotice?.actionLabel) {
      return
    }
    if (conversationNotice.actionLabel === '刷新并预览') {
      void handleRefreshAndPreview(activeAdminFunction)
      return
    }
    void handleContinueConversation(activeAdminFunction)
  }

  return (
    <main className="func-stage func-module-shell">
      {resolvedViewMode === 'admin' ? renderAdmin() : renderPublished()}
      {error ? <p className="error-banner func-error inline-error">{error}</p> : null}
      {renderCreateModal()}
    </main>
  )

  function renderPublished() {
    const hasUserSidebarNav = filteredUserSidebarNavMenus.length > 0
    // The route is authoritative: returning to /published must immediately
    // show the workbench even before the sidebar selection effect completes.
    const showFunctionPreview = Boolean(route.functionId)

    return (
      <div className="func-shell">
        <aside className="func-sidebar rail module-sidebar">
          <div className="sidebar-searchbar">
            <SidebarSearchInput
              value={adminKeyword}
              placeholder="搜索功能目录"
              aria-label="搜索功能"
              onChange={setAdminKeyword}
            />
          </div>

          <div className="func-workspace-nav-entry">
            <Button
              type="text"
              block
              className={`func-workspace-nav-button${!showFunctionPreview ? ' is-active' : ''}`}
              icon={<AppstoreOutlined />}
              onClick={openWorkspace}
            >
              工作台
            </Button>
          </div>

          {hasUserSidebarNav ? (
            <ModuleSidebarNav
              menus={filteredUserSidebarNavMenus}
              activeViewKey={activeUserNavViewKey}
              onSelect={handleUserNavSelect}
              loading={navLoading}
              ariaLabel="功能菜单"
              searchKeyword={adminKeyword}
            />
          ) : (
            <div className="func-sidebar-empty-hint">
              {directoryMenus.length === 0
                ? '请先在菜单管理的「功能使用」下创建目录，并在功能管理中发布功能。'
                : '当前账号暂无可访问的功能，请联系管理员分配权限。'}
            </div>
          )}

          {canAccessAdminHome ? (
            <div className="func-sidebar-footer rail-admin-entry">
              <Button className="admin-entry-button" icon={<SettingOutlined />} size="large" block onClick={openAdminHome}>
                进入管理后台
              </Button>
            </div>
          ) : null}
        </aside>

        <section className="func-page-panel stage">
          <ConsoleTabBar />
          <div className="func-page-body">
          {!showFunctionPreview ? (
            <PlatformWorkbench />
          ) : !activePublishedFunction ? (
            <div className="func-page-empty func-home-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="功能加载中或暂无访问权限" />
            </div>
          ) : (
            renderPreviewPanel(activePublishedFunction)
          )}
          </div>
        </section>
      </div>
    )
  }

  function renderAdmin() {
    const showAdminSidebar = !isEditorRoute

    return (
      <div className={`func-shell func-shell-admin${showAdminSidebar ? '' : ' func-shell-admin-full'}`}>
        {showAdminSidebar ? (
          <aside className="func-sidebar func-admin-sidebar rail admin-rail module-sidebar">
            <ModuleSidebarNav
              menus={adminNavMenus}
              activeViewKey={resolvedAdminNavViewKey}
              onSelect={handleAdminNavSelect}
              loading={navLoading}
              ariaLabel="管理后台菜单"
            />
            <div className="func-sidebar-footer admin-back">
              <Button className="back-button" icon={<LeftOutlined />} size="large" block onClick={exitToPublished}>
                返回工作台
              </Button>
            </div>
          </aside>
        ) : null}

        <section className={`func-page-panel func-builder-panel stage admin-stage${showAdminSidebar ? '' : ' admin-stage-full'}`}>
          <ConsoleTabBar />
          <div className={`func-page-body${isEditorRoute ? ' func-editor-page-body' : ''}`}>
          {isEditorRoute
            ? renderAdminEditor(activeAdminFunction)
            : isFuncAdminPageView(resolvedAdminNavViewKey)
              ? renderAdminListPage()
              : systemAdminViewComponents[resolvedAdminNavViewKey]
                ? systemAdminViewComponents[resolvedAdminNavViewKey]()
                : (
                  <div className="func-page-empty func-home-empty">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`未配置页面：${resolvedAdminNavViewKey}`} />
                  </div>
                )}
          </div>
        </section>
      </div>
    )
  }

  function renderAdminListPage() {
    return (
      <div className="func-admin-list-page">
        <section className="func-admin-query">
          <Input
            value={adminKeyword}
            placeholder="请输入功能名称"
            onChange={(event) => setAdminKeyword(event.target.value)}
            allowClear
          />
          <div className="func-admin-query-actions">
            <Button icon={<ReloadOutlined />} onClick={() => void reloadFunctions()} loading={loading}>
              刷新
            </Button>
            <Button onClick={() => void handleCleanupOrphanMenus()} loading={cleanupMenusLoading}>
              清理孤儿菜单
            </Button>
            <Button onClick={() => setAdminKeyword('')}>清空</Button>
            {canAdminCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleOpenCreateModal()}>
                新增功能
              </Button>
            ) : null}
          </div>
        </section>

        <section className="func-admin-table-card">
          {loading ? (
            <div className="func-empty compact">
              <Spin />
              <strong>正在加载功能</strong>
            </div>
          ) : filteredAdminFunctions.length === 0 ? (
            <div className="func-empty compact">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有功能草稿" />
            </div>
          ) : (
            <table className="func-admin-table">
              <colgroup>
                <col className="func-admin-col-name" />
                <col className="func-admin-col-directory" />
                <col className="func-admin-col-progress" />
                <col className="func-admin-col-status" />
                <col className="func-admin-col-page" />
                <col className="func-admin-col-updated" />
                <col className="func-admin-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>功能名称</th>
                  <th>所属目录</th>
                  <th>当前进度</th>
                  <th>发布状态</th>
                  <th>功能页面</th>
                  <th>最近更新</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdminFunctions.map((item) => (
                  <tr key={item.id}>
                    <td className="func-admin-table-name">
                      <strong className="func-admin-table-function-name" title={item.name}>{item.name}</strong>
                      <span className="func-admin-table-description" title={item.description || '暂无描述'}>
                        {item.description || '暂无描述'}
                      </span>
                    </td>
                    <td className="func-admin-table-directory">
                      <span className="func-admin-table-value" title={resolveDirectoryLabel(allFuncMenus, item.menuParentId)}>
                        {resolveDirectoryLabel(allFuncMenus, item.menuParentId)}
                      </span>
                    </td>
                    <td className="func-admin-table-progress">
                      <Tag variant="filled" className="binding-status" title={resolveFunctionReadiness(item).label}>
                        {resolveFunctionReadiness(item).label || workflowStageLabels[item.workflowStage] || '待完善产品方案'}
                      </Tag>
                    </td>
                    <td className="func-admin-table-status">
                      <Tag variant="filled" className={`function-status ${item.status}`} title={statusLabels[item.status] || item.status}>
                        {statusLabels[item.status] || item.status}
                      </Tag>
                    </td>
                    <td className="func-admin-table-page">
                      <span className={`func-admin-table-page-state${item.generatedAppId ? ' is-ready' : ' is-pending'}`}>
                        {item.generatedAppId ? '已生成' : '待生成'}
                      </span>
                    </td>
                    <td className="func-admin-table-updated">
                      <span className="func-admin-table-value">{formatTime(item.updatedAt)}</span>
                    </td>
                    <td className="func-admin-table-actions">
                      <div className="func-admin-table-action-group">
                        {canAdminEdit ? (
                          <Button type="link" onClick={() => openEditor(item.id)}>
                            编辑
                          </Button>
                        ) : null}
                        {item.status === FUNCTION_STATUS.published ? (
                          canAdminUnpublish ? (
                            <Button
                              type="link"
                              loading={statusUpdatingId === item.id}
                              onClick={() => void handleStatusChange(item, FUNCTION_STATUS.draft)}
                            >
                              下架
                            </Button>
                          ) : null
                        ) : canAdminPublish ? (
                          <Button
                            type="link"
                            loading={statusUpdatingId === item.id}
                            disabled={!item.generatedAppId}
                            onClick={() => void handleStatusChange(item, FUNCTION_STATUS.published)}
                          >
                            发布
                          </Button>
                        ) : null}
                        {canAdminDelete ? (
                          <Button
                            type="link"
                            danger
                            loading={deletingId === item.id}
                            onClick={() => void handleDelete(item.id)}
                          >
                            删除
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    )
  }

  function renderAdminEditor(functionItem: OperationFunction | null) {
    return (
      <FuncEditorLayout
        functionItem={functionItem}
        currentStep={resolvedEditorStep}
        conversation={resolvedEditorConversation}
        directoryMenus={directoryMenus}
        openedGenerationIds={openedGenerationIds}
        messages={messages}
        isRequesting={isRequesting}
        isDefaultMessagesRequesting={isDefaultMessagesRequesting}
        activeSessionId={activeSessionId}
        conversationOutboundPending={conversationOutboundPending}
        conversationNotice={activeConversationNotice}
        generationLaunchingIds={generationLaunchingIds}
        modelOptions={modelOptions}
        selectedModelId={resolveFunctionConversationModelId(sessionConfigs, resolvedEditorConversation, modelOptions) || ''}
        canAdminEdit={canAdminEdit}
        canAdminPublish={canAdminPublish}
        canAdminUnpublish={canAdminUnpublish}
        canAdminDelete={canAdminDelete}
        statusUpdatingId={statusUpdatingId}
        deletingId={deletingId}
        onStepChange={(step) => selectEditorStep(functionItem!, step)}
        onLeaveEditor={leaveEditor}
        onStatusChange={(status) => functionItem && handleStatusChange(functionItem, status)}
        onDelete={() => functionItem && handleDelete(functionItem.id)}
        onSaveMenuParent={(value) => functionItem && saveFunctionPatch(functionItem, { menuParentId: value })}
        onConversationRequest={handleConversationRequest}
        onAbort={abort}
        onNoticeAction={conversationNotice?.actionLabel === '继续' ? handleNoticeAction : undefined}
        renderContent={() => functionItem ? renderPlanningWorkspace(functionItem) : null}
      />
    )
  }

  function renderDocumentPanel(functionItem: OperationFunction, docType: PlanningDocType) {
    const appliedContent = docType === 'product' ? functionItem.productDoc : functionItem.technicalDoc
    const appliedVersion = docType === 'product' ? functionItem.productDocVersion : functionItem.technicalDocVersion
    const draftDocument = draftDocuments[docType]
    const draftReady = docType === 'product' ? functionItem.productDraftReady : functionItem.technicalDraftReady
    const showAdoptButton = canShowAdoptDraftButton(functionItem, docType)
    const staleHint = docType === 'technical' && functionItem.technicalStale
      ? '技术方案基于旧版产品方案，建议重新生成并采用。'
      : ''
    const loading = draftLoadingKey === `${functionItem.id}:${docType}`
    const placeholder = docType === 'product'
      ? '这里沉淀产品目标、用户角色、核心流程、页面范围、边界条件和待确认项。'
      : '这里沉淀模块拆分、数据模型、接口设计、目录结构、Action 清单与前端模块拆分。'
    const appliedPlaceholder = appliedVersion > 0
      ? placeholder
      : '尚未采用任何版本，请在「AI 最新版本」中采用。'
    const draftPlaceholder = 'AI 生成完成后，最新版本会出现在这里。'

    return (
      <div className="func-doc-panel">
        {staleHint ? <p className="func-doc-stale-hint">{staleHint}</p> : null}
        <Tabs
          className="func-doc-tabs"
          activeKey={docSourceTab}
          tabBarExtraContent={
            docSourceTab === 'draft' ? (
              <div className="func-doc-pane-toolbar">
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={loading}
                  onClick={() => void refreshDraftDocument(functionItem, docType, { force: true })}
                >
                  刷新
                </Button>
              </div>
            ) : null
          }
          onChange={(key) => {
            const nextTab = key as DocSourceTab
            setDocSourceTab(nextTab)
            if (nextTab === 'draft') {
              void refreshDraftDocument(functionItem, docType, { silent: true, force: true })
            }
          }}
          items={[
            {
              key: 'applied',
              label: appliedVersion > 0 ? `当前采用版本 v${appliedVersion}` : '当前采用版本',
              children: (
                <div className="func-doc-pane">
                  <FunctionDocumentViewer
                    content={appliedContent}
                    placeholder={appliedPlaceholder}
                  />
                </div>
              ),
            },
            {
              key: 'draft',
              label: (
                <span className="func-doc-tab-label">
                  AI 最新版本
                  {draftReady ? <Tag className="func-doc-tab-tag">新</Tag> : null}
                  {draftDocument?.version ? ` v${draftDocument.version}` : ''}
                </span>
              ),
              children: (
                <div className="func-doc-pane">
                  {loading && !draftDocument?.exists ? (
                    <div className="func-empty compact">
                      <Spin size="small" />
                      <strong>正在加载最新生成版本</strong>
                    </div>
                  ) : (
                    <FunctionDocumentViewer
                      content={draftDocument?.exists ? draftDocument.content : ''}
                      placeholder={draftPlaceholder}
                    />
                  )}
                  {!draftDocument?.exists || !draftDocument.content.trim() ? (
                    <p className="func-doc-draft-hint">AI 写入完成后会自动切换到此 Tab，确认无误后点击右上角采用。</p>
                  ) : showAdoptButton ? (
                    <p className="func-doc-draft-hint">确认内容无误后，点击右上角「{docType === 'product' ? '采用此产品方案' : '采用此技术方案'}」。</p>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    )
  }


  function renderDataFormManagement(functionItem: OperationFunction) {
    return (
      <section className="func-data-form-panel">
        <div className="func-data-form-panel-head">
          <div>
            <strong>数据库表单管理</strong>
            <span>管理当前功能生成的数据表单定义和数据库物理表。</span>
          </div>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={dataFormsLoading}
            onClick={() => void refreshDataForms(functionItem, { force: true })}
          >
            刷新
          </Button>
        </div>
        {dataFormsLoading && dataForms.length === 0 ? (
          <div className="func-data-form-empty"><Spin size="small" /> 正在加载数据库表单</div>
        ) : dataForms.length === 0 ? (
          <div className="func-data-form-empty">暂无数据库表单。页面生成并声明 dataModels 后会显示在这里。</div>
        ) : (
          <table className="func-data-form-table">
            <thead>
              <tr>
                <th>表单名</th>
                <th>数据量</th>
                <th>字段数</th>
                <th>物理表</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {dataForms.map((form) => (
                <tr key={form.name}>
                  <td>
                    <strong>{form.label || form.name}</strong>
                    <span>{form.name}</span>
                  </td>
                  <td>{form.rowCount}</td>
                  <td>{form.fieldCount}</td>
                  <td><code>{form.tableName || '-'}</code></td>
                  <td>
                    <Button
                      type="link"
                      danger
                      loading={deletingDataFormName === form.name}
                      onClick={() => void handleDeleteDataForm(functionItem, form)}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    )
  }

  function renderCodePanel(functionItem: OperationFunction) {
    const state = codeState
    const generationOpen = isGenerationOpen(functionItem)
    const staleHint = functionItem.codeStale
      ? '页面基于旧版技术方案，请重新生成。'
      : functionItem.technicalStale
        ? '技术方案待同步，请先更新技术方案。'
        : ''
    const appReady = Boolean(state?.appExists || state?.draftExists)

    return (
      <div className="func-doc-panel func-code-panel">
        {staleHint ? <p className="func-doc-stale-hint">{staleHint}</p> : null}
        {functionItem.generatedAppId ? renderDataFormManagement(functionItem) : null}
        {!functionItem.generatedAppId ? (
          <div className="func-code-empty">
            <p>两份方案已对齐后，点击「生成页面」，AI 会按技术方案产出可操作页面。</p>
          </div>
        ) : (
          <div className={`func-code-meta-pane${codeStateLoading ? ' is-loading' : ''}`}>
            <div className="func-code-meta-pane-body">
              {appReady ? (
                <>
                  <dl className="func-code-meta">
                    <div><dt>应用 ID</dt><dd>{state?.appId || functionItem.generatedAppId}</dd></div>
                    <div><dt>Manifest 版本</dt><dd>{state?.draftAppVersion || state?.appliedAppVersion || '—'}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatTime(state?.draftUpdatedAt ?? state?.appliedUpdatedAt ?? 0)}</dd></div>
                  </dl>
                  {state?.summary ? <p className="func-code-summary">{state.summary}</p> : null}
                  <p className="func-doc-draft-hint">生成完成后可前往「预览确认」查看效果。</p>
                </>
              ) : (
                <p className="func-code-empty-copy">
                  {isCodeGenerationPending(functionItem) || generationOpen
                    ? '页面正在生成，完成后可点击「刷新并预览」。'
                    : '页面尚未生成，请点击右上角「生成页面」。'}
                </p>
              )}
            </div>
            {codeStateLoading ? (
              <div className="func-planning-loading-overlay" aria-live="polite">
                <Spin size="small" />
                <strong>正在加载页面状态</strong>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  function renderWorkflowPipeline(functionItem: OperationFunction) {
    const steps = [
      {
        key: 'product',
        label: '产品方案',
        done: functionItem.productDocVersion > 0,
        pending: functionItem.productDraftReady,
      },
      {
        key: 'technical',
        label: '技术方案',
        done: functionItem.technicalDocVersion > 0 && !functionItem.technicalStale,
        pending: functionItem.technicalDraftReady || functionItem.technicalStale,
      },
      {
        key: 'code',
        label: '页面生成',
        done: hasGeneratedPage(functionItem) && !functionItem.codeStale,
        pending: functionItem.codeStale || Boolean(functionItem.generatedAppId && functionItem.codeVersion === 0),
      },
    ] as const

    return (
      <div className="func-workflow-pipeline" aria-label="文档到代码流水线">
        {steps.map((step, index) => (
          <div key={step.key} className={`func-workflow-pipeline-item${step.done ? ' is-done' : ''}${step.pending ? ' is-pending' : ''}`}>
            <span className="func-workflow-pipeline-dot">{step.done ? '✓' : index + 1}</span>
            <span>{step.label}</span>
            {index < steps.length - 1 ? <span className="func-workflow-pipeline-arrow">→</span> : null}
          </div>
        ))}
      </div>
    )
  }

  function renderPlanningHeaderAction(functionItem: OperationFunction) {
    const action = resolveStepPrimaryAction(functionItem, resolvedEditorStep, {
      openedGenerationIds,
      generationPreviewReadyIds,
    })
    if (!action) {
      return null
    }
    if (action === 'generate_product_doc' && !canGenerateProductDoc(functionItem)) {
      return null
    }
    if (action === 'generate_technical_doc' && !canGenerateTechnicalDoc(functionItem)) {
      return null
    }
    if (action === 'generate_page' && (
      hasGenerationConversationStarted(functionItem, openedGenerationIds)
      || generationLaunchingIds.includes(functionItem.id)
    )) {
      return null
    }
    if (action === 'adopt_product_doc' && !functionItem.productDraftReady) {
      return null
    }
    if (action === 'adopt_technical_doc' && !canShowAdoptDraftButton(functionItem, 'technical')) {
      return null
    }
    const primaryLabel = getNextActionLabel(action)
    const launching = generationLaunchingIds.includes(functionItem.id)
    const loading = isRequesting
      || savingFunctionId === functionItem.id
      || previewPreparingId === functionItem.id
      || statusUpdatingId === functionItem.id
      || launching
      || conversationOutboundPending

    return (
      <div className="func-planning-header-actions">
        <Button
          type="primary"
          icon={action === 'generate_page' ? <RocketOutlined /> : action === 'refresh_and_preview' ? <ReloadOutlined /> : undefined}
          loading={loading}
          onClick={() => void handleReadinessAction(functionItem, action)}
        >
          {primaryLabel}
        </Button>
      </div>
    )
  }

  function renderPlanningWorkspace(functionItem: OperationFunction) {
    const readiness = resolveFunctionReadiness(functionItem)

    return (
      <section className="func-planning-workspace">
        <header className="func-planning-header">
          <div>
            <strong>{EDITOR_STEPS.find((step) => step.id === resolvedEditorStep)?.label || '流程工作区'}</strong>
            <p>{getPlanningStepHint(resolvedEditorStep, functionItem)}</p>
            {readiness.blockingReason ? <p className="func-doc-stale-hint">{readiness.blockingReason}</p> : null}
          </div>
          {renderPlanningHeaderAction(functionItem)}
        </header>

        {renderWorkflowPipeline(functionItem)}

        <div className="func-planning-stage">
          {resolvedEditorStep === 'product' ? renderDocumentPanel(functionItem, 'product') : null}
          {resolvedEditorStep === 'technical' ? renderDocumentPanel(functionItem, 'technical') : null}
          {resolvedEditorStep === 'code' ? renderCodePanel(functionItem) : null}
          {resolvedEditorStep === 'preview' ? renderPlanningPreviewPanel(functionItem) : null}
        </div>
      </section>
    )
  }

  function renderPlanningPreviewPanel(functionItem: OperationFunction) {
    const generationOpen = isGenerationOpen(functionItem)
    const previewApp = resolveOperationPreviewApp(functionItem, generatedApps)
    const draftPreviewApp = previewApp ? {
      ...previewApp,
      frontendEntry: `/func-operation/functions/${functionItem.id}/preview/frontend.js`,
    } : null
    const previewRenderKey = `${functionItem.id}:${functionItem.generatedAppId}:${functionItem.codeVersion}:${functionItem.codeDraftVersion}:${previewReloadToken}`

    return (
      <div className="func-planning-preview-panel">
        {functionItem.status === FUNCTION_STATUS.published ? (
          <p className="preview-version-hint">已发布功能，预览展示的是工作区当前版本。</p>
        ) : null}
        {previewError ? <p className="preview-error-hint">{previewError.hint || previewError.message}</p> : null}
        {!functionItem.generatedAppId ? (
          <div className="preview-canvas-shell preview-canvas-shell-pending">
            <div className="preview-canvas-loading-overlay is-static preview-placeholder-empty">
              <Welcome
                title="还没有页面"
                description={generationOpen
                  ? '页面正在生成中，完成后可在此预览。'
                  : '请先完成产品方案和技术方案，再生成页面。'}
              />
              {!hasGenerationConversationStarted(functionItem, openedGenerationIds) ? (
                <Button type="primary" icon={<RocketOutlined />} onClick={() => void handleReadinessAction(functionItem, 'generate_page')}>
                  生成页面
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <GeneratedAppPreviewCanvas
            app={draftPreviewApp}
            enabled
            renderKey={previewRenderKey}
            functionId={functionItem.id}
            className="preview-canvas func-preview-canvas editor-step-preview-canvas"
            versionHint="当前预览：工作区最新版本"
            showManualRefresh
            navTree={navTree}
            runFunction={(_, payload) => invokeFunctionPreview(functionItem.id, payload)}
            onErrorChange={setPreviewError}
            onReload={() => setPreviewReloadToken((current) => current + 1)}
            onFixWithAI={() => handleFixPreviewWithAI(functionItem)}
          />
        )}
      </div>
    )
  }

  function renderPreviewPanel(functionItem: OperationFunction) {
    const previewApp = resolveOperationPreviewApp(functionItem, generatedApps)
    const previewRenderKey = buildGeneratedAppRenderKey(functionItem, previewApp, previewReloadToken)

    return (
      <section className="published-runtime-shell">
        {!functionItem.generatedAppId ? (
          <div className="func-empty compact preview-placeholder">
            <Welcome title="还没有页面" description="当前功能还没有可渲染的前端代码，请先在管理后台完成生成并发布。" />
          </div>
        ) : (
          <GeneratedAppPreviewCanvas
            app={previewApp}
            enabled
            renderKey={previewRenderKey}
            functionId={functionItem.id}
            className="preview-canvas func-preview-canvas published-runtime-canvas"
            navTree={navTree}
            runFunction={runFunction}
            onErrorChange={setPreviewError}
            onReload={() => void handleReloadPreviewApps(functionItem.generatedAppId)}
          />
        )}
      </section>
    )
  }

  function isGenerationOpen(functionItem: OperationFunction) {
    return Boolean(
      functionItem.generatedAppId ||
      openedGenerationIds.includes(functionItem.id) ||
      functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGeneration ||
      functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGenerated,
    )
  }

  function isCodeGenerationPending(functionItem: OperationFunction) {
    return Boolean(
      !functionItem.generatedAppId &&
      (
        functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGeneration ||
        openedGenerationIds.includes(functionItem.id)
      ),
    )
  }

  function renderCreateModal() {
    return (
      <Modal
        open={createOpen}
        title="新建功能"
        okText="创建并开始设计"
        cancelText="取消"
        confirmLoading={creating}
        onOk={() => void handleCreate()}
        onCancel={() => {
          if (!creating) {
            setCreateOpen(false)
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="功能名称"
            rules={[{ required: true, message: '请输入功能名称' }]}
          >
            <Input placeholder="例如：客户资料管理" maxLength={60} />
          </Form.Item>
          <Form.Item
            name="menuParentId"
            label="所属目录"
            rules={[{ required: true, message: '请选择功能所属目录' }]}
            extra="请先在菜单管理的「功能使用」下创建目录"
          >
            <Select
              placeholder={directoryMenusLoading ? '正在刷新目录' : directoryMenus.length > 0 ? '选择发布目录' : '暂无目录，请先到菜单管理创建'}
              options={directoryMenus.map((item) => ({ value: item.id, label: item.name }))}
              loading={directoryMenusLoading}
              disabled={directoryMenusLoading || directoryMenus.length === 0}
            />
          </Form.Item>
          <Form.Item name="description" label="功能描述">
            <Input.TextArea
              placeholder="描述这个功能要解决的问题，例如用户、核心操作、列表字段、需要保存的数据。"
              autoSize={{ minRows: 4, maxRows: 8 }}
              maxLength={300}
            />
          </Form.Item>
        </Form>
      </Modal>
    )
  }
}

function keepOrFirst(current: string, items: OperationFunction[]) {
  if (current && items.some((item) => item.id === current)) {
    return current
  }
  return items[0]?.id || ''
}

function upsertFunctionItem(items: OperationFunction[], next: OperationFunction) {
  return items.map((item) => (item.id === next.id ? mergeOperationFunction(item, next) : item))
}

function buildGeneratedAppRenderKey(
  functionItem: OperationFunction,
  app: GeneratedApp | null,
  reloadToken: number,
) {
  return [
    functionItem.id,
    functionItem.generatedAppId,
    functionItem.codeVersion,
    functionItem.codeDraftVersion,
    app?.frontendEntry || '',
    app?.version || '',
    app?.updatedAt || 0,
    reloadToken,
  ].join(':')
}

function upsertApp(current: GeneratedApp[], app: GeneratedApp) {
  return current.some((item) => item.id === app.id)
    ? current.map((item) => (item.id === app.id ? app : item))
    : [app, ...current]
}

function formatTime(timestamp: number) {
  if (!timestamp) {
    return '--'
  }
  const normalized = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function editorStepFromConversation(conversation: EditorConversation): EditorStep {
  switch (conversation) {
    case 'technical':
      return 'technical'
    case 'generation':
      return 'code'
    default:
      return 'product'
  }
}

function conversationFromEditorStep(step: EditorStep): EditorConversation {
  switch (step) {
    case 'technical':
      return 'technical'
    case 'code':
    case 'preview':
      return 'generation'
    default:
      return 'product'
  }
}

function isEditorStepAccessible(
  functionItem: OperationFunction,
  stepId: EditorStep,
  openedGenerationIds: string[],
) {
  switch (stepId) {
    case 'product':
      return true
    case 'technical':
      return Boolean(functionItem.productDoc.trim())
    case 'code':
      return Boolean(functionItem.productDoc.trim() && functionItem.technicalDoc.trim())
    case 'preview':
      return Boolean(functionItem.generatedAppId || openedGenerationIds.includes(functionItem.id))
    default:
      return false
  }
}

function shouldPromptContinueConversation(
  functionItem: OperationFunction | null | undefined,
  conversation: EditorConversation,
  content: string,
  generationPreviewReadyIds: string[],
  openedGenerationIds: string[],
): boolean {
  if (!functionItem) {
    return false
  }
  if (conversationTurnHasOutcomeTag(content, functionItem.id, conversation)) {
    return false
  }
  if (conversation === 'generation') {
    if (shouldShowRefreshAndPreview(functionItem, generationPreviewReadyIds)) {
      return false
    }
    if (functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGenerated) {
      return false
    }
    return functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE.codeGeneration
      || openedGenerationIds.includes(functionItem.id)
  }
  return true
}

function getPlanningStepHint(step: EditorStep, functionItem: OperationFunction) {
  switch (step) {
    case 'product':
      if (functionItem.productDraftReady) {
        return 'AI 已生成产品方案，请确认是否采用。'
      }
      if (functionItem.productDocVersion === 0) {
        return '点击主按钮生成产品方案，AI 会写入「AI 最新版本」。'
      }
      return '在右侧对话中描述修改需求，AI 会更新「AI 最新版本」，确认后再采用。'
    case 'technical':
      if (functionItem.technicalDraftReady) {
        return 'AI 已生成技术方案，请确认是否采用。'
      }
      if (functionItem.technicalStale) {
        return '产品方案已更新，请重新生成技术方案。'
      }
      if (functionItem.technicalDocVersion === 0) {
        return '基于已采用的产品方案生成技术方案。'
      }
      return '在右侧对话中描述修改需求，AI 会更新「AI 最新版本」，确认后再采用。'
    case 'code':
      if (functionItem.codeStale) {
        return '技术方案已更新，请重新生成页面。'
      }
      if (hasGeneratedPage(functionItem)) {
        return '页面已生成，可在预览确认中查看效果；需要调整时请在右侧对话中说明。'
      }
      return '技术方案采用后可生成页面；生成进行中时请等待 AI 完成。'
    case 'preview':
      return '在预览区检查页面是否能完成业务动作。'
    default:
      return ''
  }
}

function getFunctionConversationSessionId(functionItem: OperationFunction, conversation: EditorConversation) {
  switch (conversation) {
    case 'product':
      return functionItem.productSessionId
    case 'technical':
      return functionItem.technicalSessionId
    case 'generation':
      return functionItem.generationSessionId
    default:
      return ''
  }
}

function resolveFunctionConversationModelId(
  configs: AgentSessionConfig[],
  conversation: EditorConversation,
  models: AgentModelOption[],
) {
  const modelId = configs.find((item) => item.sessionType === toAgentSessionConfigType(conversation))?.modelId || ''
  if (modelId && models.some((item) => item.id === modelId)) {
    return modelId
  }
  return models.find((item) => item.isDefault)?.id || models[0]?.id || ''
}

function resolveFunctionConversationRuntimeConfig(configs: AgentSessionConfig[], conversation: EditorConversation) {
  const config = configs.find((item) => item.sessionType === toAgentSessionConfigType(conversation))
  if (!config) {
    return {}
  }
  return {
    agentSessionConfigType: config.sessionType,
    systemPrompt: config.systemPrompt,
    permissionMode: config.permissionMode,
    maxTurns: config.maxTurns,
  }
}

function fillSessionConfigModelFallback(configs: AgentSessionConfig[], models: AgentModelOption[]) {
  const fallbackModelId = models.find((item) => item.isDefault)?.id || models[0]?.id || ''
  return configs.map((item) => ({
    ...item,
    modelId: item.modelId || fallbackModelId,
  }))
}

function toAgentSessionConfigType(conversation: EditorConversation): AgentSessionConfigType {
  switch (conversation) {
    case 'technical':
      return 'func_technical'
    case 'generation':
      return 'func_generation'
    case 'product':
    default:
      return 'func_product'
  }
}

function getDefaultConversation(functionItem: OperationFunction | null | undefined): EditorConversation {
  if (!functionItem) {
    return 'product'
  }
  switch (functionItem.workflowStage) {
    case FUNCTION_WORKFLOW_STAGE.technicalDoc:
      return 'technical'
    case FUNCTION_WORKFLOW_STAGE.codeGeneration:
    case FUNCTION_WORKFLOW_STAGE.codeGenerated:
      return 'generation'
    default:
      return 'product'
  }
}

function buildProductDocPrompt(functionItem: OperationFunction, publicConfigs: PublicConfig[]) {
  const description = functionItem.description.trim() || '暂无补充描述'
  return [
    '使用 `product-doc-builder` 技能。',
    `功能名称：${functionItem.name}`,
    `功能描述：${description}`,
    `draft 文件：${getDraftDocumentPath(functionItem, 'product')}`,
    `完成标签：${buildDocumentReadyTag(functionItem.id, 'product')}`,
    `失败标签：${buildDocumentFailedTag(functionItem.id, 'product')}`,
    buildPublicConfigCatalogPrompt(publicConfigs),
    '要求：完成标签和失败标签只能写在对话回复最后一行，禁止写入 draft 文档正文。',
  ].join('\n')
}

function buildTechnicalDocPrompt(functionItem: OperationFunction, publicConfigs: PublicConfig[]) {
  const productDocPath = functionItem.productDocPath.trim() || getPublishedDocumentPath(functionItem, 'product')
  return [
    '使用 `technical-doc-builder` 技能。',
    `功能名称：${functionItem.name}`,
    `产品文档（applied）：${productDocPath}`,
    `draft 文件：${getDraftDocumentPath(functionItem, 'technical')}`,
    `完成标签：${buildDocumentReadyTag(functionItem.id, 'technical')}`,
    `失败标签：${buildDocumentFailedTag(functionItem.id, 'technical')}`,
    buildPublicConfigCatalogPrompt(publicConfigs),
    '要求：完成标签和失败标签只能写在对话回复最后一行，禁止写入 draft 文档正文。',
  ].join('\n')
}

function buildGeneratedAppBuilderPrompt(functionItem: OperationFunction, app: GeneratedApp, publicConfigs: PublicConfig[] = []) {
  const appFolder = functionItem.appDir.trim() || getFunctionAppDir(functionItem)
  const tablePrefix = app.tablePrefix || 'func_<function_auto_increment_id>'
  const productDocPath = functionItem.productDocPath.trim() || getPublishedDocumentPath(functionItem, 'product')
  const technicalDocPath = functionItem.technicalDocPath.trim() || getPublishedDocumentPath(functionItem, 'technical')
  return [
    '使用 `generated-app-builder` 技能。',
    `功能名称：${functionItem.name}`,
    `功能描述：${functionItem.description.trim() || '暂无补充描述'}`,
    `产品文档（applied）：${productDocPath}`,
    `研发文档（applied）：${technicalDocPath}`,
    `appId：${app.id}`,
    `appDir：${appFolder}`,
    `tablePrefix：${tablePrefix}`,
    `完成标签：${buildGeneratedAppReadyTag(functionItem.id)}`,
    `失败标签：${buildGeneratedAppFailedTag(functionItem.id)}`,
    buildPublicConfigCatalogPrompt(publicConfigs),
    '按钮权限要求：manifest.actions 必须包含所有会触发新增、编辑、删除、归档、分配、审批、保存等状态变更的 action；列表、详情、查询等只读 action 不写入 manifest.actions。',
    '按钮展示要求：所有会触发 manifest.actions 中 action 的按钮、菜单项、弹窗按钮、详情页按钮、子模块按钮，都必须在渲染前调用 `context.can(actionKey)` 或透传后的同等 can 方法判断；无权限时不要渲染按钮。',
    '嵌套界面要求：如果按钮在 modal、drawer、tab、子表格、详情面板等内部组件里，必须把 can 方法从 render(context) 一路透传进去，禁止只在外层列表做权限判断。',
    '提交自检：不得出现 “Permission checks removed”、用 `canManage = true` 放开受控按钮、`!can || can(action)` 这类默认放开受控按钮的写法；后端仍会兜底鉴权，但前端必须隐藏无权限按钮。未受控的只读入口可以默认展示。',
    '要求：完成标签和失败标签只能写在对话回复最后一行，禁止写入文档或代码文件。',
  ].join('\n')
}

function buildPublicConfigCatalogPrompt(configs: PublicConfig[]) {
  if (!configs.length) {
    return '公共配置目录：当前未读取到可用配置。如需求中的选项需要跨功能复用或由运营维护，必须在文档中标记为“待创建公共配置”，不得自行硬编码为最终方案。'
  }
  return [
    '公共配置目录（仅可使用此处明确列出的 config_key；语义不确定时先向用户确认）：',
    ...configs.map((item) => `- ${item.configKey}：${item.name || '-'}；${item.description || '无说明'}；结构：Option[] { value, label }`),
  ].join('\n')
}

function getFunctionAppDir(functionItem: OperationFunction) {
  const appId = functionItem.generatedAppId || functionItem.id
  return `generated_apps/${appId}`
}

function getDraftDocumentPath(functionItem: OperationFunction, docType: 'product' | 'technical') {
  const backendPath = docType === 'product'
    ? functionItem.productDraftDocPath.trim()
    : functionItem.technicalDraftDocPath.trim()
  if (backendPath) {
    return backendPath
  }
  const file = docType === 'product' ? 'product-doc.md' : 'technical-doc.md'
  return `${getFunctionAppDir(functionItem)}/documents/${docType}/draft/${file}`
}

function getPublishedDocumentPath(functionItem: OperationFunction, docType: 'product' | 'technical') {
  const file = docType === 'product' ? 'product-doc.md' : 'technical-doc.md'
  return `${getFunctionAppDir(functionItem)}/documents/${docType}/applied/${file}`
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error('未知错误')
}
