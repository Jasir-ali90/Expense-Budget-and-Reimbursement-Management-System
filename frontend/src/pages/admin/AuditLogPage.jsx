import React, { useEffect, useState } from 'react';
import { auditApi } from '../../api';
import { useListState } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import DataTable, { Pagination } from '../../components/DataTable';
import { formatDateTime } from '../../utils/format';

/**
 * Audit trail (Admin + Finance Manager).
 *
 * The server keeps the log append-only - this screen only reads it, and can
 * export exactly the filtered result set as CSV.
 */

/** Action -> badge tone. Mirrors the meaning of the backend AUDIT_ACTIONS. */
const ACTION_TONES = {
  CREATE: 'success',
  APPROVE: 'success',
  PARTIAL_APPROVE: 'success',
  PAY: 'success',
  ACTIVATE: 'success',
  RESTORE: 'success',
  UPDATE: 'info',
  SUBMIT: 'info',
  REASSIGN: 'info',
  UPDATE_SETTINGS: 'info',
  RETURN: 'warning',
  REVISE_BUDGET: 'warning',
  ADJUST: 'warning',
  REJECT: 'danger',
  DELETE: 'danger',
  ARCHIVE: 'danger',
  DEACTIVATE: 'danger',
  CHANGE_PASSWORD: 'muted',
};

const ACTION_OPTIONS = Object.keys(ACTION_TONES);

/** Entity types recorded by the backend (config/constants.js -> ENTITY_TYPES). */
const ENTITY_OPTIONS = [
  'User',
  'Department',
  'Category',
  'Budget',
  'Expense',
  'Claim',
  'Payment',
  'Adjustment',
  'Setting',
];

const COLUMNS = [
  {
    key: 'createdAt',
    label: 'When',
    sortable: true,
    render: (row) => formatDateTime(row.createdAt),
  },
  {
    key: 'action',
    label: 'Action',
    sortable: true,
    render: (row) => (
      <span className={`badge badge--${ACTION_TONES[row.action] || 'muted'}`}>
        {String(row.action || '').replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    key: 'entityType',
    label: 'Record',
    sortable: true,
    render: (row) => (
      <div>
        <strong>{row.entityType}</strong>
        <div className="small muted">{row.entityLabel || '—'}</div>
      </div>
    ),
  },
  { key: 'description', label: 'Description' },
  { key: 'reason', label: 'Reason', render: (row) => row.reason || '—' },
  {
    key: 'performedByName',
    label: 'Acted by',
    render: (row) => (
      <div>
        <strong>{row.performedBy?.name || row.performedByName || 'System'}</strong>
        <div className="small muted">
          {row.performedBy?.role || row.performedByRole || 'Automated'}
        </div>
      </div>
    ),
  },
  {
    key: 'meta',
    label: 'Request',
    render: (row) =>
      row.meta?.method ? (
        <span className="small muted nowrap">
          {row.meta.method} {row.meta.path}
        </span>
      ) : (
        '—'
      ),
  },
];

const AuditLogPage = () => {
  const toast = useToast();
  const list = useListState({ filters: { entityType: '', action: '', from: '', to: '' } });
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: null });
  const [exporting, setExporting] = useState(null);

  const load = async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await auditApi.list(list.query);
      setState({ items: result.items, meta: result.meta, loading: false, error: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    list.query.page,
    list.query.limit,
    list.query.search,
    list.query.sort,
    list.query.entityType,
    list.query.action,
    list.query.from,
    list.query.to,
  ]);

  /** Download the filtered audit trail as CSV or as a branded PDF. */
  const exportFile = async (format) => {
    setExporting(format);
    try {
      const fileName =
        format === 'pdf'
          ? await auditApi.exportPdf(list.query)
          : await auditApi.exportCsv(list.query);
      toast.success('Export ready', `${fileName} has been downloaded.`);
    } catch (error) {
      toast.error('Could not export the audit log', error.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p className="page-header__sub">
            Append-only trail of every approval, payment, budget change and account action.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={load}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => exportFile('csv')}
            disabled={exporting !== null}
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => exportFile('pdf')}
            disabled={exporting !== null}
            title="Download a branded, printable PDF of the audit log"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Description, reference or user"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Entity</span>
            <select
              className="select"
              value={list.filters.entityType ?? ''}
              onChange={(event) => list.updateFilter('entityType', event.target.value)}
            >
              <option value="">All entities</option>
              {ENTITY_OPTIONS.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Action</span>
            <select
              className="select"
              value={list.filters.action ?? ''}
              onChange={(event) => list.updateFilter('action', event.target.value)}
            >
              <option value="">All actions</option>
              {ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {action.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">From</span>
            <input
              type="date"
              className="input"
              value={list.filters.from ?? ''}
              onChange={(event) => list.updateFilter('from', event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">To</span>
            <input
              type="date"
              className="input"
              value={list.filters.to ?? ''}
              onChange={(event) => list.updateFilter('to', event.target.value)}
            />
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={list.resetFilters}>
              Clear filters
            </button>
          </div>
        </div>

        <DataTable
          rows={state.items}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{ title: 'No audit entries', message: 'Nothing matches the current filters.' }}
          columns={COLUMNS}
        />
        <Pagination meta={state.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    </>
  );
};

export default AuditLogPage;

