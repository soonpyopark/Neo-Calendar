/**
 * MDC Header.jsx button class strings — keep in sync with
 * `My Desktop Calendar v1.1.6/src/components/Header.jsx`.
 */

export const iconBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-transparent text-gcal-muted transition-colors hover:border-gcal-border hover:bg-gcal-surface-2'

export const iconBtnDisabledClass =
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent'

export const navBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gcal-border bg-gcal-yellow-soft text-gcal-heading transition-colors hover:bg-[#fef0c3] dark:hover:bg-gcal-surface-2'

export const yearNavBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gcal-border bg-gcal-yellow-soft text-gcal-heading transition-colors hover:bg-[#fef0c3] dark:hover:bg-gcal-surface-2'

export const viewModeIconBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gcal-border bg-gcal-green-soft text-gcal-heading transition-colors hover:bg-[#dcefe0] dark:hover:bg-gcal-surface-2'

export const viewModeIconBtnActiveClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gcal-blue bg-[#bbdefb] text-gcal-blue-dark transition-colors hover:bg-[#90caf9] dark:border-gcal-blue dark:bg-gcal-blue-soft'

export const desktopModeIconBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40'

/** Soft blue fill for web / eye / completed toolbar icons (MDC). */
export const softBlueIconBtnClass =
  'border-gcal-border bg-[#e3f2fd] text-gcal-blue-dark hover:bg-[#bbdefb] dark:border-gcal-border dark:bg-gcal-blue-soft dark:text-gcal-heading dark:hover:bg-gcal-surface-2'

export const softBlueIconBtnActiveClass =
  'border-gcal-blue bg-[#bbdefb] text-gcal-blue-dark hover:bg-[#90caf9] dark:border-gcal-blue dark:bg-gcal-blue-soft'

/** Current mode already applied — keep control but fade it. */
export const softBlueIconBtnMutedClass = 'opacity-45 hover:opacity-70'

export const actionBtnBase =
  'inline-flex h-9 shrink-0 items-center justify-center rounded border border-gcal-border px-2 text-xs font-semibold text-gcal-heading disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[72px] sm:px-3 sm:text-sm'

export const todayBtnClass =
  'h-9 shrink-0 rounded border border-gcal-border bg-gcal-red-soft px-[18px] font-medium text-gcal-heading transition-colors hover:bg-[#fad2cf] dark:hover:bg-gcal-surface-2'

export const headerShellClass =
  'relative z-20 flex shrink-0 flex-col gap-2 border-b border-gcal-border-light px-4 py-2 neo-mdc-chrome'

export const footerShellClass =
  'relative z-20 flex shrink-0 items-center justify-end border-t border-gcal-grid-line px-4 py-2 neo-mdc-chrome'
