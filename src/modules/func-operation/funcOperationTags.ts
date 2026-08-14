export const DOCUMENT_READY_TAG_NAME = 'func-operation-document-ready'
export const DOCUMENT_FAILED_TAG_NAME = 'func-operation-document-failed'
export const GENERATED_APP_READY_TAG_NAME = 'func-operation-generated-app-ready'
export const GENERATED_APP_FAILED_TAG_NAME = 'func-operation-generated-app-failed'

const LEGACY_DOCUMENT_READY_TAG_PREFIX = '[[FUNC_OPERATION_DOCUMENT_READY:'
const LEGACY_DOCUMENT_FAILED_TAG_PREFIX = '[[FUNC_OPERATION_DOCUMENT_FAILED:'
const LEGACY_GENERATED_APP_READY_TAG_PREFIX = '[[FUNC_OPERATION_GENERATED_APP_READY:'
const LEGACY_GENERATED_APP_FAILED_TAG_PREFIX = '[[FUNC_OPERATION_GENERATED_APP_FAILED:'
const LEGACY_FUNC_OPERATION_TAG_PATTERN = /\[\[FUNC_OPERATION_[^\]]+\]\]/g
const FUNC_OPERATION_XML_TAG_PATTERN = /<func-operation-[\w-]+\b[^>]*(?:\/>|>[\s\S]*?<\/func-operation-[\w-]+>)/gi

export type PlanningDocType = 'product' | 'technical'

export interface DocumentReadyTag {
  functionId: string
  docType: PlanningDocType
}

export interface DocumentFailedTag {
  functionId: string
  docType: PlanningDocType
}

export function buildDocumentReadyTag(functionId: string, docType: PlanningDocType) {
  return `<${DOCUMENT_READY_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" doc-type="${docType}" />`
}

export function buildDocumentFailedTag(functionId: string, docType: PlanningDocType) {
  return `<${DOCUMENT_FAILED_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" doc-type="${docType}" />`
}

export function buildGeneratedAppReadyTag(functionId: string) {
  return `<${GENERATED_APP_READY_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" />`
}

export function buildGeneratedAppFailedTag(functionId: string) {
  return `<${GENERATED_APP_FAILED_TAG_NAME} function-id="${escapeXmlAttribute(functionId)}" />`
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

export function extractDocumentFailedTag(content: string): DocumentFailedTag | null {
  const xmlTag = readXmlTagAttributes(content, DOCUMENT_FAILED_TAG_NAME)
  if (xmlTag?.['function-id'] && isPlanningDocType(xmlTag['doc-type'])) {
    return { functionId: xmlTag['function-id'], docType: xmlTag['doc-type'] }
  }
  return extractLegacyDocumentTag(content, LEGACY_DOCUMENT_FAILED_TAG_PREFIX)
}

export function extractGeneratedAppReadyFunctionId(content: string) {
  const xmlTag = readXmlTagAttributes(content, GENERATED_APP_READY_TAG_NAME)
  if (xmlTag?.['function-id']) {
    return xmlTag['function-id']
  }
  return extractLegacyFunctionId(content, LEGACY_GENERATED_APP_READY_TAG_PREFIX)
}

export function extractGeneratedAppFailedFunctionId(content: string) {
  const xmlTag = readXmlTagAttributes(content, GENERATED_APP_FAILED_TAG_NAME)
  if (xmlTag?.['function-id']) {
    return xmlTag['function-id']
  }
  return extractLegacyFunctionId(content, LEGACY_GENERATED_APP_FAILED_TAG_PREFIX)
}

export function extractConversationFailureMessage(content: string, fallback: string) {
  const cleaned = stripFuncOperationTags(content)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned || fallback
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
  conversation: 'product' | 'technical' | 'generation',
): boolean {
  if (conversation === 'generation') {
    const readyId = extractGeneratedAppReadyFunctionId(content)
    if (readyId) {
      return readyId === functionId
    }
    return extractGeneratedAppFailedFunctionId(content) === functionId
  }

  const ready = extractDocumentReadyTag(content)
  if (ready?.functionId === functionId && ready.docType === conversation) {
    return true
  }
  const failed = extractDocumentFailedTag(content)
  return failed?.functionId === functionId && failed.docType === conversation
}

function isPlanningDocType(value: string | undefined): value is PlanningDocType {
  return value === 'product' || value === 'technical'
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
