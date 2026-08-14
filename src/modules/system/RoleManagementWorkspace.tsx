import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  HistoryOutlined,
  SafetyOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  createSystemRole,
  deleteSystemRole,
  disableSystemRole,
  enableSystemRole,
  getRoleMenus,
  listSystemMenus,
  listSystemRoles,
  setRoleMenus,
  updateSystemRole,
} from '../../lib/systemApi'
import { buildUnifiedMenuTree, menusToTreeData } from '../../lib/menuTree'
import type { SystemMenu, SystemRole } from '../../types'
import { ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED } from '../../types'
import { OperationLogPanel } from './OperationLogWorkspace'
import { useNavMenus } from '../../contexts/NavMenuContext'

type RoleFormValues = {
  name: string
  code: string
  status: number
  sort: number
  remark: string
}

export function RoleManagementWorkspace() {
  const { message, modal } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<RoleFormValues>()
  const [roles, setRoles] = useState<SystemRole[]>([])
  const [menuTree, setMenuTree] = useState<SystemMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [menuModalOpen, setMenuModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<SystemRole | null>(null)
  const [menuRole, setMenuRole] = useState<SystemRole | null>(null)
  const [checkedMenuIds, setCheckedMenuIds] = useState<string[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [operationLogsOpen, setOperationLogsOpen] = useState(false)
  const canCreate = hasPageButton('func-operation', 'roles', 'create')
  const canUpdate = hasPageButton('func-operation', 'roles', 'update')
  const canPermissions = hasPageButton('func-operation', 'roles', 'permissions')
  const canStatus = hasPageButton('func-operation', 'roles', 'status')
  const canDelete = hasPageButton('func-operation', 'roles', 'delete')

  const loadRoles = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listSystemRoles()
      setRoles(items)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载角色失败')
    } finally {
      setLoading(false)
    }
  }, [message])

  const loadMenuTree = useCallback(async () => {
    try {
      const items = await listSystemMenus({ tree: true })
      setMenuTree(items)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载菜单树失败')
    }
  }, [message])

  useEffect(() => {
    void loadRoles()
    void loadMenuTree()
  }, [loadMenuTree, loadRoles])

  const treeData = useMemo(() => menusToTreeData(buildUnifiedMenuTree(menuTree)), [menuTree])

  const openCreateModal = () => {
    setEditingRole(null)
    form.setFieldsValue({
      name: '',
      code: '',
      status: ROLE_STATUS_ENABLED,
      sort: 0,
      remark: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (role: SystemRole) => {
    setEditingRole(role)
    form.setFieldsValue({
      name: role.name,
      code: role.code,
      status: role.status,
      sort: role.sort,
      remark: role.remark,
    })
    setModalOpen(true)
  }

  const openMenuModal = async (role: SystemRole) => {
    setMenuRole(role)
    setMenuModalOpen(true)
    setMenuLoading(true)
    try {
      const menuIds = await getRoleMenus(role.id)
      setCheckedMenuIds(menuIds)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载角色菜单失败')
    } finally {
      setMenuLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (editingRole ? !canUpdate : !canCreate) {
      message.warning('当前角色没有执行此操作的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        name: values.name,
        code: values.code,
        status: values.status,
        sort: values.sort,
        remark: values.remark,
      }
      if (editingRole) {
        await updateSystemRole(editingRole.id, payload)
        message.success('角色已更新')
      } else {
        await createSystemRole(payload)
        message.success('角色已创建')
      }
      setModalOpen(false)
      await loadRoles()
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMenus = async () => {
    if (!menuRole) {
      return
    }
    if (!canPermissions) {
      message.warning('当前角色没有配置菜单权限的权限')
      return
    }
    try {
      setSaving(true)
      await setRoleMenus(menuRole.id, checkedMenuIds)
      message.success('角色菜单已保存')
      setMenuModalOpen(false)
      await loadRoles()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (role: SystemRole) => {
    modal.confirm({
      title: '删除角色',
      content: `确认删除角色「${role.name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteSystemRole(role.id)
        message.success('角色已删除')
        await loadRoles()
      },
    })
  }

  const handleToggleStatus = async (role: SystemRole) => {
    try {
      if (role.status === ROLE_STATUS_ENABLED) {
        await disableSystemRole(role.id)
        message.success('角色已禁用')
      } else {
        await enableSystemRole(role.id)
        message.success('角色已启用')
      }
      await loadRoles()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    }
  }

  const columns = useMemo<ColumnsType<SystemRole>>(
    () => [
      { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
      { title: '编码', dataIndex: 'code', key: 'code', width: 160 },
      { title: '排序', dataIndex: 'sort', key: 'sort', width: 80 },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 90,
        render: (status: number) =>
          status === ROLE_STATUS_ENABLED ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>,
      },
      { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_value, record) => (
          <Space size="small" wrap>
            {canPermissions ? <Button type="link" size="small" icon={<SafetyOutlined />} onClick={() => void openMenuModal(record)}>
              菜单权限
            </Button> : null}
            {canUpdate ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              编辑
            </Button> : null}
            {canStatus ? <Button
              type="link"
              size="small"
              icon={record.status === ROLE_STATUS_ENABLED ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => void handleToggleStatus(record)}
            >
              {record.status === ROLE_STATUS_ENABLED ? '禁用' : '启用'}
            </Button> : null}
            {canDelete ? <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              删除
            </Button> : null}
          </Space>
        ),
      },
    ],
    [canDelete, canPermissions, canStatus, canUpdate],
  )

  return (
    <div className="system-user-workspace">
      <div className="system-user-toolbar">
        <span />
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => setOperationLogsOpen(true)}>
            操作记录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadRoles()}>
            刷新
          </Button>
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建角色
          </Button> : null}
        </Space>
      </div>

      <div className="system-user-panel">
        <Spin spinning={loading}>
          <Table<SystemRole> rowKey="id" columns={columns} dataSource={roles} scroll={{ x: 900 }} pagination={false} />
        </Spin>
      </div>

      <Modal
        title={editingRole ? '编辑角色' : '新建角色'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
        width={520}
      >
        <Form<RoleFormValues> form={form} layout="vertical" requiredMark="optional">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 运营人员" />
          </Form.Item>
          <Form.Item label="编码" name="code" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="如 operator" disabled={Boolean(editingRole?.code === 'admin')} />
          </Form.Item>
          <Form.Item label="排序" name="sort">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select
              options={[
                { value: ROLE_STATUS_ENABLED, label: '启用' },
                { value: ROLE_STATUS_DISABLED, label: '禁用' },
              ]}
            />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={menuRole ? `配置菜单权限：${menuRole.name}` : '配置菜单权限'}
        open={menuModalOpen}
        onCancel={() => setMenuModalOpen(false)}
        onOk={() => void handleSaveMenus()}
        confirmLoading={saving}
        destroyOnHidden
        width={720}
      >
        <Spin spinning={menuLoading}>
          <div className="role-menu-tree-panel">
            <Tree
              checkable
              checkStrictly
              defaultExpandAll
              checkedKeys={checkedMenuIds}
              treeData={treeData}
              onCheck={(_keys, info) => {
                setCheckedMenuIds((current) => updateMenuSelection(current, String(info.node.key), info.checked, menuTree))
              }}
            />
          </div>
        </Spin>
      </Modal>
      <Modal
        title="角色管理操作记录"
        open={operationLogsOpen}
        footer={null}
        onCancel={() => setOperationLogsOpen(false)}
        destroyOnHidden
        width={1080}
      >
        <OperationLogPanel resourceType="role" title="角色管理操作记录" />
      </Modal>
    </div>
  )
}

function updateMenuSelection(current: string[], menuID: string, checked: boolean, menuTree: SystemMenu[]): string[] {
  const byID = new Map<string, SystemMenu>()
  const childrenByParent = new Map<string, string[]>()
  const walk = (menus: SystemMenu[]) => {
    for (const menu of menus) {
      byID.set(menu.id, menu)
      const siblings = childrenByParent.get(menu.parentId) || []
      siblings.push(menu.id)
      childrenByParent.set(menu.parentId, siblings)
      if (menu.children?.length) walk(menu.children)
    }
  }
  walk(menuTree)

  const selected = new Set(current)
  const menu = byID.get(menuID)
  if (!menu) return current
  const descendants = collectDescendantIDs(menuID, childrenByParent)
  if (checked) {
    selected.add(menuID)
    if (menu.menuType !== 3) descendants.forEach((id) => selected.add(id))
    if (menu.menuType === 2) addDirectoryAncestors(menu, byID, selected)
  } else {
    selected.delete(menuID)
    if (menu.menuType !== 3) descendants.forEach((id) => selected.delete(id))
  }
  return [...selected]
}

function collectDescendantIDs(menuID: string, childrenByParent: Map<string, string[]>): string[] {
  const result: string[] = []
  const walk = (parentID: string) => {
    for (const childID of childrenByParent.get(parentID) || []) {
      result.push(childID)
      walk(childID)
    }
  }
  walk(menuID)
  return result
}

function addDirectoryAncestors(menu: SystemMenu, byID: Map<string, SystemMenu>, selected: Set<string>) {
  let parentID = menu.parentId
  while (parentID) {
    const parent = byID.get(parentID)
    if (!parent) return
    if (parent.menuType === 1) selected.add(parent.id)
    parentID = parent.parentId
  }
}
