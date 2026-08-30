import type { FunctionNextAction, FunctionReadiness, OperationFunction } from '../../types'

const FUNCTION_STATUS_PUBLISHED = 'published'
const FUNCTION_WORKFLOW_STAGE_CODE_GENERATION = 'codeGeneration'
const FUNCTION_WORKFLOW_STAGE_CODE_GENERATED = 'code_generated'

export const NEXT_ACTION_LABELS: Record<FunctionNextAction, string> = {
  generate_product_doc: '生成产品方案',
  adopt_product_doc: '采用此产品方案',
  generate_technical_doc: '生成技术方案',
  adopt_technical_doc: '采用此技术方案',
  generate_page: '生成页面',
  preview_latest_page: '预览最新版本',
  refresh_and_preview: '刷新并预览',
  adopt_latest_page: '采用最新页面',
  publish_function: '发布功能',
  open_published_function: '打开功能',
}

export type PlanningEditorStep = 'product' | 'technical' | 'code' | 'preview'

export function canShowAdoptDraftButton(
  functionItem: OperationFunction,
  docType: 'product' | 'technical',
): boolean {
  if (docType === 'product') {
    return functionItem.productDraftReady
  }
  return functionItem.technicalDraftReady
}

export function canGenerateProductDoc(functionItem: OperationFunction): boolean {
  return functionItem.productDocVersion === 0
}

export function canGenerateTechnicalDoc(functionItem: OperationFunction): boolean {
  return functionItem.technicalDocVersion === 0 || functionItem.technicalStale
}

export function hasGenerationConversationStarted(
  functionItem: OperationFunction,
  openedGenerationIds: string[],
): boolean {
  return openedGenerationIds.includes(functionItem.id)
}

export function hasGeneratedPage(functionItem: OperationFunction): boolean {
  return Boolean(functionItem.generatedAppId?.trim() && functionItem.codeVersion > 0)
}

export function shouldShowRefreshAndPreview(
  functionItem: OperationFunction,
  generationPreviewReadyIds: string[],
): boolean {
  if (functionItem.codeStale) {
    return false
  }
  if (generationPreviewReadyIds.includes(functionItem.id)) {
    return true
  }
  if (functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE_CODE_GENERATED) {
    return true
  }
  // Legacy records: page finished while workflow still stayed on code_generation.
  if (
    functionItem.codeVersion > 0
    && functionItem.workflowStage === FUNCTION_WORKFLOW_STAGE_CODE_GENERATION
  ) {
    return true
  }
  return false
}

export interface StepPrimaryActionOptions {
  openedGenerationIds?: string[]
  generationPreviewReadyIds?: string[]
}

export function resolveStepPrimaryAction(
  functionItem: OperationFunction,
  editorStep: PlanningEditorStep,
  options?: StepPrimaryActionOptions,
): FunctionNextAction | '' {
  const openedGenerationIds = options?.openedGenerationIds ?? []
  const generationPreviewReadyIds = options?.generationPreviewReadyIds ?? []
  const generationStarted = hasGenerationConversationStarted(functionItem, openedGenerationIds)

  switch (editorStep) {
    case 'product':
      if (functionItem.productDraftReady) {
        return 'adopt_product_doc'
      }
      return canGenerateProductDoc(functionItem) ? 'generate_product_doc' : ''
    case 'technical':
      if (functionItem.technicalDraftReady) {
        return 'adopt_technical_doc'
      }
      if (functionItem.technicalStale) {
        return 'generate_technical_doc'
      }
      return canGenerateTechnicalDoc(functionItem) ? 'generate_technical_doc' : ''
    case 'code':
      if (functionItem.codeStale) {
        return 'generate_page'
      }
      if (shouldShowRefreshAndPreview(functionItem, generationPreviewReadyIds)) {
        return 'refresh_and_preview'
      }
      if (hasGeneratedPage(functionItem)) {
        return 'refresh_and_preview'
      }
      if (generationStarted) {
        return ''
      }
      return 'generate_page'
    case 'preview':
      return ''
    default:
      return ''
  }
}

export function resolveFunctionReadiness(functionItem: OperationFunction): FunctionReadiness {
  if (functionItem.readiness?.label) {
    return {
      label: functionItem.readiness.label,
      nextAction: functionItem.readiness.nextAction || '',
      blockingReason: functionItem.readiness.blockingReason || '',
      hasPendingProductDraft: Boolean(functionItem.readiness.hasPendingProductDraft),
      hasPendingTechnicalDraft: Boolean(functionItem.readiness.hasPendingTechnicalDraft),
      hasPendingCodeDraft: false,
    }
  }

  return buildFallbackReadiness(functionItem)
}

function buildFallbackReadiness(functionItem: OperationFunction): FunctionReadiness {
  const readiness: FunctionReadiness = {
    label: '待完善产品方案',
    nextAction: 'generate_product_doc',
    blockingReason: '',
    hasPendingProductDraft: functionItem.productDraftReady,
    hasPendingTechnicalDraft: functionItem.technicalDraftReady,
    hasPendingCodeDraft: false,
  }

  if (functionItem.productDocVersion === 0) {
    readiness.label = '待完善产品方案'
    readiness.nextAction = functionItem.productDraftReady ? 'adopt_product_doc' : 'generate_product_doc'
    return readiness
  }

  if (functionItem.productDraftReady) {
    readiness.label = '待确认产品方案'
    readiness.nextAction = 'adopt_product_doc'
    return readiness
  }

  if (functionItem.technicalDraftReady) {
    readiness.label = '待确认技术方案'
    readiness.nextAction = 'adopt_technical_doc'
    return readiness
  }

  if (functionItem.technicalDocVersion === 0 || functionItem.technicalStale) {
    readiness.label = '待完善技术方案'
    if (functionItem.technicalStale) {
      readiness.blockingReason = '产品方案已更新，技术方案需要同步'
      readiness.nextAction = 'generate_technical_doc'
      return readiness
    }
    readiness.nextAction = 'generate_technical_doc'
    return readiness
  }

  if (functionItem.codeStale) {
    readiness.label = '待生成页面'
    readiness.blockingReason = '技术方案已更新，页面需要重新生成'
    readiness.nextAction = 'generate_page'
    return readiness
  }

  if (!hasGeneratedPage(functionItem)) {
    readiness.label = '待生成页面'
    readiness.nextAction = 'generate_page'
    return readiness
  }

  if (functionItem.status === FUNCTION_STATUS_PUBLISHED) {
    if (functionItem.productDraftReady || functionItem.technicalDraftReady) {
      readiness.label = '已发布'
      readiness.blockingReason = '发布后有新改动，尚未采用'
      readiness.nextAction = functionItem.technicalDraftReady ? 'adopt_technical_doc' : 'adopt_product_doc'
      return readiness
    }
    readiness.label = '已发布'
    readiness.nextAction = 'open_published_function'
    return readiness
  }

  readiness.label = '页面已就绪'
  readiness.nextAction = 'publish_function'
  return readiness
}

export function getNextActionLabel(action: FunctionNextAction | '', functionItem?: OperationFunction): string {
  if (action === 'generate_technical_doc' && functionItem?.technicalStale) {
    return '重新生成技术方案'
  }
  if (action === 'generate_page' && functionItem?.codeStale) {
    return '重新生成页面'
  }
  if (!action) {
    return '继续'
  }
  return NEXT_ACTION_LABELS[action] || '继续'
}

export function readinessStepFromAction(action: FunctionNextAction | ''): 'product' | 'technical' | 'code' | 'preview' | 'publish' {
  switch (action) {
    case 'generate_product_doc':
    case 'adopt_product_doc':
      return 'product'
    case 'generate_technical_doc':
    case 'adopt_technical_doc':
      return 'technical'
    case 'generate_page':
      return 'code'
    case 'preview_latest_page':
    case 'refresh_and_preview':
    case 'adopt_latest_page':
      return 'preview'
    case 'publish_function':
    case 'open_published_function':
      return 'publish'
    default:
      return 'product'
  }
}
