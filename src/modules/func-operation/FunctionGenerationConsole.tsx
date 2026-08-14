import { memo, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import { Bubble, Sender, Welcome } from '@ant-design/x'
import { MessageBubble } from '../../components/MessageBubble'
import { buildBubbleItemKey } from '../../lib/chatBubble'
import type { AgentModelOption, ChatMessage, ChatStatus } from '../../types'

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

interface ChatMessageInfo {
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
  onRequest: (params: { content: string }) => void
  onAbort: () => void
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
  onRequest: (params: { content: string }) => void
  onAbort: () => void
}) {
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft('')
  }, [conversationKey])

  return (
    <Sender
      value={draft}
      onChange={setDraft}
      loading={loading}
      disabled={disabled}
      onCancel={onAbort}
      onSubmit={(value) => {
        const content = String(value).trim()
        if (!content) {
          return
        }
        setDraft('')
        onRequest({ content })
      }}
      placeholder={placeholder}
      autoSize={{ minRows: 3, maxRows: 8 }}
      className="chat-sender"
      suffix={false}
      footer={(actions) => (
        <div className="chat-sender-toolbar generation-console-toolbar">
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
