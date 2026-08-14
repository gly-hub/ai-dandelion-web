import { Empty } from 'antd'

export function AgentMySpacePanel() {
  return (
    <section className="agent-panel-stage stage">
      <header className="agent-panel-header">
        <div>
          <p className="eyebrow">Agent</p>
          <h1 className="agent-panel-title">我的空间</h1>
          <p className="agent-panel-desc">管理个人技能、收藏与常用配置，快速复用你的工作流。</p>
        </div>
      </header>

      <div className="agent-panel-body">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="我的空间内容即将上线，可先通过左侧会话继续与 Agent 协作。"
        />
      </div>
    </section>
  )
}
