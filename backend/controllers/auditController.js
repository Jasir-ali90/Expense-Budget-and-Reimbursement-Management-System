const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');
const { sendDownload } = require('../utils/download');

/**
 * Audit trail controller (Admin + Finance Manager read only).
 * The audit log is append-only: there is no endpoint that edits or deletes
 * entries, which is what makes it trustworthy for the assignment.
 */

/** Shared filter/sort configuration for the list and the CSV export. */
const buildAuditQuery = (query) =>
  buildListQuery(query, {
    searchFields: ['description', 'entityLabel', 'performedByName', 'reason'],
    filters: [
      { field: 'entityType', type: 'string' },
      { field: 'entityId', type: 'objectId' },
      { field: 'action', type: 'string' },
      { field: 'performedBy', type: 'objectId' },
    ],
    dateField: 'createdAt',
    sortableFields: ['createdAt', 'action', 'entityType'],
    defaultSort: { createdAt: -1 },
  });

/**
 * @route GET /api/audit-logs
 * @query search, entityType, entityId, action, performedBy, from, to, page, limit, sort
 * @access Admin, Finance Manager
 */
const listAuditLogs = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildAuditQuery(req.query);

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('performedBy', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);

  sendPaginated(res, logs, { page, limit, total });
});

/**
 * @route GET /api/audit-logs/entity/:entityType/:entityId
 * @access Admin, Finance Manager
 * Full history of one record (used by detail screens and the approval timeline).
 */
const getEntityHistory = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!mongoose.isValidObjectId(entityId)) throw ApiError.badRequest('Invalid entity id');

  const logs = await AuditLog.find({ entityType, entityId })
    .sort({ createdAt: -1 })
    .populate('performedBy', 'name email role');

  sendOk(res, { logs });
});

/** Hard cap on how many rows a single export may contain. */
const EXPORT_LIMIT = 5000;

/** "2026-09-24 09:51" - compact timestamp used by the PDF KPI cards. */
const stampOf = (value) =>
  value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') : '-';

/**
 * Columns shared by the CSV and the PDF export of the audit log.
 * `performedBy.role`, `meta.method` and `meta.path` are nested values, so they
 * are read through accessor functions (a plain "meta.method" key would come out
 * empty in both formats).
 */
const AUDIT_EXPORT_COLUMNS = [
  {
    key: 'createdAt',
    label: 'Timestamp',
    format: (value) =>
      value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : '',
  },
  { key: 'action', label: 'Action', badge: true },
  { key: 'entityType', label: 'Entity' },
  { key: 'entityLabel', label: 'Reference' },
  { key: 'description', label: 'Description' },
  { key: 'reason', label: 'Reason' },
  { key: 'performedByName', label: 'Performed By' },
  { key: (row) => row.performedBy?.role || row.performedByRole, label: 'Role' },
  { key: (row) => row.meta?.method, label: 'Method' },
  { key: (row) => row.meta?.path, label: 'Path' },
];

/**
 * @route GET /api/audit-logs/export
 * @query the same filters as the list endpoint + format=csv|pdf
 * @access Admin, Finance Manager
 * CSV stays the default so existing links keep working.
 */
const exportAuditLogs = asyncHandler(async (req, res) => {
  const { filter, sort } = buildAuditQuery(req.query);

  const logs = await AuditLog.find(filter)
    .sort(sort)
    .limit(EXPORT_LIMIT)
    .populate('performedBy', 'name email role')
    .lean();

  const download = sendDownload(req, res, {
    prefix: 'audit-log',
    title: 'Audit log',
    subtitle: `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'} matching the current filters`,
    orientation: 'landscape',
    columns: AUDIT_EXPORT_COLUMNS,
    rows: logs,
    bandBadge: 'Internal use',
    watermark: 'INTERNAL USE',
    footerNote: 'Append-only audit trail - entries can never be edited or deleted.',
    stats: [
      { label: 'Matching entries', value: logs.length, tone: 'info' },
      { label: 'Latest event', value: stampOf(logs[0]?.createdAt) },
      { label: 'Earliest event', value: stampOf(logs[logs.length - 1]?.createdAt) },
    ],
    defaultFormat: 'csv',
  });

  return download;
});

module.exports = {
  listAuditLogs,
  getEntityHistory,
  exportAuditLogs,
};
