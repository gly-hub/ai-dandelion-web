import { Avatar, Button, Popover } from 'antd'
import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import type { SystemRole, SystemUser } from '../types'

interface ConsoleUserMenuProps {
  user: SystemUser | null
  roles?: SystemRole[]
  onLogout: () => void
}

export function ConsoleUserMenu({ user, roles = [], onLogout }: ConsoleUserMenuProps) {
  if (!user) {
    return null
  }

  const initial = user.username.trim().slice(0, 1).toUpperCase()

  const content = (
    <div className="console-user-popover">
      <div className="console-user-popover-head">
        <Avatar size={48} className="console-user-popover-avatar" icon={initial ? undefined : <UserOutlined />}>
          {initial || null}
        </Avatar>
        <div className="console-user-popover-meta">
          <strong>{user.username}</strong>
          {user.email ? <span>{user.email}</span> : null}
          {user.phone ? <span>{user.phone}</span> : null}
        </div>
      </div>
      {roles.length > 0 ? (
        <p className="console-user-popover-roles">{roles.map((role) => role.name).join('、')}</p>
      ) : null}
      <Button type="default" block icon={<LogoutOutlined />} onClick={onLogout}>
        退出登录
      </Button>
    </div>
  )

  return (
    <div className="console-module-rail-footer">
      <Popover
        content={content}
        trigger="click"
        placement="rightBottom"
        arrow={false}
        overlayClassName="console-user-popover-overlay"
      >
        <button type="button" className="console-module-rail-user" aria-label="用户菜单">
          <Avatar size={32} className="console-module-rail-avatar" icon={initial ? undefined : <UserOutlined />}>
            {initial || null}
          </Avatar>
        </button>
      </Popover>
    </div>
  )
}
