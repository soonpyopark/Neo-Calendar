import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { EXPORT_COLORS } from '../../shared/mdcExport/exportColors.js'
import { prepareDayListExportLayout } from '../../shared/mdcExport/dayListExportLayout.js'
import {
  prepareMonthExportLayout,
  prepareRangeGridExportLayout,
} from '../../shared/mdcExport/monthExportLayout.js'
import {
  COMPLETED_LABEL_COLOR,
  splitEventTitleRuns,
} from '../../shared/mdcExport/eventTags.js'

const FONT_NAME = 'Malgun Gothic'
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFE8EAED' } },
  left: { style: 'thin', color: { argb: 'FFE8EAED' } },
  bottom: { style: 'thin', color: { argb: 'FFE8EAED' } },
  right: { style: 'thin', color: { argb: 'FFE8EAED' } }
}

function hexToArgb(hex) {
  return `FF${hex.replace('#', '').toUpperCase()}`
}

function timeStampForFileName() {
  return new Date().toTimeString().slice(0, 8).replace(/:/g, '')
}

/**
 * @param {{ startDate?: string, endDate?: string, layout?: string, scope?: string, year?: number, month?: number }} meta
 * @param {string} extension
 */
function getExportFileName(meta, extension) {
  const stamp = timeStampForFileName()
  const layout = meta.layout === 'dayList' ? 'dayList' : 'monthGrid'
  if (meta.startDate && meta.endDate) {
    const start = String(meta.startDate).replace(/-/g, '')
    const end = String(meta.endDate).replace(/-/g, '')
    if (start === end) return `calendar_${layout}_${start}_${stamp}.${extension}`
    return `calendar_${layout}_${start}-${end}_${stamp}.${extension}`
  }
  if (meta.scope === 'year') return `calendar_${meta.year}_${stamp}.${extension}`
  return `calendar_${meta.year}${String(meta.month).padStart(2, '0')}_${stamp}.${extension}`
}

/** @type {Buffer | null} */
let cachedKoreanFont = null

/**
 * Load a Korean TTF for PDFKit from Windows Fonts (Electron main).
 * @returns {Promise<Buffer>}
 */
async function loadKoreanFontBuffer() {
  if (cachedKoreanFont) return cachedKoreanFont

  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    join(windir, 'Fonts', 'malgun.ttf'),
    join(windir, 'Fonts', 'malgunbd.ttf'),
    join(windir, 'Fonts', 'malgunsl.ttf'),
    join(windir, 'Fonts', 'gulim.ttc'),
    join(process.cwd(), 'resources', 'fonts', 'NotoSansKR-Regular.otf'),
    join(process.cwd(), 'fonts', 'NotoSansKR-Regular.otf')
  ]

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const buf = readFileSync(path)
      if (buf.byteLength > 1000) {
        cachedKoreanFont = buf
        return cachedKoreanFont
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('PDF 생성을 위한 한글 폰트를 찾을 수 없습니다.')
}

/** @type {Buffer | null} */
let cachedKoreanBoldFont = null

/**
 * Bold Korean face — PDFKit has no synthetic bold, so 진하게 needs its own file.
 * @returns {Promise<Buffer | null>} null when no bold font is installed (caller falls back).
 */
async function loadKoreanBoldFontBuffer() {
  if (cachedKoreanBoldFont) return cachedKoreanBoldFont

  const windir = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    join(windir, 'Fonts', 'malgunbd.ttf'),
    join(windir, 'Fonts', 'gulim.ttc'),
    join(process.cwd(), 'resources', 'fonts', 'NotoSansKR-Bold.otf'),
    join(process.cwd(), 'fonts', 'NotoSansKR-Bold.otf')
  ]

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const buf = readFileSync(path)
      if (buf.byteLength > 1000) {
        cachedKoreanBoldFont = buf
        return cachedKoreanBoldFont
      }
    } catch {
      /* try next */
    }
  }

  return null
}

function uint8FromBufferLike(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer);
  }
  return new Uint8Array(value);
}

function getWeekdayHeaderColor(dayIndex, weekStartsOn) {
  const dayOfWeek = (weekStartsOn + dayIndex) % 7;
  if (dayOfWeek === 0) return EXPORT_COLORS.sunday;
  if (dayOfWeek === 6) return EXPORT_COLORS.saturday;
  return EXPORT_COLORS.heading;
}

function buildDateRichText(day) {
  const parts = [
    {
      text: String(day.solar),
      font: {
        name: FONT_NAME,
        size: 12,
        bold: day.isToday,
        color: { argb: hexToArgb(day.solarColor) },
      },
    },
  ];

  if (day.lunarLabel) {
    parts.push({
      text: ` (${day.lunarLabel})`,
      font: {
        name: FONT_NAME,
        size: 9,
        color: { argb: hexToArgb(day.inMonth ? EXPORT_COLORS.muted : EXPORT_COLORS.otherMonth) },
      },
    });
  }

  return parts;
}

const EXPORT_DATE_HEADER = 24;
const EXPORT_EVENT_LINE = 12;
const PDF_EVENT_FONT_SIZE = 8;
const PDF_EVENT_GAP = 2;
const PDF_STRIPE_WIDTH = 3;
const PDF_TEXT_GAP = 5;
const PDF_CELL_PADDING = 4;
const PDF_MIN_EVENT_BAR_HEIGHT = 10;
const DAY_LIST_COLORS = {
  headerBg: '#deebd6',
  dateBg: '#deebd6',
  weekendBg: '#fff2cc',
  border: '#a3af97',
  /** 날짜/내용 머리글 + 평일 날짜·요일 글자. */
  text: '#3a3858',
  saturday: '#174ea6',
  sunday: '#b3261e',
  detailBg: '#e5e0ec',
  detailBorder: '#b9a3d6',
};

/** Padding inside the 설명/링크/첨부 box. */
const PDF_DETAIL_PAD = 3;
/** Indent of the box under the title line. */
const PDF_DETAIL_INDENT = 6;
const PDF_DETAIL_GAP = 2;

function getDayListDayOfWeek(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

/** 대한민국의 휴일 dates share the Sunday treatment. */
function getDayListDateColor(dayOfWeek, isHoliday = false) {
  if (dayOfWeek === 0 || isHoliday) return DAY_LIST_COLORS.sunday;
  if (dayOfWeek === 6) return DAY_LIST_COLORS.saturday;
  return DAY_LIST_COLORS.text;
}

function getDayListBorder() {
  const color = { argb: hexToArgb(DAY_LIST_COLORS.border) };
  return {
    top: { style: 'thin', color },
    left: { style: 'thin', color },
    bottom: { style: 'thin', color },
    right: { style: 'thin', color },
  };
}

function getExportWeekRowHeight(week, minRowHeight) {
  const maxEvents = Math.max(0, ...week.days.map((day) => day.events.length));
  return Math.max(minRowHeight, EXPORT_DATE_HEADER + maxEvents * EXPORT_EVENT_LINE + 6);
}

/**
 * @param {number} dayColumnWidth
 */
function getPdfEventTextWidth(dayColumnWidth) {
  return dayColumnWidth - PDF_CELL_PADDING - PDF_STRIPE_WIDTH - PDF_TEXT_GAP - PDF_CELL_PADDING;
}

/**
 * @param {import('pdfkit').default} doc
 * @param {string} line
 * @param {number} textWidth
 */
function measurePdfEventTextHeight(doc, line, textWidth) {
  doc.fontSize(PDF_EVENT_FONT_SIZE);
  return doc.heightOfString(line, { width: Math.max(1, textWidth) });
}

/** @param {{ details?: { text: string }[] }} event */
function getDayListDetailText(event) {
  const details = Array.isArray(event.details) ? event.details : [];
  return details.map((item) => item.text).join('\n');
}

/**
 * Day-list event height: title line plus the boxed 설명/링크/첨부 block.
 * @param {import('pdfkit').default} doc
 * @param {{ head?: string, line: string, details?: { text: string }[] }} event
 * @param {number} textWidth
 */
function measureDayListEventHeight(doc, event, textWidth) {
  doc.fontSize(PDF_EVENT_FONT_SIZE);
  const head = event.head ?? event.line;
  let height = Math.max(
    PDF_MIN_EVENT_BAR_HEIGHT,
    doc.heightOfString(head, { width: Math.max(1, textWidth) }),
  );
  const detailText = getDayListDetailText(event);
  if (detailText) {
    const innerWidth = Math.max(1, textWidth - PDF_DETAIL_INDENT - PDF_DETAIL_PAD * 2);
    height +=
      PDF_DETAIL_GAP + doc.heightOfString(detailText, { width: innerWidth }) + PDF_DETAIL_PAD * 2;
  }
  return height;
}

/**
 * Draw a day-list title line with `(완료)` in #0070CE bold.
 * PDFKit's `continued` + per-run `width` wraps the rest of the title onto a new
 * line after the styled `(완료)` run — place runs by advancing X instead.
 * @param {import('pdfkit').default} doc
 * @param {string} head
 * @param {number} textX
 * @param {number} y
 * @param {number} textWidth
 * @returns {number} height consumed
 */
function drawDayListHead(doc, head, textX, y, textWidth) {
  const runs = splitEventTitleRuns(head)
  doc.fontSize(PDF_EVENT_FONT_SIZE)
  if (runs.length === 0) {
    doc.font('Body').fillColor(EXPORT_COLORS.body)
    return PDF_MIN_EVENT_BAR_HEIGHT
  }

  const maxWidth = Math.max(1, textWidth)
  const right = textX + maxWidth
  let x = textX
  let lineY = y
  let lines = 1

  for (const run of runs) {
    if (run.completed) {
      doc.font('Bold').fillColor(COMPLETED_LABEL_COLOR)
    } else {
      doc.font('Body').fillColor(EXPORT_COLORS.body)
    }
    const runWidth = doc.widthOfString(run.text)
    if (x > textX && x + runWidth > right) {
      x = textX
      lineY += doc.currentLineHeight()
      lines += 1
    }
    doc.text(run.text, x, lineY, {
      lineBreak: false,
      continued: false,
    })
    x += runWidth
  }

  doc.font('Body').fillColor(EXPORT_COLORS.body)
  return Math.max(PDF_MIN_EVENT_BAR_HEIGHT, lines * doc.currentLineHeight())
}

/**
 * Draw one day-list event and return the height it consumed.
 * @param {import('pdfkit').default} doc
 * @param {{ head?: string, line: string, details?: { text: string }[], color: string }} event
 * @param {number} textX
 * @param {number} y
 * @param {number} textWidth
 */
function drawDayListEvent(doc, event, textX, y, textWidth) {
  const head = event.head ?? event.line;
  const detailText = getDayListDetailText(event);

  doc.font('Body').fontSize(PDF_EVENT_FONT_SIZE);
  const headHeight = drawDayListHead(doc, head, textX, y, textWidth);

  if (!detailText) return headHeight;

  const boxX = textX + PDF_DETAIL_INDENT;
  const boxY = y + headHeight + PDF_DETAIL_GAP;
  const boxWidth = Math.max(1, textWidth - PDF_DETAIL_INDENT);
  const innerWidth = Math.max(1, boxWidth - PDF_DETAIL_PAD * 2);
  const boxHeight = doc.heightOfString(detailText, { width: innerWidth }) + PDF_DETAIL_PAD * 2;

  doc.fillColor(DAY_LIST_COLORS.detailBg).roundedRect(boxX, boxY, boxWidth, boxHeight, 2).fill();
  doc.lineWidth(0.45)
    .strokeColor(DAY_LIST_COLORS.detailBorder)
    .roundedRect(boxX, boxY, boxWidth, boxHeight, 2)
    .stroke();
  doc.fillColor(EXPORT_COLORS.body).text(detailText, boxX + PDF_DETAIL_PAD, boxY + PDF_DETAIL_PAD, {
    width: innerWidth,
    lineBreak: true,
  });

  return headHeight + PDF_DETAIL_GAP + boxHeight;
}

/**
 * @param {import('pdfkit').default} doc
 * @param {object} day
 * @param {number} textWidth
 */
function measurePdfDayEventsHeight(doc, day, textWidth) {
  let height = 0;
  for (const event of day.events) {
    const textHeight = measurePdfEventTextHeight(doc, event.line, textWidth);
    height += Math.max(PDF_MIN_EVENT_BAR_HEIGHT, textHeight) + PDF_EVENT_GAP;
  }
  return height;
}

/**
 * @param {import('pdfkit').default} doc
 * @param {object} week
 * @param {number} dayColumnWidth
 * @param {number} minRowHeight
 */
function getPdfWeekRowHeight(doc, week, dayColumnWidth, minRowHeight) {
  const textWidth = getPdfEventTextWidth(dayColumnWidth);
  const maxEventsHeight = Math.max(
    0,
    ...week.days.map((day) => measurePdfDayEventsHeight(doc, day, textWidth)),
  );
  return Math.max(minRowHeight, EXPORT_DATE_HEADER + maxEventsHeight + 6);
}

function buildDayCellEventRichText(day) {
  /** @type {import('exceljs').RichText[]} */
  const parts = [];

  day.events.forEach((event) => {
    parts.push({
      text: '\n',
      font: { name: FONT_NAME, size: 9 },
    });
    parts.push({
      text: '▎ ',
      font: {
        name: FONT_NAME,
        size: 9,
        color: { argb: hexToArgb(event.color) },
      },
    });
    parts.push({
      text: event.line,
      font: {
        name: FONT_NAME,
        size: 9,
        color: { argb: hexToArgb(EXPORT_COLORS.body) },
      },
    });
  });

  return parts;
}

function getHeaderBgFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hexToArgb(EXPORT_COLORS.weekdayHeaderBg) },
  };
}

function getGridColumnCount(layout) {
  return layout.showWeekNumbers ? 8 : 7;
}

function styleWorksheetPage(worksheet, columnCount, lastRow = 20) {
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  worksheet.pageSetup.printArea = `A1:${String.fromCharCode(64 + columnCount)}${Math.max(2, lastRow)}`;
}

/**
 * @param {ReturnType<typeof prepareMonthExportLayout>} layout
 */
async function buildExcelCalendarBuffer(layout) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = layout.month ? `${layout.month}월` : '달력';
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ showGridLines: false }],
  });
  const columnCount = getGridColumnCount(layout);
  const lastColumnLetter = String.fromCharCode(64 + columnCount);
  const lastRow = 2 + (layout.weekRows?.length ?? 0);

  styleWorksheetPage(worksheet, columnCount, lastRow);

  const titleStartCol = layout.showWeekNumbers ? 2 : 1;
  const titleEndCol = columnCount - 1;
  const titleStartLetter = String.fromCharCode(64 + titleStartCol);
  const titleEndLetter = String.fromCharCode(64 + titleEndCol);
  const lunarLetter = lastColumnLetter;

  if (layout.showWeekNumbers) {
    const weekTitleCell = worksheet.getCell('A1');
    weekTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(EXPORT_COLORS.weekColumnBg) },
    };
  }

  worksheet.mergeCells(`${titleStartLetter}1:${titleEndLetter}1`);
  const titleCell = worksheet.getCell(`${titleStartLetter}1`);
  titleCell.value = layout.title;
  titleCell.font = { name: FONT_NAME, bold: true, size: 18, color: { argb: hexToArgb(EXPORT_COLORS.heading) } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  const lunarCell = worksheet.getCell(`${lunarLetter}1`);
  lunarCell.value = layout.lunarMonthLabel;
  lunarCell.font = { name: FONT_NAME, size: 11, color: { argb: hexToArgb(EXPORT_COLORS.lunarBlue) } };
  lunarCell.alignment = { vertical: 'middle', horizontal: 'right' };
  worksheet.getRow(1).height = 34;

  const headerRowIndex = 2;
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.height = 22;

  let columnIndex = 1;
  if (layout.showWeekNumbers) {
    const weekHeaderCell = headerRow.getCell(columnIndex);
    weekHeaderCell.value = '';
    weekHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(EXPORT_COLORS.weekColumnBg) },
    };
    weekHeaderCell.border = THIN_BORDER;
    worksheet.getColumn(columnIndex).width = 5;
    columnIndex += 1;
  }

  layout.weekdayHeaders.forEach((label, index) => {
    const cell = headerRow.getCell(columnIndex);
    cell.value = label;
    cell.font = {
      name: FONT_NAME,
      bold: true,
      size: 10,
      color: { argb: hexToArgb(getWeekdayHeaderColor(index, layout.weekStartsOn)) },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = THIN_BORDER;
    cell.fill = getHeaderBgFill();
    worksheet.getColumn(columnIndex).width = 18;
    columnIndex += 1;
  });

  layout.weekRows.forEach((week, weekIndex) => {
    const rowIndex = headerRowIndex + 1 + weekIndex;
    const row = worksheet.getRow(rowIndex);
    row.height = getExportWeekRowHeight(week, 92);
    let col = 1;

    if (layout.showWeekNumbers) {
      const weekCell = row.getCell(col);
      weekCell.value = week.weekNumber;
      weekCell.font = { name: FONT_NAME, size: 10, color: { argb: hexToArgb(EXPORT_COLORS.muted) } };
      weekCell.alignment = { vertical: 'top', horizontal: 'center' };
      weekCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: hexToArgb(EXPORT_COLORS.weekColumnBg) },
      };
      weekCell.border = THIN_BORDER;
      col += 1;
    }

    week.days.forEach((day) => {
      const cell = row.getCell(col);
      const richText = [...buildDateRichText(day), ...buildDayCellEventRichText(day)];

      cell.value = richText.length > 0 ? { richText } : '';
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = THIN_BORDER;

      if (day.isToday) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: hexToArgb(EXPORT_COLORS.todayBg) },
        };
      }

      col += 1;
    });
  });

  return uint8FromBufferLike(await workbook.xlsx.writeBuffer());
}

function drawPdfTitle(doc, layout, contentWidth, margin) {
  const titleY = margin + 4;
  doc.fillColor(EXPORT_COLORS.heading)
    .fontSize(20)
    .text(layout.title, margin, titleY, { width: contentWidth, align: 'center' });

  doc.fillColor(EXPORT_COLORS.lunarBlue)
    .fontSize(11)
    .text(layout.lunarMonthLabel, margin, titleY + 6, { width: contentWidth, align: 'right' });
}

/**
 * @param {import('pdfkit').default} doc
 * @param {ReturnType<typeof prepareMonthExportLayout>} layout
 * @param {number} margin
 * @param {number} contentWidth
 * @param {number} weekColumnWidth
 * @param {number} dayColumnWidth
 * @param {number} titleHeight
 * @param {number} weekdayRowHeight
 * @returns {{ gridX: number, bodyStartY: number }}
 */
function drawPdfPageHeader(doc, layout, margin, contentWidth, weekColumnWidth, dayColumnWidth, titleHeight, weekdayRowHeight) {
  drawPdfTitle(doc, layout, contentWidth, margin);

  const gridTop = margin + titleHeight;
  let gridX = margin;

  if (layout.showWeekNumbers) {
    doc.save();
    doc.fillColor(EXPORT_COLORS.weekColumnBg)
      .rect(gridX, gridTop, weekColumnWidth, weekdayRowHeight)
      .fill();
    doc.restore();
    gridX += weekColumnWidth;
  }

  layout.weekdayHeaders.forEach((label, index) => {
    const x = gridX + index * dayColumnWidth;
    doc.save();
    doc.fillColor(EXPORT_COLORS.weekdayHeaderBg).rect(x, gridTop, dayColumnWidth, weekdayRowHeight).fill();
    doc.lineWidth(0.5).strokeColor(EXPORT_COLORS.border).rect(x, gridTop, dayColumnWidth, weekdayRowHeight).stroke();
    doc.fillColor(getWeekdayHeaderColor(index, layout.weekStartsOn))
      .fontSize(10)
      .text(label, x, gridTop + 5, { width: dayColumnWidth, align: 'center', lineBreak: false });
    doc.restore();
  });

  return { gridX, bodyStartY: gridTop + weekdayRowHeight };
}

/**
 * @param {import('pdfkit').default} doc
 * @param {ReturnType<typeof prepareMonthExportLayout>} layout
 * @param {object} week
 * @param {number} weekRowHeight
 * @param {number} rowY
 * @param {number} margin
 * @param {number} gridX
 * @param {number} weekColumnWidth
 * @param {number} dayColumnWidth
 */
function drawPdfWeekRow(doc, layout, week, weekRowHeight, rowY, margin, gridX, weekColumnWidth, dayColumnWidth) {
  if (layout.showWeekNumbers) {
    doc.save();
    doc.fillColor(EXPORT_COLORS.weekColumnBg).rect(margin, rowY, weekColumnWidth, weekRowHeight).fill();
    doc.lineWidth(0.5).strokeColor(EXPORT_COLORS.border).rect(margin, rowY, weekColumnWidth, weekRowHeight).stroke();
    doc.fillColor(EXPORT_COLORS.muted)
      .fontSize(9)
      .text(String(week.weekNumber), margin, rowY + 8, { width: weekColumnWidth, align: 'center', lineBreak: false });
    doc.restore();
  }

  week.days.forEach((day, dayIndex) => {
    const x = gridX + dayIndex * dayColumnWidth;
    drawPdfDayCell(doc, day, x, rowY, dayColumnWidth, weekRowHeight);
  });
}

function drawPdfDayCell(doc, day, x, y, width, height) {
  doc.save();
  doc.lineWidth(0.5).strokeColor(EXPORT_COLORS.border).rect(x, y, width, height).stroke();

  if (day.isToday) {
    doc.fillColor(EXPORT_COLORS.todayBg).rect(x, y, width, height).fill();
    doc.lineWidth(0.5).strokeColor(EXPORT_COLORS.border).rect(x, y, width, height).stroke();
  }

  const solarX = x + 6;
  const solarY = y + 6;
  const solarSize = 14;
  const lunarGap = 14;
  const solarText = String(day.solar);
  const solarSlotWidth = doc.widthOfString('30', { size: solarSize });

  doc.fillColor(day.solarColor).fontSize(solarSize).text(solarText, solarX, solarY, { lineBreak: false });

  if (day.lunarLabel) {
    const lunarColor = day.inMonth ? EXPORT_COLORS.muted : EXPORT_COLORS.otherMonth;
    doc.fillColor(lunarColor)
      .fontSize(8)
      .text(
        `(${day.lunarLabel})`,
        solarX + solarSlotWidth + lunarGap,
        solarY + 2,
        { lineBreak: false },
      );
  }

  doc.save();
  doc.rect(x, y, width, height).clip();

  let eventY = y + 24;
  const textWidth = getPdfEventTextWidth(width);

  day.events.forEach((event) => {
    const stripeX = x + PDF_CELL_PADDING;
    const textX = stripeX + PDF_STRIPE_WIDTH + PDF_TEXT_GAP;
    const textHeight = measurePdfEventTextHeight(doc, event.line, textWidth);
    const blockHeight = Math.max(PDF_MIN_EVENT_BAR_HEIGHT, textHeight);

    doc.fillColor(event.color).rect(stripeX, eventY + 1, PDF_STRIPE_WIDTH, blockHeight).fill();
    doc.fillColor(EXPORT_COLORS.body)
      .fontSize(PDF_EVENT_FONT_SIZE)
      .text(event.line, textX, eventY, { width: textWidth, lineBreak: true });
    eventY += blockHeight + PDF_EVENT_GAP;
  });

  doc.restore();
  doc.restore();
}

/**
 * @param {ReturnType<typeof prepareMonthExportLayout>} layout
 */
async function buildPdfCalendarBuffer(layout) {
  const fontBuffer = await loadKoreanFontBuffer();
  // PDFKit defaults to Helvetica via fs/__dirname (Node-only). Pass the
  // embedded font up front so browser/WebView never touches standard AFM files.
  const fontBytes = uint8FromBufferLike(fontBuffer);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 28,
      font: fontBytes,
    });
    /** @type {Uint8Array[]} */
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(uint8FromBufferLike(chunk)));
    doc.on('end', () => {
      const total = chunks.reduce((sum, part) => sum + part.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of chunks) {
        out.set(part, offset);
        offset += part.byteLength;
      }
      resolve(out);
    });
    doc.on('error', reject);

    doc.registerFont('Body', fontBytes);
    doc.font('Body');

    const margin = 28;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const weekColumnWidth = layout.showWeekNumbers ? 28 : 0;
    const dayColumnWidth = (contentWidth - weekColumnWidth) / 7;
    const titleHeight = 40;
    const weekdayRowHeight = 20;
    const headerBlockHeight = titleHeight + weekdayRowHeight;
    const maxBodyHeight = pageHeight - margin * 2 - headerBlockHeight;
    const weekRowHeights = layout.weekRows.map((week) => getPdfWeekRowHeight(doc, week, dayColumnWidth, 96));

    let bodyStartY = 0;
    let gridX = margin;
    let usedBodyHeight = 0;
    let pageIndex = 0;

    const startNewPage = () => {
      if (pageIndex > 0) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin });
        doc.font('Body');
      }
      pageIndex += 1;
      usedBodyHeight = 0;
      const header = drawPdfPageHeader(
        doc,
        layout,
        margin,
        contentWidth,
        weekColumnWidth,
        dayColumnWidth,
        titleHeight,
        weekdayRowHeight,
      );
      gridX = header.gridX;
      bodyStartY = header.bodyStartY;
    };

    layout.weekRows.forEach((week, weekIndex) => {
      const weekRowHeight = weekRowHeights[weekIndex];

      if (pageIndex === 0 || usedBodyHeight + weekRowHeight > maxBodyHeight) {
        startNewPage();
      }

      drawPdfWeekRow(
        doc,
        layout,
        week,
        weekRowHeight,
        bodyStartY + usedBodyHeight,
        margin,
        gridX,
        weekColumnWidth,
        dayColumnWidth,
      );
      usedBodyHeight += weekRowHeight;
    });

    doc.end();
  });
}

/**
 * @param {ReturnType<typeof prepareDayListExportLayout>} layout
 */
async function buildExcelDayListBuffer(layout) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('일정 목록', {
    views: [{ showGridLines: false }],
  });
  const dayListBorder = getDayListBorder();

  worksheet.pageSetup = {
    orientation: 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  worksheet.mergeCells('A1:B1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = layout.title;
  titleCell.font = { name: FONT_NAME, bold: true, size: 16, color: { argb: hexToArgb(EXPORT_COLORS.heading) } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;

  const headerRow = worksheet.getRow(2);
  headerRow.height = 22;
  ;['날짜', '내용'].forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { name: FONT_NAME, bold: true, size: 10, color: { argb: hexToArgb(DAY_LIST_COLORS.text) } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = dayListBorder;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: hexToArgb(DAY_LIST_COLORS.headerBg) },
    };
  });
  // Excel column width uses character units; this converts to approximately 105 px.
  worksheet.getColumn(1).width = (105 - 5) / 7;
  worksheet.getColumn(2).width = 72;
  worksheet.pageSetup.printArea = `A1:B${2 + layout.rows.length}`;
  worksheet.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];

  layout.rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(3 + index);
    const contentLines = String(row.contentText || '')
      .split('\n')
      .filter((line, lineIndex, lines) => line.length > 0 || (lineIndex > 0 && lineIndex < lines.length - 1));
    const lineCount = Math.max(1, contentLines.length || row.events.length);
    excelRow.height = Math.max(22, 14 * lineCount + 8);

    const dateCell = excelRow.getCell(1);
    const dayOfWeek = getDayListDayOfWeek(row.dayKey);
    const isHoliday = Boolean(row.isHoliday);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday;
    dateCell.value = row.dateLabel;
    dateCell.font = {
      name: FONT_NAME,
      size: 10,
      bold: true,
      color: { argb: hexToArgb(getDayListDateColor(dayOfWeek, isHoliday)) },
    };
    dateCell.alignment = { vertical: 'top', horizontal: 'center' };
    dateCell.border = dayListBorder;
    dateCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: hexToArgb(isWeekend ? DAY_LIST_COLORS.weekendBg : DAY_LIST_COLORS.dateBg),
      },
    };

    const contentCell = excelRow.getCell(2);
    if (row.events.length === 0) {
      contentCell.value = '';
    } else {
      /** @type {import('exceljs').RichText[]} */
      const richText = [];
      row.events.forEach((event, eventIndex) => {
        if (eventIndex > 0) {
          richText.push({ text: '\n', font: { name: FONT_NAME, size: 9 } });
        }
        const eventLines = String(event.line || '').split('\n');
        eventLines.forEach((line, lineIndex) => {
          if (lineIndex > 0) {
            richText.push({ text: '\n', font: { name: FONT_NAME, size: 9 } });
          }
          if (lineIndex === 0) {
            richText.push({
              text: '▎ ',
              font: { name: FONT_NAME, size: 9, color: { argb: hexToArgb(event.color) } },
            });
            for (const run of splitEventTitleRuns(line)) {
              richText.push({
                text: run.text,
                font: {
                  name: FONT_NAME,
                  size: 9,
                  bold: run.completed,
                  color: {
                    argb: hexToArgb(
                      run.completed ? COMPLETED_LABEL_COLOR : EXPORT_COLORS.body
                    ),
                  },
                },
              });
            }
          } else {
            richText.push({
              text: '  ',
              font: { name: FONT_NAME, size: 9 },
            });
            richText.push({
              text: line,
              font: {
                name: FONT_NAME,
                size: 9,
                color: { argb: hexToArgb(EXPORT_COLORS.muted) },
              },
            });
          }
        });
      });
      contentCell.value = { richText };
    }
    contentCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    contentCell.border = dayListBorder;
    if (isWeekend) {
      contentCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: hexToArgb(DAY_LIST_COLORS.weekendBg) },
      };
    }
  });

  return uint8FromBufferLike(await workbook.xlsx.writeBuffer());
}

/**
 * @param {ReturnType<typeof prepareDayListExportLayout>} layout
 */
async function buildPdfDayListBuffer(layout) {
  const fontBuffer = await loadKoreanFontBuffer();
  const fontBytes = uint8FromBufferLike(fontBuffer);
  const boldBuffer = await loadKoreanBoldFontBuffer();
  const boldBytes = boldBuffer ? uint8FromBufferLike(boldBuffer) : fontBytes;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 36,
      font: fontBytes,
    });
    /** @type {Uint8Array[]} */
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(uint8FromBufferLike(chunk)));
    doc.on('end', () => {
      const total = chunks.reduce((sum, part) => sum + part.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of chunks) {
        out.set(part, offset);
        offset += part.byteLength;
      }
      resolve(out);
    });
    doc.on('error', reject);

    doc.registerFont('Body', fontBytes);
    doc.registerFont('Bold', boldBytes);
    doc.font('Body');

    const margin = 36;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin * 2;
    const dateColWidth = 90;
    const contentColWidth = contentWidth - dateColWidth;
    const titleHeight = 34;
    const headerHeight = 22;
    const rowPad = 6;

    let y = 0;
    let pageIndex = 0;

    const drawHeader = () => {
      if (pageIndex > 0) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin });
        doc.font('Body');
      }
      pageIndex += 1;

      doc.fillColor(EXPORT_COLORS.heading)
        .fontSize(16)
        .text(layout.title, margin, margin, { width: contentWidth, align: 'left' });

      const headerY = margin + titleHeight;
      doc.save();
      doc.fillColor(DAY_LIST_COLORS.headerBg).rect(margin, headerY, contentWidth, headerHeight).fill();
      doc.lineWidth(0.45).strokeColor(DAY_LIST_COLORS.border).rect(margin, headerY, dateColWidth, headerHeight).stroke();
      doc.lineWidth(0.45).strokeColor(DAY_LIST_COLORS.border)
        .rect(margin + dateColWidth, headerY, contentColWidth, headerHeight)
        .stroke();
      doc.font('Bold').fillColor(DAY_LIST_COLORS.text)
        .fontSize(10)
        .text('날짜', margin, headerY + 6, { width: dateColWidth, align: 'center', lineBreak: false });
      doc.fillColor(DAY_LIST_COLORS.text)
        .fontSize(10)
        .text('내용', margin + dateColWidth, headerY + 6, {
          width: contentColWidth,
          align: 'center',
          lineBreak: false,
        });
      doc.font('Body');
      doc.restore();
      y = headerY + headerHeight;
    };

    drawHeader();

    const eventTextWidth = contentColWidth - 18;

    for (const row of layout.rows) {
      let contentHeight = 14;
      if (row.events.length > 0) {
        contentHeight = row.events.reduce(
          (sum, event) => sum + measureDayListEventHeight(doc, event, eventTextWidth) + PDF_EVENT_GAP,
          -PDF_EVENT_GAP,
        );
      }
      const rowHeight = Math.max(14, contentHeight) + rowPad * 2;

      if (y + rowHeight > pageHeight - margin) {
        drawHeader();
      }

      doc.save();
      const dayOfWeek = getDayListDayOfWeek(row.dayKey);
      const isHoliday = Boolean(row.isHoliday);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday;
      // 휴일 / 토 / 일: 날짜칸도 내용칸과 같은 색으로 한 줄이 통째로 강조된다.
      doc.fillColor(isWeekend ? DAY_LIST_COLORS.weekendBg : DAY_LIST_COLORS.dateBg)
        .rect(margin, y, dateColWidth, rowHeight)
        .fill();
      if (isWeekend) {
        doc.fillColor(DAY_LIST_COLORS.weekendBg)
          .rect(margin + dateColWidth, y, contentColWidth, rowHeight)
          .fill();
      }
      doc.lineWidth(0.45).strokeColor(DAY_LIST_COLORS.border).rect(margin, y, dateColWidth, rowHeight).stroke();
      doc.lineWidth(0.45).strokeColor(DAY_LIST_COLORS.border)
        .rect(margin + dateColWidth, y, contentColWidth, rowHeight)
        .stroke();
      // 날짜는 평일까지 모두 진하게 — 내용 칸 본문과 구분되는 열 머리처럼 읽힌다.
      doc.font('Bold')
        .fillColor(getDayListDateColor(dayOfWeek, isHoliday))
        .fontSize(9)
        .text(row.dateLabel, margin + 4, y + rowPad, {
          width: dateColWidth - 8,
          align: 'center',
          lineBreak: false,
        });
      doc.font('Body');

      let eventY = y + rowPad;
      for (const event of row.events) {
        const stripeX = margin + dateColWidth + 6;
        const textX = stripeX + PDF_STRIPE_WIDTH + PDF_TEXT_GAP;
        const eventHeight = drawDayListEvent(doc, event, textX, eventY, eventTextWidth);
        doc.fillColor(event.color).rect(stripeX, eventY + 1, PDF_STRIPE_WIDTH, eventHeight).fill();
        eventY += eventHeight + PDF_EVENT_GAP;
      }
      doc.restore();
      y += rowHeight;
    }

    doc.end();
  });
}

/**
 * @param {object} store
 * @param {{
 *   layout?: 'monthGrid' | 'dayList'
 *   startDate: string
 *   endDate: string
 * }} request
 * @param {{
 *   asAdmin?: boolean
 *   includeCompleted?: boolean
 *   includeHolidays?: boolean
 *   excludeHiddenCalendars?: boolean
 * }} [options]
 */
function prepareExportLayout(store, request, options = {}) {
  if (request.layout === 'dayList') {
    return prepareDayListExportLayout(
      store,
      { startDate: request.startDate, endDate: request.endDate },
      options,
    );
  }
  return prepareRangeGridExportLayout(
    store,
    { startDate: request.startDate, endDate: request.endDate },
    options,
  );
}

/**
 * @param {object} store
 * @param {{
 *   scope?: 'month' | 'year'
 *   year?: number
 *   month?: number
 *   layout?: 'monthGrid' | 'dayList'
 *   startDate?: string
 *   endDate?: string
 * }} period
 * @param {{
 *   asAdmin?: boolean
 *   includeCompleted?: boolean
 *   includeHolidays?: boolean
 *   excludeHiddenCalendars?: boolean
 * }} [options]
 */
export async function buildExcelBuffer(store, period, options = {}) {
  if (period?.startDate && period?.endDate) {
    const layout = prepareExportLayout(
      store,
      {
        layout: period.layout === 'dayList' ? 'dayList' : 'monthGrid',
        startDate: period.startDate,
        endDate: period.endDate,
      },
      options,
    );
    return layout.layout === 'dayList'
      ? buildExcelDayListBuffer(layout)
      : buildExcelCalendarBuffer(layout);
  }

  const layout = prepareMonthExportLayout(store, period, options);
  if (!layout) {
    throw new Error('연간 내보내기는 아직 지원하지 않습니다.');
  }
  return buildExcelCalendarBuffer(layout);
}

/**
 * @param {object} store
 * @param {{
 *   scope?: 'month' | 'year'
 *   year?: number
 *   month?: number
 *   layout?: 'monthGrid' | 'dayList'
 *   startDate?: string
 *   endDate?: string
 * }} period
 * @param {{
 *   asAdmin?: boolean
 *   includeCompleted?: boolean
 *   includeHolidays?: boolean
 *   excludeHiddenCalendars?: boolean
 * }} [options]
 */
export async function buildPdfBuffer(store, period, options = {}) {
  if (period?.startDate && period?.endDate) {
    const layout = prepareExportLayout(
      store,
      {
        layout: period.layout === 'dayList' ? 'dayList' : 'monthGrid',
        startDate: period.startDate,
        endDate: period.endDate,
      },
      options,
    );
    return layout.layout === 'dayList'
      ? buildPdfDayListBuffer(layout)
      : buildPdfCalendarBuffer(layout);
  }

  const layout = prepareMonthExportLayout(store, period, options);
  if (!layout) {
    throw new Error('연간 내보내기는 아직 지원하지 않습니다.');
  }
  return buildPdfCalendarBuffer(layout);
}

export function getExcelExportFileName(period) {
  return getExportFileName(period, 'xlsx');
}

export function getPdfExportFileName(period) {
  return getExportFileName(period, 'pdf');
}
