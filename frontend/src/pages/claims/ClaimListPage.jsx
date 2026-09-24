import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { claimApi, departmentApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import { selectUser } from '../../features/auth/authSlice';
import DataTable, { Pagination } from '../../components/DataTable';
import StatusBadge, { OverdueBadge } from '../../components/StatusBadge';
import { CLAIM_STATUS_OPTIONS } from '../../utils/options';
import { formatDate, formatMoney, isOverdue } from '../../utils/format';

/**
 * Claim list.
 * Employees only ever see their own claims (enforced by the API); Finance and
 * Admin see everything with department/status filters.
 */
const ClaimListPage = () => {
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const isEmployee = user?.role === 'Employee';

  const list = useListState({ sort: 'createdAt:desc', filters: { status: '' } });
  const { data, loading, error, reload } = useApiQuery(
    () => claimApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort, JSON.stringify(list.filters)],
  );

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);

  const departmentOptions = useMemo(() => {
    const items = departments.data?.items || [];
    return [{ value: '', label: 'All departments' }].concat(
      items.map((department) => ({ value: department._id, label: department.name })),
    );
  }, [departments.data]);

  const columns = [
    { key: 'claimNo', label: 'Claim no', sortable: false },
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <div>
          <Link to={`/claims/${row._id}`}>{row.title}</Link>
          <div className="small muted">{(row.items || []).length} item(s)</div>
        </div>
      ),
    },
  ];

  if (!isEmployee) {
    columns.push({
      key: 'employeeName',
      label: 'Employee',
      render: (row) => row.employee?.name || row.employeeName || '—',
    });
    columns.push({
      key: 'departmentName',
      label: 'Department',
      render: (row) => row.department?.name || row.departmentName || '—',
    });
  }

  columns.push(
    {
      key: 'submittedAt',
      label: 'Submitted',
      sortable: true,
      render: (row) => (row.submittedAt ? formatDate(row.submittedAt) : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
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
      sortable: true,
      render: (row) => formatMoney(row.totalRequested),
    },
    {
      key: 'totalApproved',
      label: 'Approved',
      numeric: true,
      sortable: true,
      render: (row) => formatMoney(row.totalApproved),
    },
    {
      key: 'totalPaid',
      label: 'Paid',
      numeric: true,
      render: (row) => formatMoney(row.totalPaid),
    },
  );

  if (!isEmployee) {
    columns.push({
      key: 'assignedToName',
      label: 'Assigned to',
      render: (row) => row.assignedToName || '—',
    });
  }

  columns.push({
    key: 'actions',
    label: 'Actions',
    render: (row) => (
      <div className="table__actions">
        <Link className="btn btn--secondary btn--sm" to={`/claims/${row._id}`}>
          Open
        </Link>
      </div>
    ),
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isEmployee ? 'My claims' : 'Reimbursement claims'}</h1>
          <p className="page-header__sub">
            {isEmployee
              ? 'Draft, submit and track your reimbursement claims.'
              : 'Review, approve and pay employee reimbursement claims.'}
          </p>
        </div>
        <div className="btn-row">
          {isEmployee ? (
            <button type="button" className="btn" onClick={() => navigate('/claims/new')}>
              New claim
            </button>
          ) : (
            <Link className="btn btn--secondary" to="/approvals">
              Approval queue
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Claim no, title or employee"
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
              {CLAIM_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          {!isEmployee ? (
            <label className="field">
              <span className="field__label">Department</span>
              <select
                className="select"
                value={list.filters.department ?? ''}
                onChange={(event) => list.updateFilter('department', event.target.value)}
              >
                {departmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={list.resetFilters}>
              Clear
            </button>
            <button type="button" className="btn btn--secondary" onClick={reload}>
              Refresh
            </button>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items || []}
          loading={loading}
          error={error}
          onRetry={reload}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{
            title: 'No claims found',
            message: isEmployee
              ? 'Create a claim to get started.'
              : 'Adjust the filters to see more results.',
          }}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    </>
  );
};

export default ClaimListPage;
