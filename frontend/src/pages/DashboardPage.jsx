import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { dashboardApi } from '../api';
import { useApiQuery } from '../hooks/useApi';
import { selectUser } from '../features/auth/authSlice';
import { AsyncBoundary } from '../components/StateViews';
import DataTable from '../components/DataTable';
import StatusBadge, { OverdueBadge } from '../components/StatusBadge';
import { formatDate, formatMoney, isOverdue } from '../utils/format';
import { BarChart, RankList, StatCard, BudgetBar } from '../components/StatCard';

/**
 * Role aware dashboard.
 * Finance / Admin see budgets, company spending, trends and the approval
 * queue; employees see only their own claim figures.
 */
const FinanceDashboard = ({ data }) => (
  <>
    <div className="grid grid--stats mt-2">
      <StatCard label="Budget allocated" value={data.budgetTotals?.allocated || 0} hint="Current month" />
      <StatCard label="Used" value={data.budgetTotals?.used || 0} tone="warning" />
      <StatCard label="Committed" value={data.budgetTotals?.committed || 0} hint="Pending approval" />
      <StatCard
        label="Remaining"
        value={data.budgetTotals?.remaining || 0}
        tone={(data.budgetTotals?.remaining || 0) < 0 ? 'danger' : 'success'}
      />
    </div>

    <div className="grid grid--2 mt-2">
      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Monthly spending trend</h2>
          <span className="small muted">Direct expenses + approved reimbursements</span>
        </div>
        {(data.monthlyTrend || []).length > 0 ? (
          <BarChart
            data={data.monthlyTrend}
            series={[
              { key: 'directExpenses', label: 'Direct expenses' },
              { key: 'reimbursements', label: 'Reimbursements' },
            ]}
          />
        ) : (
          <div className="small muted">No spending recorded in this period.</div>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Top expense categories</h2>
        </div>
        <RankList rows={data.expenses?.topCategories || []} />
      </div>
    </div>

    <div className="grid grid--2 mt-2">
      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Top vendors</h2>
        </div>
        <RankList rows={data.expenses?.topVendors || []} />
      </div>

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Claims by status</h2>
          <Link to="/reports" className="btn btn--ghost btn--sm">
            Reports
          </Link>
        </div>
        <div className="kv">
          {Object.entries(data.claims?.byStatus || {}).map(([status, bucket]) => (
            <React.Fragment key={status}>
              <span className="kv__key">
                <StatusBadge status={status} /> {bucket.count}
              </span>
              <span>
                {formatMoney(bucket.requested)} requested / {formatMoney(bucket.approved)} approved
              </span>
            </React.Fragment>
          ))}
        </div>
        <div className="mt-1 small muted">
          {data.pendingExpenseApprovals || 0} direct expense(s) awaiting approval.
        </div>
      </div>
    </div>

    <div className="card mt-2">
      <div className="card__header">
        <h2 className="card__title">Budget usage this month</h2>
        <Link to="/budgets" className="btn btn--ghost btn--sm">
          Manage budgets
        </Link>
      </div>
      <DataTable
        compact
        rows={data.budgets || []}
        emptyProps={{ title: 'No budgets for the current month' }}
        columns={[
          { key: 'department', label: 'Department' },
          { key: 'category', label: 'Category' },
          { key: 'allocated', label: 'Allocated', numeric: true, render: (row) => formatMoney(row.allocated) },
          { key: 'used', label: 'Used', numeric: true, render: (row) => formatMoney(row.used) },
          { key: 'committed', label: 'Committed', numeric: true, render: (row) => formatMoney(row.committed) },
          {
            key: 'remaining',
            label: 'Remaining',
            numeric: true,
            render: (row) => (
              <span style={{ color: row.remaining < 0 ? 'var(--color-danger)' : undefined }}>
                {formatMoney(row.remaining)}
              </span>
            ),
          },
          { key: 'usage', label: 'Usage', render: (row) => <BudgetBar usage={row} /> },
          {
            key: 'state',
            label: 'State',
            render: (row) =>
              row.isExceeded ? (
                <StatusBadge status="Exceeded" tone="danger" />
              ) : row.isWarning ? (
                <StatusBadge status="Warning" tone="warning" />
              ) : (
                <StatusBadge status="Within budget" tone="success" />
              ),
          },
        ]}
      />
    </div>
  </>
);

/**
 * Dashboard page - renders the employee view or the Finance/Admin view
 * depending on the signed in role.
 */
const DashboardPage = () => {
  const user = useSelector(selectUser);
  const { data, loading, error, reload } = useApiQuery(() => dashboardApi.get(), []);

  const isEmployee = user?.role === 'Employee';


  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-header__sub">
            {isEmployee
              ? 'Your reimbursement activity at a glance.'
              : 'Company spending, budgets and reimbursement pipeline.'}
            {data?.window?.from
              ? ` Showing ${formatDate(data.window.from)} – ${formatDate(data.window.to)}.`
              : ''}
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <AsyncBoundary loading={loading} error={error} onRetry={reload} loadingLabel="Loading dashboard…">
        {data ? (
          <>
            <div className="grid grid--stats">
              <StatCard
                label={isEmployee ? 'Claimed in period' : 'Total expenses'}
                value={data.expenses ? data.expenses.total : data.claims?.totalRequested || 0}
                hint={
                  data.expenses
                    ? `${data.expenses.totalCount} direct expense record(s)`
                    : `${data.claims?.totalRequests || 0} claim(s) in period`
                }
              />
              <StatCard
                label={isEmployee ? 'Approved for you' : 'Approved reimbursements'}
                value={data.claims?.totalApproved || 0}
                hint={isEmployee ? 'Ready for payment' : 'Approved claim value'}
                tone="success"
              />
              <StatCard
                label="Pending claims"
                value={data.claims?.pending || 0}
                hint="Awaiting Finance review"
                isMoney={false}
                tone="warning"
              />
              <StatCard
                label="Overdue claims"
                value={data.claims?.overdue || 0}
                hint="Past the approval SLA"
                isMoney={false}
                tone={data.claims?.overdue > 0 ? 'danger' : undefined}
              />
            </div>

            {isEmployee ? (
              <>
                <div className="grid grid--stats mt-2">
                  <StatCard label="Draft claims" value={data.claims?.drafts || 0} isMoney={false} />
                  <StatCard
                    label="Returned for correction"
                    value={data.claims?.awaitingCorrection || 0}
                    isMoney={false}
                  />
                  <StatCard label="Paid to you" value={data.claims?.totalPaid || 0} tone="success" />
                  <StatCard
                    label="Rejected claims"
                    value={data.claims?.byStatus?.Rejected?.count || 0}
                    isMoney={false}
                    tone="danger"
                  />
                </div>
                <div className="card mt-2">
                  <div className="card__header">
                    <h2 className="card__title">Recent claims</h2>
                    <Link to="/claims" className="btn btn--ghost btn--sm">
                      View all
                    </Link>
                  </div>
                  <DataTable
                    compact
                    rows={data.recentClaims || []}
                    emptyProps={{
                      title: 'No claims yet',
                      message: 'Create your first reimbursement claim to get started.',
                      action: (
                        <Link className="btn btn--sm" to="/claims/new">
                          New claim
                        </Link>
                      ),
                    }}
                    columns={[
                      { key: 'claimNo', label: 'Claim no' },
                      {
                        key: 'title',
                        label: 'Title',
                        render: (row) => <Link to={`/claims/${row._id}`}>{row.title}</Link>,
                      },
                      {
                        key: 'status',
                        label: 'Status',
                        render: (row) => (
                          <span className="inline">
                            <StatusBadge status={row.status} />
                            <OverdueBadge show={isOverdue(row)} />
                          </span>
                        ),
                      },
                      {
                        key: 'totalRequested',
                        label: 'Requested',
                        numeric: true,
                        render: (row) => formatMoney(row.totalRequested),
                      },
                      {
                        key: 'totalApproved',
                        label: 'Approved',
                        numeric: true,
                        render: (row) => formatMoney(row.totalApproved),
                      },
                    ]}
                  />
                </div>
              </>
            ) : (
              <FinanceDashboard data={data} />
            )}
          </>
        ) : null}
      </AsyncBoundary>
    </>
  );
};

export default DashboardPage;
