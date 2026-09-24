import React, { useEffect, useMemo, useState } from 'react';
import { reportApi, departmentApi, categoryApi, userApi } from '../api';
import { useApiQuery } from '../hooks/useApi';
import useToast from '../hooks/useToast';
import DataTable, { Pagination } from '../components/DataTable';
import { BarChart, BudgetBar, RankList, StatCard } from '../components/StatCard';
import { AsyncBoundary } from '../components/StateViews';
import { StatusBadge } from '../components/StatusBadge';
import { BUDGET_PERIOD_TYPES, CLAIM_STATUS_OPTIONS, EXPENSE_STATUS_OPTIONS } from '../utils/options';
import { currentMonth, currentYear, formatDate, formatMoney, formatPercent } from '../utils/format';

/**
 * Reports screen (Admin + Finance Manager).
 *
 * Every number on this page is produced by the backend report endpoints - the
 * UI only renders it. Each tab keeps its own column set, and the
 * "Export CSV" / "Export PDF" buttons download exactly the filtered result set
 * that is on screen (every matching row, not just the current page).
 */

const TABS = [
  {
    key: 'expenses',
    label: 'Expenses',
    statuses: EXPENSE_STATUS_OPTIONS,
    searchLabel: 'Vendor, description or expense no',
  },
  {
    key: 'claims',
    label: 'Claims',
    statuses: CLAIM_STATUS_OPTIONS,
    searchLabel: 'Claim no, title or employee',
    employee: true,
  },
  { key: 'approval-summary', label: 'Approved vs rejected', employee: true },
  { key: 'budget-usage', label: 'Budget usage', period: true },
  { key: 'monthly-trend', label: 'Monthly trend' },
  { key: 'top-categories', label: 'Top categories' },
  { key: 'top-vendors', label: 'Top vendors' },
  { key: 'employee-reimbursements', label: 'Employee history' },
];

const defaultFilters = {
  from: '',
  to: '',
  department: '',
  category: '',
  status: '',
  employee: '',
  search: '',
  periodType: 'Monthly',
  period: currentMonth(),
};

/** Column definitions per report type (kept beside the tabs for clarity). */
const COLUMNS = {
  expenses: [
    { key: 'expenseNo', label: 'Expense no' },
    { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
    { key: 'vendor', label: 'Vendor' },
    { key: 'category', label: 'Category' },
    { key: 'department', label: 'Department' },
    { key: 'amount', label: 'Amount', numeric: true, render: (row) => formatMoney(row.amount) },
    {
      key: 'approvedAmount',
      label: 'Approved',
      numeric: true,
      render: (row) => formatMoney(row.approvedAmount),
    },
    { key: 'paidAmount', label: 'Paid', numeric: true, render: (row) => formatMoney(row.paidAmount) },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ],
  claims: [
    { key: 'claimNo', label: 'Claim no' },
    { key: 'employee', label: 'Employee', render: (row) => row.employee || '—' },
    { key: 'department', label: 'Department' },
    { key: 'title', label: 'Title' },
    { key: 'submittedAt', label: 'Submitted', render: (row) => formatDate(row.submittedAt) },
    { key: 'itemCount', label: 'Items', numeric: true },
    { key: 'requested', label: 'Requested', numeric: true, render: (row) => formatMoney(row.requested) },
    { key: 'approved', label: 'Approved', numeric: true, render: (row) => formatMoney(row.approved) },
    { key: 'paid', label: 'Paid', numeric: true, render: (row) => formatMoney(row.paid) },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className="inline">
          <StatusBadge status={row.status} />
          {row.overdue ? <span className="badge badge--danger">Overdue</span> : null}
        </span>
      ),
    },
  ],
};

COLUMNS['approval-summary'] = [
  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'count', label: 'Claims', numeric: true },
  { key: 'requested', label: 'Requested', numeric: true, render: (row) => formatMoney(row.requested) },
  { key: 'approved', label: 'Approved', numeric: true, render: (row) => formatMoney(row.approved) },
  { key: 'paid', label: 'Paid', numeric: true, render: (row) => formatMoney(row.paid) },
];

COLUMNS['budget-usage'] = [
  { key: 'department', label: 'Department' },
  { key: 'category', label: 'Category' },
  { key: 'period', label: 'Period' },
  { key: 'allocated', label: 'Allocated', numeric: true, render: (row) => formatMoney(row.allocated) },
  { key: 'used', label: 'Used', numeric: true, render: (row) => formatMoney(row.used) },
  { key: 'committed', label: 'Committed', numeric: true, render: (row) => formatMoney(row.committed) },
  { key: 'remaining', label: 'Remaining', numeric: true, render: (row) => formatMoney(row.remaining) },
  {
    key: 'usagePercent',
    label: 'Usage',
    render: (row) => (
      <BudgetBar
        usage={{
          usagePercent: row.usagePercent,
          usedPercent: row.allocated > 0 ? (row.used / row.allocated) * 100 : 0,
          committedPercent: row.allocated > 0 ? (row.committed / row.allocated) * 100 : 0,
          isExceeded: row.state === 'Exceeded',
          isWarning: row.state === 'Warning',
        }}
      />
    ),
  },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <StatusBadge
        status={row.state}
        tone={row.state === 'Exceeded' ? 'danger' : row.state === 'Warning' ? 'warning' : 'success'}
      />
    ),
  },
];

COLUMNS['monthly-trend'] = [
  { key: 'month', label: 'Month' },
  {
    key: 'directExpenses',
    label: 'Direct expenses',
    numeric: true,
    render: (row) => formatMoney(row.directExpenses),
  },
  {
    key: 'reimbursements',
    label: 'Reimbursements',
    numeric: true,
    render: (row) => formatMoney(row.reimbursements),
  },
  { key: 'total', label: 'Total', numeric: true, render: (row) => formatMoney(row.total) },
  { key: 'directCount', label: 'Expense records', numeric: true },
  { key: 'claimItemCount', label: 'Claim items', numeric: true },
];

COLUMNS['top-categories'] = [
  { key: 'category', label: 'Category' },
  {
    key: 'directExpenses',
    label: 'Direct expenses',
    numeric: true,
    render: (row) => formatMoney(row.directExpenses),
  },
  {
    key: 'reimbursements',
    label: 'Reimbursements',
    numeric: true,
    render: (row) => formatMoney(row.reimbursements),
  },
  { key: 'total', label: 'Total', numeric: true, render: (row) => formatMoney(row.total) },
  { key: 'count', label: 'Records', numeric: true },
];

COLUMNS['top-vendors'] = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'total', label: 'Total approved', numeric: true, render: (row) => formatMoney(row.total) },
  { key: 'count', label: 'Expenses', numeric: true },
  { key: 'lastExpenseDate', label: 'Last expense', render: (row) => formatDate(row.lastExpenseDate) },
];

COLUMNS['employee-reimbursements'] = [
  { key: 'employee', label: 'Employee' },
  { key: 'department', label: 'Department' },
  { key: 'claims', label: 'Claims', numeric: true },
  { key: 'requested', label: 'Requested', numeric: true, render: (row) => formatMoney(row.requested) },
  { key: 'approved', label: 'Approved', numeric: true, render: (row) => formatMoney(row.approved) },
  { key: 'paid', label: 'Paid', numeric: true, render: (row) => formatMoney(row.paid) },
  {
    key: 'outstanding',
    label: 'Outstanding',
    numeric: true,
    render: (row) => formatMoney(row.outstanding),
  },
  { key: 'rejectedClaims', label: 'Rejected', numeric: true },
  { key: 'pendingClaims', label: 'Pending', numeric: true },
];

/** Rows are plain objects without _id - build a stable key per report. */
const ROW_KEYS = {
  expenses: (row) => row.expenseNo,
  claims: (row) => row.claimNo,
  'approval-summary': (row) => row.status,
  'budget-usage': (row) => `${row.department}/${row.category}/${row.period}`,
  'monthly-trend': (row) => row.period,
  'top-categories': (row) => row.category,
  'top-vendors': (row) => row.vendor,
  'employee-reimbursements': (row) => `${row.employee}/${row.department}`,
};

const ReportsPage = () => {
  const toast = useToast();
  const [tabKey, setTabKey] = useState('expenses');
  const [filters, setFilters] = useState(defaultFilters);
  const [exporting, setExporting] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const tab = TABS.find((item) => item.key === tabKey) || TABS[0];

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);
  const categories = useApiQuery(() => categoryApi.list({ limit: 100 }), []);
  const users = useApiQuery(() => userApi.list({ limit: 200, role: 'Employee' }), []);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  /** Only send the parameters the selected report understands. */
  const params = useMemo(() => {
    const base = {
      from: filters.from || undefined,
      to: filters.to || undefined,
      department: filters.department || undefined,
      category: filters.category || undefined,
    };
    base.search = tab.searchLabel ? filters.search || undefined : undefined;
    base.employee = tab.employee ? filters.employee || undefined : undefined;
    base.status = tab.statuses ? filters.status || undefined : undefined;
    if (tab.period) {
      base.periodType = filters.periodType;
      base.period =
        filters.periodType === 'Yearly'
          ? filters.period.slice(0, 4) || currentYear()
          : filters.period;
    }
    return base;
  }, [filters, tab]);

  const report = useApiQuery(() => reportApi.get(tab.key, params), [tab.key, JSON.stringify(params)]);

  const rows = report.data?.rows || [];
  const totals = report.data?.totals;

  /** Reports return the whole result set - restart paging when the query changes. */
  useEffect(() => {
    setPage(1);
  }, [tabKey, params]);

  /** Download the current tab's filtered result set as CSV or as a branded PDF. */
  const exportFile = async (format) => {
    setExporting(format);
    try {
      const fileName =
        format === 'pdf'
          ? await reportApi.exportPdf(tab.key, params)
          : await reportApi.exportCsv(tab.key, params);
      toast.success('Export ready', `${fileName} has been downloaded.`);
    } catch (caught) {
      toast.error('Could not export the report', caught.message);
    } finally {
      setExporting(null);
    }
  };

  /** Summary tiles shown above the table (values come straight from the API). */
  const summary = useMemo(() => {
    const cards = [];
    if (tabKey === 'expenses' && totals) {
      cards.push(
        { label: 'Records', value: totals.count, isMoney: false },
        { label: 'Expense value', value: totals.amount },
        { label: 'Approved', value: totals.approved },
        { label: 'Paid', value: totals.paid },
      );
    }
    if (tabKey === 'claims' && totals) {
      cards.push(
        { label: 'Claims', value: rows.length, isMoney: false },
        { label: 'Requested', value: totals.requested },
        { label: 'Approved', value: totals.approved },
        { label: 'Paid', value: totals.paid },
      );
    }
    if (tabKey === 'approval-summary') {
      const approved = rows.find((row) => row.status === 'Approved');
      const rejected = rows.find((row) => row.status === 'Rejected');
      cards.push(
        { label: 'Approved claims', value: approved?.count || 0, isMoney: false },
        { label: 'Approved value', value: approved?.approved || 0 },
        { label: 'Rejected claims', value: rejected?.count || 0, isMoney: false },
        { label: 'Rejected value', value: rejected?.requested || 0 },
      );
    }
    if (tabKey === 'budget-usage' && totals) {
      cards.push(
        { label: 'Allocated', value: totals.allocated },
        { label: 'Used', value: totals.used },
        { label: 'Committed', value: totals.committed },
        { label: 'Remaining', value: totals.remaining },
      );
    }
    if (tabKey === 'employee-reimbursements' && totals) {
      cards.push(
        { label: 'Requested', value: totals.requested },
        { label: 'Approved', value: totals.approved },
        { label: 'Paid', value: totals.paid },
        { label: 'Outstanding', value: totals.outstanding },
      );
    }
    return cards;
  }, [tabKey, totals, rows]);

  /** The API returns each report whole (capped at 5000 rows) - page client side. */
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * limit, currentPage * limit);
  const meta = rows.length ? { page: currentPage, limit, total: rows.length, totalPages } : null;

  const handleLimit = (value) => {
    setLimit(value);
    setPage(1);
  };

  /** Result window shown under the card title (budget reports are period based). */
  const subtitle = report.data?.period
    ? `${report.data.periodType} · ${report.data.period}${
        typeof totals?.usagePercent === 'number' ? ` · ${formatPercent(totals.usagePercent)} used` : ''
      }`
    : report.data?.window
      ? `${formatDate(report.data.window.from)} – ${formatDate(report.data.window.to)}`
      : '';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="page-header__sub">
            Filtered, backend calculated reports. Export the exact result set you are looking at.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={report.reload}>
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
            title="Download a branded, printable PDF of this report"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn--sm ${item.key === tabKey ? '' : 'btn--secondary'}`}
              onClick={() => setTabKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-2">
        <div className="filters">
          <label className="field">
            <span className="field__label">From</span>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(event) => setFilter('from', event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">To</span>
            <input
              type="date"
              className="input"
              value={filters.to}
              onChange={(event) => setFilter('to', event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Department</span>
            <select
              className="select"
              value={filters.department}
              onChange={(event) => setFilter('department', event.target.value)}
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
              value={filters.category}
              onChange={(event) => setFilter('category', event.target.value)}
            >
              <option value="">All categories</option>
              {(categories.data?.items || []).map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          {tab.statuses ? (
            <label className="field">
              <span className="field__label">Status</span>
              <select
                className="select"
                value={filters.status}
                onChange={(event) => setFilter('status', event.target.value)}
              >
                <option value="">All statuses</option>
                {tab.statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tab.employee ? (
            <label className="field">
              <span className="field__label">Employee</span>
              <select
                className="select"
                value={filters.employee}
                onChange={(event) => setFilter('employee', event.target.value)}
              >
                <option value="">All employees</option>
                {(users.data?.items || []).map((employee) => (
                  <option key={employee._id} value={employee._id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tab.searchLabel ? (
            <label className="field">
              <span className="field__label">Search</span>
              <input
                className="input"
                placeholder={tab.searchLabel}
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
              />
            </label>
          ) : null}
          {tab.period ? (
            <>
              <label className="field">
                <span className="field__label">Period type</span>
                <select
                  className="select"
                  value={filters.periodType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      periodType: event.target.value,
                      period: event.target.value === 'Yearly' ? currentYear() : currentMonth(),
                    }))
                  }
                >
                  {BUDGET_PERIOD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Period</span>
                <input
                  className="input"
                  value={filters.period}
                  onChange={(event) => setFilter('period', event.target.value)}
                />
                <span className="field__hint">YYYY-MM or YYYY</span>
              </label>
            </>
          ) : null}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setFilters(defaultFilters)}
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card__header">
          <div>
            <h2 className="card__title">{tab.label}</h2>
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => exportFile('csv')}
              disabled={exporting !== null}
            >
              {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => exportFile('pdf')}
              disabled={exporting !== null}
            >
              {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        <AsyncBoundary loading={report.loading} error={report.error} onRetry={report.reload}>
          {summary.length > 0 ? (
            <div className="grid grid--stats mb-1">
              {summary.map((card) => (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  isMoney={card.isMoney !== false}
                />
              ))}
            </div>
          ) : null}

          {tabKey === 'monthly-trend' ? (
            <div className="mb-1">
              <BarChart
                data={rows}
                series={[
                  { key: 'directExpenses', label: 'Direct expenses' },
                  { key: 'reimbursements', label: 'Reimbursements' },
                ]}
                valueKey="total"
                labelKey="month"
              />
            </div>
          ) : null}

          {tabKey === 'top-categories' || tabKey === 'top-vendors' || tabKey === 'employee-reimbursements' ? (
            <div className="mb-1">
              <RankList
                rows={rows}
                labelKey={
                  tabKey === 'top-categories' ? 'category' : tabKey === 'top-vendors' ? 'vendor' : 'employee'
                }
                valueKey={tabKey === 'employee-reimbursements' ? 'paid' : 'total'}
                emptyLabel="No activity recorded in this period."
              />
            </div>
          ) : null}

          <DataTable
            compact
            rows={pagedRows}
            columns={COLUMNS[tabKey]}
            rowKey={ROW_KEYS[tabKey]}
            emptyProps={{
              title: 'Nothing to show',
              message: 'No rows match the current report filters.',
            }}
          />
          <Pagination meta={meta} onPage={setPage} onLimit={handleLimit} />
        </AsyncBoundary>
      </div>
    </>
  );
};

export default ReportsPage;
