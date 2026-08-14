import type { AgentSkillOption } from '../types'

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

interface SkillMetadata {
  name: string
  description: string
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50

export async function importSkillPackage(file: File): Promise<AgentSkillOption> {
  if (!isZipFile(file)) {
    throw new Error('请上传 .zip 压缩包')
  }

  const buffer = await file.arrayBuffer()
  const skillMarkdown = await readSkillMarkdownFromZip(buffer)
  const metadata = parseSkillMetadata(skillMarkdown)
  const id = normalizeSkillId(metadata.name)

  if (!id) {
    throw new Error('SKILL.md 中缺少有效的 name')
  }

  return {
    id,
    name: metadata.name,
    description: metadata.description,
    source: 'personal',
    enabled: true,
    updatedAt: Date.now(),
  }
}

function isZipFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}

async function readSkillMarkdownFromZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const eocdOffset = findEndOfCentralDirectory(view)
  if (eocdOffset < 0) {
    throw new Error('压缩包格式不正确')
  }

  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
  const entries = readCentralDirectory(view, centralDirectoryOffset, entryCount)
  const skillEntry = entries.find((entry) => isSkillMarkdownPath(entry.name))
  if (!skillEntry) {
    throw new Error('压缩包中未找到 SKILL.md')
  }

  return readZipEntryText(buffer, view, skillEntry)
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22)
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset
    }
  }
  return -1
}

function readCentralDirectory(view: DataView, offset: number, entryCount: number) {
  const entries: ZipEntry[] = []
  let cursor = offset

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('压缩包目录结构不正确')
    }
    const fileNameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const nameStart = cursor + 46
    const nameEnd = nameStart + fileNameLength
    const name = decodeUTF8(readBytes(view, nameStart, fileNameLength))

    entries.push({
      name,
      compressionMethod: view.getUint16(cursor + 10, true),
      compressedSize: view.getUint32(cursor + 20, true),
      uncompressedSize: view.getUint32(cursor + 24, true),
      localHeaderOffset: view.getUint32(cursor + 42, true),
    })

    cursor = nameEnd + extraLength + commentLength
  }

  return entries
}

function isSkillMarkdownPath(path: string) {
  return path.split('/').pop()?.toLowerCase() === 'skill.md'
}

async function readZipEntryText(buffer: ArrayBuffer, view: DataView, entry: ZipEntry) {
  const localOffset = entry.localHeaderOffset
  if (view.getUint32(localOffset, true) !== LOCAL_FILE_SIGNATURE) {
    throw new Error('压缩包文件结构不正确')
  }

  const fileNameLength = view.getUint16(localOffset + 26, true)
  const extraLength = view.getUint16(localOffset + 28, true)
  const dataStart = localOffset + 30 + fileNameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  const data = buffer.slice(dataStart, dataEnd)

  if (entry.compressionMethod === 0) {
    return decodeUTF8(data)
  }
  if (entry.compressionMethod === 8) {
    return decodeUTF8(await inflateRaw(data, entry.uncompressedSize))
  }

  throw new Error('暂不支持该压缩格式，请使用标准 zip 压缩包')
}

async function inflateRaw(data: ArrayBuffer, expectedSize: number) {
  const DecompressionStreamCtor = (globalThis as {
    DecompressionStream?: new (format: string) => DecompressionStream
  }).DecompressionStream
  if (!DecompressionStreamCtor) {
    throw new Error('当前浏览器不支持解压缩读取')
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'))
  const result = await new Response(stream).arrayBuffer()
  if (expectedSize > 0 && result.byteLength !== expectedSize) {
    throw new Error('压缩包内容读取失败')
  }
  return result
}

function parseSkillMetadata(markdown: string): SkillMetadata {
  const frontmatter = extractFrontmatter(markdown)
  const name = readYamlString(frontmatter, 'name') || readMarkdownTitle(markdown)
  const description =
    readYamlString(frontmatter, 'description') ||
    readYamlString(frontmatter, 'short-description') ||
    readYamlString(frontmatter, 'short_description') ||
    ''

  if (!name) {
    throw new Error('SKILL.md 中缺少 name')
  }

  return {
    name,
    description,
  }
}

function extractFrontmatter(markdown: string) {
  const normalized = markdown.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---')) {
    return ''
  }
  const endIndex = normalized.indexOf('\n---', 3)
  if (endIndex < 0) {
    return ''
  }
  return normalized.slice(3, endIndex)
}

function readYamlString(source: string, key: string) {
  const keyPattern = escapeRegExp(key)
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${keyPattern}\\s*:\\s*(.+)(?:\\n|$)`))
  if (!match) {
    return ''
  }
  return cleanYamlValue(match[1])
}

function cleanYamlValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '|' || trimmed === '>') {
    return ''
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed.replace(/\s+#.*$/, '').trim()
}

function readMarkdownTitle(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

function normalizeSkillId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.:/\-\u4e00-\u9fa5]/g, '')
}

function decodeUTF8(data: BufferSource) {
  return new TextDecoder('utf-8').decode(data)
}

function readBytes(view: DataView, offset: number, length: number) {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    bytes[index] = view.getUint8(offset + index)
  }
  return bytes
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
