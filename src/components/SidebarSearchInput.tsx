import { CloseOutlined } from '@ant-design/icons'

interface SidebarSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  'aria-label'?: string
}

export function SidebarSearchInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: SidebarSearchInputProps) {
  return (
    <div className="search">
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="search-clear"
          aria-label="清除搜索"
          onClick={() => onChange('')}
        >
          <CloseOutlined />
        </button>
      ) : null}
    </div>
  )
}
