import { useRef, type MouseEvent, type ReactElement, type Ref } from 'react'
import { InteractionUI } from './InteractionUI'
import {
  DesktopModeIcon,
  ExcelIcon,
  PdfIcon,
  SearchIcon,
  SettingsIcon,
  WindowModeIcon
} from './CalendarHeaderIcons'
import { APP_NAME, APP_VERSION } from '../../../shared/constants'
import {
  actionBtnBase,
  iconBtnClass,
  iconBtnDisabledClass,
  softBlueIconBtnMutedClass
} from '../lib/headerButtonClasses'
import type { AuthUser, LaunchMode } from '../../../shared/ipc'
import { CHROME_TOOLBAR_ACTIONS } from '../../../shared/ipc'

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type AppChromeProps = {
  mode: LaunchMode
  user: AuthUser | null
  /** When set, overrides `Boolean(user)` for toolbar enablement (browser token fallback). */
  loggedIn?: boolean
  searchOpen: boolean
  settingsOpen: boolean
  exporting?: boolean
  modeBusy?: boolean
  /** From main: false while cursor must leave the header after a mode switch. */
  switchReady?: boolean
  /** WorkerW-embedded: clicks via main bridge, not hover wake. */
  embedded?: boolean
  chromeRef?: Ref<HTMLDivElement | null>
  onOpenSearch: (event: MouseEvent<HTMLElement>) => void
  onOpenSettings: () => void
  onExportExcel: () => void
  onExportPdf: () => void
  onEnterDesktop: () => void
  onEnterWindow: () => void
  onAuthToggle: () => void
  /** Logged-out click on edit-gated chrome controls. */
  onLoginRequired?: () => void
}

export function AppChrome({
  mode,
  user,
  loggedIn: loggedInProp,
  searchOpen,
  settingsOpen,
  exporting = false,
  modeBusy = false,
  switchReady = true,
  embedded = false,
  chromeRef,
  onOpenSearch,
  onOpenSettings,
  onExportExcel,
  onExportPdf,
  onEnterDesktop,
  onEnterWindow,
  onAuthToggle,
  onLoginRequired
}: AppChromeProps): ReactElement {
  const isDesktop = mode === 'desktop'
  const isWindow = mode === 'window'
  const loggedIn = loggedInProp ?? Boolean(user)
  const localChromeRef = useRef<HTMLDivElement | null>(null)
  const modeButtonsReady = switchReady && !modeBusy
  const captureOnHover = !embedded

  const setChromeRef = (node: HTMLDivElement | null): void => {
    localChromeRef.current = node
    if (typeof chromeRef === 'function') chromeRef(node)
    else if (chromeRef) (chromeRef as { current: HTMLDivElement | null }).current = node
  }

  return (
    <div
      ref={setChromeRef}
      className={cn(
        'interaction-ui flex min-w-0 items-center justify-between gap-2',
        isWindow && 'is-window-mode'
      )}
      data-shell-chrome="header-actions"
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap app-chrome-drag">
        <div className="flex items-baseline gap-2">
          <InteractionUI
            as="button"
            className={cn(
              'app-chrome-no-drag whitespace-nowrap border-0 bg-transparent p-0 text-[22px] tracking-tight text-gcal-muted transition-colors hover:text-gcal-blue',
              !loggedIn && 'cursor-not-allowed opacity-40 hover:text-gcal-muted'
            )}
            captureOnHover={captureOnHover}
            data-toolbar-action={CHROME_TOOLBAR_ACTIONS.reload}
            title={loggedIn ? '더블클릭하여 새로고침' : '로그인 후 사용할 수 있습니다'}
            aria-label="새로고침"
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!loggedIn) {
                onLoginRequired?.()
                return
              }
              window.location.reload()
            }}
          >
            {APP_NAME}
          </InteractionUI>
          <span className="shrink-0 text-xs font-medium text-gcal-muted/80">v{APP_VERSION}</span>
        </div>
      </div>

      <div className="app-chrome-no-drag flex min-w-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
        <InteractionUI
          as="button"
          className={cn(
            iconBtnClass,
            (!loggedIn || settingsOpen) && 'cursor-not-allowed opacity-40'
          )}
          captureOnHover={captureOnHover}
          data-toolbar-action={CHROME_TOOLBAR_ACTIONS.search}
          aria-label="검색"
          title={
            !loggedIn
              ? '로그인 후 검색할 수 있습니다'
              : settingsOpen
                ? '설정을 닫은 후 검색할 수 있습니다'
                : '검색'
          }
          disabled={loggedIn ? settingsOpen : false}
          onClick={(event) => {
            if (!loggedIn) {
              onLoginRequired?.()
              return
            }
            if (settingsOpen) return
            onOpenSearch(event)
          }}
        >
          <SearchIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(iconBtnClass, (!loggedIn || searchOpen) && 'cursor-not-allowed opacity-40')}
          captureOnHover={captureOnHover}
          data-toolbar-action={CHROME_TOOLBAR_ACTIONS.settings}
          aria-label="설정"
          title={
            !loggedIn
              ? '로그인 후 설정을 사용할 수 있습니다'
              : searchOpen
                ? '검색을 닫은 후 설정할 수 있습니다'
                : '설정'
          }
          disabled={loggedIn ? searchOpen : false}
          onClick={() => {
            if (!loggedIn) {
              onLoginRequired?.()
              return
            }
            if (searchOpen) return
            onOpenSettings()
          }}
        >
          <SettingsIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(
            iconBtnClass,
            (!loggedIn || exporting || settingsOpen || searchOpen) &&
              'cursor-not-allowed opacity-40'
          )}
          captureOnHover={captureOnHover}
          data-toolbar-action={CHROME_TOOLBAR_ACTIONS.exportExcel}
          aria-label="Excel로 내보내기"
          title={!loggedIn ? '로그인 후 내보낼 수 있습니다' : 'Excel로 내보내기'}
          disabled={loggedIn ? exporting || settingsOpen || searchOpen : false}
          onClick={() => {
            if (!loggedIn) {
              onLoginRequired?.()
              return
            }
            onExportExcel()
          }}
        >
          <ExcelIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(
            iconBtnClass,
            (!loggedIn || exporting || settingsOpen || searchOpen) &&
              'cursor-not-allowed opacity-40'
          )}
          captureOnHover={captureOnHover}
          data-toolbar-action={CHROME_TOOLBAR_ACTIONS.exportPdf}
          aria-label="PDF로 내보내기"
          title={!loggedIn ? '로그인 후 내보낼 수 있습니다' : 'PDF로 내보내기'}
          disabled={loggedIn ? exporting || settingsOpen || searchOpen : false}
          onClick={() => {
            if (!loggedIn) {
              onLoginRequired?.()
              return
            }
            onExportPdf()
          }}
        >
          <PdfIcon />
        </InteractionUI>

        <div className="inline-flex items-center gap-1.5">
          <InteractionUI
            as="button"
            className={cn(
              iconBtnClass,
              iconBtnDisabledClass,
              isDesktop && softBlueIconBtnMutedClass
            )}
            captureOnHover={captureOnHover}
            data-toolbar-action={CHROME_TOOLBAR_ACTIONS.enterDesktop}
            aria-label="바탕화면모드"
            aria-pressed={isDesktop}
            title={
              isDesktop
                ? '바탕화면 모드 — 아이콘 아래'
                : !switchReady
                  ? '잠시만 기다려 주세요'
                  : '바탕화면에 고정 (아이콘 아래로 들어감)'
            }
            disabled={modeBusy || isDesktop || !modeButtonsReady}
            onClick={() => {
              if (!modeButtonsReady) return
              onEnterDesktop()
            }}
          >
            <DesktopModeIcon />
          </InteractionUI>

          <InteractionUI
            as="button"
            className={cn(
              iconBtnClass,
              iconBtnDisabledClass,
              isWindow && softBlueIconBtnMutedClass
            )}
            captureOnHover={captureOnHover}
            data-toolbar-action={CHROME_TOOLBAR_ACTIONS.enterWindow}
            aria-label="창모드"
            aria-pressed={isWindow}
            title={
              !switchReady ? '잠시만 기다려 주세요' : '창 모드 — 이동·크기조절 가능'
            }
            disabled={modeBusy || isWindow || !modeButtonsReady}
            onClick={() => {
              if (!modeButtonsReady) return
              onEnterWindow()
            }}
          >
            <WindowModeIcon />
          </InteractionUI>
        </div>

        <InteractionUI
          as="button"
          className={cn(actionBtnBase, 'bg-gcal-blue-soft hover:bg-[#d2e3fc] dark:hover:bg-gcal-surface-2')}
          captureOnHover={captureOnHover}
          data-toolbar-action={CHROME_TOOLBAR_ACTIONS.authToggle}
          title={loggedIn && user ? `${user.loginId} 로그아웃` : '로그인'}
          onClick={onAuthToggle}
        >
          {loggedIn ? '로그아웃' : '로그인'}
        </InteractionUI>
      </div>
    </div>
  )
}
