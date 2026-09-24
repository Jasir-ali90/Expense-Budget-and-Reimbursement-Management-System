import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { budgetApi, departmentApi, categoryApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import { Modal, ConfirmModal } from '../../components/Modal';
import DataTable, { Pagination } from '../../components/DataTable';
import { BudgetStateBadge } from '../../components/StatusBadge';
import { BudgetBar, StatCard } from '../../components/StatCard';
import { BUDGET_PERIOD_TYPES } from '../../utils/options';
import { currentMonth, currentYear, formatMoney } from '../../utils/format';

/**
 * Budget list with derived usage (allocated/used/committed/remaining).
 * Totals are ALWAYS calculated by the backend; the UI only renders them.
 */
const BudgetListPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const list = useListState({ sort: 'period:desc', filters: { periodType: 'Monthly' } });

  const { data, loading, error, reload } = useApiQuery(
    () => budgetApi.list(list.query),
    [list.query.page, list.query.limit, list.query.sort, JSON.stringify(list.filters)],
  );

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);
  const categories = useApiQuery(() => categoryApi.list({ limit: 100 }), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const openCreate = () => {
    setCreateForm({
      department: '',
      category: '',
      periodType: 'Monthly',
      period: currentMonth(),
      allocatedAmount: '',
      warningThresholdPercent: 80,
      notes: '',
    });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    setCreateBusy(true);
    try {
      await budgetApi.create({
        department: createForm.department,
        category: createForm.category,
        periodType: createForm.periodType,
        period: createForm.period,
        allocatedAmount: Number(createForm.allocatedAmount),
        warningThresholdPercent: Number(createForm.warningThresholdPercent),
        notes: createForm.notes.trim() || undefined,
      });
      toast.success('Budget created', 'The budget has been allocated successfully.');
      setCreateOpen(false);
      reload();
    } catch (error) {
      toast.error('Could not create the budget', error.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const submitDelete = async () => {
    try {
      await budgetApi.remove(deleteId);
      toast.success('Budget deleted');
      setDeleteId(null);
      reload();
    } catch (error) {
      toast.error('Could not delete the budget', error.message);
      setDeleteId(null);
    }
  };

  const rows = data?.items || [];
  const totals = rows.reduce(
    (acc, row) => ({
      allocated: acc.allocated + Number(row.usage?.allocated || 0),
      used: acc.used + Number(row.usage?.used || 0),
      committed: acc.committed + Number(row.usage?.committed || 0),
      remaining: acc.remaining + Number(row.usage?.remaining || 0),
    }),
    { allocated: 0, used: 0, committed: 0, remaining: 0 },
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Budgets</h1>
          <p className="page-header__sub">
            Monthly and yearly budgets per department and category, with derived spending totals.
          </p>
        </div>
        <button type="button" className="btn" onClick={openCreate}>
          New budget
        </button>
      </div>

      <div className="grid grid--stats">
        <StatCard label="Allocated" value={totals.allocated} />
        <StatCard label="Used" value={totals.used} tone="warning" />
        <StatCard label="Committed" value={totals.committed} />
        <StatCard label="Remaining" value={totals.remaining} tone={totals.remaining < 0 ? 'danger' : 'success'} />
      </div>

      <div className="card mt-2">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Period type</span>
            <select
              className="select"
              value={list.filters.periodType ?? ''}
              onChange={(event) => list.updateFilter('periodType', event.target.value)}
            >
              {BUDGET_PERIOD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Period e.g. 2026-09"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
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

        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{ title: 'No budgets found', message: 'Create a budget to start tracking spending.' }}
          columns={[
            { key: 'departmentName', label: 'Department', sortable: true, render: (row) => row.department?.name || '—' },
            { key: 'categoryName', label: 'Category', sortable: true, render: (row) => row.category?.name || '—' },
            { key: 'period', label: 'Period', sortable: true },
            { key: 'usage', label: 'Usage', render: (row) => <BudgetBar usage={row.usage} /> },
            {
              key: 'allocatedAmount',
              label: 'Allocated',
              numeric: true,
              sortable: true,
              render: (row) => formatMoney(row.usage?.allocated || row.allocatedAmount),
            },
            {
              key: 'used',
              label: 'Used',
              numeric: true,
              render: (row) => formatMoney(row.usage?.used || 0),
            },
            {
              key: 'committed',
              label: 'Committed',
              numeric: true,
              render: (row) => formatMoney(row.usage?.committed || 0),
            },
            {
              key: 'remaining',
              label: 'Remaining',
              numeric: true,
              render: (row) => (
                <span style={{ color: row.usage?.remaining < 0 ? 'var(--color-danger)' : undefined }}>
                  {formatMoney(row.usage?.remaining || 0)}
                </span>
              ),
            },
            {
              key: 'state',
              label: 'State',
              render: (row) => <BudgetStateBadge usage={row.usage} />,
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="table__actions">
                  <Link className="btn btn--secondary btn--sm" to={`/budgets/${row._id}/edit`}>
                    Revise
                  </Link>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setDeleteId(row._id)}
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>

      <BudgetCreateModal
        open={createOpen}
        busy={createBusy}
        form={createForm}
        setForm={setCreateForm}
        departments={departments.data?.items || []}
        categories={categories.data?.items || []}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      />

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete budget"
        tone="danger"
        confirmLabel="Delete budget"
        message="Budgets that already have spending cannot be deleted - revise the amount instead."
        onCancel={() => setDeleteId(null)}
        onConfirm={submitDelete}
      />
    </>
  );
};

/** Create budget modal (extracted for readability). */
const BudgetCreateModal = ({ open, busy, form, setForm, departments, categories, onClose, onSubmit }) => {
  if (!form) return null;
  return (
    <Modal
      open={open}
      title="Create budget"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onSubmit} disabled={busy}>
            {busy ? 'Creating…' : 'Create budget'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">
            Department<span className="req">*</span>
          </span>
          <select
            className="input"
            value={form.department}
            onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
          >
            <option value="">Select a department</option>
            {departments.map((department) => (
              <option key={department._id} value={department._id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">
            Category<span className="req">*</span>
          </span>
          <select
            className="input"
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid form-grid--2">
          <label className="field">
            <span className="field__label">
              Period type<span className="req">*</span>
            </span>
            <select
              className="input"
              value={form.periodType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  periodType: event.target.value,
                  period:
                    event.target.value === 'Yearly' ? currentYear() : currentMonth(),
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
            <span className="field__label">
              Period<span className="req">*</span>
            </span>
            <input
              className="input"
              value={form.period}
              onChange={(event) => setForm((current) => ({ ...current, period: event.target.value }))}
            />
            <span className="field__hint">YYYY-MM for monthly or YYYY for yearly</span>
          </label>
        </div>
        <label className="field">
          <span className="field__label">
            Allocated amount<span className="req">*</span>
          </span>
          <input
            type="number"
            min="1"
            step="0.01"
            className="input"
            value={form.allocatedAmount}
            onChange={(event) => setForm((current) => ({ ...current, allocatedAmount: event.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Warning threshold (%)</span>
          <input
            type="number"
            min="1"
            max="200"
            className="input"
            value={form.warningThresholdPercent}
            onChange={(event) =>
              setForm((current) => ({ ...current, warningThresholdPercent: event.target.value }))
            }
          />
          <span className="field__hint">Warn Finance when usage reaches this percentage.</span>
        </label>
        <label className="field">
          <span className="field__label">Notes (optional)</span>
          <input
            className="input"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>
      </div>
    </Modal>
  );
};

export default BudgetListPage;

