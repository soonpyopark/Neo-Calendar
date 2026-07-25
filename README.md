# Neo Calendar v1.0.2

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

## Click-through model

1. Main process starts with `setIgnoreMouseEvents(true, { forward: true })`
2. Renderer `WallpaperContainer` keeps ignore enabled for empty space
3. `InteractionUI` calls `setIgnoreMouseEvents(false)` on `mouseenter`
4. Leaving interactive UI / the window re-enables click-through
