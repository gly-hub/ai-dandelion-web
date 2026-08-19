import { CheckCircleOutlined, ClockCircleOutlined, DownOutlined, ProfileOutlined, WarningOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { useMemo, useState } from 'react'
import type { TodoTask } from '../types'

interface TodoDockProps {
  tasks: TodoTask[]
  loading: boolean
  compact?: boolean
}

export function TodoDock({ tasks, loading, compact = false }: TodoDockProps) {
  const [collapsed, setCollapsed] = useState(compact)
  const summary = useMemo(() => {
    const inProgressCount = tasks.filter((item) => item.status === 'in_progress').length
    const pendingCount = tasks.filter((item) => item.status === 'pending').length
    const failedCount = tasks.filter((item) => item.status === 'failed').length
    const completedCount = tasks.filter((item) => item.status === 'completed').length

    if (inProgressCount > 0) {
      return `共 ${tasks.length} 项，执行中 ${inProgressCount} 项，待办 ${pendingCount} 项`
    }
    if (tasks.length === 0) {
      return loading ? '等待任务创建' : '暂无待办任务'
    }
    if (failedCount > 0) {
      return `共 ${tasks.length} 项，失败 ${failedCount} 项，待办 ${pendingCount} 项`
    }
    return `共 ${tasks.length} 项，已完成 ${completedCount} 项，待办 ${pendingCount} 项`
  }, [loading, tasks])

  const activeTasks = useMemo(
    () => tasks.filter((item) => item.status === 'in_progress'),
    [tasks],
  )

  return (
    <div className={`todo-dock${compact ? ' todo-dock-compact' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="todo-dock-header"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        <span className="todo-dock-title">
          <ProfileOutlined />
          <strong>待办列表</strong>
        </span>
        <span className="todo-dock-header-side">
          <span className="todo-dock-summary">{summary}</span>
          <span className="todo-dock-toggle" aria-hidden="true">
            <DownOutlined />
          </span>
        </span>
      </button>

      {!compact ? (
        <div className="todo-dock-collapsed" hidden={!collapsed}>
          {activeTasks.length === 0 ? (
            <span className="todo-empty">当前没有执行中的任务</span>
          ) : (
            activeTasks.map((task) => (
              <Tag key={task.taskId} bordered={false} className="todo-inline-chip">
                {task.title}
              </Tag>
            ))
          )}
        </div>
      ) : null}

      <div className="todo-dock-expanded" hidden={collapsed}>
        {tasks.length === 0 ? (
          <div className="todo-empty">当前会话还没有创建待办任务</div>
        ) : (
          <div className="todo-list">
            {tasks.map((task) => (
              <article key={task.taskId} className={`todo-item ${task.status}`}>
                <div className="todo-item-main">
                  <strong>
                    <span className="todo-item-index">{task.order}.</span>
                    <span>{task.title}</span>
                  </strong>
                  {task.description && !compact ? <p>{task.description}</p> : null}
                </div>

                <Tag bordered={false} className={`todo-item-state ${task.status}`}>
                  {statusIcon(task.status)}
                  {statusLabel(task.status)}
                </Tag>
              </article>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

function statusIcon(status: TodoTask['status']) {
  if (status === 'completed') {
    return <CheckCircleOutlined />
  }
  if (status === 'failed') {
    return <WarningOutlined />
  }
  return <ClockCircleOutlined />
}

function statusLabel(status: TodoTask['status']) {
  if (status === 'completed') {
    return '已完成'
  }
  if (status === 'failed') {
    return '失败'
  }
  if (status === 'in_progress') {
    return '执行中'
  }
  return '待处理'
}
