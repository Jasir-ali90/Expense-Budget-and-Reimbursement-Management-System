/**
 * Minimal, dependency free CSV writer.
 * Produces RFC-4180 style output (quoted fields, escaped quotes) that opens
 * correctly in Excel and Google Sheets.
 */

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  let text;
  if (value instanceof Date) {
    text = value.toISOString().slice(0, 19).replace('T', ' ');
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  const needsQuotes = /[",\r\n]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

/**
 * @param {Array<Object>} rows
 * @param {Array<{key: string, label: string, format?: Function}>} columns
 * @returns {string} CSV text (without a trailing newline)
 */
const toCsv = (rows = [], columns = []) => {
  if (columns.length === 0) return '';
  const header = columns.map((column) => escapeCsvValue(column.label || column.key)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const raw = typeof column.key === 'function' ? column.key(row) : row[column.key];
        const value = typeof column.format === 'function' ? column.format(raw, row) : raw;
        return escapeCsvValue(value);
      })
      .join(','),
  );
  return [header, ...body].join('\r\n');
};

const buildCsvFileName = (prefix, extension = 'csv') => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}_${stamp}.${extension}`;
};

module.exports = { toCsv, escapeCsvValue, buildCsvFileName };
