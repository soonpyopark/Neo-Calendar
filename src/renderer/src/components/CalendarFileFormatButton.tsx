import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  CALENDAR_FILE_FORMATS,
  type CalendarFileFormat
} from '../../../shared/calendarInterchange'
import { cn } from '../lib/cn'

export type CalendarFileFormatButtonProps = {
  label: string
  variant?: 'primary' | 'secondary'
  mode: 'import' | 'export'
  onSelectFormat: (format: CalendarFileFormat) => void
  className?: string
  disabled?: boolean
}

export function CalendarFileFormatButton({
  label,
  variant = 'secondary',
  mode,
  onSelectFormat,
  className,
  disabled = false
}: CalendarFileFormatButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const buttonClassName =
    variant === 'primary'
      ? 'settings-btn-primary rounded-full px-5 py-2 text-sm font-medium'
      : 'settings-btn-secondary rounded-full px-5 py-2 text-sm font-medium'

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          buttonClassName,
          mode === 'import' && variant === 'primary' && 'text-white',
          disabled && 'opacity-60',
          className
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
        }}
      >
        {label}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-20 mt-1 min-w-[10.5rem] overflow-hidden rounded-lg border border-gcal-border bg-gcal-page py-1 shadow-[0_8px_24px_rgba(60,64,67,0.18)]"
          role="menu"
        >
          {CALENDAR_FILE_FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm text-gcal-heading hover:bg-gcal-surface-2"
              onClick={() => {
                setOpen(false)
                onSelectFormat(format.value)
              }}
            >
              {format.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function getImportAcceptAttribute(format: CalendarFileFormat): string {
  switch (format) {
    case 'json':
      return 'application/json,.json'
    case 'ics':
      return 'text/calendar,.ics'
    case 'csv':
      return 'text/csv,.csv'
    case 'zip':
      return 'application/zip,.zip'
    default:
      return ''
  }
}

/** File picker filter for all supported import formats. */
export function getAllImportAcceptAttribute(): string {
  return '.json,.ics,.csv,.zip,application/json,text/calendar,text/csv,application/zip'
}
