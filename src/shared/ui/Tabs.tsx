import { useRef, type KeyboardEvent } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  badge?: number
  hidden?: boolean
}

/**
 * Accessible tab strip (arrow keys move between tabs). The owner keeps the
 * active id, usually in the URL (`?tab=`) via `useUrlCriteria`.
 */
export function Tabs<T extends string>({
  items,
  active,
  onChange,
  label,
}: {
  items: TabItem<T>[]
  active: T
  onChange: (id: T) => void
  /** Accessible name of the tab list. */
  label: string
}) {
  const visible = items.filter((item) => !item.hidden)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + visible.length) % visible.length
    refs.current[next]?.focus()
    onChange(visible[next].id)
  }
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {visible.map((item, index) => {
        const selected = item.id === active
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'ui-tab ui-tab-active' : 'ui-tab'}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.badge ? <span className="ui-tab-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
