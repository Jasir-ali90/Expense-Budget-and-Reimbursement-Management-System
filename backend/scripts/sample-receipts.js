/**
 * Placeholder receipt / invoice image generator used by the seed script.
 *
 * The assignment forbids sample data that contains real personal, banking or
 * financial information, so the demo receipts are generated images: simple
 * geometric "receipt" layouts drawn with a tiny dependency-free PNG encoder.
 * They are valid PNG files, which means the upload links in the seeded data can
 * really be opened from the browser.
 *
 * Run standalone with: node scripts/sample-receipts.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const env = require('../config/env');

/* ------------------------------------------------------------------ */
/* Minimal PNG encoder (truecolour, filter type 0)                     */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

/** Very small RGB canvas with just enough drawing helpers for a receipt. */
const createCanvas = (width, height, background = [255, 255, 255]) => {
  const pixels = Buffer.alloc(width * height * 3);

  const canvas = {
    width,
    height,
    pixels,
    fillRect(x, y, rectWidth, rectHeight, [r, g, b]) {
      for (let row = Math.max(0, y); row < Math.min(height, y + rectHeight); row += 1) {
        for (let col = Math.max(0, x); col < Math.min(width, x + rectWidth); col += 1) {
          const offset = (row * width + col) * 3;
          pixels[offset] = r;
          pixels[offset + 1] = g;
          pixels[offset + 2] = b;
        }
      }
      return canvas;
    },
    toPng() {
      const stride = width * 3 + 1;
      const raw = Buffer.alloc(stride * height);
      for (let row = 0; row < height; row += 1) {
        const target = row * stride;
        raw[target] = 0; // filter type: none
        pixels.copy(raw, target + 1, row * width * 3, (row + 1) * width * 3);
      }

      const header = Buffer.alloc(13);
      header.writeUInt32BE(width, 0);
      header.writeUInt32BE(height, 4);
      header[8] = 8; // bit depth
      header[9] = 2; // colour type: truecolour
      header[10] = 0;
      header[11] = 0;
      header[12] = 0;

      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
      ]);
    },
  };

  canvas.fillRect(0, 0, width, height, background);
  return canvas;
};

/** Deterministic pseudo random generator so the images never change shape. */
const createRandom = (seed) => () => {
  // eslint-disable-next-line no-param-reassign
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/* ------------------------------------------------------------------ */
/* Receipt / invoice artwork                                           */
/*                                                                     */
/* Raw PNGs cannot embed fonts, so the "text" on the receipts is drawn */
/* as rows of small rectangles with varying widths - exactly like a    */
/* blurred receipt photo. Good enough for demo uploads.                */
/* ------------------------------------------------------------------ */

const INK = [60, 60, 60];
const LIGHT_INK = [150, 150, 150];
const ACCENT = [31, 78, 121];
const SHADED = [235, 238, 242];

const drawTextLine = (canvas, random, x, y, maxWidth, lineHeight, color, bold = false) => {
  let cursor = x;
  const limit = x + maxWidth;
  while (cursor < limit - 6) {
    const wordWidth = Math.max(8, Math.round((0.06 + random() * 0.16) * maxWidth));
    const wordHeight = bold ? lineHeight : Math.max(3, lineHeight - 4);
    const gap = 4 + Math.round(random() * 6);
    if (cursor + wordWidth > limit) break;
    canvas.fillRect(cursor, y + (bold ? 0 : 2), wordWidth, wordHeight, color);
    cursor += wordWidth + gap;
  }
};

const drawReceipt = ({ seed = 1, width = 420, height = 600 } = {}) => {
  const random = createRandom(seed * 7919 + 13);
  const canvas = createCanvas(width, height, [255, 255, 255]);

  // Colored header band with a "logo" block and title.
  canvas.fillRect(0, 0, width, 78, ACCENT);
  canvas.fillRect(24, 20, 38, 38, [255, 255, 255]);
  canvas.fillRect(80, 28, Math.round(width * 0.34), 10, [255, 255, 255]);
  canvas.fillRect(80, 46, Math.round(width * 0.2), 7, [198, 216, 233]);

  // Metadata block ("vendor", date, reference).
  drawTextLine(canvas, random, 24, 108, width - 48, 14, INK, true);
  drawTextLine(canvas, random, 24, 132, width * 0.55, 11, LIGHT_INK);

  // Divider.
  canvas.fillRect(24, 158, width - 48, 2, SHADED);

  // Item rows: alternating line pairs + amount column.
  const rows = Math.max(4, Math.floor((height - 320) / 42));
  let y = 176;
  for (let row = 0; row < rows; row += 1) {
    drawTextLine(canvas, random, 24, y, width * 0.55, 11, INK);
    const amountWidth = 44 + Math.round(random() * 26);
    canvas.fillRect(width - 24 - amountWidth, y, amountWidth, 11, INK);
    y += 20;
    drawTextLine(canvas, random, 24, y, width * 0.4, 9, LIGHT_INK);
    y += 22;
  }

  // Totals panel.
  canvas.fillRect(24, y + 8, width - 48, 54, SHADED);
  canvas.fillRect(width - 24 - 92, y + 22, 92, 12, INK);
  canvas.fillRect(36, y + 44, 120, 9, LIGHT_INK);

  // Footer stubs (signature strip + fake barcode).
  const footerY = height - 96;
  canvas.fillRect(24, footerY, width - 48, 2, SHADED);
  drawTextLine(canvas, random, 24, footerY + 16, width * 0.5, 10, LIGHT_INK);
  let barX = 24;
  while (barX < width - 24) {
    const barWidth = 2 + Math.round(random() * 4);
    canvas.fillRect(barX, footerY + 40, barWidth, 28, INK);
    barX += barWidth + 2 + Math.round(random() * 4);
  }

  // Small watermark so the sample purpose is obvious at a glance.
  canvas.fillRect(width - 96, height - 34, 72, 8, SHADED);

  return canvas;
};

const generateReceiptPng = (options = {}) => drawReceipt({ ...options }).toPng();

const generateInvoicePng = ({ seed = 1, width = 640, height = 480 } = {}) => {
  const random = createRandom(seed * 104729 + 7);
  const canvas = createCanvas(width, height, [255, 255, 255]);

  canvas.fillRect(0, 0, width, 64, ACCENT);
  canvas.fillRect(width - 190, 18, 150, 12, [255, 255, 255]);
  canvas.fillRect(24, 88, 180, 14, INK);

  // Table header.
  canvas.fillRect(24, 124, width - 48, 30, SHADED);
  let columnX = 36;
  const columnWidths = [0.3, 0.18, 0.14, 0.16];
  columnWidths.forEach((fraction) => {
    const columnWidth = Math.round((width - 48) * fraction) - 16;
    canvas.fillRect(columnX, 134, columnWidth, 9, LIGHT_INK);
    columnX += columnWidth + 16;
  });

  // Table rows.
  let rowY = 166;
  const rows = Math.max(5, Math.floor((height - 260) / 30));
  for (let row = 0; row < rows; row += 1) {
    let cellX = 36;
    columnWidths.forEach((fraction) => {
      const columnWidth = Math.round((width - 48) * fraction) - 16;
      drawTextLine(canvas, random, cellX, rowY, columnWidth, 10, row % 4 === 3 ? LIGHT_INK : INK);
      cellX += columnWidth + 16;
    });
    rowY += 30;
  }

  // Totals strip.
  canvas.fillRect(width - 240, rowY + 10, 216, 46, SHADED);
  canvas.fillRect(width - 226, rowY + 26, 120, 10, INK);

  return canvas.toPng();
};

/**
 * Write a set of demo receipts to disk. Used by the seed script so every
 * seeded expense / claim item links to a real, openable PNG file.
 *
 * @param {string} outputDir absolute directory
 * @param {number} count number of receipts to generate
 * @returns {string[]} written file names
 */
const writeSampleReceipts = (outputDir, count = 6) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const written = [];
  for (let index = 0; index < count; index += 1) {
    const isInvoice = index % 3 === 2;
    const buffer = isInvoice
      ? generateInvoicePng({ seed: index + 1 })
      : generateReceiptPng({ seed: index + 1 });
    const fileName = `sample-${isInvoice ? 'invoice' : 'receipt'}-${index + 1}.png`;
    fs.writeFileSync(path.join(outputDir, fileName), buffer);
    written.push(fileName);
  }
  return written;
};

if (require.main === module) {
  const target = process.argv[2] || path.join(env.uploadPath, 'samples');
  const files = writeSampleReceipts(target, 6);
  // eslint-disable-next-line no-console
  console.log(`[sample-receipts] wrote ${files.length} files to ${target}`);
  files.forEach((fileName) => {
    // eslint-disable-next-line no-console
    console.log(`  - ${fileName}`);
  });
}

module.exports = {
  createCanvas,
  createRandom,
  drawReceipt,
  generateReceiptPng,
  generateInvoicePng,
  writeSampleReceipts,
};
