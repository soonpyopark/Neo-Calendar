import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_WIDGET_BOUNDS } from '../shared/constants'
import type { AppSettings, LaunchMode, WidgetBounds } from '../shared/ipc'

const DEFAULT_SETTINGS: AppSettings = {
  widget: {
    launchMode: 'window',
    bounds: { ...DEFAULT_WIDGET_BOUNDS }
  },
  weekStartsOn: 0,
  headerOpacity: 0.62,
  shellOpacity: 0.35
}

type PersistedFile = {
  settings: AppSettings
  authToken: string | null
  authLoginId: string | null
}

function deepMergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    weekStartsOn: patch.weekStartsOn ?? base.weekStartsOn,
    headerOpacity: patch.headerOpacity ?? base.headerOpacity,
    shellOpacity: patch.shellOpacity ?? base.shellOpacity,
    widget: {
      launchMode: patch.widget?.launchMode ?? base.widget.launchMode,
      bounds: patch.widget?.bounds ? { ...patch.widget.bounds } : { ...base.widget.bounds }
    }
  }
}

export class SettingsStore {
  private readonly filePath: string
  private data: PersistedFile

  constructor() {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'settings.json')
    this.data = this.load()
  }

  getSettings(): AppSettings {
    return structuredClone(this.data.settings)
  }

  patchSettings(patch: Partial<AppSettings>): AppSettings {
    this.data.settings = deepMergeSettings(this.data.settings, patch)
    this.save()
    return this.getSettings()
  }

  getWidgetBounds(): WidgetBounds {
    return { ...this.data.settings.widget.bounds }
  }

  setWidget(patch: { launchMode?: LaunchMode; bounds?: WidgetBounds }): AppSettings {
    return this.patchSettings({
      widget: {
        launchMode: patch.launchMode ?? this.data.settings.widget.launchMode,
        bounds: patch.bounds ?? this.data.settings.widget.bounds
      }
    })
  }

  getAuthSession(): { token: string; loginId: string } | null {
    if (!this.data.authToken || !this.data.authLoginId) return null
    return { token: this.data.authToken, loginId: this.data.authLoginId }
  }

  setAuthSession(session: { token: string; loginId: string } | null): void {
    this.data.authToken = session?.token ?? null
    this.data.authLoginId = session?.loginId ?? null
    this.save()
  }

  private load(): PersistedFile {
    if (!existsSync(this.filePath)) {
      return {
        settings: structuredClone(DEFAULT_SETTINGS),
        authToken: null,
        authLoginId: null
      }
    }

    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<PersistedFile>
      const merged = deepMergeSettings(DEFAULT_SETTINGS, raw.settings ?? {})
      return {
        settings: merged,
        authToken: typeof raw.authToken === 'string' ? raw.authToken : null,
        authLoginId: typeof raw.authLoginId === 'string' ? raw.authLoginId : null
      }
    } catch {
      return {
        settings: structuredClone(DEFAULT_SETTINGS),
        authToken: null,
        authLoginId: null
      }
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
  }
}
