import type { ReactNode } from 'react'
import './FuncEditorChat.css'

interface FuncEditorChatProps {
  children: ReactNode
}

/**
 * 编辑器对话框容器组件
 * 作用：隔离对话框组件样式，防止影响外层网格布局
 */
export function FuncEditorChat({ children }: FuncEditorChatProps) {
  return (
    <div className="func-editor-chat-wrapper">
      <div className="func-editor-chat-inner">
        {children}
      </div>
    </div>
  )
}
