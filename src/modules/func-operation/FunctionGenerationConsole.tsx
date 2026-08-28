import { memo, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import { Attachments, Bubble, Sender, Welcome } from '@ant-design/x'
import { InboxOutlined, PaperClipOutlined } from '@ant-design/icons'
import { MessageBubble } from '../../components/MessageBubble'
import { TodoDock } from '../../components/TodoDock'
import { buildBubbleItemKey } from '../../lib/chatBubble'
import { uploadChatFile } from '../../lib/api'
import { getClipboardImageFile } from '../../lib/clipboardAttachment'
import type { AgentModelOption, ChatMessage, ChatStatus, MessagePart, TodoTask } from '../../types'
import type { ChatInput } from '../../lib/aiAgentProvider'

type EditorConversation = 'product' | 'technical' | 'generation'
type EditorStep = 'product' | 'technical' | 'code' | 'preview'

export interface ConversationNotice {
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  actionLabel?: string
}

interface BubblePayload {
  message: ChatMessage
  status: ChatStatus
  messageKey: string | number
  sessionId?: string
}

export interface ChatMessageInfo {
  id: string | number
  message: ChatMessage
  status: ChatStatus
}

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

interface FunctionGenerationConsoleProps {
  conversation: EditorConversation
  editorStep: EditorStep
  sessionId: string
  messages: ChatMessageInfo[]
  isRequesting: boolean
  isDefaultMessagesRequesting: boolean
  composerDisabled: boolean
  notice?: ConversationNotice | null
  onNoticeAction?: () => void
  composerLoading?: boolean
  outboundPending?: boolean
  modelOptions?: AgentModelOption[]
  selectedModelId?: string
  todoTasks?: TodoTask[]
  onRequest: (params: ChatInput) => void
  onAbort: () => void
}

interface PendingGenerationAttachment {
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

function revokeAttachmentPreview(attachment: PendingGenerationAttachment) {
  if (attachment.url?.startsWith('blob:')) {
    URL.revokeObjectURL(attachment.url)
  }
}

const GenerationConsoleMessages = memo(function GenerationConsoleMessages({
  editorStep,
  sessionId,
  messages,
  outboundPending,
}: {
  editorStep: EditorStep
  sessionId: string
  messages: ChatMessageInfo[]
  outboundPending: boolean
}) {
  const welcome = getConversationWelcome(editorStep)
  const bubbleItems = useMemo(
    () => messages.map(({ id, message, status }, index) => {
      const bubbleKey = buildBubbleItemKey(id, message, index)
      return {
        key: bubbleKey,
        role: message.role,
        content: { message, status, messageKey: bubbleKey, sessionId },
        streaming: false,
        loading:
          (status === 'loading' || status === 'updating') &&
          message.parts.length === 0 &&
          !message.content,
      }
    }),
    [messages, sessionId],
  )

  if (messages.length === 0) {
    if (outboundPending) {
      return (
        <div className="generation-messages-state">
          <Spin size="small" />
          <strong>正在发送消息…</strong>
        </div>
      )
    }
    return (
      <div className="generation-messages-welcome">
        <Welcome title={welcome.title} description={welcome.description} />
      </div>
    )
  }

  return (
    <>
      <Bubble.List className="bubble-list" role={bubbleRoles} items={bubbleItems} />
      {outboundPending ? (
        <div className="generation-console-pending-hint">
          <Spin size="small" />
          <span>正在发送消息…</span>
        </div>
      ) : null}
    </>
  )
})

const GenerationConsoleComposer = memo(function GenerationConsoleComposer({
  disabled,
  loading,
  placeholder,
  conversationKey,
  selectedModel,
  onRequest,
  onAbort,
}: {
  disabled: boolean
  loading: boolean
  placeholder: string
  conversationKey: string
  selectedModel: AgentModelOption | null
  onRequest: (params: ChatInput) => void
  onAbort: () => void
}) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<MessagePart[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingGenerationAttachment[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const pendingAttachmentsRef = useRef<PendingGenerationAttachment[]>([])
  const uploadSeedRef = useRef(0)
  const dropContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => {
    setDraft('')
    pendingAttachmentsRef.current.forEach(revokeAttachmentPreview)
    pendingAttachmentsRef.current = []
    setPendingAttachments([])
    setAttachments([])
  }, [conversationKey])

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach(revokeAttachmentPreview)
  }, [])

  async function handleAttachmentUpload(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setUploadError('聊天附件最大支持 16 MiB')
      return false
    }
    const isImage = file.type.startsWith('image/')
    const uid = `generation-upload-${Date.now()}-${uploadSeedRef.current++}`
    const localPreviewURL = isImage ? URL.createObjectURL(file) : undefined
    setPendingAttachments((current) => [...current, {
      uid,
      name: file.name,
      size: file.size,
      type: file.type,
      url: localPreviewURL,
      thumbUrl: localPreviewURL,
      percent: 0,
      status: 'uploading',
    }])
    setUploadError('')
    setUploadingAttachment(true)
    try {
      const uploaded = await uploadChatFile(file, (percent) => {
        setPendingAttachments((current) => current.map((attachment) => (
          attachment.uid === uid
            ? { ...attachment, percent: Math.max(attachment.percent, percent) }
            : attachment
        )))
      })
      const fileUrl = uploaded.url
      if (!fileUrl) {
        throw new Error('附件预览地址缺失')
      }
      const type: Extract<MessagePart, { fileUuid: string }>['type'] = uploaded.contentType.startsWith('image/')
        ? 'image'
        : uploaded.contentType === 'application/pdf' ? 'document' : 'file'
      setAttachments((current) => [...current, {
        type,
        fileUuid: uploaded.uuid,
        fileName: file.name,
        contentType: uploaded.contentType,
        fileSize: file.size,
        md5: uploaded.md5 || '',
        fileUrl,
      }])
      setPendingAttachments((current) => current.map((attachment) => (
        attachment.uid === uid
          ? { ...attachment, fileUuid: uploaded.uuid, percent: 100, status: 'done' }
          : attachment
      )))
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '附件上传失败')
      setPendingAttachments((current) => current.filter((attachment) => attachment.uid !== uid))
      if (localPreviewURL) {
        URL.revokeObjectURL(localPreviewURL)
      }
    } finally {
      setUploadingAttachment(false)
    }
    return false
  }

  function removeAttachment(uid: string) {
    const attachment = pendingAttachments.find((item) => item.uid === uid)
    if (!attachment) {
      return
    }
    revokeAttachmentPreview(attachment)
    setPendingAttachments((current) => current.filter((item) => item.uid !== uid))
    if (attachment.fileUuid) {
      setAttachments((current) => current.filter((part) => !('fileUuid' in part) || part.fileUuid !== attachment.fileUuid))
    }
  }

  function clearAttachments() {
    pendingAttachments.forEach(revokeAttachmentPreview)
    pendingAttachmentsRef.current = []
    setPendingAttachments([])
    setAttachments([])
    setUploadError('')
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = getClipboardImageFile(event.clipboardData)
    if (!file || disabled || loading || uploadingAttachment) {
      return
    }
    event.preventDefault()
    void handleAttachmentUpload(file)
  }

  return (
    <div ref={dropContainerRef} className="generation-composer-shell" onPaste={handleComposerPaste}>
      <Sender
        value={draft}
        onChange={setDraft}
        loading={loading}
        disabled={disabled || uploadingAttachment}
        onCancel={onAbort}
        onSubmit={(value) => {
          const content = String(value).trim()
          if (!content && attachments.length === 0) {
            return
          }
          setDraft('')
          onRequest({ content, messageParts: attachments })
          clearAttachments()
        }}
        placeholder={placeholder}
        autoSize={{ minRows: 3, maxRows: 8 }}
        className="chat-sender"
        suffix={false}
        header={pendingAttachments.length > 0 || uploadError ? (
        <>
          {pendingAttachments.length > 0 ? (
            <Attachments
              items={pendingAttachments}
              maxCount={pendingAttachments.length}
              onRemove={(file) => removeAttachment(String(file.uid))}
              disabled={disabled || uploadingAttachment}
              rootClassName="generation-attachment-list"
            />
          ) : null}
          {uploadError ? <div className="generation-attachment-error" role="alert">{uploadError}</div> : null}
        </>
        ) : null}
        footer={(actions) => (
          <div className="chat-sender-toolbar generation-console-toolbar">
          <Attachments
            rootClassName="generation-attachment-uploader"
            beforeUpload={handleAttachmentUpload}
            disabled={disabled || loading || uploadingAttachment}
            getDropContainer={() => dropContainerRef.current}
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
          {selectedModel ? (
            <div className="generation-console-model-pill" title={selectedModel.model || selectedModel.name}>
              <span>模型</span>
              <Tag color="blue">{selectedModel.name}</Tag>
            </div>
          ) : <span />}
          <div className="chat-sender-toolbar-actions">{actions}</div>
          </div>
        )}
      />
    </div>
  )
})

export const FunctionGenerationConsole = memo(function FunctionGenerationConsole({
  conversation,
  editorStep,
  sessionId,
  messages,
  isRequesting,
  isDefaultMessagesRequesting,
  composerDisabled,
  notice,
  onNoticeAction,
  composerLoading,
  outboundPending = false,
  modelOptions = [],
  selectedModelId = '',
  todoTasks = [],
  onRequest,
  onAbort,
}: FunctionGenerationConsoleProps) {
  const welcome = getConversationWelcome(editorStep)
  const placeholder = getConversationPlaceholder(editorStep)
  const senderLoading = composerLoading ?? isRequesting
  const selectedModel = modelOptions.find((item) => item.id === selectedModelId) || null

  return (
    <section className="generation-console generation-console-admin">
      <header>
        <div className="generation-console-heading">
          <strong>{getConversationLabel(conversation)}</strong>
          <p className="generation-console-subtitle">{welcome.subtitle}</p>
        </div>
      </header>
      <div className={`generation-messages${isDefaultMessagesRequesting ? ' is-loading-history' : ''}`}>
        <div className="generation-messages-body">
          <GenerationConsoleMessages
            editorStep={editorStep}
            sessionId={sessionId}
            messages={messages}
            outboundPending={outboundPending}
          />
        </div>
        {isDefaultMessagesRequesting ? (
          <div className="generation-messages-history-loading" aria-live="polite">
            <Spin size="small" />
            <strong>正在加载会话</strong>
          </div>
        ) : null}
      </div>
      <footer className="generation-console-footer">
        {notice ? (
          <Alert
            className="generation-console-notice"
            type={notice.type}
            showIcon
            message={notice.message}
            action={notice.actionLabel && onNoticeAction ? (
              <Button size="small" type="primary" onClick={onNoticeAction}>
                {notice.actionLabel}
              </Button>
            ) : undefined}
          />
        ) : null}
        {todoTasks.length > 0 ? (
          <section className="agent-compact-todo-panel" aria-label="待办列表">
            <TodoDock tasks={todoTasks} loading={isRequesting} compact />
          </section>
        ) : null}
        <div className="generation-console-composer">
          <GenerationConsoleComposer
            disabled={composerDisabled}
            loading={senderLoading}
            placeholder={placeholder}
            conversationKey={`${conversation}:${editorStep}`}
            selectedModel={selectedModel}
            onRequest={onRequest}
            onAbort={onAbort}
          />
        </div>
      </footer>
    </section>
  )
})

function getConversationLabel(conversation: EditorConversation) {
  switch (conversation) {
    case 'product':
      return '产品方案'
    case 'technical':
      return '技术方案'
    case 'generation':
      return '页面生成'
    default:
      return 'AI 协作'
  }
}

function getConversationWelcome(step: EditorStep) {
  switch (step) {
    case 'product':
      return {
        title: '生成产品方案',
        description: '描述功能目标、用户和核心流程，AI 会帮你结构化并写入方案。',
        subtitle: '左侧查看方案内容，在此与 AI 讨论和修改。',
      }
    case 'technical':
      return {
        title: '生成技术方案',
        description: 'AI 会读取已采用的产品方案，并产出数据模型、接口与实现步骤。',
        subtitle: '确认左侧「AI 最新版本」后采用，将进入页面生成。',
      }
    case 'code':
      return {
        title: '页面生成任务',
        description: 'AI 会按技术方案生成可操作页面和后端能力。',
        subtitle: '生成完成后点击「刷新并预览」查看最新页面。',
      }
    default:
      return {
        title: 'AI 协作',
        description: '',
        subtitle: '',
      }
  }
}

function getConversationPlaceholder(step: EditorStep) {
  switch (step) {
    case 'product':
      return '补充产品目标、用户角色、页面范围或边界条件…'
    case 'technical':
      return '补充模块设计、接口字段、状态流转或异常处理…'
    case 'code':
      return '输入修改意见、交互细节或 Bug 描述…'
    default:
      return '输入消息…'
  }
}
