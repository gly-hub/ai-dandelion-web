export function getClipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) {
    return null
  }

  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      continue
    }
    const file = item.getAsFile()
    if (!file) {
      continue
    }
    if (file.name.trim()) {
      return file
    }
    const extension = file.type.split('/')[1]?.split(';')[0] || 'png'
    return new File([file], `pasted-image-${Date.now()}.${extension}`, { type: file.type })
  }

  const fallback = Array.from(data.files).find((file) => file.type.startsWith('image/'))
  if (fallback) {
    return fallback.name.trim()
      ? fallback
      : new File([fallback], `pasted-image-${Date.now()}.png`, { type: fallback.type || 'image/png' })
  }

  return null
}
