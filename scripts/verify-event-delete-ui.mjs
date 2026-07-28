#!/usr/bin/env node
/**
 * Static check: delete dismiss contract is wired for all modes.
 * - Success paths call closePanelsAfterEventDelete
 * - Shared helper dispatches inline dismiss phases (browser)
 * - Floating editor open no longer evicts quickEdit
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const checks = []
function assert(name, cond, detail = '') {
  checks.push({ name, ok: Boolean(cond), detail })
}

const recurrence = read('src/renderer/src/lib/recurrenceComplete.ts')
assert(
  'closePanelsAfterEventDelete dispatches immediate + quickEdit phases',
  recurrence.includes("dispatchEventUiDismiss('immediate')") &&
    recurrence.includes("dispatchEventUiDismiss('quickEdit')")
)
assert(
  'floating delete uses main-process sequenced close (survives panel teardown)',
  recurrence.includes('closeAfterEventDelete')
)
assert(
  'quickEdit closes after delay constant',
  recurrence.includes('EVENT_UI_DISMISS_QUICK_EDIT_DELAY_MS')
)

const panelMgr = read('src/main/panelWindowManager.ts')
assert(
  'main closeAfterEventDelete closes quickEdit last',
  panelMgr.includes('closeAfterEventDelete()') &&
    /closeSlot\('quickEdit'\)/.test(panelMgr) &&
    panelMgr.includes("panel-close-after-event-delete")
)

const dismiss = read('src/renderer/src/lib/eventUiDismiss.ts')
assert(
  'eventUiDismiss documents all modes',
  dismiss.includes('Desktop') && dismiss.includes('Window') && dismiss.includes('Browser')
)

const grid = read('src/renderer/src/components/CalendarGrid.tsx')
assert(
  'CalendarGrid listens for dismiss events (browser/unlocked desktop)',
  grid.includes('EVENT_UI_DISMISS_AFTER_DELETE') && grid.includes("phase === 'quickEdit'")
)
assert(
  'detail X clears detail only (clearEventDetail)',
  grid.includes('onClose={clearEventDetail}')
)
assert(
  'inline delete success uses shared helper (not local setQuickEdit race)',
  /removeEvent\(master\.id\)\.then\(\(\) => \{\s*closePanelsAfterEventDelete\(\)/.test(grid) ||
    grid.includes('void removeEvent(master.id).then(() => {\n                closePanelsAfterEventDelete()')
)
assert(
  'inline editor open keeps quickEdit (no setQuickEdit(null) before setEditor)',
  grid.includes('Keep inline quickEdit mounted')
)

const quickEditPopover = read('src/renderer/src/components/DayQuickEditPopover.tsx')
assert(
  'quickEdit outside-click ignores event detail / delete dialogs (browser)',
  quickEditPopover.includes(".event-detail-shell") &&
    quickEditPopover.includes('.app-dialog-root') &&
    quickEditPopover.includes('.recurrence-scope-shell')
)

assert(
  'floating eventEditor no longer evicts quickEdit',
  panelMgr.includes('keep quickEdit') &&
    !/slot === 'eventEditor'[\s\S]{0,120}evictSlot\('quickEdit'\)/.test(panelMgr)
)

const detailHost = read('src/renderer/src/panel/panelHosts/EventDetailPanelHost.tsx')
assert(
  'floating detail delete success calls closePanelsAfterEventDelete',
  detailHost.includes('closePanelsAfterEventDelete()')
)
assert(
  'floating detail onClose uses closePanel (detail only)',
  detailHost.includes('onClose={closePanel}')
)

const router = read('src/renderer/src/panel/usePanelEventHelpers.ts')
assert(
  'closePanel does not close quickEdit',
  router.includes('closePanelWindow') && !/closePanel[\s\S]{0,80}closeQuickEditWindow/.test(router)
)

const scopeHost = read('src/renderer/src/panel/panelHosts/RecurrenceScopePanelHost.tsx')
assert(
  'recurrence delete success closes via shared helper',
  scopeHost.includes('closePanelsAfterEventDelete()')
)
assert(
  'recurrence cancel closes scope only (block outside)',
  scopeHost.includes('blockPanelOutsideClose') && scopeHost.includes('closePanelWindow')
)

const failed = checks.filter((c) => !c.ok)
for (const c of checks) {
  console.log(`${c.ok ? 'OK' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed (desktop/window/browser delete UI contract).`)
