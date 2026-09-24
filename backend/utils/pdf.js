/**
 * Dependency free PDF renderer for the export endpoints.
 *
 * The project ships no PDF library (the same philosophy as
 * scripts/sample-receipts.js, which draws PNGs by hand). This module renders a
 * report grade document with the PDF base-14 fonts only, so nothing has to be
 * embedded and the output opens in every viewer.
 *
 * Layout, top to bottom:
 *   gradient brand band (brand mark, title, filters, page x of y)
 *   -> KPI stat cards (optional)
 *   -> table: accent header row, column separators, zebra rows, status pills,
 *      progress bars, bold totals row, repeating header on every page
 *   -> footer with product name, note and generation stamp
 * plus an optional low opacity diagonal watermark.
 */

const PAGE_SIZES = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
};

/** Palette taken from the web UI so the PDF and the app look related. */
const COLORS = {
  ink: [0.063, 0.094, 0.161],
  brand: [0.063, 0.09, 0.161],
  brandEnd: [0.106, 0.239, 0.494],
  accent: [0.059, 0.616, 0.561],
  accentSoft: [0.878, 0.965, 0.949],
  primary: [0.122, 0.373, 0.749],
  headerBg: [0.918, 0.945, 0.992],
  headerLine: [0.784, 0.851, 0.968],
  grid: [0.886, 0.898, 0.929],
  zebra: [0.976, 0.98, 0.99],
  totalsBg: [0.937, 0.976, 0.965],
  totalsLine: [0.706, 0.894, 0.816],
  cardWash: [0.984, 0.988, 0.996],
  cardBorder: [0.859, 0.882, 0.922],
  text: [0.117, 0.141, 0.188],
  muted: [0.392, 0.439, 0.541],
  faint: [0.6, 0.647, 0.729],
  white: [1, 1, 1],
  bandMuted: [0.749, 0.8, 0.89],
};

/** Status tone palette used by the pill and progress bar renderers. */
const TONES = {
  success: { text: [0.098, 0.463, 0.282], fill: [0.902, 0.965, 0.925], bar: [0.11, 0.478, 0.29] },
  info: { text: [0.098, 0.278, 0.604], fill: [0.91, 0.941, 0.992], bar: [0.122, 0.373, 0.749] },
  warning: { text: [0.663, 0.396, 0], fill: [1, 0.957, 0.878], bar: [0.769, 0.494, 0] },
  danger: { text: [0.784, 0.204, 0.169], fill: [0.992, 0.925, 0.918], bar: [0.784, 0.204, 0.169] },
  muted: { text: [0.396, 0.435, 0.545], fill: [0.933, 0.945, 0.969], bar: [0.6, 0.647, 0.729] },
};

/**
 * Well known business values -> tone. Used only when a column asks for a pill
 * (`badge: true`), so the renderer stays generic while the exports look right.
 */
const STATUS_TONES = {
  approved: 'success',
  paid: 'success',
  active: 'success',
  'within budget': 'success',
  submitted: 'info',
  pending: 'info',
  'partially approved': 'info',
  unread: 'info',
  draft: 'muted',
  read: 'muted',
  returned: 'warning',
  warning: 'warning',
  'partially paid': 'warning',
  rejected: 'danger',
  overdue: 'danger',
  exceeded: 'danger',
  create: 'success',
  approve: 'success',
  pay: 'success',
  activate: 'success',
  restore: 'success',
  update: 'info',
  submit: 'info',
  reassign: 'info',
  update_settings: 'info',
  delete: 'danger',
  reject: 'danger',
  deactivate: 'danger',
  archive: 'muted',
  return: 'warning',
  adjust: 'warning',
  revise_budget: 'warning',
  change_password: 'muted',
};

/** PDF strings are single byte (Latin-1): normalise typographic characters. */
const sanitize = (value) =>
  String(value === null || value === undefined ? '' : value)
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/** Escape the characters that are special inside a PDF literal string. */
const escapeText = (value) =>
  sanitize(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Helvetica advance widths (per mille) for the characters we print. */
const WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

const DEFAULT_WIDTH = 556;

const textWidth = (value, size, bold = false, letterSpacing = 0) => {
  const characters = sanitize(value);
  let total = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const code = characters.charCodeAt(index);
    total += WIDTHS[characters[index]] || (code > 127 ? 556 : DEFAULT_WIDTH);
  }
  const spacing = letterSpacing > 0 ? letterSpacing * Math.max(0, characters.length - 1) : 0;
  // Helvetica-Bold is roughly 6% wider than Helvetica for mixed case text.
  return (total / 1000) * size * (bold ? 1.06 : 1) + spacing;
};

/** Shorten text until it fits, ending with an ellipsis. */
const fitText = (value, maxWidth, size, bold = false) => {
  const characters = sanitize(value);
  if (textWidth(characters, size, bold) <= maxWidth) return characters;
  let truncated = characters;
  while (truncated.length > 1 && textWidth(`${truncated}...`, size, bold) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
};

/* ---------------------------------------------------------- primitives --- */

const MARGIN = 36;
const BAND_FIRST = 104;
const BAND_REST = 58;
const STATS_H = 52;
const TABLE_HEAD_H = 26;
const ROW_H = 19;
const FOOTER_H = 48;
const PADDING = 6;
const BAR_WIDTH = 46;

/** 1,234.56 - grouped, two decimals (money and quantity friendly). */
const formatNumberPlain = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return sanitize(value);
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Turn any raw cell value into printable text. */
const toCellText = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumberPlain(value);
  return String(value);
};

/** Map a value to a tone name (defaults to muted). */
const resolveTone = (value) => STATUS_TONES[String(value ?? '').trim().toLowerCase()] || 'muted';

/** Read one cell value, letting a column define its own formatter. */
const resolveCell = (column, row) => {
  const raw = typeof column.key === 'function' ? column.key(row) : row?.[column.key];
  return typeof column.format === 'function' ? column.format(raw, row) : raw;
};

/** Raw (unformatted) numeric value, used by progress bar columns. */
const resolveNumber = (column, row) => {
  const raw = typeof column.key === 'function' ? column.key(row) : row?.[column.key];
  return Number(raw);
};

/**
 * Proportional column widths weighted by content length. Badge and bar columns
 * get a little extra room so the decoration never crowds the text.
 */
const computeColumnWidths = (columns, rows, availableWidth) => {
  const minWidth = 46;
  const weights = columns.map((column) => {
    if (Number.isFinite(column.width)) return Number(column.width);
    const headerWeight = textWidth(String(column.label || column.key), 8, true, 0.4) / 5;
    const contentWeight = rows.reduce((max, row) => {
      const text = toCellText(resolveCell(column, row));
      const bonus = column.badge ? 6 : 0;
      return Math.max(max, Math.min(text.length + bonus, 40));
    }, 0);
    const floor = column.bar ? 14 : 8;
    return Math.max(headerWeight, contentWeight, floor);
  });

  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  let widths = weights.map((weight) => Math.max(minWidth, (weight / totalWeight) * availableWidth));

  const total = widths.reduce((sum, value) => sum + value, 0);
  const overflow = total - availableWidth;
  if (overflow > 0) {
    const shrinkable = widths.reduce((sum, value) => sum + Math.max(0, value - minWidth), 0) || 1;
    widths = widths.map((value) => {
      const room = Math.max(0, value - minWidth);
      return value - (room / shrinkable) * overflow;
    });
  }
  return widths;
};

/** Marks the synthetic totals row so pagination and styling can spot it. */
const TOTALS_ROW = { __pdfTotals: true };

/** A page is just a growing list of PDF content stream operators. */
const createPage = () => {
  const ops = [];
  return {
    ops,
    fill(color) {
      ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    },
    /** Switch the graphics state alpha ('full' | 'soft' | 'watermark'). */
    alpha(level = 'full') {
      const ref = level === 'watermark' ? 'GSw' : level === 'soft' ? 'GSf' : 'GSn';
      ops.push(`/${ref} gs`);
    },
    rect(x, y, width, height) {
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
    },
    /** Filled rectangle with rounded corners (four Bezier corners). */
    roundedRect(x, y, width, height, radius = 6) {
      const r = Math.min(radius, width / 2, height / 2);
      const k = 0.5523 * r;
      const p = (value) => value.toFixed(2);
      ops.push(`${p(x + r)} ${p(y)} m`);
      ops.push(`${p(x + width - r)} ${p(y)} l`);
      ops.push(`${p(x + width - r + k)} ${p(y)} ${p(x + width)} ${p(y + r - k)} ${p(x + width)} ${p(y + r)} c`);
      ops.push(`${p(x + width)} ${p(y + height - r)} l`);
      ops.push(
        `${p(x + width)} ${p(y + height - r + k)} ${p(x + width - r + k)} ${p(y + height)} ${p(
          x + width - r,
        )} ${p(y + height)} c`,
      );
      ops.push(`${p(x + r)} ${p(y + height)} l`);
      ops.push(
        `${p(x + r - k)} ${p(y + height)} ${p(x)} ${p(y + height - r + k)} ${p(x)} ${p(
          y + height - r,
        )} c`,
      );
      ops.push(`${p(x)} ${p(y + r)} l`);
      ops.push(`${p(x)} ${p(y + r - k)} ${p(x + r - k)} ${p(y)} ${p(x + r)} ${p(y)} c`);
      ops.push('f');
    },
    line(x1, y1, x2, y2, color = COLORS.grid, width = 0.6) {
      ops.push(`${color[0]} ${color[1]} ${color[2]} RG`);
      ops.push(`${width} w`);
      ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    },
    text(value, x, y, options = {}) {
      const {
        size = 9,
        bold = false,
        color = COLORS.text,
        align = 'left',
        maxWidth = null,
        letterSpacing = 0,
      } = options;
      const content = maxWidth ? fitText(value, maxWidth, size, bold) : sanitize(value);
      if (!content) return;
      const width = textWidth(content, size, bold, letterSpacing);
      const drawX = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
      const spacing = letterSpacing > 0 ? `${letterSpacing} Tc ` : '';
      this.fill(color);
      ops.push(
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${spacing}${drawX.toFixed(2)} ${y.toFixed(
          2,
        )} Td (${escapeText(content)}) Tj ET`,
      );
    },
    /** Rotated text - used for the diagonal watermark. */
    rotatedText(value, x, y, options = {}) {
      const { size = 40, bold = true, color = COLORS.accent, angle = 32 } = options;
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians).toFixed(4);
      const sin = Math.sin(radians).toFixed(4);
      this.fill(color);
      ops.push(
        `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${cos} ${sin} ${-sin} ${cos} ${x.toFixed(
          2,
        )} ${y.toFixed(2)} Tm (${escapeText(value)}) Tj ET`,
      );
    },
  };
};

/* ------------------------------------------------------------ chrome ----- */

/** Draw a rounded pill and return its width (used for status values). */
const drawPill = (page, text, x, y, tone) => {
  const size = 8;
  const paddingX = 6;
  const width = textWidth(text, size, true) + paddingX * 2;
  const height = size + 7;
  page.fill(tone.fill);
  page.roundedRect(x, y, width, height, height / 2);
  page.text(text, x + paddingX, y + 4.2, { size, bold: true, color: tone.text });
  return width;
};

/** Gradient brand band with the web app's identity. */
const drawBand = (
  page,
  { size, bandHeight, first, title, subtitle, brand, meta, bandBadge, pageNumber, pageCount, stamp, availableWidth },
) => {
  // Vertical gradient drawn as thin strips (no shadings / no dependencies).
  const strips = 26;
  const stripHeight = bandHeight / strips;
  for (let index = 0; index < strips; index += 1) {
    const ratio = strips === 1 ? 0 : index / (strips - 1);
    const color = [0, 1, 2].map(
      (channel) => COLORS.brand[channel] + (COLORS.brandEnd[channel] - COLORS.brand[channel]) * ratio,
    );
    page.fill(color);
    page.rect(0, size.height - bandHeight + index * stripHeight, size.width, stripHeight + 0.6);
  }

  // Accent underline.
  page.fill(COLORS.accent);
  page.rect(0, size.height - bandHeight, size.width, 3.2);

  // Rounded brand mark with the product initials.
  page.alpha('soft');
  page.fill(COLORS.white);
  page.roundedRect(MARGIN, size.height - 48, 30, 30, 8);
  page.alpha('full');
  page.text('EB', MARGIN + 15, size.height - 38, {
    size: 11,
    bold: true,
    color: COLORS.brand,
    align: 'center',
    letterSpacing: 0.5,
  });

  const textX = MARGIN + 40;
  const textWidthLimit = availableWidth - 210;
  page.text(brand.toUpperCase(), textX, size.height - 25, {
    size: 8.5,
    bold: true,
    color: COLORS.bandMuted,
    letterSpacing: 1.1,
    maxWidth: textWidthLimit,
  });
  page.text(title, textX, size.height - 45, {
    size: 16,
    bold: true,
    color: COLORS.white,
    maxWidth: textWidthLimit,
  });
  if (first && subtitle) {
    page.text(subtitle, textX, size.height - 61, {
      size: 8.5,
      color: COLORS.bandMuted,
      maxWidth: textWidthLimit,
    });
  }

  // Translucent badge (for example "INTERNAL USE").
  if (first && bandBadge) {
    const label = String(bandBadge).toUpperCase();
    const width = textWidth(label, 7.5, true, 0.6) + 14;
    page.alpha('soft');
    page.fill(COLORS.white);
    page.roundedRect(size.width - MARGIN - width, size.height - 30, width, 16, 8);
    page.alpha('full');
    page.text(label, size.width - MARGIN - width / 2, size.height - 25.5, {
      size: 7.5,
      bold: true,
      color: COLORS.white,
      align: 'center',
      letterSpacing: 0.6,
    });
  }

  page.text(`Page ${pageNumber} of ${pageCount}`, size.width - MARGIN, size.height - 43, {
    size: 8,
    color: COLORS.bandMuted,
    align: 'right',
  });
  if (first && meta.length > 0) {
    meta.slice(0, 2).forEach((entry, index) => {
      page.text(entry, size.width - MARGIN, size.height - 59 - index * 11, {
        size: 7.5,
        color: COLORS.bandMuted,
        align: 'right',
        maxWidth: 190,
      });
    });
  }
  if (!first) {
    page.text(`Generated ${stamp}`, size.width - MARGIN, size.height - 56, {
      size: 7.5,
      color: COLORS.bandMuted,
      align: 'right',
    });
  }
};

/** KPI cards row shown under the band on the first page. */
const drawStats = (page, stats, y, availableWidth) => {
  const cards = stats.slice(0, 4);
  const gap = 10;
  const cardWidth = (availableWidth - gap * (cards.length - 1)) / cards.length;

  cards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    const tone = card.tone ? TONES[card.tone] || TONES.muted : null;

    // Border via an outer rounded rect, then the wash on top of it.
    page.fill(COLORS.cardBorder);
    page.roundedRect(x, y, cardWidth, STATS_H, 8);
    page.fill(COLORS.cardWash);
    page.roundedRect(x + 0.7, y + 0.7, cardWidth - 1.4, STATS_H - 1.4, 7.4);

    // Accent edge + label + value.
    page.fill(tone ? tone.bar : COLORS.accent);
    page.roundedRect(x + 9, y + 11, 2.6, STATS_H - 22, 1.3);
    page.text(String(card.label || '').toUpperCase(), x + 17, y + STATS_H - 19, {
      size: 7,
      bold: true,
      color: COLORS.muted,
      letterSpacing: 0.6,
      maxWidth: cardWidth - 26,
    });
    page.text(toCellText(card.value), x + 17, y + 11, {
      size: 13,
      bold: true,
      color: tone ? tone.text : COLORS.ink,
      maxWidth: cardWidth - 26,
    });
  });
};

/* -------------------------------------------------------------- table ---- */

/** Table header row with column separators and an accent underline. */
const drawTableHeader = (page, { columns, widths, y, availableWidth }) => {
  page.fill(COLORS.headerBg);
  page.rect(MARGIN, y, availableWidth, TABLE_HEAD_H);
  page.fill(COLORS.accent);
  page.rect(MARGIN, y + TABLE_HEAD_H - 1.6, availableWidth, 1.8);
  page.line(MARGIN, y, MARGIN + availableWidth, y, COLORS.grid, 0.7);

  let x = MARGIN;
  columns.forEach((column, index) => {
    const numeric = column.numeric === true;
    page.text(
      String(column.label || column.key).toUpperCase(),
      numeric ? x + widths[index] - PADDING : x + PADDING,
      y + 9,
      {
        size: 8,
        bold: true,
        color: COLORS.ink,
        align: numeric ? 'right' : 'left',
        letterSpacing: 0.4,
        maxWidth: widths[index] - PADDING * 2,
      },
    );
    if (index > 0) page.line(x, y, x, y + TABLE_HEAD_H, COLORS.headerLine, 0.7);
    x += widths[index];
  });
};

/** Tone used by progress bar columns: threshold aware when asked to be. */
const barTone = (column, value) => {
  if (typeof column.tone === 'function') return TONES[column.tone(value)] || TONES.info;
  const warningAt = Number.isFinite(column.warningAt) ? column.warningAt : 80;
  if (value >= 100) return TONES.danger;
  if (value >= warningAt) return TONES.warning;
  return TONES.success;
};

/** One body row: zebra fill, pills, progress bars and cell text. */
const drawRow = (page, { columns, widths, row, y, availableWidth, isTotals, totals }) => {
  if (isTotals) {
    page.fill(COLORS.totalsBg);
    page.roundedRect(MARGIN, y, availableWidth, ROW_H, 3);
    page.line(MARGIN, y + ROW_H, MARGIN + availableWidth, y + ROW_H, COLORS.totalsLine, 1);
  }

  let x = MARGIN;
  columns.forEach((column, index) => {
    const numeric = column.numeric === true;
    const raw = isTotals ? totals[column.key] : resolveCell(column, row);
    const text = toCellText(raw);
    const baseline = y + 6.8;

    if (column.badge && !isTotals && text !== '-') {
      drawPill(page, text, x + PADDING, y + 5.6, TONES[resolveTone(raw)]);
    } else if (column.bar && !isTotals) {
      const value = Math.max(0, Math.min(140, resolveNumber(column, row) || 0));
      const tone = barTone(column, value);
      const trackX = x + PADDING;
      const trackWidth = Math.max(18, widths[index] - PADDING * 2 - BAR_WIDTH - 6);
      page.fill(COLORS.grid);
      page.roundedRect(trackX, y + 8, trackWidth, 6, 3);
      page.fill(tone.bar);
      page.roundedRect(trackX, y + 8, Math.max(1.5, (trackWidth * Math.min(100, value)) / 100), 6, 3);
      page.text(text, x + widths[index] - PADDING, baseline, {
        size: 8,
        bold: true,
        color: tone.text,
        align: 'right',
        maxWidth: BAR_WIDTH,
      });
    } else {
      page.text(text, numeric ? x + widths[index] - PADDING : x + PADDING, baseline, {
        size: 8.5,
        bold: isTotals,
        color: isTotals ? COLORS.ink : COLORS.text,
        align: numeric ? 'right' : 'left',
        maxWidth: widths[index] - PADDING * 2,
      });
    }

    if (index > 0) page.line(x, y, x, y + ROW_H, COLORS.grid, 0.4);
    x += widths[index];
  });

  page.line(MARGIN, y, MARGIN + availableWidth, y, COLORS.grid, 0.4);
};

/** Friendly panel shown when the filters produced no rows. */
const drawEmptyState = (page, { y, availableWidth, message }) => {
  const height = 74;
  const top = y - height;
  page.fill(COLORS.cardBorder);
  page.roundedRect(MARGIN, top, availableWidth, height, 8);
  page.fill(COLORS.cardWash);
  page.roundedRect(MARGIN + 0.7, top + 0.7, availableWidth - 1.4, height - 1.4, 7.4);
  page.text(message, MARGIN + availableWidth / 2, top + height - 26, {
    size: 10.5,
    bold: true,
    color: COLORS.muted,
    align: 'center',
    maxWidth: availableWidth - 30,
  });
  page.text('Adjust the filters and export again to see rows here.', MARGIN + availableWidth / 2, top + height - 44, {
    size: 8,
    color: COLORS.faint,
    align: 'center',
    maxWidth: availableWidth - 30,
  });
};

/** Footer: product line, optional note and the generation stamp. */
const drawFooter = (page, { size, availableWidth, brand, title, footerNote, stamp }) => {
  const y = MARGIN - 14;
  page.line(MARGIN, y + 18, size.width - MARGIN, y + 18, COLORS.grid, 0.7);
  page.fill(COLORS.accent);
  page.rect(MARGIN, y + 17, 22, 1.8);
  page.text(`${brand} - ${title}`, MARGIN, y, {
    size: 7.5,
    color: COLORS.muted,
    maxWidth: availableWidth * 0.42,
  });
  if (footerNote) {
    page.text(footerNote, size.width / 2, y, {
      size: 7.5,
      color: COLORS.faint,
      align: 'center',
      maxWidth: availableWidth * 0.42,
    });
  }
  page.text(`Generated ${stamp}`, size.width - MARGIN, y, {
    size: 7.5,
    color: COLORS.muted,
    align: 'right',
  });
};

/* ---------------------------------------------------------- page render -- */

const drawPage = ({
  pageNumber,
  pageCount,
  size,
  bandHeight,
  first,
  title,
  subtitle,
  brand,
  meta,
  bandBadge,
  columns,
  widths,
  availableWidth,
  pageRows,
  totals,
  stats,
  stamp,
  footerNote,
  watermark,
  emptyMessage,
}) => {
  const page = createPage();

  if (watermark) {
    page.alpha('watermark');
    page.rotatedText(watermark, size.width * 0.13, size.height * 0.3, {
      size: 54,
      angle: 30,
      color: COLORS.primary,
    });
    page.alpha('full');
  }

  drawBand(page, {
    size,
    bandHeight,
    first,
    title,
    subtitle,
    brand,
    meta,
    bandBadge,
    pageNumber,
    pageCount,
    stamp,
    availableWidth,
  });

  let cursorY = size.height - bandHeight;

  if (first && stats.length > 0) {
    cursorY -= STATS_H + 14;
    drawStats(page, stats, cursorY, availableWidth);
  }

  if (pageRows.length === 0) {
    drawEmptyState(page, { y: cursorY - 10, availableWidth, message: emptyMessage });
  } else {
    const headY = cursorY - TABLE_HEAD_H;
    drawTableHeader(page, { columns, widths, y: headY, availableWidth });

    let rowY = headY;
    pageRows.forEach((row, index) => {
      rowY -= ROW_H;
      const isTotals = row === TOTALS_ROW;
      if (!isTotals && index % 2 === 1) {
        page.fill(COLORS.zebra);
        page.rect(MARGIN, rowY, availableWidth, ROW_H);
      }
      drawRow(page, { columns, widths, row, y: rowY, availableWidth, isTotals, totals });
    });
  }

  drawFooter(page, { size, availableWidth, brand, title, footerNote, stamp });
  return page.ops.join('\n');
};

/**
 * Build a complete, self contained PDF document.
 *
 * @param {Object} options
 * @param {string} options.title              report name (band)
 * @param {string} [options.subtitle]         filter / window summary line
 * @param {string} [options.brand]            product name (band + footer)
 * @param {Array<Object>} options.columns     [{ key, label, numeric?, width?, format?, badge?, bar?, tone?, warningAt? }]
 * @param {Array<Object>} options.rows
 * @param {Object} [options.totals]           values keyed by column key -> bold totals row
 * @param {Array<Object>} [options.stats]     up to four KPI cards: [{ label, value, tone? }]
 * @param {Array<string>} [options.meta]      up to two right aligned band lines
 * @param {string} [options.bandBadge]        translucent band pill (e.g. "INTERNAL USE")
 * @param {string} [options.footerNote]       centred footer line
 * @param {string} [options.watermark]        low opacity diagonal watermark
 * @param {string} [options.emptyMessage]     shown when there are no rows
 * @param {'portrait'|'landscape'} [options.orientation]
 * @param {Date} [options.generatedAt]
 * @returns {Buffer} the PDF file
 */
const buildTablePdf = ({
  title = 'Report',
  subtitle = '',
  brand = 'Expense, Budget & Reimbursement',
  columns = [],
  rows = [],
  totals = null,
  stats = [],
  meta = [],
  bandBadge = '',
  footerNote = '',
  watermark = '',
  emptyMessage = 'No records match the current filters',
  orientation = 'portrait',
  generatedAt = new Date(),
} = {}) => {
  const size = PAGE_SIZES[orientation] || PAGE_SIZES.portrait;
  const availableWidth = size.width - MARGIN * 2;
  const widths = computeColumnWidths(columns, rows, availableWidth);
  const body = totals ? [...rows, TOTALS_ROW] : rows;
  const statsHeight = stats.length > 0 ? STATS_H + 14 : 0;

  const firstCapacity = Math.max(
    1,
    Math.floor((size.height - BAND_FIRST - statsHeight - TABLE_HEAD_H - FOOTER_H - 12) / ROW_H),
  );
  const restCapacity = Math.max(
    1,
    Math.floor((size.height - BAND_REST - TABLE_HEAD_H - FOOTER_H - 12) / ROW_H),
  );
  const pageCount =
    body.length <= firstCapacity ? 1 : 1 + Math.ceil((body.length - firstCapacity) / restCapacity);

  const stamp = `${generatedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const streams = [];
  let cursor = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const capacity = pageNumber === 1 ? firstCapacity : restCapacity;
    const pageRows = body.slice(cursor, cursor + capacity);
    cursor += pageRows.length;
    streams.push(
      drawPage({
        pageNumber,
        pageCount,
        size,
        bandHeight: pageNumber === 1 ? BAND_FIRST : BAND_REST,
        first: pageNumber === 1,
        title,
        subtitle,
        brand,
        meta,
        bandBadge,
        columns,
        widths,
        availableWidth,
        pageRows,
        totals,
        stats,
        stamp,
        footerNote,
        watermark,
        emptyMessage,
      }),
    );
  }

  // Objects: 1 catalog, 2 page tree, 3 Helvetica, 4 Helvetica-Bold,
  // 5/6/7 graphics states (normal / soft / watermark alpha), then one page
  // object plus one content stream per page.
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = streams.map((_, index) => `${8 + index * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /ExtGState /ca 1 /CA 1 >>');
  objects.push('<< /Type /ExtGState /ca 0.16 /CA 0.16 >>');
  objects.push('<< /Type /ExtGState /ca 0.07 /CA 0.07 >>');

  streams.forEach((stream, index) => {
    const contentNumber = 9 + index * 2;
    const resources =
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> ' +
      '/ExtGState << /GSn 5 0 R /GSf 6 0 R /GSw 7 0 R >> >>';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width.toFixed(2)} ${size.height.toFixed(
        2,
      )}] ${resources} /Contents ${contentNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });

  const chunks = ['%PDF-1.4\n'];
  const offsets = [];
  let offset = Buffer.byteLength(chunks[0], 'latin1');

  objects.forEach((object, index) => {
    offsets.push(offset);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    offset += Buffer.byteLength(chunk, 'latin1');
  });

  chunks.push(
    [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      'startxref',
      String(offset),
      '%%EOF',
      '',
    ].join('\n'),
  );

  return Buffer.from(chunks.join(''), 'latin1');
};

module.exports = { buildTablePdf, formatNumberPlain };






