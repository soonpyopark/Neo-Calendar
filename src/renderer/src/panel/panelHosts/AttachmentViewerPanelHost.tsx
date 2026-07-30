import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  AttachmentImageViewer,
  type AttachmentViewerState
} from '../../components/AttachmentViewerProvider'
import { useAppDialog } from '../../components/AppDialogProvider'
import { openEventAttachment, readEventAttachmentImage } from '../../lib/eventAttachments'
import type { PanelWindowInit } from '../../../../shared/panelWindows'
import { usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'
import { useCalendarStore } from '../../hooks/useCalendarStore'

type Init = Extract<PanelWindowInit, { kind: 'attachmentViewer' }>

export function AttachmentViewerPanelHost({ init }: { init: Init }): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { alert } = useAppDialog()
  const { store, loading } = useCalendarStore()
  usePanelTheme(store.settings, loading)
  const [state, setState] = useState<AttachmentViewerState | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (eventId: string, attachmentId: string): Promise<void> => {
    try {
      const image = await readEventAttachmentImage(eventId, attachmentId)
      if (!image) {
        setFailed(true)
        return
      }
      setFailed(false)
      setState({
        eventId,
        attachmentId,
        name: image.name,
        dataUrl: image.dataUrl,
        images: image.images.length > 0 ? image.images : [{ id: attachmentId, name: image.name }]
      })
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load(init.eventId, init.attachmentId)
  }, [init.attachmentId, init.eventId, load])

  const selectImage = useCallback(
    (attachmentId: string) => {
      void load(init.eventId, attachmentId)
    },
    [init.eventId, load]
  )

  const openExternal = useCallback(async () => {
    if (!state) return
    try {
      window.neoCalendar?.blockPanelOutsideClose?.(800)
      await openEventAttachment(state.eventId, state.attachmentId)
    } catch (error) {
      await alert(error instanceof Error ? error.message : '첨부 파일을 열 수 없습니다.')
    }
  }, [alert, state])

  if (loading && !state) return null

  if (failed || !state) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-gcal-surface px-4 text-sm text-gcal-muted">
        {failed ? '이미지를 열 수 없습니다.' : '불러오는 중…'}
        <button
          type="button"
          className="ml-3 rounded-full px-2.5 py-1 text-gcal-blue hover:bg-gcal-blue-soft"
          onClick={closePanel}
        >
          닫기
        </button>
      </div>
    )
  }

  return (
    <AttachmentImageViewer
      state={state}
      surface="floating"
      onClose={closePanel}
      onSelect={selectImage}
      onOpenExternal={openExternal}
    />
  )
}

export default AttachmentViewerPanelHost
