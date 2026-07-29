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
import type { AttachmentImageEntry } from '../../../shared/ipc'
import { cn } from '../lib/cn'
import { openEventAttachment, readEventAttachmentImage } from '../lib/eventAttachments'
import { useAppDialog } from './AppDialogProvider'
import { InteractionUI } from './InteractionUI'

type ViewerState = {
  eventId: string
  attachmentId: string
  name: string
  dataUrl: string
  images: AttachmentImageEntry[]
}

type AttachmentViewerApi = {
  /** Images open in the viewer; anything else is handed to the OS (browser: download). */
  openAttachment: (eventId: string, attachmentId: string) => Promise<void>
}

const AttachmentViewerContext = createContext<AttachmentViewerApi | null>(null)

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
/** `null` = fit to the surface; a number is a multiplier of the image's natural size. */
type Zoom = number | null

function AttachmentImageViewer({
  state,
  onClose,
  onSelect,
  onOpenExternal
}: {
  state: ViewerState
  onClose: () => void
  onSelect: (attachmentId: string) => void
  onOpenExternal: () => void
}): ReactElement {
  const [zoom, setZoom] = useState<Zoom>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const index = state.images.findIndex((item) => item.id === state.attachmentId)
  const total = state.images.length
  const canPage = total > 1

  const step = useCallback(
    (direction: 1 | -1) => {
      const canvas = canvasRef.current
      const fitRatio =
        natural && canvas
          ? Math.min(
              1,
              canvas.clientWidth / natural.width,
              canvas.clientHeight / natural.height
            )
          : 1
      const current = zoom ?? fitRatio
      const next =
        direction > 0
          ? ZOOM_STEPS.find((value) => value > current + 0.001)
          : [...ZOOM_STEPS].reverse().find((value) => value < current - 0.001)
      if (next === undefined) return
      setZoom(next)
    },
    [natural, zoom]
  )

  const page = useCallback(
    (direction: 1 | -1) => {
      if (!canPage || index < 0) return
      const next = (index + direction + total) % total
      setZoom(null)
      setNatural(null)
      onSelect(state.images[next].id)
    },
    [canPage, index, onSelect, state.images, total]
  )

  // Capture phase + stopPropagation so host panels (e.g. 세로보기) do not also act on Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const handled = (): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Escape') {
        handled()
        onClose()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        handled()
        page(1)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        handled()
        page(-1)
        return
      }
      if (event.key === '+' || event.key === '=') {
        handled()
        step(1)
        return
      }
      if (event.key === '-' || event.key === '_') {
        handled()
        step(-1)
        return
      }
      if (event.key === '0') {
        handled()
        setZoom(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, page, step])

  const zoomLabel = (() => {
    if (zoom !== null) return `${Math.round(zoom * 100)}%`
    return '화면 맞춤'
  })()

  return (
    <InteractionUI
      className="attachment-viewer-root fixed inset-0 z-[110] flex flex-col"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="attachment-viewer-shell shell-solid-surface relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={state.name}
      >
        <div className="attachment-viewer-header flex flex-shrink-0 items-center gap-1 px-2 py-1.5">
          <span className="attachment-viewer-title min-w-0 flex-1 truncate text-xs" title={state.name}>
            {state.name}
            {canPage ? (
              <span className="attachment-viewer-count ml-1.5">
                {index + 1}/{total}
              </span>
            ) : null}
          </span>
          {canPage ? (
            <>
              <button
                type="button"
                className="attachment-viewer-btn"
                onClick={() => page(-1)}
                title="이전 이미지 (←)"
                aria-label="이전 이미지"
              >
                ‹
              </button>
              <button
                type="button"
                className="attachment-viewer-btn"
                onClick={() => page(1)}
                title="다음 이미지 (→)"
                aria-label="다음 이미지"
              >
                ›
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="attachment-viewer-btn"
            onClick={() => step(-1)}
            title="축소 (−)"
            aria-label="축소"
          >
            −
          </button>
          <button
            type="button"
            className="attachment-viewer-zoom"
            onClick={() => setZoom(null)}
            title="화면에 맞추기 (0)"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            className="attachment-viewer-btn"
            onClick={() => step(1)}
            title="확대 (+)"
            aria-label="확대"
          >
            +
          </button>
          <button
            type="button"
            className="attachment-viewer-btn attachment-viewer-btn-wide"
            onClick={onOpenExternal}
            title="기본 앱으로 열기"
          >
            기본 앱
          </button>
          <button
            type="button"
            className="attachment-viewer-btn"
            onClick={onClose}
            title="닫기 (Esc)"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div
          ref={canvasRef}
          className="attachment-viewer-canvas flex min-h-0 flex-1 items-center justify-center overflow-auto p-2"
        >
          <img
            src={state.dataUrl}
            alt={state.name}
            className={cn('attachment-viewer-image', (zoom === null || !natural) && 'is-fit')}
            style={
              zoom !== null && natural
                ? { width: `${Math.round(natural.width * zoom)}px`, maxWidth: 'none' }
                : undefined
            }
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              })
            }
            draggable={false}
          />
        </div>
      </div>
    </InteractionUI>
  )
}

export function AttachmentViewerProvider({ children }: { children: ReactNode }): ReactElement {
  const { alert } = useAppDialog()
  const [state, setState] = useState<ViewerState | null>(null)

  const load = useCallback(
    async (eventId: string, attachmentId: string): Promise<boolean> => {
      const image = await readEventAttachmentImage(eventId, attachmentId)
      if (!image) return false
      setState({
        eventId,
        attachmentId,
        name: image.name,
        dataUrl: image.dataUrl,
        images: image.images.length > 0 ? image.images : [{ id: attachmentId, name: image.name }]
      })
      return true
    },
    []
  )

  const openAttachment = useCallback(
    async (eventId: string, attachmentId: string) => {
      try {
        if (await load(eventId, attachmentId)) return
        await openEventAttachment(eventId, attachmentId)
      } catch (error) {
        await alert(error instanceof Error ? error.message : '첨부 파일을 열 수 없습니다.')
      }
    },
    [alert, load]
  )

  const eventId = state?.eventId
  const selectImage = useCallback(
    (attachmentId: string) => {
      if (!eventId) return
      void load(eventId, attachmentId)
    },
    [eventId, load]
  )

  const close = useCallback(() => {
    // Same click can fall through after unmount and dismiss sibling panels.
    window.neoCalendar?.blockPanelOutsideClose?.(450)
    setState(null)
  }, [])

  const openExternal = useCallback(async () => {
    if (!state) return
    try {
      await openEventAttachment(state.eventId, state.attachmentId)
    } catch (error) {
      await alert(error instanceof Error ? error.message : '첨부 파일을 열 수 없습니다.')
    }
  }, [alert, state])

  const value = useMemo(() => ({ openAttachment }), [openAttachment])

  return (
    <AttachmentViewerContext.Provider value={value}>
      {children}
      {state ? (
        <AttachmentImageViewer
          state={state}
          onClose={close}
          onSelect={selectImage}
          onOpenExternal={openExternal}
        />
      ) : null}
    </AttachmentViewerContext.Provider>
  )
}

/**
 * Opens an attachment: images in the in-app viewer, everything else in the OS
 * default app. Falls back to the OS app when no provider is mounted.
 */
export function useOpenAttachment(): AttachmentViewerApi['openAttachment'] {
  const context = useContext(AttachmentViewerContext)
  const { alert } = useAppDialog()
  return useMemo(() => {
    if (context) return context.openAttachment
    return async (eventId: string, attachmentId: string) => {
      try {
        await openEventAttachment(eventId, attachmentId)
      } catch (error) {
        await alert(error instanceof Error ? error.message : '첨부 파일을 열 수 없습니다.')
      }
    }
  }, [alert, context])
}
