import { ReloadOutlined } from '@ant-design/icons'

interface AttachmentUploadStatusProps {
  onRetry: () => void
  disabled?: boolean
}

export function AttachmentUploadStatus({ onRetry, disabled = false }: AttachmentUploadStatusProps) {
  return (
    <span className="attachment-upload-status">
      <span className="attachment-upload-status-label">上传失败</span>
      <button
        type="button"
        className="attachment-upload-status-retry"
        aria-label="重试上传"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onRetry()
        }}
      >
        <ReloadOutlined />
        <span>重试</span>
      </button>
    </span>
  )
}
