import { useEffect, useState } from 'react'
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavMenus } from '../../contexts/NavMenuContext'
import { listSystemNotifications, listSystemUsers, sendSystemNotification } from '../../lib/systemApi'
import type { SystemUser } from '../../types'
import type { SystemNotification } from '../../types'

export function NotificationManagementWorkspace() {
  const { message } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm()
  const [items, setItems] = useState<SystemNotification[]>([])
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const canCreate = hasPageButton('func-operation', 'notifications', 'create')
  const load = async () => { setLoading(true); try { const result = await listSystemNotifications({ pageSize: 100 }); setItems(result.notifications) } catch (error) { message.error(error instanceof Error ? error.message : '加载通知失败') } finally { setLoading(false) } }
  useEffect(() => { void load(); void listSystemUsers().then(setUsers).catch(() => undefined) }, [])
  const submit = async () => {
    if (!canCreate) {
      message.warning('当前角色没有发送通知的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSending(true)
      await sendSystemNotification(values)
      message.success('通知已发送')
      form.resetFields()
      setCreateOpen(false)
      await load()
    } catch (error) {
      if (error instanceof Error && error.message) message.error(error.message)
    } finally {
      setSending(false)
    }
  }

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({ displayType: 'toast', level: 'info' })
    setCreateOpen(true)
  }

  return <section className="system-user-workspace">
    <div className="system-user-toolbar">
      <strong>通知管理</strong>
      <Space>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加通知</Button> : null}
      </Space>
    </div>
    <div className="system-user-panel">
      <Table<SystemNotification>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', render: (value: number) => new Date(value / 1000).toLocaleString() },
          { title: '标题', dataIndex: 'title' },
          { title: '表现', dataIndex: 'displayType', render: (value: string) => <Tag>{value === 'modal' ? '弹窗' : '气泡'}</Tag> },
          { title: '内容', dataIndex: 'content', ellipsis: true },
          { title: '状态', dataIndex: 'read', render: (value: boolean) => <Tag color={value ? 'default' : 'blue'}>{value ? '已读' : '未读'}</Tag> },
        ]}
      />
    </div>
    <Modal
      title="添加通知"
      open={createOpen}
      onCancel={() => { if (!sending) setCreateOpen(false) }}
      onOk={() => void submit()}
      okText="发送通知"
      cancelText="取消"
      confirmLoading={sending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ displayType: 'toast', level: 'info' }}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入通知标题' }]}><Input placeholder="通知标题" /></Form.Item>
        <Space align="start" wrap style={{ width: '100%' }}>
          <Form.Item name="displayType" label="表现形式" rules={[{ required: true }]}><Select style={{ width: 150 }} options={[{ value: 'toast', label: '气泡提示' }, { value: 'modal', label: '弹窗' }]} /></Form.Item>
          <Form.Item name="level" label="级别"><Select style={{ width: 130 }} options={[{ value: 'info', label: '普通' }, { value: 'success', label: '成功' }, { value: 'warning', label: '警告' }, { value: 'error', label: '错误' }]} /></Form.Item>
        </Space>
        <Form.Item name="userIds" label="接收人"><Select mode="multiple" allowClear style={{ width: '100%' }} placeholder="不选择则发送给全部用户" options={users.filter((user) => user.status === 1).map((user) => ({ value: user.id, label: user.username }))} /></Form.Item>
        <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入通知内容' }]}><Input.TextArea rows={5} maxLength={2000} showCount placeholder="请输入通知内容" /></Form.Item>
      </Form>
    </Modal>
  </section>
}
