import { Button, Form, Select, Spin, Tag } from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  LeftOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type {
  OperationFunction,
  AgentModelOption,
  SystemMenu,
  TodoTask,
} from '../../types'
import { FunctionGenerationConsole, type ChatMessageInfo, type ConversationNotice } from './FunctionGenerationConsole'
import { resolveFunctionReadiness } from './functionReadiness'
import type { ChatInput } from '../../lib/aiAgentProvider'
import { FuncEditorContent } from './FuncEditorContent'
import { FuncEditorChat } from './FuncEditorChat'
import './FuncEditorLayout.css'

type EditorStep = 'product' | 'technical' | 'code' | 'preview'
type EditorConversation = 'product' | 'technical' | 'generation'

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

const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
}

interface FuncEditorLayoutProps {
  functionItem: OperationFunction | null
  currentStep: EditorStep
  conversation: EditorConversation
  directoryMenus: SystemMenu[]
  openedGenerationIds: string[]
  messages: ChatMessageInfo[]
  isRequesting: boolean
  isDefaultMessagesRequesting: boolean
  activeSessionId: string
  conversationOutboundPending: boolean
  conversationNotice: ConversationNotice | null
  generationLaunchingIds: string[]
  modelOptions: AgentModelOption[]
  selectedModelId: string
  todoTasks: TodoTask[]
  canAdminEdit: boolean
  canAdminPublish: boolean
  canAdminUnpublish: boolean
  canAdminDelete: boolean
  statusUpdatingId: string
  deletingId: string
  onStepChange: (step: EditorStep) => void
  onLeaveEditor: () => void
  onStatusChange: (status: string) => void
  onDelete: () => void
  onSaveMenuParent: (menuParentId: string) => void
  onConversationRequest: (params: ChatInput) => void
  onAbort: () => void
  onNoticeAction?: () => void
  renderContent: () => React.ReactNode
}

export function FuncEditorLayout(props: FuncEditorLayoutProps) {
  const {
    functionItem,
    currentStep,
    conversation,
    directoryMenus,
    openedGenerationIds,
    messages,
    isRequesting,
    isDefaultMessagesRequesting,
    activeSessionId,
    conversationOutboundPending,
    conversationNotice,
    generationLaunchingIds,
    modelOptions,
    selectedModelId,
    todoTasks,
    canAdminEdit,
    canAdminPublish,
    canAdminUnpublish,
    canAdminDelete,
    statusUpdatingId,
    deletingId,
    onStepChange,
    onLeaveEditor,
    onStatusChange,
    onDelete,
    onSaveMenuParent,
    onConversationRequest,
    onAbort,
    onNoticeAction,
    renderContent,
  } = props

  const isLoading = !functionItem
  const isPreviewMode = currentStep === 'preview'

  return (
    <div className="func-admin-editor-page func-editor-new-layout">
      {/* 左侧流程步骤栏 */}
      <aside className="func-editor-new-sidebar">
        <div className="func-editor-new-sidebar-scroll">
          <div className="func-editor-new-back">
            <Button icon={<LeftOutlined />} block onClick={onLeaveEditor}>
              返回列表
            </Button>
          </div>

          {isLoading ? (
            <div className="func-editor-new-loading">
              <Spin size="small" />
              <span>正在加载功能</span>
            </div>
          ) : (
            <>
              <section className="func-editor-new-info">
                <header>
                  <p className="func-editor-new-eyebrow">功能编辑</p>
                  <h2 className="func-editor-new-title">{functionItem.name}</h2>
                  <p className="func-editor-new-desc">
                    {functionItem.description || '按步骤完成文档与代码生成。'}
                  </p>
                </header>

                <nav className="func-editor-new-steps" aria-label="工作流步骤">
                  {EDITOR_STEPS.map((step, index) => {
                    const isActive = currentStep === step.id
                    const isDone = isStepComplete(functionItem, step.id, openedGenerationIds)
                    const isLocked = step.id !== 'product' && !isStepAccessible(functionItem, step.id, openedGenerationIds)

                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`func-editor-new-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}${isLocked ? ' is-locked' : ''}`}
                        disabled={isLocked}
                        onClick={() => onStepChange(step.id)}
                      >
                        <span className="func-editor-new-step-index">
                          {isDone ? '✓' : index + 1}
                        </span>
                        <span className="func-editor-new-step-content">
                          <strong>{step.label}</strong>
                          <small>{step.hint}</small>
                          {step.id === 'product' && functionItem.productDraftReady && (
                            <Tag className="func-editor-new-step-tag" variant="filled">有新稿</Tag>
                          )}
                          {step.id === 'technical' && functionItem.technicalDraftReady && (
                            <Tag className="func-editor-new-step-tag" variant="filled">有新稿</Tag>
                          )}
                          {step.id === 'technical' && functionItem.technicalStale && (
                            <Tag className="func-editor-new-step-tag stale" variant="filled">待同步</Tag>
                          )}
                          {step.id === 'code' && functionItem.codeStale && (
                            <Tag className="func-editor-new-step-tag stale" variant="filled">待更新</Tag>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </nav>

                <div className="func-editor-new-tags">
                  <Tag variant="filled" className={`function-status ${functionItem.status}`}>
                    {statusLabels[functionItem.status] || functionItem.status}
                  </Tag>
                  <Tag variant="filled" className="binding-status">
                    {resolveFunctionReadiness(functionItem).label}
                  </Tag>
                </div>

                <Form layout="vertical" className="func-editor-new-form">
                  <Form.Item label="所属目录" required={functionItem.status === FUNCTION_STATUS.published}>
                    <Select
                      placeholder="选择功能发布目录"
                      value={functionItem.menuParentId || undefined}
                      options={directoryMenus.map((item) => ({ value: item.id, label: item.name }))}
                      onChange={onSaveMenuParent}
                      disabled={!canAdminEdit || directoryMenus.length === 0}
                    />
                  </Form.Item>
                </Form>

                <div className="func-editor-new-actions">
                  {functionItem.status === FUNCTION_STATUS.published ? (
                    canAdminUnpublish && (
                      <Button
                        icon={<StopOutlined />}
                        loading={statusUpdatingId === functionItem.id}
                        onClick={() => onStatusChange(FUNCTION_STATUS.draft)}
                      >
                        下架
                      </Button>
                    )
                  ) : (
                    canAdminPublish && (
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        loading={statusUpdatingId === functionItem.id}
                        disabled={!functionItem.generatedAppId}
                        onClick={() => onStatusChange(FUNCTION_STATUS.published)}
                      >
                        发布
                      </Button>
                    )
                  )}
                  {canAdminDelete && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      loading={deletingId === functionItem.id}
                      onClick={onDelete}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </aside>

      {/* 右侧内容区域 */}
      <main
        className={`func-editor-new-main${isPreviewMode ? ' is-preview-mode' : ''}`}
      >
        {isLoading ? (
          <>
            <div className="func-editor-new-content-col">
              <FuncEditorContent step={currentStep}>
                <div className="func-editor-new-loading-box">
                  <Spin size="small" />
                  <span>正在加载工作区...</span>
                </div>
              </FuncEditorContent>
            </div>
            {!isPreviewMode ? (
              <div className="func-editor-new-chat-col">
                <FuncEditorChat>
                  <div className="func-editor-new-loading-box">
                    <Spin size="small" />
                    <span>正在加载会话...</span>
                  </div>
                </FuncEditorChat>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="func-editor-new-content-col">
              <FuncEditorContent step={currentStep}>
                {renderContent()}
              </FuncEditorContent>
            </div>
            {!isPreviewMode ? (
              <div className="func-editor-new-chat-col">
                <FuncEditorChat>
                  <FunctionGenerationConsole
                    conversation={conversation}
                    editorStep={currentStep}
                    sessionId={activeSessionId}
                    messages={messages}
                    isRequesting={isRequesting}
                    isDefaultMessagesRequesting={isDefaultMessagesRequesting}
                    composerDisabled={!activeSessionId}
                    composerLoading={
                      isRequesting ||
                      conversationOutboundPending ||
                      (functionItem && generationLaunchingIds.includes(functionItem.id))
                    }
                    outboundPending={conversationOutboundPending && !isRequesting}
                    notice={conversationNotice}
                    onNoticeAction={onNoticeAction}
                    onRequest={onConversationRequest}
                    onAbort={onAbort}
                    modelOptions={modelOptions}
                    selectedModelId={selectedModelId}
                    todoTasks={todoTasks}
                  />
                </FuncEditorChat>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

function isStepComplete(
  functionItem: OperationFunction,
  stepId: EditorStep,
  openedGenerationIds: string[],
): boolean {
  switch (stepId) {
    case 'product':
      return Boolean(functionItem.productDoc.trim())
    case 'technical':
      return Boolean(functionItem.technicalDoc.trim())
    case 'code':
      return Boolean(functionItem.generatedAppId || openedGenerationIds.includes(functionItem.id))
    case 'preview':
      return Boolean(functionItem.generatedAppId)
    default:
      return false
  }
}

function isStepAccessible(
  functionItem: OperationFunction,
  stepId: EditorStep,
  openedGenerationIds: string[],
): boolean {
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
