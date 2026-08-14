import { FileTextOutlined } from '@ant-design/icons'
import { Empty } from 'antd'
import { MarkdownBlock } from '../../components/MarkdownBlock'

interface FunctionDocumentViewerProps {
  content: string
  placeholder: string
}

export function FunctionDocumentViewer({ content, placeholder }: FunctionDocumentViewerProps) {
  const trimmed = content.trim()

  if (!trimmed) {
    return (
      <div className="func-doc-viewer func-doc-empty">
        <Empty
          image={<FileTextOutlined className="func-doc-empty-icon" />}
          description={placeholder}
        />
      </div>
    )
  }

  return (
    <div className="func-doc-viewer">
      <div className="func-doc-viewer-body">
        <MarkdownBlock content={trimmed} />
      </div>
    </div>
  )
}
