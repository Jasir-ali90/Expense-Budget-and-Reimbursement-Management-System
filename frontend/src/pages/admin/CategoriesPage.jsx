import React, { useState } from 'react';
import { categoryApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import { Modal } from '../../components/Modal';
import { Checkbox, TextArea, TextInput } from '../../components/FormField';
import DataTable, { Pagination } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatMoney } from '../../utils/format';

/**
 * Expense category master data (Admin only).
 *
 * The receipt requirement and the optional maximum claim amount set here are
 * re-checked on the backend for every claim item, so this screen cannot be
 * bypassed by editing a request by hand.
 */

const emptyForm = {
  name: '',
  code: '',
  description: '',
  requiresReceipt: true,
  maxClaimAmount: '',
};

const CategoriesPage = () => {
  const toast = useToast();

  const list = useListState({ sort: 'name:asc', filters: { isArchived: '' } });
  const { data, loading, error, reload } = useApiQuery(
    () => categoryApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort, JSON.stringify(list.filters)],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editBusy, setEditBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);

  const rows = data?.items || [];

  const openCreate = () => {
    setCreateForm(emptyForm);
    setCreateOpen(true);
  };

  /** Shared payload builder for create/update (numbers kept as numbers). */
  const buildPayload = (form) => ({
    name: form.name.trim(),
    code: form.code.trim() || undefined,
    description: form.description.trim() || undefined,
    requiresReceipt: Boolean(form.requiresReceipt),
    maxClaimAmount:
      String(form.maxClaimAmount).trim() === '' ? null : Number(form.maxClaimAmount),
  });

  const submitCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Name is required', 'Give the category a name such as Travel or Meals.');
      return;
    }
    setCreateBusy(true);
    try {
      await categoryApi.create(buildPayload(createForm));
      toast.success('Category created', 'The category is now available for claims.');
      setCreateOpen(false);
      reload();
    } catch (caught) {
      toast.error('Could not create the category', caught.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (category) => {
    setEditTarget(category);
    setEditForm({
      name: category.name || '',
      code: category.code || '',
      description: category.description || '',
      requiresReceipt: Boolean(category.requiresReceipt),
      maxClaimAmount: category.maxClaimAmount ?? '',
    });
  };

  const submitEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('Name is required', 'The category name cannot be empty.');
      return;
    }
    setEditBusy(true);
    try {
      await categoryApi.update(editTarget._id, buildPayload(editForm));
      toast.success('Category updated', 'Rules apply to the next claims that are created.');
      setEditTarget(null);
      reload();
    } catch (caught) {
      toast.error('Could not update the category', caught.message);
    } finally {
      setEditBusy(false);
    }
  };

  const submitArchive = async () => {
    if (!archiveReason.trim()) {
      toast.error('Reason required', 'Archiving always needs a short reason for the audit log.');
      return;
    }
    setArchiveBusy(true);
    try {
      await categoryApi.archive(archiveTarget._id, { reason: archiveReason.trim() });
      toast.success('Category archived', 'It can no longer be used for new claims.');
      setArchiveTarget(null);
      setArchiveReason('');
      reload();
    } catch (caught) {
      toast.error('Could not archive the category', caught.message);
    } finally {
      setArchiveBusy(false);
    }
  };

  const restore = async (category) => {
    try {
      await categoryApi.restore(category._id);
      toast.success('Category restored', 'It is available again for new claims.');
      reload();
    } catch (caught) {
      toast.error('Could not restore the category', caught.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Expense categories</h1>
          <p className="page-header__sub">
            Receipt rules and maximum claim amounts defined here are enforced by the backend on
            every claim item.
          </p>
        </div>
        <button type="button" className="btn" onClick={openCreate}>
          New category
        </button>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Name or code"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Availability</span>
            <select
              className="select"
              value={list.filters.isArchived ?? ''}
              onChange={(event) => list.updateFilter('isArchived', event.target.value)}
            >
              <option value="">Active and archived</option>
              <option value="False">Active only</option>
              <option value="True">Archived only</option>
            </select>
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
          emptyProps={{
            title: 'No categories found',
            message: 'Create categories such as Travel, Meals, Fuel, Software or Office Supplies.',
          }}
          columns={[
            {
              key: 'name',
              label: 'Category',
              sortable: true,
              render: (row) => (
                <div>
                  <strong>{row.name}</strong>
                  {row.description ? <div className="small muted">{row.description}</div> : null}
                </div>
              ),
            },
            { key: 'code', label: 'Code', render: (row) => row.code || '—' },
            {
              key: 'requiresReceipt',
              label: 'Receipt',
              render: (row) => (
                <StatusBadge
                  status={row.requiresReceipt ? 'Required' : 'Optional'}
                  tone={row.requiresReceipt ? 'warning' : 'muted'}
                />
              ),
            },
            {
              key: 'maxClaimAmount',
              label: 'Max claim',
              numeric: true,
              render: (row) => (row.maxClaimAmount ? formatMoney(row.maxClaimAmount) : 'No limit'),
            },
            {
              key: 'isArchived',
              label: 'Status',
              render: (row) => (
                <StatusBadge
                  status={row.isArchived ? 'Archived' : 'Active'}
                  tone={row.isArchived ? 'danger' : 'success'}
                />
              ),
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="table__actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => openEdit(row)}
                  >
                    Edit
                  </button>
                  {row.isArchived ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => restore(row)}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => {
                        setArchiveReason('');
                        setArchiveTarget(row);
                      }}
                    >
                      Archive
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>

      <CategoryFormModal
        title="New expense category"
        open={createOpen}
        busy={createBusy}
        form={createForm}
        setForm={setCreateForm}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
        submitLabel="Create category"
      />

      <CategoryFormModal
        title={`Edit ${editTarget?.name || 'category'}`}
        open={Boolean(editTarget)}
        busy={editBusy}
        form={editForm}
        setForm={setEditForm}
        onClose={() => setEditTarget(null)}
        onSubmit={submitEdit}
        submitLabel="Save changes"
      />

      <Modal
        open={Boolean(archiveTarget)}
        title={`Archive ${archiveTarget?.name || 'category'}`}
        onClose={archiveBusy ? undefined : () => setArchiveTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setArchiveTarget(null)}
              disabled={archiveBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={submitArchive}
              disabled={archiveBusy}
            >
              {archiveBusy ? 'Archiving…' : 'Archive category'}
            </button>
          </>
        }
      >
        <p className="small">
          Archived categories stay visible in historical reports and existing claims, but cannot be
          used for new claims.
        </p>
        <TextArea
          label="Reason"
          required
          rows={3}
          value={archiveReason}
          onChange={(event) => setArchiveReason(event.target.value)}
          placeholder="Why is this category being retired?"
        />
      </Modal>
    </>
  );
};

/** Create / edit dialog - identical fields, different submit handler. */
const CategoryFormModal = ({ title, open, busy, form, setForm, onClose, onSubmit, submitLabel }) => (
  <Modal
    open={open}
    title={title}
    onClose={busy ? undefined : onClose}
    footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={onSubmit} disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </>
    }
  >
    <TextInput
      label="Name"
      required
      value={form.name}
      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
      placeholder="Travel"
    />
    <TextInput
      label="Code (optional)"
      value={form.code}
      onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
      placeholder="CAT-TRV"
    />
    <TextArea
      label="Description (optional)"
      rows={2}
      value={form.description}
      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
      placeholder="Short description shown to employees when they pick a category."
    />
    <Checkbox
      label="A receipt is mandatory for this category"
      checked={Boolean(form.requiresReceipt)}
      onChange={(event) => setForm((current) => ({ ...current, requiresReceipt: event.target.checked }))}
      hint="The backend rejects claim items in this category when no receipt is attached."
    />
    <TextInput
      label="Maximum claim amount (optional)"
      type="number"
      min="0"
      step="0.01"
      value={form.maxClaimAmount}
      onChange={(event) =>
        setForm((current) => ({ ...current, maxClaimAmount: event.target.value }))
      }
      hint="Leave empty for no limit. Checked on the backend for every claim item."
    />
  </Modal>
);

export default CategoriesPage;
