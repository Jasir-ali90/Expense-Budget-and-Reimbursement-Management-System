import React from 'react';
import { Link } from 'react-router-dom';
import { claimApi } from '../api';
import { useApiQuery, useListState } from '../hooks/useApi';
import DataTable, { Pagination } from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { StatCard } from '../components/StatCard';
import { formatDate, formatMoney } from '../utils/format';

/**
 * Payments screen.
 * Lists approved claims with an outstanding balance (ready to pay) and the
 * paid history. Requested, approved and paid totals are always shown
 * separately - a payment never edits the requested amount.
 */
const PaymentsPage = () => {
  const list = useListState({ sort: 'submittedAt:desc', limit: 10, filters: { status: 'Approved,Paid' } });
  const { data, loading, error, reload } = useApiQuery(
    () => claimApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort],
  );

  const rows = data?.items || [];
  const awaitingPayment = rows.filter(
    (claim) => Number(claim.totalApproved) - Number(claim.totalPaid) > 0.001,
  );
  const outstandingTotal = awaitingPayment.reduce(
    (sum, claim) => sum + (Number(claim.totalApproved) - Number(claim.totalPaid)),
    0,
  );
  const paidTotal = rows.reduce((sum, claim) => sum + Number(claim.totalPaid || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Payments</h1>
          <p className="page-header__sub">
            Record reimbursement payments against approved claims. Partial payments are supported until the
            approved amount is settled.
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="grid grid--stats">
        <StatCard label="Awaiting payment" value={awaitingPayment.length} isMoney={false} tone="warning" />
        <StatCard label="Outstanding balance" value={outstandingTotal} tone="warning" />
        <StatCard label="Paid (this page)" value={paidTotal} tone="success" />
      </div>

      <div className="card mt-2">
        <div className="card__header">
          <h2 className="card__title">Approved claims</h2>
          <span className="small muted">Pay only approved amounts</span>
        </div>

        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{ title: 'No approved claims', message: 'Approve a claim to start paying it.' }}
          columns={[
            { key: 'claimNo', label: 'Claim no' },
            {
              key: 'employeeName',
              label: 'Employee',
              render: (row) => (
                <div>
                  <Link to={`/claims/${row._id}`}>{row.employeeName || row.employee?.name}</Link>
                  <div className="small muted">{row.departmentName}</div>
                </div>
              ),
            },
            {
              key: 'submittedAt',
              label: 'Submitted',
              render: (row) => formatDate(row.submittedAt),
            },
            {
              key: 'status',
              label: 'Status',
              sortable: true,
              render: (row) => <StatusBadge status={row.status} />,
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
            {
              key: 'totalPaid',
              label: 'Paid',
              numeric: true,
              render: (row) => formatMoney(row.totalPaid),
            },
            {
              key: 'outstanding',
              label: 'Outstanding',
              numeric: true,
              render: (row) => {
                const outstanding = Number(row.totalApproved) - Number(row.totalPaid);
                return (
                  <span style={{ color: outstanding > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {formatMoney(Math.max(0, outstanding))}
                  </span>
                );
              },
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <Link className="btn btn--sm" to={`/claims/${row._id}`}>
                  {Number(row.totalApproved) - Number(row.totalPaid) > 0.001 ? 'Record payment' : 'View'}
                </Link>
              ),
            },
          ]}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    </>
  );
};

export default PaymentsPage;
