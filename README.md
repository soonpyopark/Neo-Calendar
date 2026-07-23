# Neo Calendar

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
npm run dev
npm run dev:restart
npm run stop
```

## Build

```bash
npm run build
npm run dist
```

## Click-through model

1. Main process starts with `setIgnoreMouseEvents(true, { forward: true })`
2. Renderer `WallpaperContainer` keeps ignore enabled for empty space
3. `InteractionUI` calls `setIgnoreMouseEvents(false)` on `mouseenter`
4. Leaving interactive UI / the window re-enables click-through
# Neo-Calendar
