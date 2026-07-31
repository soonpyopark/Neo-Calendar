/**
 * Event tag helpers — master catalog on store.tags, event.tagIds references.
 */

/** Completed marker in day-list / export titles. */
export const COMPLETED_LABEL = '(완료)'
/** Accent for COMPLETED_LABEL in UI + PDF/Excel rich text. */
export const COMPLETED_LABEL_COLOR = '#0070CE'

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeTagIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * @param {object[]} tags
 * @returns {object[]}
 */
export function sortTags(tags) {
  return [...(tags ?? [])].sort((a, b) => {
    const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko');
  });
}

/**
 * @param {object} event
 * @param {object[]} tags
 * @returns {object[]}
 */
export function resolveEventTags(event, tags) {
  const byId = new Map((tags ?? []).map((tag) => [tag.id, tag]));
  return normalizeTagIds(event?.tagIds)
    .map((id) => byId.get(id))
    .filter(Boolean);
}

/**
 * Bracket prefix for display, e.g. "[행정, 출장]".
 * @param {object} event
 * @param {object[]} tags
 */
export function formatEventTagPrefix(event, tags) {
  const resolved = resolveEventTags(event, tags);
  if (!resolved.length) return '';
  const names = resolved.map((tag) => String(tag.name ?? '').trim()).filter(Boolean);
  if (!names.length) return '';
  return `[${names.join(', ')}]`;
}

/**
 * Title with tag / completed markers:
 * "[개인, 행정] (완료) 점심 커피"
 * @param {object} event
 * @param {object[]} tags
 */
export function formatTaggedEventTitle(event, tags) {
  const title = String(event?.title ?? '');
  const prefix = formatEventTagPrefix(event, tags);
  const completed = event?.completed ? COMPLETED_LABEL : '';
  return [prefix, completed, title].filter(Boolean).join(' ');
}

/**
 * Split a title/head line so `(완료)` can be styled separately.
 * @param {string} text
 * @returns {{ text: string, completed: boolean }[]}
 */
export function splitEventTitleRuns(text) {
  const source = String(text ?? '')
  if (!source) return []
  if (!source.includes(COMPLETED_LABEL)) {
    return [{ text: source, completed: false }]
  }

  /** @type {{ text: string, completed: boolean }[]} */
  const runs = []
  let cursor = 0
  while (cursor < source.length) {
    const hit = source.indexOf(COMPLETED_LABEL, cursor)
    if (hit < 0) {
      runs.push({ text: source.slice(cursor), completed: false })
      break
    }
    if (hit > cursor) {
      runs.push({ text: source.slice(cursor, hit), completed: false })
    }
    runs.push({ text: COMPLETED_LABEL, completed: true })
    cursor = hit + COMPLETED_LABEL.length
  }
  return runs.filter((run) => run.text)
}
