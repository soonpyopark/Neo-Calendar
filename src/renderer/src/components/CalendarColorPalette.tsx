import type { ReactElement } from 'react'
import { CALENDAR_COLOR_PALETTE } from '../../../shared/calendarColorPalette'
import { getCalendarTheme } from '../lib/colors'
import { CustomColorPicker } from './CustomColorPicker'

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type CalendarColorPaletteProps = {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
  onRequestClose?: () => void
  className?: string
}

/** MDC CalendarColorPalette — presets + custom color swatch. */
export function CalendarColorPalette({
  value,
  onChange,
  disabled = false,
  onRequestClose,
  className
}: CalendarColorPaletteProps): ReactElement {
  const selected = (value ?? '').toLowerCase()
  const isCustomSelected = Boolean(
    value && !CALENDAR_COLOR_PALETTE.some((c) => c.toLowerCase() === selected)
  )

  return (
    <div className={cn('calendar-color-palette-wrap', className)}>
      <div className="calendar-color-palette" role="listbox" aria-label="일정 색상">
        {CALENDAR_COLOR_PALETTE.map((color) => {
          const isActive = selected === color.toLowerCase()
          const theme = getCalendarTheme(color)
          return (
            <button
              key={color}
              type="button"
              role="option"
              aria-selected={isActive}
              disabled={disabled}
              title={color}
              aria-label={`색상 ${color}`}
              className={cn('calendar-color-swatch', isActive && 'active')}
              onClick={(e) => {
                if (e.detail > 1) return
                onChange(color)
              }}
              onDoubleClick={(e) => {
                e.preventDefault()
                onChange(color)
                onRequestClose?.()
              }}
            >
              <span
                className="calendar-color-swatch-half calendar-color-swatch-half--solid"
                style={{ backgroundColor: theme.base }}
                aria-hidden
              />
              <span
                className="calendar-color-swatch-half calendar-color-swatch-half--tint"
                style={{ backgroundColor: theme.bg }}
                aria-hidden
              />
            </button>
          )
        })}
        {!disabled ? (
          <CustomColorPicker
            value={value}
            isActive={isCustomSelected}
            defaultDraft={CALENDAR_COLOR_PALETTE[0]}
            onApply={(color) => onChange(color)}
            onRequestClose={onRequestClose}
            swatchClassName="calendar-color-swatch calendar-color-swatch--picker"
          />
        ) : null}
      </div>
    </div>
  )
}

export default CalendarColorPalette
