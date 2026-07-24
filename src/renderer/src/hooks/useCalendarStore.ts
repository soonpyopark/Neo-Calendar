import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CalendarEvent,
  CalendarRecord,
  CalendarStoreSnapshot,
  EventInput,
  MemberRecord,
  MemberSaveInput,
  StoreSettings,
  SyncHolidaysInput,
  SyncHolidaysResult,
  TagRecord
} from '../../../shared/calendarTypes'
import { createEmptySnapshot } from '../../../shared/calendarDefaults'
import {
  applyAccentColor,
  applyColorScheme,
  getColorScheme,
  normalizeAccentColor
} from '../lib/colorScheme'

export type UseCalendarStoreResult = {
  store: CalendarStoreSnapshot
  loading: boolean
  refresh: () => Promise<void>
  addEvent: (input: EventInput) => Promise<CalendarEvent>
  editEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>
  removeEvent: (id: string) => Promise<void>
  createCalendar: (
    input: Partial<CalendarRecord> & { name: string; color: string }
  ) => Promise<CalendarRecord>
  patchCalendar: (id: string, patch: Partial<CalendarRecord>) => Promise<CalendarRecord>
  deleteCalendar: (id: string) => Promise<void>
  clearCalendarEvents: (id: string) => Promise<void>
  importEventsIntoCalendar: (
    id: string,
    events: unknown[]
  ) => Promise<{ ok: true; importedCount: number; calendarId: string }>
  setTags: (tags: TagRecord[]) => Promise<TagRecord[]>
  createTag: (input: { name: string; color: string; sortOrder?: number }) => Promise<TagRecord>
  patchTag: (
    id: string,
    patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>
  ) => Promise<TagRecord>
  deleteTag: (id: string) => Promise<void>
  patchStoreSettings: (patch: Partial<StoreSettings>) => Promise<void>
  replaceStore: (next: CalendarStoreSnapshot) => Promise<void>
  importStore: (payload: unknown) => Promise<void>
  listMembers: () => Promise<MemberRecord[]>
  saveMembers: (members: MemberSaveInput[]) => Promise<MemberRecord[]>
  syncHolidays: (input?: SyncHolidaysInput) => Promise<SyncHolidaysResult>
  calendarsById: Map<string, CalendarRecord>
  visibleEvents: CalendarEvent[]
}

export function useCalendarStore(): UseCalendarStoreResult {
  const [store, setStore] = useState<CalendarStoreSnapshot>(() => createEmptySnapshot())
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const api = window.neoCalendar
    if (!api?.getCalendarStore) return
    const next = await api.getCalendarStore()
    setStore(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Browser WebSocket / cross-tab store updates from the local HTTP server.
  useEffect(() => {
    const onChanged = (): void => {
      void refresh()
    }
    window.addEventListener('neo-store-changed', onChanged)
    return () => window.removeEventListener('neo-store-changed', onChanged)
  }, [refresh])

  // Apply MDC light/dark + accent as soon as store settings load (not only Settings panel).
  useEffect(() => {
    if (loading) return
    const vo = store.settings.viewOptions
    applyColorScheme(getColorScheme(vo))
    applyAccentColor(normalizeAccentColor(vo.accentColor, '#1a73e8'))
  }, [loading, store.settings.viewOptions.colorScheme, store.settings.viewOptions.accentColor])

  useEffect(() => {
    if (loading) return
    if (getColorScheme(store.settings.viewOptions) !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      applyColorScheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [loading, store.settings.viewOptions.colorScheme])

  const addEvent = useCallback(
    async (input: EventInput) => {
      const created = await window.neoCalendar.addEvent(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const editEvent = useCallback(
    async (id: string, patch: Partial<CalendarEvent>) => {
      const updated = await window.neoCalendar.editEvent(id, patch)
      await refresh()
      return updated
    },
    [refresh]
  )

  const removeEvent = useCallback(
    async (id: string) => {
      await window.neoCalendar.removeEvent(id)
      await refresh()
    },
    [refresh]
  )

  const createCalendar = useCallback(
    async (input: Partial<CalendarRecord> & { name: string; color: string }) => {
      const created = await window.neoCalendar.createCalendar(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const patchCalendar = useCallback(
    async (id: string, patch: Partial<CalendarRecord>) => {
      const updated = await window.neoCalendar.patchCalendar(id, patch)
      await refresh()
      return updated
    },
    [refresh]
  )

  const deleteCalendar = useCallback(
    async (id: string) => {
      await window.neoCalendar.deleteCalendar(id)
      await refresh()
    },
    [refresh]
  )

  const clearCalendarEvents = useCallback(
    async (id: string) => {
      await window.neoCalendar.clearCalendarEvents(id)
      await refresh()
    },
    [refresh]
  )

  const importEventsIntoCalendar = useCallback(
    async (id: string, events: unknown[]) => {
      const result = await window.neoCalendar.importEventsIntoCalendar(id, events)
      await refresh()
      return result
    },
    [refresh]
  )

  const setTags = useCallback(
    async (tags: TagRecord[]) => {
      const next = await window.neoCalendar.setTags(tags)
      await refresh()
      return next
    },
    [refresh]
  )

  const createTag = useCallback(
    async (input: { name: string; color: string; sortOrder?: number }) => {
      const created = await window.neoCalendar.createTag(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const patchTag = useCallback(
    async (id: string, patch: Partial<Pick<TagRecord, 'name' | 'color' | 'sortOrder'>>) => {
      const updated = await window.neoCalendar.patchTag(id, patch)
      await refresh()
      return updated
    },
    [refresh]
  )

  const deleteTag = useCallback(
    async (id: string) => {
      await window.neoCalendar.deleteTag(id)
      await refresh()
    },
    [refresh]
  )

  const patchStoreSettings = useCallback(
    async (patch: Partial<StoreSettings>) => {
      await window.neoCalendar.patchStoreSettings(patch)
      await refresh()
    },
    [refresh]
  )

  const replaceStore = useCallback(
    async (next: CalendarStoreSnapshot) => {
      await window.neoCalendar.replaceCalendarStore(next)
      await refresh()
    },
    [refresh]
  )

  const importStore = useCallback(
    async (payload: unknown) => {
      await window.neoCalendar.importCalendarStore(payload)
      await refresh()
    },
    [refresh]
  )

  const listMembers = useCallback(() => window.neoCalendar.listMembers(), [])
  const saveMembers = useCallback(
    async (members: MemberSaveInput[]) => {
      const next = await window.neoCalendar.saveMembers(members)
      await refresh()
      return next
    },
    [refresh]
  )

  const syncHolidays = useCallback(
    async (input?: SyncHolidaysInput) => {
      const result = await window.neoCalendar.syncHolidays(input)
      await refresh()
      return result
    },
    [refresh]
  )

  const calendarsById = useMemo(() => {
    const map = new Map<string, CalendarRecord>()
    for (const c of store.calendars) map.set(c.id, c)
    return map
  }, [store.calendars])

  const visibleEvents = useMemo(() => {
    const hiddenCompleted = store.settings.viewOptions.completedHidden
    return store.events.filter((e) => {
      const cal = calendarsById.get(e.calendarId)
      if (cal && cal.visible === false) return false
      if (hiddenCompleted && e.completed) return false
      return true
    })
  }, [store.events, store.settings.viewOptions.completedHidden, calendarsById])

  return {
    store,
    loading,
    refresh,
    addEvent,
    editEvent,
    removeEvent,
    createCalendar,
    patchCalendar,
    deleteCalendar,
    clearCalendarEvents,
    importEventsIntoCalendar,
    setTags,
    createTag,
    patchTag,
    deleteTag,
    patchStoreSettings,
    replaceStore,
    importStore,
    listMembers,
    saveMembers,
    syncHolidays,
    calendarsById,
    visibleEvents
  }
}
