import React, { useMemo, useState } from 'react';
import { departmentApi, userApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import { Modal } from '../../components/Modal';
import { Checkbox, Select, TextArea, TextInput } from '../../components/FormField';
import DataTable, { Pagination } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate } from '../../utils/format';

/**
 * Department master data (Admin only).
 * Departments are archived rather than deleted so old budgets, expenses and
 * claims keep resolving their department name in historical reports.
 */

const emptyForm = { name: '', code: '', description: '', manager: '' };

const emptyArchive = { department: null, reason: '' };

const DepartmentsPage = () => {
  const toast = useToast();

  const list = useListState({ sort: 'name:asc', filters: { isArchived: '' } });
  const { data, loading, error, reload } = useApiQuery(
    () => departmentApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort, JSON.stringify(list.filters)],
  );

  const staff = useApiQuery(() => userApi.list({ limit: 100 }), []);
  const managerOptions = useMemo(
    () => (staff.data?.items || []).filter((person) => person.isActive),
    [staff.data],
  );

  const [editor, setEditor] = useState(null); // { mode: 'create' | 'edit', department }
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveForm, setArchiveForm] = useState(emptyArchive);
  const [restoreTarget, setRestoreTarget] = useState(null);

  const rows = data?.items || [];
  const activeCount = rows.filter((row) => !row.isArchived).length;
  const archivedCount = rows.filter((row) => row.isArchived).length;

  const openCreate = () => {
    setForm(emptyForm);
    setEditor({ mode: 'create' });
  };

  const openEdit = (department) => {
    setForm({
      name: department.name || '',
      code: department.code || '',
      description: department.description || '',
      manager: department.manager?._id || '',
    });
    setEditor({ mode: 'edit', department });
  };

  const submitEditor = async () => {
    if (!form.name.trim()) {
      toast.error('Missing details', 'Department name is required.');
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || undefined,
      manager: form.manager || null,
    };
    try {
      if (editor.mode === 'create') {
        await departmentApi.create(payload);
        toast.success('Department created', 'You can now assign employees to it.');
      } else {
        await departmentApi.update(editor.department._id, payload);
        toast.success('Department updated', 'The changes have been recorded in the audit trail.');
      }
      setEditor(null);
      reload();
    } catch (caught) {
      toast.error('Could not save the department', caught.message);
    } finally {
      setBusy(false);
    }
  };

  const submitArchive = async () => {
    if (!archiveForm.reason.trim()) {
      toast.error('Reason required', 'Archiving a department requires a reason.');
      return;
    }
    setBusy(true);
    try {
      await departmentApi.archive(archiveForm.department._id, { reason: archiveForm.reason.trim() });
      toast.success('Department archived', 'It can no longer be used for new records.');
      setArchiveForm(emptyArchive);
      reload();
    } catch (caught) {
      toast.error('Could not archive the department', caught.message);
    } finally {
      setBusy(false);
    }
  };

  const submitRestore = async () => {
    setBusy(true);
    try {
      await departmentApi.restore(restoreTarget._id, {});
      toast.success('Department restored', 'It is available again for new records.');
      setRestoreTarget(null);
      reload();
    } catch (caught) {
      toast.error('Could not restore the department', caught.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Department',
      sortable: true,
      render: (row) => (
        <div>
          <strong>{row.name}</strong>
          {row.code ? <span className="small muted"> · {row.code}</span> : null}
          {row.description ? <div className="small muted">{row.description}</div> : null}
        </div>
      ),
    },
    {
      key: 'manager',
      label: 'Finance manager',
      render: (row) => row.manager?.name || <span className="muted">Not assigned</span>,
    },
    {
      key: 'employeeCount',
      label: 'Employees',
      numeric: true,
      render: (row) => row.employeeCount ?? 0,
    },
    {
      key: 'isArchived',
      label: 'Status',
      render: (row) => (
        <StatusBadge
          status={row.isArchived ? 'Archived' : 'Active'}
          tone={row.isArchived ? 'muted' : 'success'}
        />
      ),
    },
    {
      key: 'archivedAt',
      label: 'Archived',
      render: (row) => (row.archivedAt ? formatDate(row.archivedAt) : '—'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEdit(row)}>
            Edit
          </button>
          {row.isArchived ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setRestoreTarget(row)}
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setArchiveForm({ department: row, reason: '' })}
            >
              Archive
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Departments</h1>
          <p className="page-header__sub">
            Organise employees into departments and nominate the Finance Manager who reviews their
            claims.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={openCreate}>
            New department
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__label">Visible departments</div>
          <div className="stat__value">{rows.length}</div>
        </div>
        <div className="stat stat--success">
          <div className="stat__label">Active</div>
          <div className="stat__value">{activeCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Archived</div>
          <div className="stat__value">{archivedCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Name, code or description"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Status</span>
            <select
              className="select"
              value={list.filters.isArchived ?? ''}
              onChange={(event) => list.updateFilter('isArchived', event.target.value)}
            >
              <option value="">All departments</option>
              <option value="false">Active only</option>
              <option value="true">Archived only</option>
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
          columns={columns}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          sortState={list.sortState}
          onSort={list.toggleSort}
          emptyProps={{
            title: 'No departments found',
            message: 'Create a department before setting budgets.',
          }}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>

      {/* Create / edit department */}
      {editor ? (
        <Modal
          open
          title={editor.mode === 'create' ? 'New department' : `Edit ${editor.department.name}`}
          onClose={busy ? undefined : () => setEditor(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={submitEditor} disabled={busy}>
                {busy ? 'Saving…' : editor.mode === 'create' ? 'Create department' : 'Save changes'}
              </button>
            </>
          }
        >
          <div className="form-grid form-grid--2">
            <TextInput
              label="Name"
              required
              value={form.name}
              onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            />
            <TextInput
              label="Code"
              hint="Short cost-centre code, e.g. OPS-01."
              value={form.code}
              onChange={(event) => setForm((c) => ({ ...c, code: event.target.value }))}
            />
          </div>
          <Select
            label="Finance manager"
            hint="Submitted claims from this department are routed to this reviewer."
            value={form.manager}
            onChange={(event) => setForm((c) => ({ ...c, manager: event.target.value }))}
          >
            <option value="">Not assigned</option>
            {managerOptions.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name} — {person.role}
              </option>
            ))}
          </Select>
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
          />
          <Checkbox
            label="Historical records are preserved when this department is archived"
            checked
            readOnly
          />
        </Modal>
      ) : null}

      {/* Archive department (reason mandatory) */}
      {archiveForm.department ? (
        <Modal
          open
          title={`Archive ${archiveForm.department.name}`}
          onClose={busy ? undefined : () => setArchiveForm(emptyArchive)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setArchiveForm(emptyArchive)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn btn--danger" onClick={submitArchive} disabled={busy}>
                {busy ? 'Archiving…' : 'Archive department'}
              </button>
            </>
          }
        >
          <p className="small">
            Archiving hides the department from new budgets, expenses and claims, but every existing
            record keeps its department name.
          </p>
          <TextArea
            label="Reason"
            required
            rows={3}
            value={archiveForm.reason}
            onChange={(event) => setArchiveForm((c) => ({ ...c, reason: event.target.value }))}
          />
        </Modal>
      ) : null}

      {/* Restore department */}
      {restoreTarget ? (
        <Modal
          open
          title={`Restore ${restoreTarget.name}`}
          onClose={busy ? undefined : () => setRestoreTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setRestoreTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={submitRestore} disabled={busy}>
                {busy ? 'Restoring…' : 'Restore department'}
              </button>
            </>
          }
        >
          <p className="small">
            The department will be selectable again immediately and available in budget filters.
          </p>
        </Modal>
      ) : null}

    </>
  );
};

export default DepartmentsPage;
