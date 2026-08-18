import { memo } from 'react'
import { XMarkdown } from '@ant-design/x-markdown'

interface MarkdownBlockProps {
  content: string
  streaming?: boolean
}

export const MarkdownBlock = memo(function MarkdownBlock({ content, streaming = false }: MarkdownBlockProps) {
  return (
    <div className={`markdown-shell${streaming ? ' streaming' : ''}`}>
      <XMarkdown
        content={content || ''}
        rootClassName="markdown-body"
      />
    </div>
  )
})
