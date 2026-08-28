import type { ChatMessage, TodoTask } from '../types'

// Replays the native TaskCreate/TaskUpdate tool parts persisted by ai-agent.
// Function operations call this with the messages loaded for the active session.
export function buildTodoDockData(messages: ChatMessage[]) {
  const tasksById = new Map<string, TodoTask>()
  const taskIdByToolId = new Map<string, string>()
  let order = 0

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    if (message.parts.some((part) => part.type === 'tool' && part.toolName === 'TaskCreate')) {
      tasksById.clear()
      taskIdByToolId.clear()
      order = 0
    }
    for (const part of message.parts) {
      if (part.type !== 'tool' || !isTaskTool(part.toolName)) continue
      order += 1
      const input = parseObject(part.input || '')
      const result = String(part.result || '')
      if (part.toolName === 'TaskCreate') {
        const taskId = firstNonEmpty(taskIDFromResult(result), stringValue(input.taskId), part.toolId)
        const key = taskIdByToolId.get(part.toolId) || taskId
        const task = tasksById.get(key) || {
          taskId,
          title: firstNonEmpty(stringValue(input.subject), stringValue(input.activeForm), '未命名任务'),
          description: stringValue(input.description),
          status: 'pending' as const,
          order,
        }
        task.taskId = taskId
        task.title = firstNonEmpty(stringValue(input.subject), stringValue(input.activeForm), task.title)
        task.description = stringValue(input.description) || task.description || ''
        task.status = normalizeStatus(task.status)
        task.order = Math.min(task.order, order)
        tasksById.set(key, task)
        taskIdByToolId.set(part.toolId, key)
        continue
      }
      if (part.toolName === 'TaskUpdate') {
        const taskId = firstNonEmpty(stringValue(input.taskId), taskIDFromResult(result))
        if (!taskId) continue
        const task = tasksById.get(taskId) || { taskId, title: `任务 #${taskId}`, description: '', status: 'pending' as const, order }
        task.status = normalizeStatus(input.status || task.status)
        task.order = Math.min(task.order, order)
        tasksById.set(taskId, task)
      }
    }
  }

  return {
    tasks: Array.from(tasksById.values()).sort((left, right) => {
      if (left.status === 'in_progress' && right.status !== 'in_progress') return -1
      if (left.status !== 'in_progress' && right.status === 'in_progress') return 1
      return left.order - right.order
    }),
  }
}

export function buildCompactTodoTasks(messages: ChatMessage[], tasks: TodoTask[]) {
  let latestTodoMessageIndex = -1
  let latestUserMessageIndex = -1

  messages.forEach((message, index) => {
    if (message.role === 'user') {
      latestUserMessageIndex = index
      return
    }
    if (message.role !== 'assistant') return
    const taskParts = message.parts.filter((part) => part.type === 'tool' && isTaskTool(part.toolName))
    if (taskParts.length > 0) {
      latestTodoMessageIndex = index
    }
  })

  if (tasks.length === 0) {
    return []
  }

  // A new TaskCreate replaces the plan. Without one, a continuation must keep
  // showing the previous unfinished plan while TaskUpdate parts merge into it.
  const hasCurrentTurnTaskActivity = latestTodoMessageIndex >= latestUserMessageIndex
  const hasUnfinishedTask = tasks.some((task) => task.status !== 'completed')
  if (hasCurrentTurnTaskActivity || hasUnfinishedTask) {
    return tasks
  }
  return []
}

function isTaskTool(toolName?: string) {
  return typeof toolName === 'string' && (toolName === 'TaskCreate' || toolName === 'TaskUpdate')
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function taskIDFromResult(value: string) {
  return value.match(/task\s*#(\d+)/i)?.[1] || ''
}

function normalizeStatus(value: unknown): TodoTask['status'] {
  const status = String(value || '').toLowerCase()
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'in_progress' || status === 'running') return 'in_progress'
  return 'pending'
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.trim()) || ''
}
