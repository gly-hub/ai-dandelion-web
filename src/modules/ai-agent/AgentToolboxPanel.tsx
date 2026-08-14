import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Empty, Form, Input, InputNumber, message, Modal, Select, Switch, Tabs, Tag, type MenuProps } from 'antd'
import {
  AppstoreAddOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  HddOutlined,
  MoreOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { AgentBot, AgentBotCapability, AgentMCPServerOption, AgentModelOption, AgentSkillOption } from '../../types'
import {
  AGENT_BOT_CAPABILITY_ENABLED,
  AGENT_BOT_CHANNEL_STATUS_DISABLED,
  AGENT_BOT_CHANNEL_STATUS_ENABLED,
  AGENT_BOT_STATUS_DISABLED,
  AGENT_BOT_STATUS_ENABLED,
} from '../../types'
import {
  deleteUserAgentSkillOption,
  formatSkillLabel,
  importUserAgentSkillPackage,
  listAgentSkillOptions,
  listUserAgentSkillOptions,
  updateUserAgentSkillOption,
  upsertAgentSkillOption,
} from '../../lib/agentSkillApi'
import {
  deleteUserAgentMCPServer,
  emptyMCPServer,
  formatMCPLabel,
  listUserAgentMCPServers,
  saveUserAgentMCPServer,
} from '../../lib/agentMcpApi'
import { listAgentModelOptions } from '../../lib/agentModelApi'
import {
  createAgentBot,
  deleteAgentBot,
  disableAgentBot,
  enableAgentBot,
  listAgentBots,
  updateAgentBot,
} from '../../lib/systemApi'

interface AgentToolboxPanelProps {
  skills: AgentSkillOption[]
  mcpServers: AgentMCPServerOption[]
  userId?: string
  modalZIndex?: number
  onSkillsChange: (skills: AgentSkillOption[]) => void
  onMCPServersChange: (servers: AgentMCPServerOption[]) => void
}

interface SkillFormValues {
  id: string
  name: string
  description?: string
}

interface MCPFormValues {
  id: string
  name: string
  description?: string
  enabled: boolean
  configJson: string
}

interface AgentBotFormValues {
  name: string
  code: string
  status: boolean
  description?: string
  businessScene?: string
  welcomeMessage?: string
  modelId: string
  permissionMode: string
  maxTurns: number
  systemPrompt: string
  skillIds: string[]
  mcpIds: string[]
  channelEnabled: boolean
  channelName: string
  channelType: string
  externalBotId: string
  secret?: string
  endpointUrl?: string
  configJson: string
}

const PERMISSION_MODE_OPTIONS = [
  { value: 'bypassPermissions', label: 'bypassPermissions' },
  { value: 'default', label: 'default' },
]

const CHANNEL_OPTIONS = [
  { value: 'wecom', label: '企业微信' },
  { value: 'feishu', label: '飞书' },
  { value: 'dingtalk', label: '钉钉' },
  { value: 'web', label: 'Web' },
]

export function AgentToolboxPanel({
  skills,
  mcpServers,
  userId = '',
  modalZIndex = 1000,
  onSkillsChange,
  onMCPServersChange,
}: AgentToolboxPanelProps) {
  const [activeCategory, setActiveCategory] = useState('personal')
  const [keyword, setKeyword] = useState('')
  const [editingSkill, setEditingSkill] = useState<AgentSkillOption | null>(null)
  const [editingMCPServer, setEditingMCPServer] = useState<AgentMCPServerOption | null>(null)
  const [editingBot, setEditingBot] = useState<AgentBot | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mcpModalOpen, setMCPModalOpen] = useState(false)
  const [botModalOpen, setBotModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [bots, setBots] = useState<AgentBot[]>([])
  const [modelOptions, setModelOptions] = useState<AgentModelOption[]>([])
  const [botLoading, setBotLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form] = Form.useForm<SkillFormValues>()
  const [mcpForm] = Form.useForm<MCPFormValues>()
  const [botForm] = Form.useForm<AgentBotFormValues>()
  const filteredSkills = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    if (!value) {
      return skills
    }
    return skills.filter((skill) =>
      [skill.name, skill.id, skill.description, skill.source].some((item) => item.toLowerCase().includes(value)),
    )
  }, [keyword, skills])
  const filteredMCPServers = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    if (!value) {
      return mcpServers
    }
    return mcpServers.filter((server) =>
      [server.name, server.id, server.description, server.type, server.command, server.url].some((item) =>
        item.toLowerCase().includes(value),
      ),
    )
  }, [keyword, mcpServers])
  const filteredBots = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    if (!value) {
      return bots
    }
    return bots.filter((bot) =>
      [bot.name, bot.code, bot.description, bot.businessScene].some((item) => item.toLowerCase().includes(value)),
    )
  }, [bots, keyword])

  const loadBotData = async () => {
    setBotLoading(true)
    try {
      const [nextBots, nextModels] = await Promise.all([listAgentBots(), listAgentModelOptions()])
      setBots(nextBots)
      setModelOptions(nextModels)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载智能机器人失败')
    } finally {
      setBotLoading(false)
    }
  }

  const openEditModal = (skill: AgentSkillOption) => {
    setEditingSkill(skill)
    form.setFieldsValue({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const skill: AgentSkillOption = {
      id: values.id,
      name: values.name,
      description: values.description || '',
      source: editingSkill?.source || 'personal',
      enabled: true,
      updatedAt: editingSkill?.updatedAt || Date.now(),
    }
    try {
      if (editingSkill) {
        await updateUserAgentSkillOption(userId, skill)
        const nextSkills = userId ? await listUserAgentSkillOptions(userId) : listAgentSkillOptions()
        onSkillsChange(nextSkills)
      } else {
        const nextSkills = upsertAgentSkillOption(skill)
        onSkillsChange(nextSkills)
      }
      setModalOpen(false)
      message.success(`已保存技能：${formatSkillLabel(skill)}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存技能失败')
    }
  }

  const openMCPModal = (server?: AgentMCPServerOption) => {
    const next = server || emptyMCPServer()
    setEditingMCPServer(server || null)
    mcpForm.setFieldsValue({
      id: next.id,
      name: next.name,
      description: next.description,
      enabled: next.enabled,
      configJson: next.configJson,
    })
    setMCPModalOpen(true)
  }

  const handleMCPSubmit = async () => {
    const values = await mcpForm.validateFields()
    const server: AgentMCPServerOption = {
      id: values.id.trim(),
      name: values.name.trim(),
      description: values.description?.trim() || '',
      ...deriveMCPFieldsFromJSON(values.configJson),
      enabled: values.enabled,
      configJson: normalizeMCPConfigJSON(values.configJson),
      updatedAt: Date.now(),
    }
    try {
      await saveUserAgentMCPServer(userId, server, Boolean(editingMCPServer))
      const nextServers = await listUserAgentMCPServers(userId)
      onMCPServersChange(nextServers)
      setMCPModalOpen(false)
      message.success(`已保存 MCP：${formatMCPLabel(server)}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存 MCP 失败')
    }
  }

  const openBotModal = (bot?: AgentBot) => {
    const firstChannel = bot?.channels[0]
    setEditingBot(bot || null)
    botForm.setFieldsValue({
      name: bot?.name || '',
      code: bot?.code || '',
      status: bot ? bot.status === AGENT_BOT_STATUS_ENABLED : true,
      description: bot?.description || '',
      businessScene: bot?.businessScene || '',
      welcomeMessage: bot?.welcomeMessage || '',
      modelId: bot?.modelId || modelOptions.find((item) => item.isDefault)?.id || modelOptions[0]?.id || '',
      permissionMode: bot?.permissionMode || 'bypassPermissions',
      maxTurns: bot?.maxTurns || 20,
      systemPrompt: bot?.systemPrompt || '',
      skillIds: botCapabilityIds(bot, 'skill'),
      mcpIds: botCapabilityIds(bot, 'mcp'),
      channelEnabled: firstChannel ? firstChannel.status === AGENT_BOT_CHANNEL_STATUS_ENABLED : true,
      channelName: firstChannel?.name || '企业微信',
      channelType: firstChannel?.channel || 'wecom',
      externalBotId: firstChannel?.externalBotId || '',
      secret: firstChannel?.secret || '',
      endpointUrl: firstChannel?.endpointUrl || 'wss://openws.work.weixin.qq.com',
      configJson: firstChannel?.configJson || defaultWecomChannelConfig(),
    })
    setBotModalOpen(true)
  }

  const handleBotSubmit = async () => {
    const values = await botForm.validateFields()
    const payload = buildBotPayload(values, editingBot, skills, mcpServers)
    try {
      const saved = editingBot ? await updateAgentBot(editingBot.id, payload) : await createAgentBot(payload)
      setBots((current) => upsertBot(current, saved))
      setBotModalOpen(false)
      message.success(`已保存机器人：${saved.name}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存智能机器人失败')
    }
  }

  const handleDelete = (skillId: string) => {
    Modal.confirm({
      title: '删除技能',
      content: '删除后对话框中将不能再选择该技能。',
      zIndex: modalZIndex,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteUserAgentSkillOption(userId, skillId)
        const nextSkills = userId ? await listUserAgentSkillOptions(userId) : listAgentSkillOptions()
        onSkillsChange(nextSkills)
      },
    })
  }

  const handleDeleteMCP = (server: AgentMCPServerOption) => {
    Modal.confirm({
      title: '删除 MCP',
      content: '删除后对话框中将不能再选择该 MCP。',
      zIndex: modalZIndex,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteUserAgentMCPServer(userId, server.id)
        const nextServers = await listUserAgentMCPServers(userId)
        onMCPServersChange(nextServers)
      },
    })
  }

  const handleDeleteBot = (bot: AgentBot) => {
    Modal.confirm({
      title: '删除智能机器人',
      content: '删除后该机器人配置、渠道接入和能力范围都会移除。',
      zIndex: modalZIndex,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteAgentBot(bot.id)
        setBots((current) => current.filter((item) => item.id !== bot.id))
      },
    })
  }

  const handleToggleBot = async (bot: AgentBot) => {
    try {
      const saved = bot.status === AGENT_BOT_STATUS_ENABLED
        ? await disableAgentBot(bot.id)
        : await enableAgentBot(bot.id)
      setBots((current) => upsertBot(current, saved))
      message.success(saved.status === AGENT_BOT_STATUS_ENABLED ? '机器人已启用' : '机器人已禁用')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新机器人状态失败')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportPackage = async (file?: File) => {
    if (!file) {
      return
    }
    setImporting(true)
    try {
      const skill = await importUserAgentSkillPackage(userId, file)
      const nextSkills = userId ? await listUserAgentSkillOptions(userId) : upsertAgentSkillOption(skill)
      onSkillsChange(nextSkills)
      message.success(`已导入技能：${formatSkillLabel(skill)}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入技能包失败')
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const buildSkillMenuItems = (skill: AgentSkillOption): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => openEditModal(skill),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDelete(skill.id),
    },
  ]

  const buildMCPMenuItems = (server: AgentMCPServerOption): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => openMCPModal(server),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDeleteMCP(server),
    },
  ]

  const buildBotMenuItems = (bot: AgentBot): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => openBotModal(bot),
    },
    {
      key: 'toggle',
      label: bot.status === AGENT_BOT_STATUS_ENABLED ? '禁用' : '启用',
      icon: <CheckCircleOutlined />,
      onClick: () => void handleToggleBot(bot),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDeleteBot(bot),
    },
  ]

  const renderSkillGrid = () => {
    if (filteredSkills.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配技能" />
    }

    return (
      <div className="agent-skill-grid">
        {filteredSkills.map((skill) => (
          <article key={skill.id} className="agent-skill-card">
            <div className="agent-skill-icon" aria-hidden="true">
              <AppstoreAddOutlined />
            </div>
            <div className="agent-skill-card-content">
              <div className="agent-skill-card-title-row">
                <strong>{formatSkillLabel(skill)}</strong>
              </div>
              <p>{skill.description || '暂无描述'}</p>
            </div>
            <Dropdown
              menu={{ items: buildSkillMenuItems(skill) }}
              trigger={['click']}
              placement="bottomLeft"
              align={{ offset: [4, 4] }}
              overlayClassName="agent-skill-card-menu-overlay"
            >
              <Button
                type="text"
                size="small"
                className="agent-skill-card-menu-trigger"
                icon={<MoreOutlined />}
                aria-label={`${formatSkillLabel(skill)}操作菜单`}
              />
            </Dropdown>
          </article>
        ))}
      </div>
    )
  }

  const renderMCPGrid = () => {
    if (filteredMCPServers.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配 MCP" />
    }

    return (
      <div className="agent-skill-grid">
        {filteredMCPServers.map((server) => (
          <article key={server.id} className="agent-skill-card">
            <div className="agent-skill-icon mcp" aria-hidden="true">
              <HddOutlined />
            </div>
            <div className="agent-skill-card-content">
              <div className="agent-skill-card-title-row">
                <strong>{formatMCPLabel(server)}</strong>
              </div>
              <p>{server.description || server.command || server.url || '暂无描述'}</p>
            </div>
            <Dropdown
              menu={{ items: buildMCPMenuItems(server) }}
              trigger={['click']}
              placement="bottomLeft"
              align={{ offset: [4, 4] }}
              overlayClassName="agent-skill-card-menu-overlay"
            >
              <Button
                type="text"
                size="small"
                className="agent-skill-card-menu-trigger"
                icon={<MoreOutlined />}
                aria-label={`${formatMCPLabel(server)}操作菜单`}
              />
            </Dropdown>
          </article>
        ))}
      </div>
    )
  }

  const renderBotGrid = () => {
    if (botLoading) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在加载智能机器人" />
    }
    if (filteredBots.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配智能机器人" />
    }

    return (
      <div className="agent-skill-grid">
        {filteredBots.map((bot) => {
          const model = modelOptions.find((item) => item.id === bot.modelId)
          const skillCount = bot.capabilities.filter((item) => item.capabilityType === 'skill').length
          const mcpCount = bot.capabilities.filter((item) => item.capabilityType === 'mcp').length
          return (
            <article key={bot.id} className="agent-skill-card agent-bot-card">
              <div className="agent-skill-icon bot" aria-hidden="true">
                <RobotOutlined />
              </div>
              <div className="agent-skill-card-content">
                <div className="agent-skill-card-title-row">
                  <strong>{bot.name}</strong>
                  <Tag color={bot.status === AGENT_BOT_STATUS_ENABLED ? 'green' : 'default'}>
                    {bot.status === AGENT_BOT_STATUS_ENABLED ? '启用' : '禁用'}
                  </Tag>
                </div>
                <p>{bot.businessScene || bot.description || '未设置业务场景'}</p>
                <div className="agent-bot-card-meta">
                  <span>{model ? model.name : '未选择模型'}</span>
                  <span>{bot.channels.length} 个渠道</span>
                  <span>{skillCount} 技能</span>
                  <span>{mcpCount} MCP</span>
                </div>
              </div>
              <Dropdown
                menu={{ items: buildBotMenuItems(bot) }}
                trigger={['click']}
                placement="bottomLeft"
                align={{ offset: [4, 4] }}
                overlayClassName="agent-skill-card-menu-overlay"
              >
                <Button
                  type="text"
                  size="small"
                  className="agent-skill-card-menu-trigger"
                  icon={<MoreOutlined />}
                  aria-label={`${bot.name}操作菜单`}
                />
              </Dropdown>
            </article>
          )
        })}
      </div>
    )
  }

  const renderCategoryPanel = () => {
    if (activeCategory === 'mcp') {
      return renderMCPGrid()
    }
    if (activeCategory === 'bots') {
      return renderBotGrid()
    }

    return renderSkillGrid()
  }

  return (
    <section className="agent-panel-stage agent-toolbox-stage stage">
      <header className="agent-panel-header agent-toolbox-header">
        <div>
          <h1 className="agent-panel-title">工具集</h1>
          <p className="agent-panel-desc">
            管理个人技能，并在 AI 对话输入框中按需选择使用。
          </p>
        </div>
        <div className="agent-toolbox-actions">
          <Input
            prefix={<SearchOutlined />}
            allowClear
            value={keyword}
            placeholder="搜索技能"
            onChange={(event) => setKeyword(event.target.value)}
          />
          {activeCategory === 'mcp' ? (
            <Button icon={<PlusOutlined />} onClick={() => openMCPModal()}>
              创建 MCP
            </Button>
          ) : activeCategory === 'bots' ? (
            <Button icon={<PlusOutlined />} onClick={() => openBotModal()}>
              创建机器人
            </Button>
          ) : (
            <>
              <Button icon={<DownloadOutlined />} loading={importing} onClick={handleImportClick}>
                导入技能包
              </Button>
              <input
                ref={fileInputRef}
                className="agent-skill-import-input"
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(event) => void handleImportPackage(event.target.files?.[0])}
              />
            </>
          )}
        </div>
      </header>

      <div className="agent-panel-body">
        <div className="agent-toolbox-category-tabs" role="tablist" aria-label="工具集分类">
          {[
            { key: 'personal', label: '个人技能' },
            { key: 'mcp', label: 'MCP' },
            { key: 'bots', label: '智能机器人' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={activeCategory === item.key}
              className={activeCategory === item.key ? 'is-active' : ''}
              onClick={() => {
                setActiveCategory(item.key)
                if (item.key === 'bots') {
                  void loadBotData()
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="agent-toolbox-divider" />
        {renderCategoryPanel()}
      </div>

      <Modal
        open={modalOpen}
        title={editingSkill ? '编辑技能' : '新建技能'}
        zIndex={modalZIndex}
        okText="保存"
        cancelText="取消"
        onOk={() => void handleSubmit()}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" requiredMark="optional" className="agent-skill-form">
          <Form.Item
            name="id"
            label="技能标识"
            rules={[
              { required: true, message: '请输入技能标识' },
              { pattern: /^[a-zA-Z0-9_.:/-]+$/, message: '仅支持字母、数字、点、冒号、斜杠、下划线和连字符' },
            ]}
          >
            <Input placeholder="例如 webnovel-writing" disabled={Boolean(editingSkill)} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如 网文写作" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="简要说明这个技能适合什么任务" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={mcpModalOpen}
        title={editingMCPServer ? '编辑 MCP' : '创建 MCP'}
        zIndex={modalZIndex}
        okText="保存"
        cancelText="取消"
        width={640}
        onOk={() => void handleMCPSubmit()}
        onCancel={() => setMCPModalOpen(false)}
      >
        <Form form={mcpForm} layout="vertical" requiredMark="optional" className="agent-skill-form">
          <div className="agent-mcp-form-grid">
            <Form.Item
              name="id"
              label="MCP 标识"
              rules={[
                { required: true, message: '请输入 MCP 标识' },
                { pattern: /^[a-zA-Z0-9_.:/-]+$/, message: '仅支持字母、数字、点、冒号、斜杠、下划线和连字符' },
              ]}
            >
              <Input placeholder="例如 filesystem" disabled={Boolean(editingMCPServer)} />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="例如 文件系统" />
            </Form.Item>
          </div>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="简要说明这个 MCP 提供什么能力" />
          </Form.Item>
          <Form.Item
            name="configJson"
            label="MCP JSON 配置"
            rules={[
              { required: true, message: '请输入 MCP JSON 配置' },
              {
                validator: (_, value) => {
                  try {
                    deriveMCPFieldsFromJSON(String(value || ''))
                    return Promise.resolve()
                  } catch (error) {
                    return Promise.reject(error instanceof Error ? error : new Error('MCP JSON 配置无效'))
                  }
                },
              },
            ]}
          >
            <Input.TextArea
              rows={12}
              spellCheck={false}
              placeholder={'{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]\n}'}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={botModalOpen}
        title={editingBot ? '编辑智能机器人' : '创建智能机器人'}
        zIndex={modalZIndex}
        okText="保存"
        cancelText="取消"
        width={1040}
        className="agent-bot-modal"
        onOk={() => void handleBotSubmit()}
        onCancel={() => setBotModalOpen(false)}
      >
        <Form form={botForm} layout="vertical" requiredMark="optional" className="agent-bot-form">
          <div className="agent-bot-form-summary">
            <div>
              <strong>按业务场景定义机器人</strong>
              <span>机器人本身不绑定渠道，渠道只是接入方式。</span>
            </div>
            <Form.Item name="status" valuePropName="checked" noStyle>
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </div>

          <Tabs
            className="agent-bot-form-tabs"
            defaultActiveKey="base"
            items={[
              {
                key: 'base',
                label: '机器人配置',
                children: (
                  <BotFormSection title="机器人配置" description="定义业务身份和默认话术。">
                    <div className="agent-bot-form-row">
                      <Form.Item name="name" label="机器人名称" rules={[{ required: true, message: '请输入机器人名称' }]}>
                        <Input placeholder="例如 售前助手" />
                      </Form.Item>
                      <Form.Item
                        name="code"
                        label="机器人编码"
                        rules={[
                          { required: true, message: '请输入机器人编码' },
                          { pattern: /^[a-zA-Z0-9_.:/-]+$/, message: '仅支持字母、数字、点、冒号、斜杠、下划线和连字符' },
                        ]}
                      >
                        <Input placeholder="presales-assistant" />
                      </Form.Item>
                    </div>
                    <Form.Item name="businessScene" label="业务场景">
                      <Input placeholder="例如 售前答疑、内部知识库、客服工单" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                      <Input.TextArea rows={3} placeholder="说明这个机器人负责什么业务" />
                    </Form.Item>
                    <Form.Item name="welcomeMessage" label="默认欢迎语">
                      <Input.TextArea rows={3} placeholder="渠道进入会话时可使用的欢迎语" />
                    </Form.Item>
                  </BotFormSection>
                ),
              },
              {
                key: 'channel',
                label: '渠道接入',
                children: (
                  <BotFormSection title="渠道接入" description="当前先配置一个渠道，后续可扩展为多渠道。">
                    <div className="agent-bot-form-row">
                      <Form.Item name="channelType" label="渠道类型">
                        <Select options={CHANNEL_OPTIONS} />
                      </Form.Item>
                      <Form.Item name="channelName" label="渠道名称">
                        <Input placeholder="例如 企业微信" />
                      </Form.Item>
                    </div>
                    <div className="agent-bot-form-row">
                      <Form.Item name="externalBotId" label="外部机器人 ID">
                        <Input placeholder="企微 bot_id 或其他渠道机器人 ID" />
                      </Form.Item>
                      <Form.Item name="secret" label="渠道密钥">
                        <Input.Password placeholder="留空或保持 ****** 表示不修改" />
                      </Form.Item>
                    </div>
                    <div className="agent-bot-form-row agent-bot-form-row-compact">
                      <Form.Item name="endpointUrl" label="连接地址">
                        <Input placeholder="wss://openws.work.weixin.qq.com" />
                      </Form.Item>
                      <Form.Item name="channelEnabled" label="渠道启用" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name="configJson"
                      label="渠道扩展配置"
                      rules={[{ validator: (_, value) => validateOptionalJSON(value) }]}
                    >
                      <Input.TextArea rows={8} spellCheck={false} />
                    </Form.Item>
                  </BotFormSection>
                ),
              },
              {
                key: 'runtime',
                label: '运行参数',
                children: (
                  <BotFormSection title="运行参数" description="控制模型、系统提示词和单轮执行边界。">
                    <Form.Item name="modelId" label="使用模型" rules={[{ required: true, message: '请选择模型' }]}>
                      <Select
                        placeholder="选择已启用模型"
                        options={modelOptions.map((item) => ({
                          value: item.id,
                          label: item.isDefault ? `${item.name}（默认）` : item.name,
                        }))}
                        showSearch
                        optionFilterProp="label"
                      />
                    </Form.Item>
                    <div className="agent-bot-form-row">
                      <Form.Item name="permissionMode" label="权限模式">
                        <Select options={PERMISSION_MODE_OPTIONS} />
                      </Form.Item>
                      <Form.Item name="maxTurns" label="最大轮次">
                        <InputNumber min={1} max={200} style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                    <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: '请输入系统提示词' }]}>
                      <Input.TextArea rows={14} showCount maxLength={6000} />
                    </Form.Item>
                  </BotFormSection>
                ),
              },
              {
                key: 'capabilities',
                label: '能力范围',
                children: (
                  <BotFormSection title="能力范围" description="限制这个机器人能使用的技能和 MCP。">
                    <Form.Item name="skillIds" label="可用技能">
                      <Select
                        mode="multiple"
                        options={skills
                          .filter((item) => item.enabled)
                          .map((item) => ({ value: item.id, label: formatSkillLabel(item) }))}
                        placeholder="选择技能"
                        showSearch
                        optionFilterProp="label"
                        maxTagCount="responsive"
                      />
                    </Form.Item>
                    <Form.Item name="mcpIds" label="可用 MCP">
                      <Select
                        mode="multiple"
                        options={mcpServers
                          .filter((item) => item.enabled)
                          .map((item) => ({ value: item.id, label: formatMCPLabel(item) }))}
                        placeholder="选择 MCP"
                        showSearch
                        optionFilterProp="label"
                        maxTagCount="responsive"
                      />
                    </Form.Item>
                  </BotFormSection>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </section>
  )
}

function BotFormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="agent-bot-form-section">
      <div className="agent-bot-form-section-head">
        <h3>{title}</h3>
        <span>{description}</span>
      </div>
      {children}
    </section>
  )
}

function normalizeMCPConfigJSON(value: string) {
  return JSON.stringify(JSON.parse(value), null, 2)
}

function deriveMCPFieldsFromJSON(value: string): Pick<AgentMCPServerOption, 'type' | 'command' | 'args' | 'env' | 'url' | 'headers'> {
  const parsed = JSON.parse(value) as Record<string, unknown>
  const type = parsed.type === 'http' || parsed.type === 'sse' ? parsed.type : 'stdio'
  const command = typeof parsed.command === 'string' ? parsed.command.trim() : ''
  const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
  if (type === 'stdio' && !command) {
    throw new Error('STDIO MCP 需要 command')
  }
  if ((type === 'http' || type === 'sse') && !url) {
    throw new Error('HTTP/SSE MCP 需要 url')
  }
  return {
    type,
    command,
    args: Array.isArray(parsed.args) ? parsed.args.filter((item): item is string => typeof item === 'string') : [],
    env: recordToKeyValues(parsed.env),
    url,
    headers: recordToKeyValues(parsed.headers),
  }
}

function recordToKeyValues(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
    key,
    value: typeof item === 'string' ? item : String(item ?? ''),
  }))
}

function defaultWecomChannelConfig() {
  return JSON.stringify({
    heartbeatInterval: 30000,
    maxReconnectAttempts: 10,
  }, null, 2)
}

function botCapabilityIds(bot: AgentBot | undefined, type: AgentBotCapability['capabilityType']) {
  return bot?.capabilities
    .filter((item) => item.capabilityType === type && item.enabled === AGENT_BOT_CAPABILITY_ENABLED)
    .map((item) => item.capabilityId) || []
}

function buildBotPayload(
  values: AgentBotFormValues,
  editingBot: AgentBot | null,
  skills: AgentSkillOption[],
  mcpServers: AgentMCPServerOption[],
) {
  const firstChannel = editingBot?.channels[0]
  const capabilities: AgentBotCapability[] = [
    ...values.skillIds.map((id) =>
      capabilityFromOption(editingBot, 'skill', id, skills.find((item) => item.id === id)?.name || id),
    ),
    ...values.mcpIds.map((id) =>
      capabilityFromOption(editingBot, 'mcp', id, mcpServers.find((item) => item.id === id)?.name || id),
    ),
  ]
  return {
    id: editingBot?.id,
    name: values.name.trim(),
    code: values.code.trim(),
    status: values.status ? AGENT_BOT_STATUS_ENABLED : AGENT_BOT_STATUS_DISABLED,
    description: values.description?.trim() || '',
    businessScene: values.businessScene?.trim() || '',
    welcomeMessage: values.welcomeMessage?.trim() || '',
    modelId: values.modelId,
    systemPrompt: values.systemPrompt.trim(),
    permissionMode: values.permissionMode || 'bypassPermissions',
    maxTurns: values.maxTurns || 20,
    channels: [{
      id: firstChannel?.id || '',
      botId: editingBot?.id || '',
      channel: values.channelType || 'wecom',
      name: values.channelName?.trim() || CHANNEL_OPTIONS.find((item) => item.value === values.channelType)?.label || '渠道',
      status: values.channelEnabled ? AGENT_BOT_CHANNEL_STATUS_ENABLED : AGENT_BOT_CHANNEL_STATUS_DISABLED,
      externalBotId: values.externalBotId?.trim() || '',
      secret: values.secret?.trim() || '',
      endpointUrl: values.endpointUrl?.trim() || '',
      configJson: normalizeOptionalJSON(values.configJson),
      createdAt: firstChannel?.createdAt || 0,
      updatedAt: Date.now(),
    }],
    capabilities,
  }
}

function capabilityFromOption(
  editingBot: AgentBot | null,
  type: AgentBotCapability['capabilityType'],
  id: string,
  name: string,
): AgentBotCapability {
  const existing = editingBot?.capabilities.find((item) => item.capabilityType === type && item.capabilityId === id)
  return {
    id: existing?.id || '',
    botId: editingBot?.id || '',
    capabilityType: type,
    capabilityId: id,
    name,
    enabled: AGENT_BOT_CAPABILITY_ENABLED,
    createdAt: existing?.createdAt || 0,
    updatedAt: Date.now(),
  }
}

function validateOptionalJSON(value: unknown) {
  try {
    normalizeOptionalJSON(String(value || ''))
    return Promise.resolve()
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error('JSON 配置无效'))
  }
}

function normalizeOptionalJSON(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return JSON.stringify(JSON.parse(trimmed), null, 2)
}

function upsertBot(current: AgentBot[], bot: AgentBot) {
  const exists = current.some((item) => item.id === bot.id)
  return exists
    ? current.map((item) => (item.id === bot.id ? bot : item))
    : [bot, ...current]
}
