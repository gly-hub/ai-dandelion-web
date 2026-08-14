import type { ReactNode } from 'react'
import './FuncEditorContent.css'

type EditorStep = 'product' | 'technical' | 'code' | 'preview'

interface FuncEditorContentProps {
  step: EditorStep
  children: ReactNode
}

/**
 * 编辑器内容容器组件
 * 作用：隔离子组件样式，防止影响外层网格布局
 */
export function FuncEditorContent({ step, children }: FuncEditorContentProps) {
  const isPreviewMode = step === 'preview'

  return (
    <div className={`func-editor-content-wrapper${isPreviewMode ? ' is-preview' : ''}`}>
      <div className="func-editor-content-inner">
        {children}
      </div>
    </div>
  )
}
