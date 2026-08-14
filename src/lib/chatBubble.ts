import type { ChatMessage } from '../types'

export function buildBubbleItemKey(
  wrapperId: string | number,
  message: ChatMessage,
  index: number,
) {
  if (message.id) {
    return `${message.id}:${index}`
  }
  return `${wrapperId}:${index}`
}
