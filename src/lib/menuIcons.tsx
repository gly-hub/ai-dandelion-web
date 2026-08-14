import {
  AppstoreOutlined,
  BellOutlined,
  ApiOutlined,
  CodeOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOutlined,
  FormOutlined,
	HistoryOutlined,
  MenuOutlined,
  MessageOutlined,
  ProfileOutlined,
  RocketOutlined,
  SafetyOutlined,
  SaveOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

const iconMap: Record<string, ReactNode> = {
  SettingOutlined: <SettingOutlined />,
  ToolOutlined: <ToolOutlined />,
  MessageOutlined: <MessageOutlined />,
  TeamOutlined: <TeamOutlined />,
  MenuOutlined: <MenuOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  BellOutlined: <BellOutlined />,
  FolderOutlined: <FolderOutlined />,
  RocketOutlined: <RocketOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  UserOutlined: <UserOutlined />,
  ProfileOutlined: <ProfileOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  FormOutlined: <FormOutlined />,
	HistoryOutlined: <HistoryOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  DashboardOutlined: <DashboardOutlined />,
  ControlOutlined: <ControlOutlined />,
  CodeOutlined: <CodeOutlined />,
  ApiOutlined: <ApiOutlined />,
  SaveOutlined: <SaveOutlined />,
}

const iconAliases: Record<string, string> = {
  'message-square': 'MessageOutlined',
  settings: 'SettingOutlined',
  tool: 'ToolOutlined',
  team: 'TeamOutlined',
  menu: 'MenuOutlined',
  appstore: 'AppstoreOutlined',
  folder: 'FolderOutlined',
  rocket: 'RocketOutlined',
  safety: 'SafetyOutlined',
	  history: 'HistoryOutlined',
}

export const menuIconOptions = Object.keys(iconMap).map((value) => ({
  value,
  label: value.replace(/Outlined$/, ''),
  icon: iconMap[value],
}))

export function resolveMenuIcon(iconName: string): ReactNode {
  const rawKey = iconName.trim()
  const key = iconAliases[rawKey] || rawKey
  if (!key) {
    return <MenuOutlined />
  }
  return iconMap[key] ?? <MenuOutlined />
}
