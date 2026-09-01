import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CheckCircleOutlined, CodeOutlined, CopyOutlined, DownloadOutlined, DownOutlined, FileTextOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Checkbox, Image, Input, Modal, Radio } from 'antd'
import { FileCard } from '@ant-design/x'
import type { ChatMessage, ChatStatus, FunctionOperationBootstrap, MessagePart } from '../types'
import { MarkdownBlock } from './MarkdownBlock'
import { getUploadDownloadURL, submitAskUserQuestion, submitToolPermission } from '../lib/api'


interface MessageBubbleProps {
  message: ChatMessage
  status: ChatStatus
  messageKey: string | number
  sessionId?: string
}

type UserAttachmentPart = Extract<MessagePart, { fileUuid: string }>

export function MessageBubble({ message, status, messageKey, sessionId }: MessageBubbleProps) {
  const parts = visibleParts(message.parts)
  const isStreaming = status === 'loading' || status === 'updating'

  if (message.role === 'user') {
    const attachments = parts.filter(isUserAttachmentPart)
    const contentParts = parts.filter((part) => !isUserAttachmentPart(part))
    const bootstrap = findFunctionOperationBootstrap(contentParts)
    const hasMessageContent = contentParts.length > 0 || attachments.length === 0 || Boolean(message.content.trim())
    return (
      <div className="message-bubble-shell user">
        {attachments.length > 0 ? (
          <Image.PreviewGroup>
            <div className="user-message-attachments">
              {attachments.map((part) => renderUserAttachment(part, messageKey))}
            </div>
          </Image.PreviewGroup>
        ) : null}
        {bootstrap ? <FunctionOperationBootstrapCard bootstrap={bootstrap} /> : hasMessageContent ? (
          <div className="user-message-content">{renderUserParts(contentParts, message.content, messageKey)}</div>
        ) : null}
        <time>{formatTime(message.createdAt)}</time>
      </div>
    )
  }

  return (
    <div className="message-bubble-shell assistant">
      {shouldShowStreamingPlaceholder(message, parts, isStreaming) ? (
        <div className="streaming-placeholder" aria-live="polite">
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-text">生成中</span>
        </div>
      ) : null}

      {parts.map((part, index) => (
        <div key={`${messageKey}-${part.type}-${index}`} className="part">
          {part.type === 'text' ? (
            <MarkdownBlock
              content={part.text}
              streaming={isStreaming && isTrailingTextPart(parts, index)}
            />
          ) : null}

          {part.type === 'thinking' ? <ThinkingBlock part={part} /> : null}

          {part.type === 'tool' ? (
            part.status === 'waiting_permission' ? (
              <ToolPermissionRequest
                part={part}
                sessionId={sessionId || message.sessionId || ''}
              />
            ) : isAskUserQuestion(part) && part.status === 'waiting' ? (
              <AskUserQuestionCard
                part={part}
                sessionId={sessionId || message.sessionId || ''}
              />
            ) : (
            <details className={`collapsible-card tool-card ${part.status || ''}`}>
              <summary className="collapsible-header">
                <span className="summary-main">
                  <span className={`summary-icon tool-icon ${part.status === 'error' ? 'error' : ''}`}>
                    {part.status === 'error' ? '✕' : '✓'}
                  </span>
                  <strong title={part.toolName || '执行命令'}>{part.toolName || '执行命令'}</strong>
                </span>
                <span className="summary-side">
                  <span className="tool-state">{toolStatusLabel(part.status)}</span>
                  <span className="summary-tail" aria-hidden="true">
                    <DownOutlined />
                  </span>
                </span>
              </summary>
              {hasToolBody(part) ? (
                <div className="collapsible-panel tool-panel">
                  <div className="collapsible-body">
                    {part.input ? <MarkdownBlock content={formatToolBlock('输入', part.input)} /> : null}
                    {part.result ? <MarkdownBlock content={formatToolBlock('输出', part.result)} /> : null}
                  </div>
                </div>
              ) : null}
            </details>
            )
          ) : null}
        </div>
      ))}

      {shouldShowStreamingTail(message, parts, isStreaming) ? (
        <div className="streaming-placeholder streaming-placeholder-inline" aria-live="polite">
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-text">输出中</span>
        </div>
      ) : null}

      <div className="message-bubble-footer">
        <time>{formatTime(message.createdAt)}</time>
        {message.content ? (
          <Button
            type="text"
            size="small"
            className="message-copy-button"
            icon={<CopyOutlined />}
            onClick={() => navigator.clipboard.writeText(message.content).catch(() => undefined)}
          >
            复制
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FunctionOperationBootstrapCard({ bootstrap }: { bootstrap: FunctionOperationBootstrap }) {
  const Icon = bootstrap.conversation === 'product'
    ? FileTextOutlined
    : bootstrap.conversation === 'technical'
      ? CodeOutlined
      : CheckCircleOutlined

  return (
    <div className="function-operation-bootstrap-card">
      <div className="function-operation-bootstrap-header">
        <span className="function-operation-bootstrap-icon" aria-hidden="true"><Icon /></span>
        <div className="function-operation-bootstrap-heading">
          <strong>{bootstrap.title}</strong>
          <span>功能生成</span>
        </div>
      </div>
      <div className="function-operation-bootstrap-details">
        <div className="function-operation-bootstrap-row">
          <span>功能</span>
          <strong>{bootstrap.functionName}</strong>
        </div>
        {bootstrap.description ? (
          <div className="function-operation-bootstrap-description">
            <span>需求描述</span>
            <p>{bootstrap.description}</p>
          </div>
        ) : null}
      </div>
      <div className="function-operation-bootstrap-status">
        <CheckCircleOutlined />
        <span>已发起</span>
      </div>
    </div>
  )
}

function findFunctionOperationBootstrap(parts: MessagePart[]): FunctionOperationBootstrap | null {
  const part = parts.find((item) => item.type === 'function_operation_bootstrap')
  if (!part || part.type !== 'function_operation_bootstrap') {
    return null
  }
  try {
    const value = JSON.parse(part.text) as Partial<FunctionOperationBootstrap>
    if (
      (value.conversation !== 'product' && value.conversation !== 'technical' && value.conversation !== 'generation') ||
      typeof value.title !== 'string' ||
      typeof value.functionName !== 'string' ||
      typeof value.description !== 'string'
    ) {
      return null
    }
    return {
      conversation: value.conversation,
      title: value.title.trim(),
      functionName: value.functionName.trim(),
      description: value.description.trim(),
    }
  } catch {
    return null
  }
}

function ThinkingBlock({ part }: { part: Extract<MessagePart, { type: 'thinking' }> }) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (part.status !== 'running' || !bodyRef.current) {
      return
    }
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [part.status, part.text])

  return (
    <details className={`collapsible-card thinking-card ${part.status}`} open={part.status === 'running'}>
      <summary className="collapsible-header">
        <span className="summary-main">
          <span className="summary-icon thinking-icon">✣</span>
          <strong>{part.status === 'running' ? '思考中' : '已完成思考'}</strong>
        </span>
        <span className="summary-tail" aria-hidden="true">
          <DownOutlined />
        </span>
      </summary>
      <div className="collapsible-panel thinking-panel">
        <div ref={bodyRef} className="collapsible-body">
          <MarkdownBlock
            content={part.text || '_模型暂未返回思考摘要_'}
            streaming={part.status === 'running'}
          />
        </div>
      </div>
    </details>
  )
}

function formatToolBlock(title: string, content: string, fallback = '暂无内容') {
  const body = content.trim() || fallback
  return `#### ${title}\n\n\`\`\`text\n${body}\n\`\`\``
}

function hasToolBody(part: Extract<MessagePart, { type: 'tool' }>) {
  return Boolean((part.input || '').trim() || (part.result || '').trim())
}

function toolStatusLabel(status?: string) {
  if (status === 'error') {
    return 'Failed'
  }
  if (status === 'running') {
    return 'Running'
  }
  if (status === 'waiting') {
    return 'Waiting for your answer'
  }

  if (status === 'waiting_permission') {
    return 'Waiting for approval'
  }
  return 'Success'
}

function ToolPermissionRequest({
  part,
  sessionId,
}: {
  part: Extract<MessagePart, { type: 'tool' }>
  sessionId: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const title = part.toolTitle || part.toolName || '工具调用确认'
  const description = part.toolDescription || '此操作需要你的确认后才能执行。'

  async function decide(allow: boolean) {
    if (!sessionId || !part.toolId || submitting) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitToolPermission(
        sessionId,
        part.toolId,
        allow,
        allow ? '' : '用户拒绝执行此工具',
      )
      setSubmitted(true)
      setSubmitting(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交工具授权失败')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return <ToolPermissionPendingCard part={part} />
  }

  return (
    <Modal
      open
      centered
      title="确认工具调用"
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={[
        <Button key="deny" danger disabled={submitting || !sessionId} onClick={() => void decide(false)}>
          拒绝
        </Button>,
        <Button key="allow" type="primary" loading={submitting} disabled={!sessionId} onClick={() => void decide(true)}>
          允许执行
        </Button>,
      ]}
    >
      <section className="tool-permission-request" aria-label="工具调用确认">
        <div className="tool-permission-request-heading">
          <span className="summary-icon tool-icon">!</span>
          <div>
            <strong>{title}</strong>
            {part.toolName && part.toolName !== title ? <span>{part.toolName}</span> : null}
          </div>
        </div>
        <p>{description}</p>
        {part.input ? (
          <pre className="tool-permission-input">{formatToolPermissionInput(part.input)}</pre>
        ) : null}
        {error ? <p className="tool-permission-error">{error}</p> : null}
      </section>
    </Modal>
  )
}

function ToolPermissionPendingCard({ part }: { part: Extract<MessagePart, { type: 'tool' }> }) {
  return (
    <details className="collapsible-card tool-card running" open>
      <summary className="collapsible-header">
        <span className="summary-main">
          <span className="summary-icon tool-icon">✓</span>
          <strong>{part.toolName || '执行工具'}</strong>
        </span>
        <span className="summary-side">
          <span className="tool-state">已确认，执行中</span>
          <span className="summary-tail" aria-hidden="true">
            <DownOutlined />
          </span>
        </span>
      </summary>
      <div className="collapsible-panel tool-panel">
        <div className="collapsible-body">
          {part.input ? <MarkdownBlock content={formatToolBlock('输入', part.input)} /> : null}
        </div>
      </div>
    </details>
  )
}

function formatToolPermissionInput(input: string) {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return input
  }
}

interface AskUserQuestionOption {
  label: string
  description: string
}

interface AskUserQuestionItem {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect: boolean
}

function AskUserQuestionCard({
  part,
  sessionId,
}: {
  part: Extract<MessagePart, { type: 'tool' }>
  sessionId: string
}) {
  const questions = useMemo(() => parseAskUserQuestions(part.input), [part.input])
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({})
  const [response, setResponse] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)

  if (questions.length === 0) {
    return <ToolFallback part={part} />
  }

  const resolvedAnswers = questions.reduce<Record<string, string | string[]>>((result, question) => {
    const other = otherAnswers[question.question]?.trim()
    if (other) {
      result[question.question] = question.multiSelect
        ? [...selectedValues(answers[question.question]), other]
        : other
    } else if (answers[question.question]) {
      result[question.question] = answers[question.question]
    }
    return result
  }, {})
  const complete = questions.every((question) => hasAnswer(resolvedAnswers[question.question]))
  const currentQuestion = questions[Math.min(activeQuestionIndex, questions.length - 1)]
  const currentAnswer = resolvedAnswers[currentQuestion.question]
  const currentComplete = hasAnswer(currentAnswer)
  const isLastQuestion = activeQuestionIndex === questions.length - 1

  async function submit() {
    if (!sessionId || !part.toolId || !complete || submitting) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await submitAskUserQuestion(sessionId, part.toolId, resolvedAnswers, response.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交回答失败')
      setSubmitting(false)
    }
  }

  return (
    <section className="ask-user-question-card" aria-label="需要你的回答">
      <header className="ask-user-question-header">
        <span className="summary-icon tool-icon">?</span>
        <strong>需要你的回答</strong>
      </header>
      <div className="ask-user-question-body">
        <fieldset className="ask-user-question-item">
          <legend>
            <span>{currentQuestion.header}</span>
            {questions.length > 1 ? <small>问题 {activeQuestionIndex + 1}</small> : null}
          </legend>
          <p>{currentQuestion.question}</p>
          {currentQuestion.multiSelect ? (
            <Checkbox.Group
              value={selectedValues(answers[currentQuestion.question])}
              onChange={(values) => setAnswers((current) => ({ ...current, [currentQuestion.question]: values as string[] }))}
            >
              <QuestionOptions
                options={currentQuestion.options}
                multiSelect
                selectedValue={answers[currentQuestion.question]}
              />
            </Checkbox.Group>
          ) : (
            <Radio.Group
              value={typeof answers[currentQuestion.question] === 'string' ? answers[currentQuestion.question] : undefined}
              onChange={(event) => setAnswers((current) => ({ ...current, [currentQuestion.question]: event.target.value }))}
            >
              <QuestionOptions options={currentQuestion.options} selectedValue={answers[currentQuestion.question]} />
            </Radio.Group>
          )}
          <Input
            value={otherAnswers[currentQuestion.question] || ''}
            onChange={(event) => setOtherAnswers((current) => ({ ...current, [currentQuestion.question]: event.target.value }))}
            placeholder="其他答案（可选）"
            className="ask-user-question-other"
          />
        </fieldset>

        {questions.length > 1 ? (
          <div className="ask-user-question-navigation">
            <Button
              icon={<LeftOutlined />}
              disabled={activeQuestionIndex === 0 || submitting}
              onClick={() => setActiveQuestionIndex((current) => Math.max(0, current - 1))}
            >
              上一题
            </Button>
            <span>{activeQuestionIndex + 1} / {questions.length}</span>
            {!isLastQuestion ? (
              <Button
                type="primary"
                icon={<RightOutlined />}
                iconPosition="end"
                disabled={!currentComplete || submitting}
                onClick={() => setActiveQuestionIndex((current) => Math.min(questions.length - 1, current + 1))}
              >
                下一题
              </Button>
            ) : <span className="ask-user-question-navigation-spacer" />}
          </div>
        ) : null}

        {isLastQuestion ? (
          <>
            <Input.TextArea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder="补充说明（可选）"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            {error ? <p className="ask-user-question-error">{error}</p> : null}
            <Button type="primary" loading={submitting} disabled={!complete || !sessionId} onClick={() => void submit()}>
              提交回答
            </Button>
          </>
        ) : null}
      </div>
    </section>
  )
}

function QuestionOptions({
  options,
  multiSelect = false,
  selectedValue,
}: {
  options: AskUserQuestionOption[]
  multiSelect?: boolean
  selectedValue?: string | string[]
}) {
  return options.map((option) => {
    const selected = multiSelect
      ? selectedValues(selectedValue).includes(option.label)
      : selectedValue === option.label
    const label = <span className="ask-user-question-option-label">{option.label}</span>
    return (
      <div key={option.label} className={`ask-user-question-option${selected ? ' is-selected' : ''}`}>
        {multiSelect ? <Checkbox value={option.label}>{label}</Checkbox> : <Radio value={option.label}>{label}</Radio>}
        {option.description ? <span className="ask-user-question-option-description">{option.description}</span> : null}
      </div>
    )
  })
}

function ToolFallback({ part }: { part: Extract<MessagePart, { type: 'tool' }> }) {
  return (
    <details className="collapsible-card tool-card waiting" open>
      <summary className="collapsible-header">
        <span className="summary-main"><span className="summary-icon tool-icon">?</span><strong>AskUserQuestion</strong></span>
        <span className="tool-state">Waiting for your answer</span>
      </summary>
      <div className="collapsible-panel tool-panel"><div className="collapsible-body"><MarkdownBlock content={formatToolBlock('输入', part.input || '')} /></div></div>
    </details>
  )
}

function parseAskUserQuestions(input?: string): AskUserQuestionItem[] {
  if (!input) {
    return []
  }
  try {
    const data = JSON.parse(input) as { questions?: unknown }
    if (!Array.isArray(data.questions)) {
      return []
    }
    return data.questions.flatMap((item) => {
      const value = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const question = typeof value.question === 'string' ? value.question : ''
      const header = typeof value.header === 'string' ? value.header : ''
      const options = Array.isArray(value.options)
        ? value.options.flatMap((option) => {
            const record = option && typeof option === 'object' ? option as Record<string, unknown> : {}
            const label = typeof record.label === 'string' ? record.label : ''
            const description = typeof record.description === 'string' ? record.description : ''
            return label ? [{ label, description }] : []
          })
        : []
      return question && header && options.length > 0
        ? [{ question, header, options, multiSelect: value.multiSelect === true }]
        : []
    })
  } catch {
    return []
  }
}

function selectedValues(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function hasAnswer(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim())
}

function isAskUserQuestion(part: Extract<MessagePart, { type: 'tool' }>) {
  return part.toolName === 'AskUserQuestion'
}

function visibleParts(parts: MessagePart[]) {
  return parts
    .map((part) => part)
    .filter((part) => {
      if (part.type === 'text') {
        return Boolean(part.text)
      }
      if (part.type === 'tool') {
        return !isTaskTool(part.toolName)
      }
      return true
    })
}

function renderUserParts(parts: MessagePart[], fallbackContent: string, messageKey: string | number) {
  const userParts = parts.filter(isVisibleUserPart)
  if (userParts.length === 0) {
    return <span className="user-message-text-part">{fallbackContent}</span>
  }

  return userParts.map((part, index) => {
    if (part.type === 'skill' || part.type === 'mcp' || part.type === 'function_skill') {
      const id = part.type === 'mcp' ? part.mcpId : part.skillId
      return (
        <span
          key={`${messageKey}-${part.type}-${id}-${index}`}
          className="user-message-skill-token"
        >
          {part.label}
        </span>
      )
    }
    if (part.type !== 'text') {
      return null
    }
    return (
      <span key={`${messageKey}-text-${index}`} className="user-message-text-part">
        {part.text}
      </span>
    )
  })
}

function renderUserAttachment(
  part: UserAttachmentPart,
  messageKey: string | number,
) {
  if (part.type === 'image') {
    return (
      <span
        key={`${messageKey}-image-${part.fileUuid}`}
        className="user-message-image-attachment"
        title={part.fileName}
      >
        <Image src={part.fileUrl} alt={part.fileName} preview />
      </span>
    )
  }
  return <UserMessageFileAttachment key={`${messageKey}-file-${part.fileUuid}`} part={part} />
}

function UserMessageFileAttachment({
  part,
}: {
  part: UserAttachmentPart
}) {
  const [downloading, setDownloading] = useState(false)

  async function download() {
    if (downloading) {
      return
    }
    setDownloading(true)
    try {
      const downloadURL = await getUploadDownloadURL(part.fileUuid, part.fileName)
      const anchor = document.createElement('a')
      anchor.href = downloadURL
      anchor.download = part.fileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch {
      // The download button remains available for a retry when the URL request fails.
    } finally {
      setDownloading(false)
    }
  }

  return (
    <FileCard
      name={part.fileName}
      byte={part.fileSize}
      size="small"
      rootClassName="user-message-file-attachment"
      mask={(
        <button
          type="button"
          className="user-message-file-download"
          aria-label={`下载 ${part.fileName}`}
          title={downloading ? '准备下载中' : '下载'}
          disabled={downloading}
          onClick={() => void download()}
        >
          <DownloadOutlined />
        </button>
      )}
    />
  )
}

function isUserAttachmentPart(
  part: MessagePart,
): part is UserAttachmentPart {
  return part.type === 'file' || part.type === 'image' || part.type === 'document'
}

function isVisibleUserPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: 'skill' | 'mcp' | 'function_skill' | 'text' | 'file' | 'image' | 'document' }> {
  return part.type === 'skill' || part.type === 'mcp' || part.type === 'function_skill' || part.type === 'file' || part.type === 'image' || part.type === 'document' || (part.type === 'text' && Boolean(part.text))
}

function isTaskTool(toolName?: string) {
  return typeof toolName === 'string' && toolName.startsWith('Task')
}

function shouldShowStreamingPlaceholder(message: ChatMessage, parts: MessagePart[], isStreaming: boolean) {
  return message.role === 'assistant' && isStreaming && parts.length === 0
}

function shouldShowStreamingTail(message: ChatMessage, parts: MessagePart[], isStreaming: boolean) {
  if (!(message.role === 'assistant' && isStreaming) || parts.length === 0) {
    return false
  }
  const hasStreamingText = parts.some((part) => part.type === 'text')
  const hasStreamingThinking = parts.some(
    (part) => part.type === 'thinking' && part.status === 'running',
  )
  return !(hasStreamingText || hasStreamingThinking)
}

function isTrailingTextPart(parts: MessagePart[], index: number) {
  if (parts[index]?.type !== 'text') {
    return false
  }
  for (let cursor = parts.length - 1; cursor >= 0; cursor -= 1) {
    if (parts[cursor]?.type === 'text') {
      return cursor === index
    }
  }
  return false
}

function formatTime(value: number) {
  const milliseconds = value > 9_999_999_999 ? Math.floor(value / 1000) : value * 1000
  const date = new Date(milliseconds || Date.now())
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  return new Intl.DateTimeFormat('zh-CN', isToday
    ? {
        hour: '2-digit',
        minute: '2-digit',
      }
    : {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
}
