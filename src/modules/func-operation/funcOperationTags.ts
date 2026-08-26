export const DOCUMENT_READY_TAG_NAME = 'func-operation-document-ready'
export const GENERATED_APP_READY_TAG_NAME = 'func-operation-generated-app-ready'
export const CONTINUE_TAG_NAME = 'func-operation-continue'

const LEGACY_DOCUMENT_READY_TAG_PREFIX = '[[FUNC_OPERATION_DOCUMENT_READY:'
const LEGACY_GENERATED_APP_READY_TAG_PREFIX = '[[FUNC_OPERATION_GENERATED_APP_READY:'
const LEGACY_FUNC_OPERATION_TAG_PATTERN = /\[\[FUNC_OPERATION_[^\]]+\]\]/g
const FUNC_OPERATION_XML_TAG_PATTERN = /<func-operation-[\w-]+\b[^>]*(?:\/>|>[\s\S]*?<\/func-operation-[\w-]+>)/gi

export type PlanningDocType = 'product' | 'technical'
export type FunctionConversationType = PlanningDocType | 'generation'

export interface DocumentReadyTag {
  functionId: string
  docType: PlanningDocType
}

export interface ContinueTag {
  functionId: string
  conversation: FunctionConversationType
}

export function buildDocumentReadyTag(functionId: string, docType: PlanningDocType) {
  return `<${DOCUMENT_READY_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" doc-type="${docType}" />`
}

export function buildGeneratedAppReadyTag(functionId: string) {
  return `<${GENERATED_APP_READY_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" />`
}

export function buildContinueTag(functionId: string, conversation: FunctionConversationType) {
  return `<${CONTINUE_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" conversation="${conversation}" />`
}

export function stripFuncOperationTags(content: string) {
  return content
    .replace(FUNC_OPERATION_XML_TAG_PATTERN, '')
    .replace(LEGACY_FUNC_OPERATION_TAG_PATTERN, '')
    .trim()
}

export function extractDocumentReadyTag(content: string): DocumentReadyTag | null {
  const xmlTag = readXmlTagAttributes(content, DOCUMENT_READY_TAG_NAME)
  if (xmlTag?.['function-id'] && isPlanningDocType(xmlTag['doc-type'])) {
    return { functionId: xmlTag['function-id'], docType: xmlTag['doc-type'] }
  }
  return extractLegacyDocumentTag(content, LEGACY_DOCUMENT_READY_TAG_PREFIX)
}

export function extractGeneratedAppReadyFunctionId(content: string) {
  const xmlTag = readXmlTagAttributes(content, GENERATED_APP_READY_TAG_NAME)
  if (xmlTag?.['function-id']) {
    return xmlTag['function-id']
  }
  return extractLegacyFunctionId(content, LEGACY_GENERATED_APP_READY_TAG_PREFIX)
}

export function extractContinueTag(content: string): ContinueTag | null {
  const xmlTag = readXmlTagAttributes(content, CONTINUE_TAG_NAME)
  if (xmlTag?.['function-id'] && isFunctionConversationType(xmlTag.conversation)) {
    return { functionId: xmlTag['function-id'], conversation: xmlTag.conversation }
  }
  return null
}

interface AssistantMessageLike {
  id: string | number
  message: {
    role: string
    content: string
  }
}

export function findLatestAssistantMessage<T extends AssistantMessageLike>(messages: T[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (item?.message.role === 'assistant') {
      return item
    }
  }
  return null
}

export function findLatestTurnAssistantMessage<T extends AssistantMessageLike>(messages: T[]) {
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.message.role === 'user') {
      latestUserIndex = index
      break
    }
  }
  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    const item = messages[index]
    if (item?.message.role === 'assistant') {
      return item
    }
  }
  return null
}

export function conversationTurnHasOutcomeTag(
  content: string,
  functionId: string,
  conversation: FunctionConversationType,
): boolean {
  if (conversation === 'generation') {
    return extractGeneratedAppReadyFunctionId(content) === functionId
  }

  const ready = extractDocumentReadyTag(content)
  if (ready?.functionId === functionId && ready.docType === conversation) {
    return true
  }
  return false
}

export function conversationTurnNeedsContinue(
  content: string,
  functionId: string,
  conversation: FunctionConversationType,
): boolean {
  const tag = extractContinueTag(content)
  return tag?.functionId === functionId && tag.conversation === conversation
}

function isPlanningDocType(value: string | undefined): value is PlanningDocType {
  return value === 'product' || value === 'technical'
}

function isFunctionConversationType(value: string | undefined): value is FunctionConversationType {
  return value === 'product' || value === 'technical' || value === 'generation'
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function readXmlTagAttributes(content: string, tagName: string): Record<string, string> | null {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)(?:/>|>\\s*</${tagName}>)`, 'i')
  const match = content.match(pattern)
  if (!match?.[1]) {
    return null
  }
  const attrs: Record<string, string> = {}
  const attrPattern = /([\w-]+)\s*=\s*"([^"]*)"/g
  let attrMatch = attrPattern.exec(match[1])
  while (attrMatch) {
    attrs[attrMatch[1]] = attrMatch[2]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    attrMatch = attrPattern.exec(match[1])
  }
  return Object.keys(attrs).length > 0 ? attrs : null
}

function extractLegacyDocumentTag(content: string, prefix: string): DocumentReadyTag | null {
  const start = content.indexOf(prefix)
  if (start < 0) {
    return null
  }
  const valueStart = start + prefix.length
  const valueEnd = content.indexOf(']]', valueStart)
  if (valueEnd < 0) {
    return null
  }
  const parts = content.slice(valueStart, valueEnd).trim().split(':')
  if (parts.length !== 2) {
    return null
  }
  const [functionId, docType] = parts
  if (!isPlanningDocType(docType) || !functionId) {
    return null
  }
  return { functionId, docType }
}

function extractLegacyFunctionId(content: string, prefix: string) {
  const start = content.indexOf(prefix)
  if (start < 0) {
    return ''
  }
  const idStart = start + prefix.length
  const idEnd = content.indexOf(']]', idStart)
  if (idEnd < 0) {
    return ''
  }
  return content.slice(idStart, idEnd).trim()
}
