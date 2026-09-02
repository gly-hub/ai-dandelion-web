import { memo } from 'react'
import { Image } from 'antd'
import { XMarkdown, type ComponentProps } from '@ant-design/x-markdown'

interface MarkdownBlockProps {
  content: string
  streaming?: boolean
}

type MarkdownImageProps = ComponentProps<{
  src?: string
  alt?: string
  title?: string
}>

const MarkdownImage = memo(function MarkdownImage({ src, alt, title }: MarkdownImageProps) {
  if (!src) return null
  return <Image className="markdown-image" src={src} alt={alt || ''} title={title} preview />
})

const markdownComponents = {
  img: MarkdownImage,
}

export const MarkdownBlock = memo(function MarkdownBlock({ content, streaming = false }: MarkdownBlockProps) {
  return (
    <div className={`markdown-shell${streaming ? ' streaming' : ''}`}>
      <XMarkdown
        content={content || ''}
        rootClassName="markdown-body"
        components={markdownComponents}
      />
    </div>
  )
})
