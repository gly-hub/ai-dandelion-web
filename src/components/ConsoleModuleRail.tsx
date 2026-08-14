import { ModuleRail, type ModuleRailItem } from './ModuleRail'
import { ConsoleUserMenu } from './ConsoleUserMenu'
import type { ModuleKey } from '../types'
import type { SystemRole, SystemUser } from '../types'

interface ConsoleModuleRailProps {
  modules: ModuleRailItem[]
  activeModule: ModuleKey | null
  onSelect: (moduleKey: ModuleKey) => void
  user: SystemUser | null
  roles?: SystemRole[]
  onLogout: () => void
}

export function ConsoleModuleRail({
  modules,
  activeModule,
  onSelect,
  user,
  roles,
  onLogout,
}: ConsoleModuleRailProps) {
  return (
    <aside className="console-module-rail" aria-label="应用导航">
      <div className="console-module-rail-head">
        <div className="console-module-rail-brand" aria-label="AiDandelion" title="AiDandelion">
          <span className="console-module-rail-brand-mark" aria-hidden="true">
            AD
          </span>
        </div>
      </div>

      <ModuleRail modules={modules} activeModule={activeModule} onSelect={onSelect} />
      <ConsoleUserMenu user={user} roles={roles} onLogout={onLogout} />
    </aside>
  )
}
