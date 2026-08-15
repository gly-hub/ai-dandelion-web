import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Spin } from 'antd'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { listSessions } from '../../lib/api'
import { listAgentModelOptions } from '../../lib/agentModelApi'
import { listGeneratedApps, listOperationFunctions } from '../../lib/funcOperationApi'
import { listAgentBots, listSystemMenus, listSystemNotifications, listSystemRoles, listSystemUsers } from '../../lib/systemApi'
import type { GeneratedApp, OperationFunction } from '../../types'
import './PlatformWorkbench.css'

type FunctionOverview = {
  functions: OperationFunction[]
  apps: GeneratedApp[]
}

type AgentOverview = {
  sessions: number
  models: number
  bots: number
}

type SystemOverview = {
  users: number
  roles: number
  menus: number
  unreadNotifications: number
}

function countMenuNodes(items: { children?: unknown[] }[]): number {
  return items.reduce((count, item) => count + 1 + countMenuNodes(Array.isArray(item.children) ? item.children as { children?: unknown[] }[] : []), 0)
}

export function PlatformWorkbench() {
  const { getModuleNav } = useNavMenus()
  const canViewFunctions = getModuleNav('func-operation').length > 0
  const canViewAgent = getModuleNav('ai-agent').length > 0
  const canViewSystem = getModuleNav('system').length > 0
  const [functions, setFunctions] = useState<FunctionOverview | null>(null)
  const [agent, setAgent] = useState<AgentOverview | null>(null)
  const [system, setSystem] = useState<SystemOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailableModules, setUnavailableModules] = useState<string[]>([])

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setUnavailableModules([])

    const [functionResult, agentResult, systemResult] = await Promise.all([
      canViewFunctions
        ? Promise.all([listOperationFunctions(), listGeneratedApps()])
          .then(([functionItems, apps]) => ({ functions: functionItems, apps }))
          .catch(() => null)
        : Promise.resolve(null),
      canViewAgent
        ? Promise.all([listSessions(), listAgentModelOptions(), listAgentBots()])
          .then(([sessions, models, bots]) => ({ sessions: sessions.length, models: models.length, bots: bots.length }))
          .catch(() => null)
        : Promise.resolve(null),
      canViewSystem
        ? Promise.all([listSystemUsers(), listSystemRoles(), listSystemMenus({ tree: true }), listSystemNotifications({ page: 1, pageSize: 1 })])
          .then(([users, roles, menus, notifications]) => ({
            users: users.length,
            roles: roles.length,
            menus: countMenuNodes(menus),
            unreadNotifications: notifications.unreadCount,
          }))
          .catch(() => null)
        : Promise.resolve(null),
    ])

    setFunctions(functionResult)
    setAgent(agentResult)
    setSystem(systemResult)
    setUnavailableModules([
      ...(canViewFunctions && !functionResult ? ['功能中心'] : []),
      ...(canViewAgent && !agentResult ? ['Agent 中心'] : []),
      ...(canViewSystem && !systemResult ? ['系统管理'] : []),
    ])
    setLoading(false)
  }, [canViewAgent, canViewFunctions, canViewSystem])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) {
        return loadOverview()
      }
      return undefined
    })
    return () => {
      active = false
    }
  }, [loadOverview])

  const publishedFunctions = useMemo(
    () => functions?.functions.filter((item) => item.status === 'published' && Boolean(item.generatedAppId)).length ?? 0,
    [functions],
  )
  const stats = [
    functions ? { key: 'functions', icon: <AppstoreOutlined />, value: functions.functions.length, label: '全部功能', tone: 'blue' } : null,
    functions ? { key: 'published', icon: <CheckCircleOutlined />, value: publishedFunctions, label: '已发布可使用', tone: 'green' } : null,
    agent ? { key: 'sessions', icon: <MessageOutlined />, value: agent.sessions, label: '对话会话', tone: 'orange' } : null,
    system ? { key: 'roles', icon: <SafetyCertificateOutlined />, value: system.roles, label: '系统角色', tone: 'purple' } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <section className="platform-workbench" aria-label="平台工作台">
      <div className="platform-workbench-main">
        <header className="platform-workbench-header">
          <div>
            <p className="platform-workbench-eyebrow">平台工作台</p>
            <h1>让平台能力看得见</h1>
            <p>一屏掌握功能交付、Agent 运行和系统治理，并快速进入对应管理模块。</p>
          </div>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadOverview()}>刷新数据</Button>
        </header>

        {loading && stats.length === 0 ? (
          <div className="platform-workbench-loading"><Spin /><span>正在加载平台数据</span></div>
        ) : (
          <>
            {stats.length > 0 ? <section className="platform-workbench-stats" aria-label="平台统计">
              {stats.map((stat) => <article className={`platform-workbench-stat is-${stat.tone}`} key={stat.key}>
                <span className="platform-workbench-stat-icon">{stat.icon}</span>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </article>)}
            </section> : null}

            <section className="platform-workbench-path" aria-label="平台协作路径">
              <div><h2>核心协作路径</h2><p>三类能力协同工作</p></div>
              <ol>
                <li><span>01</span><div><b>功能交付</b><p>定义目标，生成并发布业务入口。</p></div></li>
                <li><span>02</span><div><b>智能协作</b><p>由模型和 Bot 支持生成与执行。</p></div></li>
                <li><span>03</span><div><b>系统治理</b><p>以角色权限控制使用范围。</p></div></li>
              </ol>
            </section>

            <section className="platform-workbench-modules" aria-label="三大模块说明">
              <div className="platform-workbench-section-heading"><h2>三大模块，分别负责什么</h2><span>职责、功能范围与产出一目了然</span></div>
              <div className="platform-workbench-module-grid">
                <article className="platform-workbench-module is-function">
                  <div className="platform-workbench-module-kicker"><span><AppstoreOutlined /></span><small>FUNCTION</small></div>
                  <h3>功能中心</h3>
                  <p className="platform-workbench-module-lead">把业务想法沉淀为可使用、可发布、可持续维护的业务功能。</p>
                  <ul><li><b>功能创建与方案协作</b>：明确业务目标，沉淀功能方案。</li><li><b>页面生成与挂载</b>：生成业务页面，并自动绑定至对应功能。</li><li><b>发布与接口配置</b>：管理发布状态、公共配置及外部 API 接入。</li></ul>
                </article>
                <article className="platform-workbench-module is-agent">
                  <div className="platform-workbench-module-kicker"><span><RobotOutlined /></span><small>AGENT</small></div>
                  <h3>Agent 中心</h3>
                  <p className="platform-workbench-module-lead">为功能生成、知识问答和日常协作提供可管理的智能执行能力。</p>
                  <ul><li><b>对话与会话管理</b>：保留上下文，支持连续协作和历史追溯。</li><li><b>模型配置与选择</b>：维护可用模型，为不同任务匹配执行能力。</li><li><b>Agent Bot 管理</b>：配置面向具体职责的智能助手与调用入口。</li></ul>
                </article>
                <article className="platform-workbench-module is-system">
                  <div className="platform-workbench-module-kicker"><span><TeamOutlined /></span><small>SYSTEM</small></div>
                  <h3>系统管理</h3>
                  <p className="platform-workbench-module-lead">建立多用户协作的组织、权限与审计基础，保证能力按规则被使用。</p>
                  <ul><li><b>用户与角色管理</b>：定义成员身份及可承担的平台职责。</li><li><b>菜单与权限控制</b>：按角色分配页面、按钮和数据访问范围。</li><li><b>通知与操作记录</b>：传递重要变化，并保留关键操作轨迹。</li></ul>
                </article>
              </div>
            </section>

            {unavailableModules.length > 0 ? <p className="platform-workbench-unavailable"><FileTextOutlined />{unavailableModules.join('、')}数据暂不可用，请稍后刷新。</p> : null}
          </>
        )}
      </div>
    </section>
  )
}
