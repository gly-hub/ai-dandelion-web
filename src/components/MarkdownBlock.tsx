import { XMarkdown } from '@ant-design/x-markdown'

interface MarkdownBlockProps {
  content: string
  streaming?: boolean
}

export function MarkdownBlock({ content, streaming = false }: MarkdownBlockProps) {
  return (
    <div className={`markdown-shell${streaming ? ' streaming' : ''}`}>
      <XMarkdown
        content={content || ''}
        streaming={{ hasNextChunk: streaming }}
        rootClassName="markdown-body"
      />
    </div>
  )
}
