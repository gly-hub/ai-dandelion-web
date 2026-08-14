import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { App, Button, Form, Input, Modal, Select, Space, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  createSystemUser,
  deleteSystemUser,
  disableSystemUser,
  enableSystemUser,
  getUserRoles,
  listSystemRoles,
  listSystemUsers,
  setUserRoles,
  updateSystemUser,
} from '../../lib/systemApi'
import type { SystemUser } from '../../types'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '../../types'
import { OperationLogPanel } from './OperationLogWorkspace'
import { useNavMenus } from '../../contexts/NavMenuContext'

type UserFormValues = {
  username: string
  email: string
  password?: string
  phone?: string
  status: number
  roleIds: string[]
}

export function UserManagementWorkspace() {
  const { message, modal } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<UserFormValues>()
  const [users, setUsers] = useState<SystemUser[]>([])
  const [roleOptions, setRoleOptions] = useState<Array<{ value: string; label: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null)
  const [operationLogsOpen, setOperationLogsOpen] = useState(false)
  const canCreate = hasPageButton('func-operation', 'users', 'create')
  const canUpdate = hasPageButton('func-operation', 'users', 'update')
  const canStatus = hasPageButton('func-operation', 'users', 'status')
  const canDelete = hasPageButton('func-operation', 'users', 'delete')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const [items, roles] = await Promise.all([listSystemUsers(), listSystemRoles()])
      setUsers(items)
      setRoleOptions(roles.map((role) => ({ value: role.id, label: `${role.name} (${role.code})` })))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const openCreateModal = () => {
    setEditingUser(null)
    form.setFieldsValue({
      username: '',
      email: '',
      password: '',
      phone: '',
      status: USER_STATUS_ENABLED,
      roleIds: [],
    })
    setModalOpen(true)
  }

  const openEditModal = async (user: SystemUser) => {
    setEditingUser(user)
    let roleIds = user.roleIds || []
    try {
      roleIds = await getUserRoles(user.id)
    } catch {
      roleIds = user.roleIds || []
    }
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      password: '',
      phone: user.phone,
      status: user.status,
      roleIds,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (editingUser ? !canUpdate : !canCreate) {
      message.warning('当前角色没有执行此操作的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editingUser) {
        await updateSystemUser(editingUser.id, {
          username: values.username,
          email: values.email,
          password: values.password,
          phone: values.phone,
          status: values.status,
        })
        await setUserRoles(editingUser.id, values.roleIds || [])
        message.success('用户已更新')
      } else {
        const created = await createSystemUser({
          username: values.username,
          email: values.email,
          password: values.password || '',
          phone: values.phone,
          status: values.status,
        })
        await setUserRoles(created.id, values.roleIds || [])
        message.success('用户已创建')
      }
      setModalOpen(false)
      await loadUsers()
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (user: SystemUser) => {
    modal.confirm({
      title: '删除用户',
      content: `确认删除用户「${user.username}」？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteSystemUser(user.id)
          message.success('用户已删除')
          await loadUsers()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败')
          throw error
        }
      },
    })
  }

  const handleToggleStatus = async (user: SystemUser) => {
    try {
      if (user.status === USER_STATUS_ENABLED) {
        await disableSystemUser(user.id)
        message.success('用户已禁用')
      } else {
        await enableSystemUser(user.id)
        message.success('用户已启用')
      }
      await loadUsers()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    }
  }

  const columns = useMemo<ColumnsType<SystemUser>>(
    () => [
      {
        title: '用户名',
        dataIndex: 'username',
        key: 'username',
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: '手机号',
        dataIndex: 'phone',
        key: 'phone',
        render: (phone: string) => phone || '--',
      },
      {
        title: '角色',
        dataIndex: 'roleIds',
        key: 'roleIds',
        render: (roleIds: string[] | undefined) => {
          if (!roleIds?.length) {
            return '--'
          }
          const labels = roleIds
            .map((id) => roleOptions.find((item) => item.value === id)?.label)
            .filter(Boolean)
          return labels.length ? labels.join('、') : roleIds.join('、')
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: number) =>
          status === USER_STATUS_ENABLED ? (
            <Tag color="success">启用</Tag>
          ) : (
            <Tag color="default">禁用</Tag>
          ),
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (createdAt: number) => formatTime(createdAt),
      },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_value, record) => (
          <Space size="small" wrap>
            {canUpdate ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              编辑
            </Button> : null}
            {canStatus ? <Button
              type="link"
              size="small"
              icon={record.status === USER_STATUS_ENABLED ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => void handleToggleStatus(record)}
            >
              {record.status === USER_STATUS_ENABLED ? '禁用' : '启用'}
            </Button> : null}
            {canDelete ? <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            >
              删除
            </Button> : null}
          </Space>
        ),
      },
    ],
    [canDelete, canStatus, canUpdate, roleOptions],
  )

  return (
    <div className="system-user-workspace">
      <div className="system-user-toolbar">
        <span />
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => setOperationLogsOpen(true)}>
            操作记录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadUsers()}>
            刷新
          </Button>
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建用户
          </Button> : null}
        </Space>
      </div>

      <div className="system-user-panel">
        <Spin spinning={loading}>
          <Table<SystemUser>
            rowKey="id"
            columns={columns}
            dataSource={users}
            pagination={{ pageSize: 10, showSizeChanger: true }}
          />
        </Spin>
      </div>

      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
        width={520}
      >
        <Form<UserFormValues> form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
              { max: 64, message: '用户名最多 64 个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={
              editingUser
                ? [{ min: 6, message: '密码至少 6 位' }]
                : [
                    { required: true, message: '请输入密码' },
                    { min: 6, message: '密码至少 6 位' },
                  ]
            }
          >
            <Input.Password placeholder={editingUser ? '留空则不修改密码' : '请输入密码'} />
          </Form.Item>
          <Form.Item label="手机号" name="phone">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: USER_STATUS_ENABLED, label: '启用' },
                { value: USER_STATUS_DISABLED, label: '禁用' },
              ]}
            />
          </Form.Item>
          <Form.Item label="角色" name="roleIds">
            <Select mode="multiple" allowClear placeholder="选择角色" options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="成员管理操作记录"
        open={operationLogsOpen}
        footer={null}
        onCancel={() => setOperationLogsOpen(false)}
        destroyOnHidden
        width={1080}
      >
        <OperationLogPanel resourceType="user" title="成员管理操作记录" />
      </Modal>
    </div>
  )
}

function formatTime(value: number) {
  if (!value) {
    return '--'
  }
  const milliseconds = value > 9_999_999_999 ? Math.floor(value / 1000) : value * 1000
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
