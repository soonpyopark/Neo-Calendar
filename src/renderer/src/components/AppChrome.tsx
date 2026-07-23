import { useEffect, useLayoutEffect, useRef, type ReactElement, type Ref } from 'react'
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

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type AppChromeProps = {
  mode: LaunchMode
  user: AuthUser | null
  searchOpen: boolean
  settingsOpen: boolean
  exporting?: boolean
  modeBusy?: boolean
  /** From main: false while cursor must leave the header after a mode switch. */
  switchReady?: boolean
  /** Expose chrome root so wake zones can be derived from its buttons. */
  chromeRef?: Ref<HTMLDivElement | null>
  onOpenSearch: () => void
  onOpenSettings: () => void
  onExportExcel: () => void
  onExportPdf: () => void
  onEnterDesktop: () => void
  onEnterWindow: () => void
  onAuthToggle: () => void
}

export function AppChrome({
  mode,
  user,
  searchOpen,
  settingsOpen,
  exporting = false,
  modeBusy = false,
  switchReady = true,
  chromeRef,
  onOpenSearch,
  onOpenSettings,
  onExportExcel,
  onExportPdf,
  onEnterDesktop,
  onEnterWindow,
  onAuthToggle
}: AppChromeProps): ReactElement {
  const isDesktop = mode === 'desktop'
  const isWindow = mode === 'window'
  const loggedIn = Boolean(user)
  const localChromeRef = useRef<HTMLDivElement | null>(null)
  const windowModeBtnRef = useRef<HTMLSpanElement | null>(null)
  const modeButtonsReady = switchReady && !modeBusy

  const setChromeRef = (node: HTMLDivElement | null): void => {
    localChromeRef.current = node
    if (typeof chromeRef === 'function') chromeRef(node)
    else if (chromeRef) (chromeRef as { current: HTMLDivElement | null }).current = node
  }

  const publishWindowModeZone = (): void => {
    const api = window.neoCalendar
    if (!api?.setWindowModeHitZone) return

    if (mode !== 'desktop') {
      api.setWindowModeHitZone(null)
      return
    }

    const el = windowModeBtnRef.current
    if (!el) {
      api.setWindowModeHitZone(null)
      return
    }
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      api.setWindowModeHitZone(null)
      return
    }
    api.setWindowModeHitZone({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    })
  }

  useLayoutEffect(() => {
    publishWindowModeZone()
  })

  useEffect(() => {
    const onResize = (): void => publishWindowModeZone()
    window.addEventListener('resize', onResize)
    const id = window.setInterval(publishWindowModeZone, 400)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(id)
      window.neoCalendar?.setWindowModeHitZone?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish uses latest mode/ref
  }, [mode])

  return (
    <div
      ref={setChromeRef}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2',
        isWindow && 'is-window-mode'
      )}
      data-shell-chrome="header-actions"
    >
      <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap app-chrome-drag">
        <div className="flex items-baseline gap-2">
          <InteractionUI
            as="button"
            className="app-chrome-no-drag whitespace-nowrap border-0 bg-transparent p-0 text-[22px] tracking-tight text-gcal-muted transition-colors hover:text-gcal-blue"
            title="새로고침"
            aria-label="새로고침"
            onClick={() => window.location.reload()}
          >
            {APP_NAME}
          </InteractionUI>
          <span className="shrink-0 text-xs font-medium text-gcal-muted/80">v{APP_VERSION}</span>
        </div>
      </div>

      <div className="app-chrome-no-drag flex min-w-0 flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
        <InteractionUI
          as="button"
          className={cn(iconBtnClass, iconBtnDisabledClass)}
          aria-label="검색"
          title={settingsOpen ? '설정을 닫은 후 검색할 수 있습니다' : '검색'}
          disabled={settingsOpen}
          onClick={onOpenSearch}
        >
          <SearchIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(iconBtnClass, iconBtnDisabledClass)}
          aria-label="설정"
          title={
            !loggedIn
              ? '로그인 후 설정을 사용할 수 있습니다'
              : searchOpen
                ? '검색을 닫은 후 설정할 수 있습니다'
                : '설정'
          }
          disabled={!loggedIn || searchOpen}
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(iconBtnClass, iconBtnDisabledClass)}
          aria-label="Excel로 내보내기"
          title={!loggedIn ? '로그인 후 내보낼 수 있습니다' : 'Excel로 내보내기'}
          disabled={!loggedIn || exporting || settingsOpen || searchOpen}
          onClick={onExportExcel}
        >
          <ExcelIcon />
        </InteractionUI>

        <InteractionUI
          as="button"
          className={cn(iconBtnClass, iconBtnDisabledClass)}
          aria-label="PDF로 내보내기"
          title={!loggedIn ? '로그인 후 내보낼 수 있습니다' : 'PDF로 내보내기'}
          disabled={!loggedIn || exporting || settingsOpen || searchOpen}
          onClick={onExportPdf}
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
            aria-label="바탕화면모드"
            aria-pressed={isDesktop}
            title={
              isDesktop
                ? '바탕화면 모드 — 아이콘 아래 (버튼 호버·날짜 더블클릭 시 일시 분리)'
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

          <span ref={windowModeBtnRef} className="window-mode-hit-host">
            <InteractionUI
              as="button"
              className={cn(
                iconBtnClass,
                iconBtnDisabledClass,
                isWindow && softBlueIconBtnMutedClass
              )}
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
          </span>
        </div>

        <InteractionUI
          as="button"
          className={cn(actionBtnBase, 'bg-gcal-blue-soft hover:bg-[#d2e3fc] dark:hover:bg-gcal-surface-2')}
          title={loggedIn && user ? `${user.loginId} 로그아웃` : '로그인'}
          onClick={onAuthToggle}
        >
          {loggedIn ? '로그아웃' : '로그인'}
        </InteractionUI>
      </div>
    </div>
  )
}

export default AppChrome
