import { chatMessagesStoreHelper } from '@ant-design/x-sdk/es/x-chat/store'

export const MAX_LIVE_CHAT_MESSAGES = 40

export function releaseChatStore(chatKey: string) {
  if (!chatKey) {
    return
  }
  const store = chatMessagesStoreHelper.get(chatKey)
  if (!store) {
    return
  }
  try {
    store.setMessages([])
  } catch {
    // ignore store teardown races
  }
  store.destroy()
  chatMessagesStoreHelper.delete(chatKey)
}

export function releaseChatStoresByPrefix(prefix: string) {
  if (!prefix) {
    return
  }
  const stores = chatMessagesStoreHelper._chatMessagesStores
  for (const key of [...stores.keys()]) {
    if (String(key).startsWith(prefix)) {
      releaseChatStore(String(key))
    }
  }
}
