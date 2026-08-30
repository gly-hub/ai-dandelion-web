import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { InboxOutlined, PaperClipOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { Attachments } from '@ant-design/x'
import type { MessagePart } from '../../types'
import { getClipboardImageFile } from '../../lib/clipboardAttachment'
import { uploadChatFile } from '../../lib/api'

interface PendingReferenceAttachment {
  uid: string
  fileUuid?: string
  name: string
  size: number
  type: string
  url?: string
  thumbUrl?: string
  percent: number
  status: 'uploading' | 'done'
}

interface InitialProductDocumentModalProps {
  open: boolean
  functionName: string
  loading?: boolean
  onCancel: () => void
  onStart: (attachments: MessagePart[]) => Promise<boolean>
}

function revokeAttachmentPreview(attachment: PendingReferenceAttachment) {
  if (attachment.url?.startsWith('blob:')) {
    URL.revokeObjectURL(attachment.url)
  }
}

export function InitialProductDocumentModal({
  open,
  functionName,
  loading = false,
  onCancel,
  onStart,
}: InitialProductDocumentModalProps) {
  const [attachments, setAttachments] = useState<MessagePart[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingReferenceAttachment[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pendingAttachmentsRef = useRef<PendingReferenceAttachment[]>([])
  const uploadSeedRef = useRef(0)
  const dropContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach(revokeAttachmentPreview)
  }, [])

  useEffect(() => {
    if (!open) {
      clearAttachments()
    }
  }, [open])

  async function handleAttachmentUpload(file: File) {
    if (file.size > 16 * 1024 * 1024) {
      setUploadError('参考资料最大支持 16 MiB')
      return false
    }
    const isImage = file.type.startsWith('image/')
    const uid = `product-reference-${Date.now()}-${uploadSeedRef.current++}`
    const localPreviewURL = isImage ? URL.createObjectURL(file) : undefined
    setPendingAttachments((current) => [...current, {
      uid,
      name: file.name,
      size: file.size,
      type: file.type,
      url: localPreviewURL,
      thumbUrl: localPreviewURL,
      percent: 0,
      status: 'uploading',
    }])
    setUploadError('')
    setUploadingAttachment(true)
    try {
      const uploaded = await uploadChatFile(file, (percent) => {
        setPendingAttachments((current) => current.map((attachment) => (
          attachment.uid === uid
            ? { ...attachment, percent: Math.max(attachment.percent, percent) }
            : attachment
        )))
      })
      const fileUrl = uploaded.url
      if (!fileUrl) {
        throw new Error('附件预览地址缺失')
      }
      const type: Extract<MessagePart, { fileUuid: string }>['type'] = uploaded.contentType.startsWith('image/')
        ? 'image'
        : uploaded.contentType === 'application/pdf' ? 'document' : 'file'
      setAttachments((current) => [...current, {
        type,
        fileUuid: uploaded.uuid,
        fileName: file.name,
        contentType: uploaded.contentType,
        fileSize: file.size,
        md5: uploaded.md5 || '',
        fileUrl,
      }])
      setPendingAttachments((current) => current.map((attachment) => (
        attachment.uid === uid
          ? { ...attachment, fileUuid: uploaded.uuid, percent: 100, status: 'done' }
          : attachment
      )))
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '附件上传失败')
      setPendingAttachments((current) => current.filter((attachment) => attachment.uid !== uid))
      if (localPreviewURL) {
        URL.revokeObjectURL(localPreviewURL)
      }
    } finally {
      setUploadingAttachment(false)
    }
    return false
  }

  function removeAttachment(uid: string) {
    const attachment = pendingAttachments.find((item) => item.uid === uid)
    if (!attachment) {
      return
    }
    revokeAttachmentPreview(attachment)
    setPendingAttachments((current) => current.filter((item) => item.uid !== uid))
    if (attachment.fileUuid) {
      setAttachments((current) => current.filter((part) => !('fileUuid' in part) || part.fileUuid !== attachment.fileUuid))
    }
  }

  function clearAttachments() {
    pendingAttachmentsRef.current.forEach(revokeAttachmentPreview)
    pendingAttachmentsRef.current = []
    setPendingAttachments([])
    setAttachments([])
    setUploadError('')
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = getClipboardImageFile(event.clipboardData)
    if (!file || loading || submitting || uploadingAttachment) {
      return
    }
    event.preventDefault()
    void handleAttachmentUpload(file)
  }

  async function handleStart() {
    if (loading || submitting || uploadingAttachment) {
      return
    }
    setSubmitting(true)
    try {
      if (await onStart(attachments)) {
        clearAttachments()
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    if (loading || submitting || uploadingAttachment) {
      return
    }
    clearAttachments()
    onCancel()
  }

  return (
    <Modal
      open={open}
      title="生成产品方案"
      width={560}
      okText="开始生成"
      cancelText="取消"
      confirmLoading={loading || submitting}
      okButtonProps={{ disabled: uploadingAttachment }}
      cancelButtonProps={{ disabled: loading || submitting || uploadingAttachment }}
      onOk={() => void handleStart()}
      onCancel={handleCancel}
    >
      <div ref={dropContainerRef} className="initial-product-document-modal" onPaste={handlePaste}>
        <p className="initial-product-document-copy">
          可添加现有的需求说明、产品文档或截图，AI 会在生成方案前先阅读这些资料。
        </p>
        <section className="initial-product-document-reference-area" aria-label="参考资料">
          <Attachments
            rootClassName="initial-product-document-uploader"
            beforeUpload={handleAttachmentUpload}
            disabled={loading || submitting || uploadingAttachment}
            getDropContainer={() => dropContainerRef.current}
            placeholder={{
              icon: <InboxOutlined />,
              title: '拖入资料即可添加',
              description: '支持点击上传或粘贴截图，单个文件最大 16 MiB',
            }}
          >
            <Button icon={<PaperClipOutlined />} disabled={loading || submitting || uploadingAttachment}>
              添加参考资料
            </Button>
          </Attachments>
        </section>
        {pendingAttachments.length > 0 ? (
          <Attachments
            items={pendingAttachments}
            maxCount={pendingAttachments.length}
            onRemove={(file) => removeAttachment(String(file.uid))}
            disabled={loading || submitting || uploadingAttachment}
            rootClassName="initial-product-document-attachment-list"
          />
        ) : null}
        {uploadError ? <div className="initial-product-document-upload-error" role="alert">{uploadError}</div> : null}
        <p className="initial-product-document-function">将为“{functionName || '当前功能'}”生成产品方案</p>
      </div>
    </Modal>
  )
}
