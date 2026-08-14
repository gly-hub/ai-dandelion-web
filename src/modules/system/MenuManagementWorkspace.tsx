import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tag, TreeSelect } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  createSystemMenu,
  deleteSystemMenu,
  disableSystemMenu,
  enableSystemMenu,
  listSystemMenus,
  updateSystemMenu,
} from '../../lib/systemApi'
import {
  buildModuleLabelMap,
  buildModuleOptions,
  buildParentDirectoryTreeData,
  flattenMenus,
  getModuleLabel,
} from '../../lib/navMenus'
import { isGeneratedFunctionMenu } from '../../lib/funcMenus'
import { menuIconOptions } from '../../lib/menuIcons'
import type { SystemMenu } from '../../types'
import { OperationLogPanel } from './OperationLogWorkspace'
import { useNavMenus } from '../../contexts/NavMenuContext'
import {
  MENU_MODULE_FUNC_OPERATION,
  MENU_PLACEMENT_MODULE_NAV,
  MENU_STATUS_DISABLED,
  MENU_STATUS_ENABLED,
  MENU_TYPE_BUTTON,
  MENU_TYPE_DIRECTORY,
  MENU_TYPE_MENU,
  MENU_VISIBLE_NO,
  MENU_VISIBLE_YES,
} from '../../types'

type MenuFormValues = {
  parentId?: string
  module: string
  placement: string
  name: string
  code: string
  viewKey: string
  icon: string
  menuType: number
  sort: number
  status: number
  visible: number
  isDefault: boolean
  remark: string
}

const placementOptions = [
  { value: MENU_PLACEMENT_MODULE_NAV, label: '导航菜单' },
]

const menuTypeOptions = [
  { value: MENU_TYPE_DIRECTORY, label: '目录' },
  { value: MENU_TYPE_MENU, label: '菜单' },
  { value: MENU_TYPE_BUTTON, label: '按钮' },
]

function menuTypeLabel(type: number) {
  if (type === MENU_TYPE_DIRECTORY) {
    return '目录'
  }
  if (type === MENU_TYPE_BUTTON) {
    return '按钮'
  }
  return '菜单'
}

function placementLabel(placement: string) {
  return placementOptions.find((item) => item.value === placement)?.label || placement
}

type MenuTableRow = {
  id: string
  rowType: 'group' | 'menu'
  name: string
  code?: string
  module?: string
  placement?: string
  viewKey?: string
  icon?: string
  menuType?: number
  sort?: number
  status?: number
  visible?: number
  isDefault?: boolean
  menu?: SystemMenu
  children?: MenuTableRow[]
}

function systemMenuToTableRow(item: SystemMenu): MenuTableRow {
  return {
    id: item.id,
    rowType: 'menu',
    name: item.name,
    code: item.code,
    module: item.module,
    placement: item.placement,
    viewKey: item.viewKey,
    icon: item.icon,
    menuType: item.menuType,
    sort: item.sort,
    status: item.status,
    visible: item.visible,
    isDefault: item.isDefault,
    menu: item,
  }
}

function nestMenuRows(items: SystemMenu[]): MenuTableRow[] {
  const byId = new Map<string, MenuTableRow>()
  items.forEach((item) => {
    byId.set(item.id, { ...systemMenuToTableRow(item), children: [] })
  })

  const roots: MenuTableRow[] = []
  byId.forEach((row) => {
    const parentId = row.menu?.parentId
    if (!parentId || !byId.has(parentId)) {
      roots.push(row)
      return
    }
    byId.get(parentId)?.children?.push(row)
  })

  const sortRows = (rows: MenuTableRow[]) => {
    rows.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, 'zh-CN'))
    rows.forEach((row) => {
      if (row.children?.length) {
        sortRows(row.children)
      } else {
        delete row.children
      }
    })
  }
  sortRows(roots)
  return roots
}

function buildMenuTableTree(
  menus: SystemMenu[],
  filterModule: string,
): MenuTableRow[] {
  let flat = flattenMenus(menus)
  if (filterModule) {
    flat = flat.filter((item) => item.module === filterModule)
  }
  return nestMenuRows(flat.filter((item) => item.placement === MENU_PLACEMENT_MODULE_NAV))
}

export function MenuManagementWorkspace() {
  const { message, modal } = App.useApp()
  const { hasPageButton } = useNavMenus()
  const [form] = Form.useForm<MenuFormValues>()
  const [menus, setMenus] = useState<SystemMenu[]>([])
  const [allMenus, setAllMenus] = useState<SystemMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<SystemMenu | null>(null)
  const [filterModule, setFilterModule] = useState('')
  const [operationLogsOpen, setOperationLogsOpen] = useState(false)
  const canCreate = hasPageButton('func-operation', 'menus', 'create')
  const canUpdate = hasPageButton('func-operation', 'menus', 'update')
  const canStatus = hasPageButton('func-operation', 'menus', 'status')
  const canDelete = hasPageButton('func-operation', 'menus', 'delete')

  const loadMenus = useCallback(async () => {
    setLoading(true)
    try {
      const [items, allItems] = await Promise.all([
        listSystemMenus({
          module: filterModule || undefined,
          tree: true,
        }),
        listSystemMenus({ tree: true }),
      ])
      setMenus(items)
      setAllMenus(allItems)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载菜单失败')
    } finally {
      setLoading(false)
    }
  }, [filterModule, message])

  useEffect(() => {
    void loadMenus()
  }, [loadMenus])

  const moduleLabelMap = useMemo(() => buildModuleLabelMap(allMenus), [allMenus])
  const moduleOptions = useMemo(() => buildModuleOptions(moduleLabelMap), [moduleLabelMap])
  const defaultModule = moduleOptions[0]?.value || MENU_MODULE_FUNC_OPERATION

  const tableRows = useMemo(
    () => buildMenuTableTree(menus, filterModule),
    [menus, filterModule],
  )

  const formModule = Form.useWatch('module', form)

  const parentDirectoryTree = useMemo(
    () =>
      buildParentDirectoryTreeData(allMenus, {
        module: formModule || defaultModule,
        placement: MENU_PLACEMENT_MODULE_NAV,
        excludeMenuId: editingMenu?.id,
      }),
    [allMenus, defaultModule, editingMenu?.id, formModule],
  )

  const resetParentDirectory = () => {
    form.setFieldValue('parentId', undefined)
  }

  const openCreateModal = () => {
    setEditingMenu(null)
    form.setFieldsValue({
      parentId: '',
      module: filterModule || defaultModule,
      placement: MENU_PLACEMENT_MODULE_NAV,
      name: '',
      code: '',
      viewKey: '',
      icon: '',
      menuType: MENU_TYPE_MENU,
      sort: 0,
      status: MENU_STATUS_ENABLED,
      visible: MENU_VISIBLE_YES,
      isDefault: false,
      remark: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (menu: SystemMenu) => {
    setEditingMenu(menu)
    form.setFieldsValue({
      parentId: menu.parentId || '',
      module: menu.module,
      placement: MENU_PLACEMENT_MODULE_NAV,
      name: menu.name,
      code: menu.code,
      viewKey: menu.viewKey,
      icon: menu.icon,
      menuType: menu.menuType,
      sort: menu.sort,
      status: menu.status,
      visible: menu.visible,
      isDefault: menu.isDefault,
      remark: menu.remark,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (editingMenu ? !canUpdate : !canCreate) {
      message.warning('当前角色没有执行此操作的权限')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        parentId: values.parentId || '',
        module: values.module,
        placement: MENU_PLACEMENT_MODULE_NAV,
        name: values.name,
        code: values.code,
        viewKey: values.viewKey || values.code,
        icon: values.icon,
        menuType: values.menuType,
        sort: values.sort,
        status: values.status,
        visible: values.visible,
        isDefault: values.isDefault,
        remark: values.remark,
      }
      if (editingMenu) {
        await updateSystemMenu(editingMenu.id, payload)
        message.success('菜单已更新')
      } else {
        await createSystemMenu(payload)
        message.success('菜单已创建')
      }
      setModalOpen(false)
      await loadMenus()
    } catch (error) {
      if (error instanceof Error && error.message) {
        message.error(error.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (menu: SystemMenu) => {
    if (!canDelete) {
      message.warning('当前角色没有删除菜单的权限')
      return
    }
    modal.confirm({
      title: '删除菜单',
      content: `确认删除「${menu.name}」？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteSystemMenu(menu.id)
          message.success('菜单已删除')
          await loadMenus()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败')
          throw error
        }
      },
    })
  }

  const handleToggleStatus = async (menu: SystemMenu) => {
    if (!canStatus) {
      message.warning('当前角色没有启停菜单的权限')
      return
    }
    try {
      if (menu.status === MENU_STATUS_ENABLED) {
        await disableSystemMenu(menu.id)
        message.success('菜单已禁用')
      } else {
        await enableSystemMenu(menu.id)
        message.success('菜单已启用')
      }
      await loadMenus()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    }
  }

  const columns = useMemo<ColumnsType<MenuTableRow>>(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        width: 220,
        render: (name: string, record) => {
          if (record.rowType === 'group') {
            return <span className="menu-tree-group-name">{name}</span>
          }
          if (record.menu && isGeneratedFunctionMenu(record.menu)) {
            return (
              <Space size={4}>
                <span>{name}</span>
                <Tag color="processing">生成</Tag>
              </Space>
            )
          }
          return name
        },
      },
      {
        title: '编码',
        dataIndex: 'code',
        key: 'code',
        width: 180,
        render: (code: string | undefined) => code || '--',
      },
      {
        title: '模块',
        dataIndex: 'module',
        key: 'module',
        width: 110,
        render: (module: string | undefined) => (module ? getModuleLabel(module, moduleLabelMap) : '--'),
      },
      {
        title: '位置',
        dataIndex: 'placement',
        key: 'placement',
        width: 110,
        render: (placement: string | undefined) => (placement ? placementLabel(placement) : '--'),
      },
      {
        title: '视图',
        dataIndex: 'viewKey',
        key: 'viewKey',
        width: 120,
        render: (viewKey: string | undefined) => viewKey || '--',
      },
      {
        title: '图标',
        dataIndex: 'icon',
        key: 'icon',
        width: 120,
        render: (icon: string | undefined) => icon || '--',
      },
      {
        title: '类型',
        dataIndex: 'menuType',
        key: 'menuType',
        width: 80,
        render: (menuType: number | undefined) => (menuType ? menuTypeLabel(menuType) : '--'),
      },
      { title: '排序', dataIndex: 'sort', key: 'sort', width: 70, render: (sort?: number) => sort ?? '--' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status: number | undefined) => {
          if (status === undefined) {
            return '--'
          }
          return status === MENU_STATUS_ENABLED ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>
        },
      },
      {
        title: '显示',
        dataIndex: 'visible',
        key: 'visible',
        width: 80,
        render: (visible: number | undefined) => {
          if (visible === undefined) {
            return '--'
          }
          return visible === MENU_VISIBLE_YES ? '是' : '否'
        },
      },
      {
        title: '默认',
        dataIndex: 'isDefault',
        key: 'isDefault',
        width: 70,
        render: (value: boolean | undefined) => (value === undefined ? '--' : value ? '是' : '否'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_value, record) => {
          if (record.rowType !== 'menu' || !record.menu) {
            return null
          }
          const menu = record.menu
          if (isGeneratedFunctionMenu(menu)) {
            return <Tag color="default">由功能发布同步</Tag>
          }
          return (
            <Space size="small" wrap>
              {canUpdate ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(menu)}>
                编辑
              </Button> : null}
              {canStatus ? <Button
                type="link"
                size="small"
                icon={menu.status === MENU_STATUS_ENABLED ? <StopOutlined /> : <CheckCircleOutlined />}
                onClick={() => void handleToggleStatus(menu)}
              >
                {menu.status === MENU_STATUS_ENABLED ? '禁用' : '启用'}
              </Button> : null}
              {canDelete ? <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(menu)}>
                删除
              </Button> : null}
            </Space>
          )
        },
      },
    ],
    [canDelete, canStatus, canUpdate, moduleLabelMap],
  )

  return (
    <div className="system-user-workspace">
      <div className="system-user-toolbar">
        <Space wrap>
          <Select
            allowClear
            placeholder="模块"
            style={{ width: 140 }}
            options={moduleOptions}
            value={filterModule || undefined}
            onChange={(value) => setFilterModule(value || '')}
          />
        </Space>
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => setOperationLogsOpen(true)}>
            操作记录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadMenus()}>
            刷新
          </Button>
          {canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建菜单
          </Button> : null}
        </Space>
      </div>

      <div className="system-user-panel">
        <Spin spinning={loading}>
          <Table<MenuTableRow>
            rowKey="id"
            columns={columns}
            dataSource={tableRows}
            scroll={{ x: 1400 }}
            pagination={false}
            expandable={{ defaultExpandAllRows: true, indentSize: 20 }}
            rowClassName={(record) => (record.rowType === 'group' ? 'menu-tree-group-row' : '')}
          />
        </Spin>
      </div>

      <Modal
        title={editingMenu ? '编辑菜单' : '新建菜单'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={saving}
        destroyOnHidden
        width={760}
      >
        <Form<MenuFormValues> form={form} layout="vertical" requiredMark={false} className="menu-modal-form">
          <section className="menu-modal-section">
            <h4 className="menu-modal-section-title">挂载信息</h4>
            <div className="menu-modal-grid menu-modal-grid-2">
              <Form.Item label="所属模块" name="module" rules={[{ required: true, message: '请选择模块' }]}>
                <Select
                  options={moduleOptions}
                  onChange={() => {
                    resetParentDirectory()
                  }}
                />
              </Form.Item>
              <Form.Item label="父级目录" name="parentId">
                <TreeSelect
                  allowClear
                  showSearch
                  treeDefaultExpandAll
                  placeholder={parentDirectoryTree.length > 0 ? '无父级' : '当前模块暂无目录'}
                  treeData={parentDirectoryTree}
                  treeNodeFilterProp="title"
                  notFoundContent="当前模块暂无目录"
                />
              </Form.Item>
            </div>
          </section>

          <section className="menu-modal-section">
            <h4 className="menu-modal-section-title">页面标识</h4>
            <div className="menu-modal-grid menu-modal-grid-2">
              <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="菜单名称" />
              </Form.Item>
              <Form.Item label="编码" name="code" rules={[{ required: true, message: '请输入编码' }]}>
                <Input placeholder="如 system.users" />
              </Form.Item>
              <Form.Item label="视图键" name="viewKey">
                <Input placeholder="默认同编码，如 users / toolbox" />
              </Form.Item>
              <Form.Item label="图标" name="icon">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择菜单图标"
                  optionFilterProp="searchText"
                  options={menuIconOptions.map((item) => ({
                    value: item.value,
                    label: (
                      <span className="menu-icon-option">
                        <span className="menu-icon-option-preview">{item.icon}</span>
                        <span>{item.label}</span>
                        <span className="menu-icon-option-key">{item.value}</span>
                      </span>
                    ),
                    searchText: `${item.label} ${item.value}`,
                  }))}
                />
              </Form.Item>
            </div>
          </section>

          <section className="menu-modal-section">
            <h4 className="menu-modal-section-title">展示设置</h4>
            <div className="menu-modal-grid menu-modal-display-grid">
              <Form.Item label="类型" name="menuType" rules={[{ required: true, message: '请选择类型' }]}>
                <Select options={menuTypeOptions} />
              </Form.Item>
              <Form.Item label="排序" name="sort">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
              <Form.Item label="状态" name="status" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: MENU_STATUS_ENABLED, label: '启用' },
                    { value: MENU_STATUS_DISABLED, label: '禁用' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="是否显示" name="visible" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: MENU_VISIBLE_YES, label: '显示' },
                    { value: MENU_VISIBLE_NO, label: '隐藏' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="默认页" name="isDefault" valuePropName="checked" className="menu-modal-switch-item">
                <Switch />
              </Form.Item>
            </div>
          </section>

          <Form.Item label="备注" name="remark" className="menu-modal-remark-item">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="菜单管理操作记录"
        open={operationLogsOpen}
        footer={null}
        onCancel={() => setOperationLogsOpen(false)}
        destroyOnHidden
        width={1080}
      >
        <OperationLogPanel resourceType="menu" title="菜单管理操作记录" />
      </Modal>
    </div>
  )
}
