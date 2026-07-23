# My Desktop Calendar (Electron)

My Desktop Calendar UI running on the Neo Calendar Electron core.

## Desktop mode (click-through)

When **바탕화면 모드** is enabled:

- Transparent frameless overlay pinned to `HWND_BOTTOM`
- Empty space clicks pass through to the Windows desktop
- Interactive controls (header, events, dialogs, inputs) capture the mouse via `setIgnoreMouseEvents` + hit-testing

## Window mode

Normal movable/resizable frameless window with custom title bar.

## Develop

```bash
npm install
npm run fix-electron   # if electron.exe is missing
npm run dev
```

```bash
npm run stop
npm run dev:restart
```

## Build

```bash
npm run build
npm run dist
```

## Data

Local store under Electron `userData/data`:

- `settings.json`
- `calendars/*.json`
- `members.json`
- `attachments/`

Default login: `admin` / `admin1234`
