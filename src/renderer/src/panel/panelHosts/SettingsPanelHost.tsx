import { useEffect, useState, type ReactElement } from 'react'
import { SettingsPanel } from '../../components/SettingsPanel'
import { useCalendarStore } from '../../hooks/useCalendarStore'
import type { AppSettings } from '../../../../shared/ipc'
import { usePanelAuth, usePanelRouter, usePanelTheme } from '../usePanelEventHelpers'

export function SettingsPanelHost(): ReactElement | null {
  const { closePanel } = usePanelRouter()
  const { authReady, user } = usePanelAuth()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const {
    store,
    loading,
    refresh,
    patchStoreSettings,
    createCalendar,
    patchCalendar,
    reorderCalendars,
    deleteCalendar,
    clearCalendarEvents,
    importEventsIntoCalendar,
    createTag,
    patchTag,
    deleteTag,
    replaceStore,
    importStore,
    addEvent,
    listMembers,
    saveMembers,
    syncHolidays
  } = useCalendarStore()
  usePanelTheme(store.settings)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await window.neoCalendar.getSettings()
        if (!cancelled) setSettings(next)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || !authReady || !settings) return null

  return (
    <div className="neo-panel-shell h-screen w-screen overflow-hidden">
      <SettingsPanel
        surface="floating"
        open
        settings={settings}
        store={store}
        user={user}
        onClose={closePanel}
        onSave={async (patch) => {
          const next = await window.neoCalendar.patchSettings(patch)
          setSettings(next)
        }}
        onPatchStore={patchStoreSettings}
        onCreateCalendar={createCalendar}
        onPatchCalendar={patchCalendar}
        onReorderCalendars={reorderCalendars}
        onDeleteCalendar={deleteCalendar}
        onClearCalendarEvents={clearCalendarEvents}
        onImportIntoCalendar={importEventsIntoCalendar}
        onCreateTag={createTag}
        onUpdateTag={patchTag}
        onDeleteTag={deleteTag}
        onReplaceStore={replaceStore}
        onImportStore={importStore}
        onAddEvent={addEvent}
        onListMembers={listMembers}
        onSaveMembers={saveMembers}
        onSyncHolidays={syncHolidays}
        onRefresh={refresh}
        onMainOpacityPreview={(patch) => {
          window.neoCalendar.applyMainOpacityPreview?.(patch)
        }}
      />
    </div>
  )
}

export default SettingsPanelHost
