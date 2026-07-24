import { DEFAULT_WIDGET_BOUNDS } from './constants'
import type {
  CalendarRecord,
  CalendarStoreSnapshot,
  StoreSettings,
  TagRecord
} from './calendarTypes'

export const HOLIDAYS_KR_CALENDAR_ID = 'holidays-kr'
export const PRIMARY_CALENDAR_ID = 'primary'
export const PRIMARY_CALENDAR_COLOR = '#f6bf26'

export const DEFAULT_TAGS: TagRecord[] = [
  { id: 'tag-admin', name: '행정', color: '#039be5', sortOrder: 0 },
  { id: 'tag-work', name: '작업', color: '#ffe252', sortOrder: 1 },
  { id: 'tag-duty', name: '회의', color: '#8e24aa', sortOrder: 2 },
  { id: 'tag-trip', name: '출장', color: '#f4511e', sortOrder: 3 },
  { id: 'tag-personal', name: '개인', color: '#33b679', sortOrder: 4 }
]

export const DEFAULT_CALENDARS: CalendarRecord[] = [
  {
    id: PRIMARY_CALENDAR_ID,
    dataKey: PRIMARY_CALENDAR_ID,
    name: '기본 캘린더',
    color: PRIMARY_CALENDAR_COLOR,
    visible: true,
    owner: 'local',
    custom: false,
    sortOrder: 0
  },
  {
    id: HOLIDAYS_KR_CALENDAR_ID,
    dataKey: HOLIDAYS_KR_CALENDAR_ID,
    name: '대한민국의 휴일',
    description: '공공데이터포털 특일 정보로 동기화할 수 있습니다.',
    color: '#d50000',
    visible: true,
    owner: 'shared',
    custom: false,
    sortOrder: 1
  }
]

export function createDefaultSettings(): StoreSettings {
  return {
    ownerName: '',
    timezone: 'Asia/Seoul',
    timezoneLabel: '(GMT+09:00) 한국 표준시 - 서울',
    notifications: {
      enabled: 'none',
      reminderTiming: '1min',
      playSound: true,
      onlyYesOrMaybe: false
    },
    viewOptions: {
      showWeekNumbers: true,
      weekStartsOnSunday: true,
      roundedCorners: true,
      colorScheme: 'light',
      accentColor: '#039be5',
      runAtStartup: false,
      eventsHidden: false,
      completedHidden: false
    },
    holidaysKr: {
      serviceKey: '',
      rememberKey: false,
      ok: null,
      skipped: false,
      reason: null,
      message: null,
      years: [],
      count: 0,
      lastSyncedAt: null
    },
    widget: {
      launchMode: 'window',
      enabled: false,
      alwaysOnTop: false,
      bounds: { ...DEFAULT_WIDGET_BOUNDS }
    },
    dayColors: {},
    dayColorsByLoginId: {},
    hiddenCalendarIdsByLoginId: {},
    allowedIpCidrs: [],
    headerOpacity: 0.95,
    shellOpacity: 0.95
  }
}

export function createEmptySnapshot(): CalendarStoreSnapshot {
  return {
    version: 2,
    settings: createDefaultSettings(),
    calendars: structuredClone(DEFAULT_CALENDARS),
    events: [],
    tags: structuredClone(DEFAULT_TAGS),
    updatedAt: new Date().toISOString()
  }
}
