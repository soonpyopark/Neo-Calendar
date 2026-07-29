# Neo Calendar v1.0.5

Lightweight Electron desktop wallpaper calendar with dynamic click-through.

## Stack

- Electron (main)
- React + TypeScript (renderer)
- Tailwind CSS v4
- IPC click-through bridge (`set-ignore-mouse`)

## Features

- Frameless, transparent, taskbar-hidden window
- Windows wallpaper-layer attachment via `win.setAsWallpaper()`
- Empty space clicks pass through to the OS desktop
- Interactive controls (nav, events, add) capture mouse on hover

## Develop

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
npm run dev
npm run dev:restart
npm run stop
```

### 브라우저에서 테스트 (개발 중)

Electron 앱(`npm run dev`)이 실행 중일 때 HTTP API(기본 `:3010`)와 Vite UI(`:5173`)가 함께 뜹니다.

1. 터미널 1: `npm run dev` (또는 `npm run dev:restart`)
2. 터미널 2: `npm run browser:dev` — 준비되면 브라우저를 엽니다  
   또는 직접 **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)** 접속

- UI는 **Vite(5173)** 에서 제공하고, `/api`·`/ws`는 Vite가 **CalendarWebServer(3010)** 로 프록시합니다.
- `:3010`만 열면 dev 모드에서 Vite(5173)로 리다이렉트됩니다.
- `.env`에 `PORT=3010`이 있어야 합니다 (`.env.example` 참고).

Admin login credentials come from `.env` (`MYCALENDAR_ADMIN_ID` / `MYCALENDAR_ADMIN_PW`), with `NEOCALENDAR_*` / `ADMIN_*` aliases and built-in defaults as fallback.

## Build

```bash
npm run build
npm run dist
```

### MSI 설치판 (MDC와 동일 흐름)

```bash
npm run build:msi
```

사전 요구: [WiX CLI 7+](https://wixtoolset.org/) (`winget install WiXToolset.WiXCLI`) 후 `wix eula accept wix7`  
프로젝트 루트 `.env`에 `DATA_GO_KR_SERVICE_KEY`가 있어야 합니다.  
→ `msi/Neo Calendar v{버전}_YYMMDD_HHMMSS.msi` (현재 사용자 설치, 관리자 권한 불필요)  
설치 마법사에서 **설치 폴더 선택** 가능 (`WixUI_InstallDir`).  
MSI에는 Electron 런타임이 포함됩니다 (`Neo Calendar.exe` + `resources/app.asar` + DLL). 별도 Electron 설치 불필요.

| 스크립트 | 설명 |
| --- | --- |
| `npm run dist` | NSIS 설치 파일 (`release/`) |
| `npm run build:msi` | WiX MSI 설치판 (`msi/*.msi`) |
| `npm run sync-version` | `constants.ts` 버전 → package.json / License.rtf 동기화 |
| `npm run update:all` | npm 의존성 업데이트 (+ desktop-hit 헬퍼 재빌드) |
| `npm run build:update_all` | `update:all` 후 MSI 빌드 |

### 의존성 업데이트

NAS4USB와 같은 흐름입니다.

```bash
npm run update:all
```

옵션: `--skip-git` `--skip-npm` `--skip-hit` `--build` `--msi`  
예: `npm run update:all -- --build`  
Windows: `update_all.bat` (로그: `.cache/logs/update-all.log`)

## Click-through model

1. Main process starts with `setIgnoreMouseEvents(true, { forward: true })`
2. Renderer `WallpaperContainer` keeps ignore enabled for empty space
3. `InteractionUI` calls `setIgnoreMouseEvents(false)` on `mouseenter`
4. Leaving interactive UI / the window re-enables click-through
