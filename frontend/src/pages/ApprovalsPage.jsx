import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { claimApi } from '../api';
import { useApiQuery, useListState } from '../hooks/useApi';
import DataTable, { Pagination } from '../components/DataTable';
import StatusBadge, { OverdueBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatMoney, isOverdue } from '../utils/format';

/**
 * Approval queue for Finance Managers and Admins.
 * Three views: pending (waiting on a decision), overdue (past the SLA) and
 * completed (approved / rejected / paid history).
 */
const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

const ApprovalsPage = () => {
  const [tab, setTab] = useState('pending');
  const list = useListState({ sort: 'submittedAt:asc' });

  // Pending = Submitted. Overdue is filtered client side using the SLA flag
  // the list endpoint already returns per claim.
  const query = {
    ...list.query,
    status: tab === 'completed' ? 'Approved,Rejected,Paid' : 'Submitted',
  };

  const { data, loading, error, reload } = useApiQuery(() => claimApi.list(query), [
    tab,
    list.query.page,
    list.query.limit,
    list.query.search,
    list.query.sort,
  ]);

  const rows = (data?.items || []).filter((claim) => (tab === 'overdue' ? isOverdue(claim) : true));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Approval queue</h1>
          <p className="page-header__sub">
            Claims routed to you by department. A user can never approve their own claim.
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="inline mb-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn--sm${tab === item.key ? '' : ' btn--secondary'}`}
              onClick={() => {
                setTab(item.key);
                list.setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
          <span className="spacer" />
          <input
            className="input"
            style={{ maxWidth: '260px' }}
            placeholder="Search claim no or employee"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
          />
        </div>

        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{
            title: tab === 'overdue' ? 'No overdue claims' : 'Nothing to review',
            message: tab === 'pending' ? 'The queue is empty right now.' : undefined,
          }}
          columns={[
            { key: 'claimNo', label: 'Claim no' },
            {
              key: 'title',
              label: 'Claim',
              render: (row) => (
                <div>
                  <Link to={`/claims/${row._id}`}>{row.title}</Link>
                  <div className="small muted">
                    {row.employeeName || row.employee?.name} · {row.departmentName}
                  </div>
                </div>
              ),
            },
            {
              key: 'submittedAt',
              label: 'Submitted',
              sortable: true,
              render: (row) => formatDate(row.submittedAt),
            },
            {
              key: 'dueAt',
              label: 'Due',
              render: (row) => (
                <div>
                  {formatDateTime(row.dueAt)}
                  <div>
                    <OverdueBadge show={isOverdue(row)} />
                  </div>
                </div>
              ),
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
              sortable: true,
              render: (row) => formatMoney(row.totalRequested),
            },
            {
              key: 'assignedToName',
              label: 'Approver',
              render: (row) => row.assignedToName || '—',
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <Link className="btn btn--sm" to={`/claims/${row._id}`}>
                  Review
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

export default ApprovalsPage;
