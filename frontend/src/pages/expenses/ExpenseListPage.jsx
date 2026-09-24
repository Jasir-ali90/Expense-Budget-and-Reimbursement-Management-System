import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoryApi, departmentApi, expenseApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import DataTable, { Pagination } from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { EXPENSE_STATUS_OPTIONS } from '../../utils/options';
import { formatDate, formatMoney } from '../../utils/format';

/** Table + page level totals (kept separate to keep the page readable). */
const ExpenseTable = ({ data, loading, error, reload, list }) => {
  const rows = data?.items || [];
  const totals = rows.reduce(
    (accumulator, item) => ({
      amount: accumulator.amount + Number(item.amount || 0),
      approved: accumulator.approved + Number(item.approvedAmount || 0),
      paid: accumulator.paid + Number(item.paidAmount || 0),
    }),
    { amount: 0, approved: 0, paid: 0 },
  );

  return (
    <>
      <div className="inline mb-1 small muted">
        <span>Page total: {formatMoney(totals.amount)}</span>
        <span>· approved {formatMoney(totals.approved)}</span>
        <span>· paid {formatMoney(totals.paid)}</span>
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        sortState={list.sortState}
        onSort={list.toggleSort}
        emptyProps={{
          title: 'No expense records',
          message: 'Record a direct company expense to get started.',
        }}
        columns={[
          { key: 'expenseNo', label: 'Number' },
          { key: 'date', label: 'Date', sortable: true, render: (row) => formatDate(row.date) },
          {
            key: 'vendor',
            label: 'Vendor',
            render: (row) => (
              <div>
                <Link to={`/expenses/${row._id}`}>{row.vendor}</Link>
                <div className="small muted">{row.description}</div>
              </div>
            ),
          },
          {
            key: 'categoryName',
            label: 'Category',
            render: (row) => row.category?.name || row.categoryName || '—',
          },
          {
            key: 'departmentName',
            label: 'Department',
            render: (row) => row.department?.name || row.departmentName || '—',
          },
          {
            key: 'amount',
            label: 'Amount',
            numeric: true,
            sortable: true,
            render: (row) => formatMoney(row.amount),
          },
          {
            key: 'approvedAmount',
            label: 'Approved',
            numeric: true,
            render: (row) => formatMoney(row.approvedAmount || 0),
          },
          {
            key: 'paidAmount',
            label: 'Paid',
            numeric: true,
            render: (row) => formatMoney(row.paidAmount || 0),
          },
          { key: 'paymentMethod', label: 'Method' },
          { key: 'recurringLabel', label: 'Recurring' },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            key: 'receipt',
            label: 'Receipt',
            render: (row) =>
              row.receipt ? (
                <span className="badge badge--success">Attached</span>
              ) : (
                <span className="badge badge--muted">None</span>
              ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <Link className="btn btn--secondary btn--sm" to={`/expenses/${row._id}`}>
                Open
              </Link>
            ),
          },
        ]}
      />
    </>
  );
};

/**
 * Direct company expense records (Finance Manager / Admin).
 * Server side search, filters, sorting and pagination. Draft records can be
 * deleted; paid records can never be changed (adjustments only).
 */
const ExpenseListPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useListState({ sort: 'date:desc', filters: { status: '', department: '', category: '' } });
  /** null | 'csv' | 'pdf' - which download is currently running. */
  const [exporting, setExporting] = useState(null);

  const { data, loading, error, reload } = useApiQuery(
    () => expenseApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort, JSON.stringify(list.filters)],
  );

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);
  const categories = useApiQuery(() => categoryApi.list({ limit: 100 }), []);

  /**
   * Download every record matching the active filters (not only the visible
   * page) as CSV or as a branded PDF.
   */
  const exportFile = async (format) => {
    setExporting(format);
    try {
      const fileName =
        format === 'pdf'
          ? await expenseApi.exportPdf(list.query)
          : await expenseApi.exportCsv(list.query);
      toast.success('Export ready', `${fileName} has been downloaded.`);
    } catch (caught) {
      toast.error(`Could not export the ${format.toUpperCase()}`, caught.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Company expenses</h1>
          <p className="page-header__sub">
            Direct spending recorded by Finance, with receipts, statuses and an append-only adjustment
            history.
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => exportFile('csv')}
            disabled={exporting !== null}
            title="Download every matching expense as a spreadsheet"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => exportFile('pdf')}
            disabled={exporting !== null}
            title="Download every matching expense as a printable PDF"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/expenses/new')}>
            New expense
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Vendor, description or number"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Status</span>
            <select
              className="select"
              value={list.filters.status ?? ''}
              onChange={(event) => list.updateFilter('status', event.target.value)}
            >
              <option value="">All statuses</option>
              {EXPENSE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Department</span>
            <select
              className="select"
              value={list.filters.department ?? ''}
              onChange={(event) => list.updateFilter('department', event.target.value)}
            >
              <option value="">All departments</option>
              {(departments.data?.items || []).map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Category</span>
            <select
              className="select"
              value={list.filters.category ?? ''}
              onChange={(event) => list.updateFilter('category', event.target.value)}
            >
              <option value="">All categories</option>
              {(categories.data?.items || []).map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
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
              Clear
            </button>
            <button type="button" className="btn btn--secondary" onClick={reload}>
              Refresh
            </button>
          </div>
        </div>

        <ExpenseTable data={data} loading={loading} error={error} reload={reload} list={list} />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    </>
  );
};

export default ExpenseListPage;

