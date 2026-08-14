import { useRef, type MouseEvent, type WheelEvent } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Dropdown, type MenuProps } from 'antd'
import { useTabNavigation } from '../contexts/TabNavigationContext'
import { normalizeTabPath } from '../lib/tabNavigation'

export function ConsoleTabBar() {
  const { tabs, activePath, tabBarVisible, switchTab, closeTab, closeOtherTabs, closeAllTabs } =
    useTabNavigation()
  const listRef = useRef<HTMLDivElement | null>(null)

  if (!tabBarVisible) {
    return null
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const list = listRef.current
    if (!list || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }
    list.scrollLeft += event.deltaY
    event.preventDefault()
  }

  function handleAuxClick(event: MouseEvent<HTMLButtonElement>, path: string) {
    if (event.button === 1) {
      event.preventDefault()
      closeTab(path)
    }
  }

  const contextMenuItems: MenuProps['items'] = [
    { key: 'close-others', label: '关闭其他标签', disabled: tabs.length <= 1 },
    { key: 'close-all', label: '关闭全部标签' },
  ]

  return (
    <div className="console-tabbar" aria-label="页面标签">
      <div className="console-tabbar-scroll" ref={listRef} onWheel={handleWheel}>
        <div className="console-tabbar-list" role="tablist">
          {tabs.map((tab) => {
            const normalized = normalizeTabPath(tab.path)
            const isActive = normalized === activePath
            return (
              <Dropdown
                key={normalized}
                trigger={['contextMenu']}
                menu={{
                  items: contextMenuItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation()
                    if (key === 'close-others') {
                      closeOtherTabs(normalized)
                    }
                    if (key === 'close-all') {
                      closeAllTabs()
                    }
                  },
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`console-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => switchTab(normalized)}
                  onAuxClick={(event) => handleAuxClick(event, normalized)}
                >
                  <span className="console-tab-label" title={tab.title}>
                    {tab.title}
                  </span>
                  <span
                    className="console-tab-close"
                    role="button"
                    aria-label={`关闭 ${tab.title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTab(normalized)
                    }}
                  >
                    <CloseOutlined />
                  </span>
                </button>
              </Dropdown>
            )
          })}
        </div>
      </div>
    </div>
  )
}
