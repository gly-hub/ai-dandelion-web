import { useCallback, useEffect, useMemo, useState } from 'react'
import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Descriptions, Drawer, Empty, Input, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { listSystemMenus, listSystemOperationLogs } from '../../lib/systemApi'
import type { SystemMenu, SystemOperationLog } from '../../types'

type OperationLogPanelProps = {
  resourceType?: string
  resourceId?: string
  title?: string
}

type RoleSnapshot = {
  name?: string
  code?: string
  username?: string
  email?: string
  phone?: string
  status?: number
  remark?: string
  sort?: number
  roles?: Array<{ name?: string; code?: string }>
  menus?: Array<{ id?: string; parentId?: string; menuType?: number; name?: string; code?: string }>
  parentId?: string
  module?: string
  placement?: string
  viewKey?: string
  menuType?: number
  visible?: number
  isDefault?: boolean
}

type MenuMetadata = {
  parentId: string
  name: string
  menuType: number
}

const actionOptionsByResource: Record<string, Array<{ value: string; label: string }>> = {
  role: [
    { value: 'role.create', label: '创建角色' },
    { value: 'role.update', label: '更新角色' },
    { value: 'role.menu.update', label: '更新菜单权限' },
    { value: 'role.enable', label: '启用角色' },
    { value: 'role.disable', label: '禁用角色' },
    { value: 'role.delete', label: '删除角色' },
  ],
  user: [
    { value: 'user.create', label: '创建成员' },
    { value: 'user.update', label: '更新成员' },
    { value: 'user.role.update', label: '更新成员角色' },
    { value: 'user.enable', label: '启用成员' },
    { value: 'user.disable', label: '禁用成员' },
    { value: 'user.delete', label: '删除成员' },
  ],
  menu: [
    { value: 'menu.create', label: '创建菜单' },
    { value: 'menu.update', label: '更新菜单' },
    { value: 'menu.enable', label: '启用菜单' },
    { value: 'menu.disable', label: '禁用菜单' },
    { value: 'menu.delete', label: '删除菜单' },
  ],
}

export function OperationLogWorkspace() {
  return <OperationLogPanel title="操作记录" />
}

export function OperationLogPanel({ resourceType, resourceId, title }: OperationLogPanelProps) {
  const { message } = App.useApp()
  const [logs, setLogs] = useState<SystemOperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [action, setAction] = useState('')
  const [selected, setSelected] = useState<SystemOperationLog | null>(null)
  const [menuMetadataByID, setMenuMetadataByID] = useState<Record<string, MenuMetadata>>({})

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    try {
      const result = await listSystemOperationLogs({
        module: resourceType ? 'system' : undefined,
        action: action || undefined,
        resourceType,
        resourceId,
        keyword: keyword.trim() || undefined,
        page: nextPage,
        pageSize: 20,
      })
      setLogs(result.logs)
      setTotal(result.total)
      setPage(nextPage)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载操作记录失败')
    } finally {
      setLoading(false)
    }
  }, [action, keyword, message, resourceId, resourceType])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1)
    })
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listSystemMenus({ tree: true }).then((menus) => setMenuMetadataByID(buildMenuMetadataMap(menus)))
    })
    return () => window.clearTimeout(timer)
  }, [])

  const columns = useMemo<ColumnsType<SystemOperationLog>>(() => [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 176,
      render: (value: number) => formatOperationTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_value, record) => <Tag color="blue">{record.actionLabel || record.action}</Tag>,
    },
    {
      title: '对象',
      key: 'resource',
      width: 190,
      render: (_value, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.resourceName || record.resourceId}</span>
          <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>{resourceLabel(record.resourceType)}</span>
        </Space>
      ),
    },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 130 },
    { title: '摘要', dataIndex: 'summary', key: 'summary', ellipsis: true },
    {
      title: '详情',
      key: 'detail',
      width: 90,
      fixed: 'right',
      render: (_value, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setSelected(record)}>
          查看
        </Button>
      ),
    },
  ], [])

  const showFilters = !resourceId
  return (
    <section className="system-user-workspace">
      {title ? (
        <div className="system-user-toolbar">
          <strong>{title}</strong>
          <Space wrap>
            {showFilters ? (
              <Select
                allowClear
                value={action || undefined}
                placeholder="全部操作"
                style={{ width: 170 }}
                options={resourceType ? actionOptionsByResource[resourceType] || [] : Object.values(actionOptionsByResource).flat()}
                onChange={(value) => setAction(value || '')}
              />
            ) : null}
            <Input
              allowClear
              value={keyword}
              prefix={<SearchOutlined />}
              placeholder="搜索对象、操作人或摘要"
              style={{ width: 240 }}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => void load(1)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load(1)} />
          </Space>
        </div>
      ) : null}
      <div className="system-user-panel">
        <Table<SystemOperationLog>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={logs}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作记录" /> }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage) => void load(nextPage),
          }}
        />
      </div>
      <OperationLogDetailDrawer record={selected} menuMetadataByID={menuMetadataByID} onClose={() => setSelected(null)} />
    </section>
  )
}

function OperationLogDetailDrawer({ record, menuMetadataByID, onClose }: { record: SystemOperationLog | null; menuMetadataByID: Record<string, MenuMetadata>; onClose: () => void }) {
  const before = parseRoleSnapshot(record?.beforeData)
  const after = parseRoleSnapshot(record?.afterData)
  const fieldChanges = changedAuditFields(before, after)
  const menuChanges = changedMenus(before.menus, after.menus, menuMetadataByID)

  return (
    <Drawer title={record ? `${record.actionLabel || record.action}详情` : '操作详情'} open={Boolean(record)} onClose={onClose} width={680}>
      {record ? (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="操作时间">{formatOperationTime(record.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="操作人">{record.operatorName || record.operatorId || '系统'}</Descriptions.Item>
            <Descriptions.Item label="操作对象">{record.resourceName || record.resourceId}</Descriptions.Item>
            <Descriptions.Item label="操作摘要">{record.summary || '-'}</Descriptions.Item>
          </Descriptions>
          {fieldChanges.length ? <ChangeTable title="字段变更" rows={fieldChanges} /> : null}
          {menuChanges.added.length || menuChanges.removed.length ? <MenuChangePanel added={menuChanges.added} removed={menuChanges.removed} /> : null}
          {!fieldChanges.length && !menuChanges.added.length && !menuChanges.removed.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该操作没有可展示的字段差异" />
          ) : null}
        </Space>
      ) : null}
    </Drawer>
  )
}

function ChangeTable({ title, rows }: { title: string; rows: Array<{ field: string; before: string; after: string }> }) {
  return (
    <section>
      <strong>{title}</strong>
      <Table size="small" style={{ marginTop: 10 }} rowKey="field" pagination={false} dataSource={rows} columns={[
        { title: '字段', dataIndex: 'field', width: 110 },
        { title: '变更前', dataIndex: 'before' },
        { title: '变更后', dataIndex: 'after' },
      ]} />
    </section>
  )
}

function MenuChangePanel({ added, removed }: { added: string[]; removed: string[] }) {
  return (
    <section>
      <strong>菜单权限变更</strong>
      <Space direction="vertical" size={12} style={{ display: 'flex', marginTop: 10 }}>
        {added.length ? <PermissionList title="新增权限" color="success" values={added} /> : null}
        {removed.length ? <PermissionList title="移除权限" color="error" values={removed} /> : null}
      </Space>
    </section>
  )
}

function PermissionList({ title, color, values }: { title: string; color: string; values: string[] }) {
  return <div><span style={{ display: 'inline-block', width: 76 }}>{title}</span>{values.map((value) => <Tag color={color} key={value}>{value}</Tag>)}</div>
}

function parseRoleSnapshot(raw?: string): RoleSnapshot {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' ? value as RoleSnapshot : {}
  } catch {
    return {}
  }
}

function changedAuditFields(before: RoleSnapshot, after: RoleSnapshot): Array<{ field: string; before: string; after: string }> {
  const fields: Array<{ key: keyof RoleSnapshot; label: string }> = [
    { key: 'name', label: '角色名称' },
    { key: 'code', label: '角色编码' },
    { key: 'username', label: '成员名称' },
    { key: 'email', label: '邮箱' },
    { key: 'phone', label: '手机号' },
    { key: 'roles', label: '角色' },
    { key: 'parentId', label: '父级菜单' },
    { key: 'module', label: '所属模块' },
    { key: 'placement', label: '挂载位置' },
    { key: 'viewKey', label: '视图键' },
    { key: 'menuType', label: '菜单类型' },
    { key: 'visible', label: '是否显示' },
    { key: 'isDefault', label: '默认页' },
    { key: 'status', label: '状态' },
    { key: 'remark', label: '备注' },
    { key: 'sort', label: '排序' },
  ]
  return fields.flatMap(({ key, label }) => {
    const beforeValue = formatAuditField(key, before[key])
    const afterValue = formatAuditField(key, after[key])
    return beforeValue === afterValue ? [] : [{ field: label, before: beforeValue, after: afterValue }]
  })
}

function changedMenus(before: RoleSnapshot['menus'], after: RoleSnapshot['menus'], metadataByID: Record<string, MenuMetadata>) {
  const beforeByID = new Map((before || []).map((item) => [menuID(item), item]))
  const afterByID = new Map((after || []).map((item) => [menuID(item), item]))
  const added = [...afterByID].filter(([id]) => !beforeByID.has(id)).map(([, item]) => item)
  const removed = [...beforeByID].filter(([id]) => !afterByID.has(id)).map(([, item]) => item)
  return {
    added: collapseInheritedMenuChanges(added, after || [], metadataByID).map((item) => menuLabel(item, metadataByID)),
    removed: collapseInheritedMenuChanges(removed, before || [], metadataByID).map((item) => menuLabel(item, metadataByID)),
  }
}

function collapseInheritedMenuChanges(
  changes: Array<NonNullable<RoleSnapshot['menus']>[number]>,
  snapshotMenus: NonNullable<RoleSnapshot['menus']>,
  metadataByID: Record<string, MenuMetadata>,
) {
  const parentByID = new Map(Object.entries(metadataByID).map(([id, item]) => [id, item.parentId]))
  snapshotMenus.forEach((menu) => parentByID.set(menuID(menu), menu.parentId || parentByID.get(menuID(menu)) || ''))
  const changedIDs = new Set(changes.map(menuID))
  return changes.filter((menu) => ![...changedIDs].some((id) => id !== menuID(menu) && isMenuAncestor(menuID(menu), id, parentByID)))
}

function isMenuAncestor(ancestorID: string, menuIDValue: string, parentByID: Map<string, string>) {
  let parentID = parentByID.get(menuIDValue) || ''
  while (parentID) {
    if (parentID === ancestorID) return true
    parentID = parentByID.get(parentID) || ''
  }
  return false
}

function menuID(menu: NonNullable<RoleSnapshot['menus']>[number]) {
  return menu.id || menu.code || menu.name || ''
}

function formatAuditField(key: keyof RoleSnapshot, value: unknown): string {
  if (key === 'status') {
    return value === 1 ? '启用' : value === 2 ? '禁用' : '-'
  }
  if (key === 'menuType') {
    return value === 1 ? '目录' : value === 2 ? '菜单' : value === 3 ? '按钮' : '-'
  }
  if (key === 'visible') {
    return value === 1 ? '显示' : value === 0 ? '隐藏' : '-'
  }
  if (key === 'isDefault') {
    return value === true ? '是' : value === false ? '否' : '-'
  }
  if (key === 'roles' && Array.isArray(value)) {
    return value.length ? value.map((item) => `${String(item.name || item.code || '')}`).filter(Boolean).join('、') : '无'
  }
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function menuLabel(menu: { id?: string; name?: string; code?: string }, metadataByID: Record<string, MenuMetadata>) {
  const metadata = menu.id ? metadataByID[menu.id] : undefined
  const action = humanizeMenuName(menu.name || metadata?.name || menu.code || '-')
  const parent = metadata?.parentId ? metadataByID[metadata.parentId] : undefined
  return parent?.menuType === 2 ? `${humanizeMenuName(parent.name)} / ${action}` : action
}

function humanizeMenuName(value: string) {
  const labels: Record<string, string> = {
    create: '创建',
    delete: '删除',
    lend: '借出',
    offshelf: '下架',
    onshelf: '上架',
    return_book: '归还',
    update: '更新',
  }
  return labels[value] || value
}

function buildMenuMetadataMap(menus: SystemMenu[]) {
  const metadata: Record<string, MenuMetadata> = {}
  const walk = (items: SystemMenu[]) => {
    items.forEach((item) => {
      metadata[item.id] = { parentId: item.parentId, name: item.name, menuType: item.menuType }
      if (item.children?.length) walk(item.children)
    })
  }
  walk(menus)
  return metadata
}

function resourceLabel(resourceType: string) {
  if (resourceType === 'role') return '角色'
  if (resourceType === 'user') return '成员'
  if (resourceType === 'menu') return '菜单'
  return resourceType || '-'
}

function formatOperationTime(value: number) {
  if (!value) return '-'
  const date = new Date(Math.floor(value / 1000))
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false })
}
