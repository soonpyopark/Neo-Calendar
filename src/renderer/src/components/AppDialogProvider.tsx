import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { cn } from '../lib/cn'
import { InteractionUI } from './InteractionUI'

type DialogVariant = 'default' | 'danger'

type DialogOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
}

type AlertDialog = {
  type: 'alert'
  message: string
  title?: string
  confirmLabel?: string
  variant?: DialogVariant
  resolve: () => void
}

type ConfirmDialog = {
  type: 'confirm'
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
  resolve: (ok: boolean) => void
}

type AppDialog = AlertDialog | ConfirmDialog

type AppDialogApi = {
  alert: (message: string, options?: DialogOptions) => Promise<void>
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>
  /** Cancel open + queued dialogs (confirm → false). Used on WorkerW re-embed. */
  dismissAll: () => void
}

const AppDialogContext = createContext<AppDialogApi | null>(null)

function resolveDialog(dialog: AppDialog, result: boolean): void {
  if (dialog.type === 'confirm') dialog.resolve(result)
  else dialog.resolve()
}

function AppDialogModal({
  dialog,
  onClose
}: {
  dialog: AppDialog | null
  onClose: (result: boolean) => void
}): ReactElement | null {
  useEffect(() => {
    if (!dialog) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog, onClose])

  if (!dialog) return null

  const isConfirm = dialog.type === 'confirm'
  const confirmLabel = dialog.confirmLabel ?? '확인'
  const cancelLabel = isConfirm ? (dialog.cancelLabel ?? '취소') : '취소'

  return (
    <InteractionUI
      className="app-dialog-root fixed inset-0 z-[100] flex items-center justify-center bg-transparent p-4"
      onClick={() => onClose(false)}
      role="presentation"
    >
      <div
        className="neo-modal-shell settings-scroll max-h-[calc(100vh-2rem)] w-full max-w-[360px] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-message"
      >
        {dialog.title ? (
          <h3 className="px-6 pt-6 text-base font-medium text-gcal-heading">{dialog.title}</h3>
        ) : null}
        <p
          id="app-dialog-message"
          className={cn(
            'whitespace-pre-line px-6 text-sm leading-relaxed text-gcal-body',
            dialog.title ? 'pt-2 pb-5' : 'py-6'
          )}
        >
          {dialog.message}
        </p>
        <div className="neo-modal-shell-footer flex justify-end gap-2 px-4 py-3">
          {isConfirm ? (
            <button
              type="button"
              className="rounded-full px-5 py-2 text-sm font-medium text-gcal-body transition-colors hover:bg-gcal-surface-2"
              onClick={() => onClose(false)}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              dialog.variant === 'danger'
                ? 'bg-[#c5221f] text-white hover:bg-[#a50e0e]'
                : 'bg-gcal-blue text-white hover:bg-[#1765cc]'
            )}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </InteractionUI>
  )
}

export function AppDialogProvider({ children }: { children: ReactNode }): ReactElement {
  const [dialog, setDialog] = useState<AppDialog | null>(null)
  const dialogRef = useRef<AppDialog | null>(null)
  const queueRef = useRef<AppDialog[]>([])

  const showNext = useCallback((): void => {
    const next = queueRef.current.shift() ?? null
    dialogRef.current = next
    setDialog(next)
  }, [])

  const enqueue = useCallback(
    (next: AppDialog): void => {
      if (!dialogRef.current) {
        dialogRef.current = next
        setDialog(next)
        return
      }
      queueRef.current.push(next)
    },
    []
  )

  const closeDialog = useCallback(
    (result: boolean) => {
      // Same click can fall through after the modal unmounts and wipe sibling panels (quickEdit).
      window.neoCalendar?.blockPanelOutsideClose?.(450)
      const current = dialogRef.current
      if (!current) return
      dialogRef.current = null
      setDialog(null)
      resolveDialog(current, result)
      // Defer so nested alert() from a resolve handler can enqueue cleanly.
      queueMicrotask(() => showNext())
    },
    [showNext]
  )

  const dismissAll = useCallback((): void => {
    const current = dialogRef.current
    const queued = queueRef.current.splice(0)
    dialogRef.current = null
    setDialog(null)
    if (current) resolveDialog(current, false)
    for (const item of queued) resolveDialog(item, false)
  }, [])

  const alert = useCallback(
    (message: string, options: DialogOptions = {}) => {
      return new Promise<void>((resolve) => {
        enqueue({
          type: 'alert',
          message,
          title: options.title,
          confirmLabel: options.confirmLabel,
          variant: options.variant,
          resolve: () => resolve()
        })
      })
    },
    [enqueue]
  )

  const confirm = useCallback(
    (message: string, options: DialogOptions = {}) => {
      return new Promise<boolean>((resolve) => {
        enqueue({
          type: 'confirm',
          message,
          title: options.title,
          confirmLabel: options.confirmLabel,
          cancelLabel: options.cancelLabel,
          variant: options.variant,
          resolve
        })
      })
    },
    [enqueue]
  )

  // WorkerW re-embed / enter desktop under icons — never leave a modal on click-through.
  useEffect(() => {
    const api = window.neoCalendar
    if (!api?.onModeChanged) return undefined
    return api.onModeChanged((status) => {
      if (status.mode === 'desktop' && status.embedded) {
        dismissAll()
      }
    })
  }, [dismissAll])

  const value = useMemo(() => ({ alert, confirm, dismissAll }), [alert, confirm, dismissAll])

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AppDialogModal dialog={dialog} onClose={closeDialog} />
    </AppDialogContext.Provider>
  )
}

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext)
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return context
}
