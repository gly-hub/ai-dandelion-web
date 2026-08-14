import type { ReactNode } from 'react'
import type { ModuleKey } from '../types'

export interface ModuleRailItem {
  key: ModuleKey
  title: string
  desc: string
  icon: ReactNode
  enabled: boolean
}

interface ModuleRailProps {
  modules: ModuleRailItem[]
  activeModule: ModuleKey | null
  onSelect: (moduleKey: ModuleKey) => void
}

export function ModuleRail({ modules, activeModule, onSelect }: ModuleRailProps) {
  return (
    <nav className="console-module-rail-nav" aria-label="模块">
      {modules.map((module) => (
        <button
          key={module.key}
          type="button"
          className={`console-module-rail-button${activeModule === module.key ? ' active' : ''}`}
          aria-pressed={activeModule === module.key}
          aria-label={module.title}
          title={module.title}
          disabled={!module.enabled}
          onClick={() => {
            if (module.enabled) {
              onSelect(module.key)
            }
          }}
        >
          <span className="console-module-rail-icon" aria-hidden="true">
            {module.icon}
          </span>
        </button>
      ))}
    </nav>
  )
}
