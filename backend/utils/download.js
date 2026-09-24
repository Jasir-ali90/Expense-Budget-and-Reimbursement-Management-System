const { toCsv, buildCsvFileName } = require('./csv');
const { buildTablePdf } = require('./pdf');

/**
 * Shared download helper for every "export the filtered result set" endpoint.
 *
 * A request asks for a download with `?format=csv` or `?format=pdf`; anything
 * else keeps the normal JSON answer. Both formats are produced by hand written
 * writers (utils/csv.js, utils/pdf.js) so the API stays dependency free.
 */

const filenameStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/** @returns {'csv'|'pdf'|null} the requested download format, if any. */
const resolveDownloadFormat = (req) => {
  const format = String(req.query?.format || '').toLowerCase();
  return format === 'csv' || format === 'pdf' ? format : null;
};

/** Send rows as a spreadsheet friendly CSV attachment. */
const sendCsvFile = (res, prefix, rows, columns) => {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${buildCsvFileName(prefix)}"`);
  // The BOM keeps Excel happy with UTF-8 content.
  return res.status(200).send(`\uFEFF${csv}`);
};

/** Send a branded, printable PDF attachment. */
const sendPdfFile = (res, prefix, document) => {
  const buffer = buildTablePdf(document);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${prefix}_${filenameStamp()}.pdf"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
};

/**
 * Send the export when one was asked for, otherwise return null so the
 * controller can continue with its usual JSON response.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Object} payload
 * @param {string} payload.prefix       file name prefix (no extension)
 * @param {string} payload.title        PDF document title
 * @param {string} [payload.subtitle]   filter / window line under the title
 * @param {string} [payload.brand]      product name for the PDF band
 * @param {Array}  payload.columns      shared column definitions
 * @param {Array}  payload.rows         the filtered rows
 * @param {Object} [payload.totals]     values keyed by column key (bold last row)
 * @param {Array<string>} [payload.meta] up to three right aligned PDF band lines
 * @param {'portrait'|'landscape'} [payload.orientation]
 */
const sendDownload = (
  req,
  res,
  {
    prefix,
    title,
    subtitle = '',
    brand,
    columns,
    rows,
    totals = null,
    meta = [],
    orientation = 'portrait',
    /** PDF niceties (ignored by the CSV writer, which only needs columns). */
    stats = [],
    bandBadge = '',
    footerNote = '',
    watermark = '',
    emptyMessage,
    /** Format used when the request does not ask for one (e.g. legacy export routes). */
    defaultFormat = null,
  },
) => {
  const format = resolveDownloadFormat(req) || defaultFormat;
  if (format === 'csv') return sendCsvFile(res, prefix, rows, columns);
  if (format === 'pdf') {
    return sendPdfFile(res, prefix, {
      title,
      subtitle,
      brand,
      columns,
      rows,
      totals,
      meta,
      orientation,
      stats,
      bandBadge,
      footerNote,
      watermark,
      emptyMessage,
    });
  }
  return null;
};

module.exports = { resolveDownloadFormat, sendDownload, sendCsvFile, sendPdfFile };
