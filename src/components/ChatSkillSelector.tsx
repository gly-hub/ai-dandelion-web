import { useMemo, useState } from 'react'
import { AppstoreAddOutlined } from '@ant-design/icons'
import { Empty, Popover } from 'antd'
import type { AgentMCPServerOption, AgentSkillOption } from '../types'
import { formatMCPLabel } from '../lib/agentMcpApi'
import { formatSkillLabel } from '../lib/agentSkillApi'

interface ChatSkillSelectorProps {
  skills: AgentSkillOption[]
  mcpServers?: AgentMCPServerOption[]
  selectedSkillIds: string[]
  selectedMCPIds?: string[]
  disabled?: boolean
  loading?: boolean
  onSelectedSkillIdsChange: (skillIds: string[]) => void
  onSelectedMCPIdsChange?: (mcpIds: string[]) => void
  onSkillPick?: (skill: AgentSkillOption) => void
  onMCPPick?: (server: AgentMCPServerOption) => void
}

export function ChatSkillSelector({
  skills,
  mcpServers = [],
  selectedSkillIds,
  selectedMCPIds = [],
  disabled = false,
  loading = false,
  onSelectedSkillIdsChange,
  onSelectedMCPIdsChange,
  onSkillPick,
  onMCPPick,
}: ChatSkillSelectorProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'skill' | 'mcp'>('skill')
  const enabledSkills = useMemo(() => skills.filter((item) => item.enabled), [skills])
  const enabledMCPServers = useMemo(() => mcpServers.filter((item) => item.enabled), [mcpServers])
  const selectedIdSet = useMemo(() => new Set(selectedSkillIds), [selectedSkillIds])
  const selectedMCPIdSet = useMemo(() => new Set(selectedMCPIds), [selectedMCPIds])
  const selectedSkills = useMemo(
    () => enabledSkills.filter((item) => selectedIdSet.has(item.id)),
    [enabledSkills, selectedIdSet],
  )
  const selectedMCPServers = useMemo(
    () => enabledMCPServers.filter((item) => selectedMCPIdSet.has(item.id)),
    [enabledMCPServers, selectedMCPIdSet],
  )

  const updateSelected = (skillIds: string[]) => {
    onSelectedSkillIdsChange(skillIds)
  }

  const toggleSkill = (skillId: string) => {
    const skill = enabledSkills.find((item) => item.id === skillId)
    if (skill && onSkillPick) {
      onSkillPick(skill)
      setOpen(false)
      return
    }
    const next = selectedIdSet.has(skillId)
      ? selectedSkillIds.filter((id) => id !== skillId)
      : [...selectedSkillIds, skillId]
    updateSelected(next)
    setOpen(false)
  }

  const toggleMCP = (serverId: string) => {
    const server = enabledMCPServers.find((item) => item.id === serverId)
    if (server && onMCPPick) {
      onMCPPick(server)
      setOpen(false)
      return
    }
    const next = selectedMCPIdSet.has(serverId)
      ? selectedMCPIds.filter((id) => id !== serverId)
      : [...selectedMCPIds, serverId]
    onSelectedMCPIdsChange?.(next)
    setOpen(false)
  }

  const popoverContent = (
    <div className="chat-skill-selector-panel">
      <div className="chat-skill-selector-tabs" role="tablist" aria-label="能力类型">
        {[
          { key: 'skill' as const, label: '技能' },
          { key: 'mcp' as const, label: 'MCP' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={activeTab === item.key}
            className={activeTab === item.key ? 'is-active' : ''}
            onClick={() => setActiveTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chat-skill-selector-list" role="listbox" aria-label="个人技能列表">
        {activeTab === 'mcp' ? (
          enabledMCPServers.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用 MCP" />
          ) : (
            enabledMCPServers.map((server) => {
              const selected = selectedMCPIdSet.has(server.id)
              return (
                <button
                  key={server.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`chat-skill-selector-item${selected ? ' is-selected' : ''}`}
                  onClick={() => toggleMCP(server.id)}
                >
                  <span className="chat-skill-selector-item-icon" aria-hidden="true">
                    <AppstoreAddOutlined />
                  </span>
                  <span className="chat-skill-selector-copy">
                    {formatMCPLabel(server)}
                  </span>
                </button>
              )
            })
          )
        ) : enabledSkills.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用技能" />
        ) : (
          enabledSkills.map((skill) => {
            const selected = selectedIdSet.has(skill.id)
            return (
              <button
                key={skill.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`chat-skill-selector-item${selected ? ' is-selected' : ''}`}
                onClick={() => toggleSkill(skill.id)}
              >
                <span className="chat-skill-selector-item-icon" aria-hidden="true">
                  <AppstoreAddOutlined />
                </span>
                <span className="chat-skill-selector-copy">
                  {formatSkillLabel(skill)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      trigger="click"
      placement="topLeft"
      arrow={false}
      overlayClassName="chat-skill-selector-popover"
      content={popoverContent}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen)
        }
      }}
    >
      <button
        type="button"
        className={`chat-skill-selector-trigger${open ? ' is-open' : ''}${selectedSkills.length > 0 || selectedMCPServers.length > 0 ? ' has-selection' : ''}`}
        disabled={disabled || loading}
      >
        /
      </button>
    </Popover>
  )
}
