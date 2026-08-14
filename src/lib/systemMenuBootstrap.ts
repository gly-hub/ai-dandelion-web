import {
  createSystemMenu,
  listSystemMenus,
  updateSystemMenu,
} from './systemApi'
import { flattenMenus } from './navMenus'
import {
	MENU_MODULE_FUNC_OPERATION,
  MENU_PLACEMENT_MODULE_NAV,
  MENU_STATUS_ENABLED,
  MENU_TYPE_BUTTON,
  MENU_TYPE_MENU,
  MENU_VISIBLE_NO,
  MENU_VISIBLE_YES,
  type SystemMenu,
} from '../types'

const AGENT_SESSION_CONFIG_VIEW_KEY = 'agent-session-configs'
const AGENT_SESSION_CONFIG_CODE = 'system.agent-session-configs'

const AGENT_SESSION_CONFIG_BUTTONS = [
  {
    name: '刷新',
    code: `${AGENT_SESSION_CONFIG_CODE}.refresh`,
    viewKey: 'refresh',
    icon: 'ReloadOutlined',
    sort: 10,
    remark: '控制搭建会话配置的刷新操作',
  },
  {
    name: '保存配置',
    code: `${AGENT_SESSION_CONFIG_CODE}.save`,
    viewKey: 'save',
    icon: 'SaveOutlined',
    sort: 20,
    remark: '控制搭建会话配置的保存操作',
  },
]

export async function ensureAgentSessionConfigMenus(): Promise<boolean> {
  const menus = flattenMenus(await listSystemMenus({ tree: true }))
  const modelMenu = findMenu(menus, 'agent-models', 'system.agent-models')
  let changed = false

  let pageMenu = findMenu(menus, AGENT_SESSION_CONFIG_VIEW_KEY, AGENT_SESSION_CONFIG_CODE)
  if (!pageMenu) {
    pageMenu = await createSystemMenu({
      parentId: modelMenu?.parentId || '',
      module: MENU_MODULE_FUNC_OPERATION,
      placement: MENU_PLACEMENT_MODULE_NAV,
      name: '搭建会话配置',
      code: AGENT_SESSION_CONFIG_CODE,
      viewKey: AGENT_SESSION_CONFIG_VIEW_KEY,
      icon: 'MessageOutlined',
      menuType: MENU_TYPE_MENU,
      sort: modelMenu ? modelMenu.sort + 1 : 21,
      status: MENU_STATUS_ENABLED,
      visible: MENU_VISIBLE_YES,
      isDefault: false,
      remark: '按功能搭建会话类型配置 Agent 参数',
    })
    changed = true
  } else {
    const nextParentId = modelMenu?.parentId || pageMenu.parentId
    const nextSort = pageMenu.sort > 0 ? pageMenu.sort : modelMenu ? modelMenu.sort + 1 : 21
    if (
      pageMenu.name !== '搭建会话配置' ||
      pageMenu.parentId !== nextParentId ||
      pageMenu.code !== AGENT_SESSION_CONFIG_CODE ||
      pageMenu.viewKey !== AGENT_SESSION_CONFIG_VIEW_KEY ||
      pageMenu.module !== MENU_MODULE_FUNC_OPERATION ||
      pageMenu.placement !== MENU_PLACEMENT_MODULE_NAV ||
      pageMenu.menuType !== MENU_TYPE_MENU ||
      pageMenu.icon !== 'MessageOutlined' ||
      pageMenu.sort !== nextSort
    ) {
      pageMenu = await updateSystemMenu(pageMenu.id, {
        parentId: nextParentId,
        module: MENU_MODULE_FUNC_OPERATION,
        placement: MENU_PLACEMENT_MODULE_NAV,
        name: '搭建会话配置',
        code: AGENT_SESSION_CONFIG_CODE,
        viewKey: AGENT_SESSION_CONFIG_VIEW_KEY,
        icon: 'MessageOutlined',
        menuType: MENU_TYPE_MENU,
        sort: nextSort,
        status: pageMenu.status || MENU_STATUS_ENABLED,
        visible: pageMenu.visible || MENU_VISIBLE_YES,
        isDefault: pageMenu.isDefault,
        remark: pageMenu.remark || '按功能搭建会话类型配置 Agent 参数',
      })
      changed = true
    }
  }

  const latestMenus = changed ? flattenMenus(await listSystemMenus({ tree: true })) : menus
  const latestPageMenu = findMenu(latestMenus, AGENT_SESSION_CONFIG_VIEW_KEY, AGENT_SESSION_CONFIG_CODE) || pageMenu
  for (const button of AGENT_SESSION_CONFIG_BUTTONS) {
    const existingButton = latestMenus.find(
      (item) =>
        item.parentId === latestPageMenu.id &&
        (item.viewKey === button.viewKey || item.code === button.code),
    )
    if (existingButton) {
      continue
    }
    await createSystemMenu({
      parentId: latestPageMenu.id,
      module: MENU_MODULE_FUNC_OPERATION,
      placement: MENU_PLACEMENT_MODULE_NAV,
      name: button.name,
      code: button.code,
      viewKey: button.viewKey,
      icon: button.icon,
      menuType: MENU_TYPE_BUTTON,
      sort: button.sort,
      status: MENU_STATUS_ENABLED,
      visible: MENU_VISIBLE_NO,
      isDefault: false,
      remark: button.remark,
    })
    changed = true
  }

  return changed
}

function findMenu(menus: SystemMenu[], viewKey: string, code: string): SystemMenu | null {
  return menus.find((item) => item.viewKey === viewKey || item.code === code) || null
}
