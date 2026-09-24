import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { userApi, departmentApi } from '../../api';
import { useApiQuery, useListState } from '../../hooks/useApi';
import { selectUser } from '../../features/auth/authSlice';
import useToast from '../../hooks/useToast';
import { Modal } from '../../components/Modal';
import { PasswordInput, Select, TextArea, TextInput } from '../../components/FormField';
import DataTable, { Pagination } from '../../components/DataTable';
import { RoleBadge, StatusBadge } from '../../components/StatusBadge';
import { ROLES } from '../../utils/options';
import { formatDateTime } from '../../utils/format';

/**
 * User management (Admin only).
 *
 * The backend owns every rule enforced here: only employees may belong to a
 * department, the last active administrator cannot be deactivated or demoted,
 * and deactivation always requires a reason (which is audited + notified).
 */

const emptyCreate = {
  name: '',
  email: '',
  password: '',
  role: 'Employee',
  department: '',
  employeeCode: '',
  designation: '',
  phone: '',
};

const emptyEdit = {
  name: '',
  role: 'Employee',
  department: '',
  employeeCode: '',
  designation: '',
  phone: '',
};

const UsersPage = () => {
  const toast = useToast();
  const currentUser = useSelector(selectUser);

  const list = useListState({
    sort: 'createdAt:desc',
    filters: { role: '', isActive: '', department: '' },
  });

  const { data, loading, error, reload } = useApiQuery(
    () => userApi.list(list.query),
    [list.query.page, list.query.limit, list.query.search, list.query.sort, JSON.stringify(list.filters)],
  );

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);
  const departmentOptions = useMemo(() => departments.data?.items || [], [departments.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createBusy, setCreateBusy] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [editBusy, setEditBusy] = useState(false);

  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ newPassword: '', confirm: '' });
  const [resetBusy, setResetBusy] = useState(false);

  const rows = data?.items || [];

  const openCreate = () => {
    setCreateForm(emptyCreate);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password) {
      toast.error('Missing details', 'Name, email and password are required.');
      return;
    }
    setCreateBusy(true);
    try {
      await userApi.create({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
        department: createForm.role === 'Employee' ? createForm.department || null : null,
        employeeCode: createForm.employeeCode.trim() || undefined,
        designation: createForm.designation.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
      });
      toast.success('User created', 'The account is ready to sign in.');
      setCreateOpen(false);
      reload();
    } catch (caught) {
      toast.error('Could not create the user', caught.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (user) => {
    setEditTarget(user);
    setEditForm({
      name: user.name || '',
      role: user.role || 'Employee',
      department: user.department?._id || '',
      employeeCode: user.employeeCode || '',
      designation: user.designation || '',
      phone: user.phone || '',
    });
  };

  const submitEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error('Missing details', 'Name is required.');
      return;
    }
    setEditBusy(true);
    try {
      await userApi.update(editTarget._id, {
        name: editForm.name.trim(),
        role: editForm.role,
        department: editForm.role === 'Employee' ? editForm.department || null : null,
        employeeCode: editForm.employeeCode.trim() || null,
        designation: editForm.designation.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
      });
      toast.success('User updated', 'The profile changes have been saved.');
      setEditTarget(null);
      reload();
    } catch (caught) {
      toast.error('Could not update the user', caught.message);
    } finally {
      setEditBusy(false);
    }
  };

  const submitStatusChange = async () => {
    const nextActive = !statusTarget.user.isActive;
    if (!nextActive && !statusTarget.reason.trim()) {
      toast.error('Reason required', 'A reason is mandatory when deactivating an account.');
      return;
    }
    setStatusBusy(true);
    try {
      await userApi.setStatus(statusTarget.user._id, {
        isActive: nextActive,
        reason: statusTarget.reason.trim() || undefined,
      });
      toast.success(
        nextActive ? 'Account activated' : 'Account deactivated',
        'The user has been notified.',
      );
      setStatusTarget(null);
      reload();
    } catch (caught) {
      toast.error('Could not change the account status', caught.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const submitResetPassword = async () => {
    if (resetForm.newPassword !== resetForm.confirm) {
      toast.error('Passwords do not match', 'Re-type the same password in both fields.');
      return;
    }
    setResetBusy(true);
    try {
      await userApi.resetPassword(resetTarget._id, { newPassword: resetForm.newPassword });
      toast.success('Password reset', 'The user must change it at next sign in.');
      setResetTarget(null);
      setResetForm({ newPassword: '', confirm: '' });
    } catch (caught) {
      toast.error('Could not reset the password', caught.message);
    } finally {
      setResetBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => (
        <div>
          <strong>{row.name}</strong>
          {row._id === currentUser?._id ? <span className="small muted"> (you)</span> : null}
          <div className="small muted">{row.email}</div>
        </div>
      ),
    },
    { key: 'role', label: 'Role', sortable: true, render: (row) => <RoleBadge role={row.role} /> },
    {
      key: 'department',
      label: 'Department',
      render: (row) => row.department?.name || '—',
    },
    { key: 'employeeCode', label: 'Code', render: (row) => row.employeeCode || '—' },
    {
      key: 'isActive',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <StatusBadge status={row.isActive ? 'Active' : 'Deactivated'} tone={row.isActive ? 'success' : 'muted'} />
      ),
    },
    {
      key: 'lastLoginAt',
      label: 'Last sign in',
      sortable: true,
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEdit(row)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setStatusTarget({ user: row, reason: '' })}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setResetTarget(row);
              setResetForm({ newPassword: '', confirm: '' });
            }}
          >
            Reset password
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-header__sub">
            Create accounts, assign roles and departments, and activate or deactivate access.
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={openCreate}>
            New user
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Name or email"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Role</span>
            <select
              className="select"
              value={list.filters.role ?? ''}
              onChange={(event) => list.updateFilter('role', event.target.value)}
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Account</span>
            <select
              className="select"
              value={list.filters.isActive ?? ''}
              onChange={(event) => list.updateFilter('isActive', event.target.value)}
            >
              <option value="">All accounts</option>
              <option value="true">Active only</option>
              <option value="false">Deactivated only</option>
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
              {departmentOptions.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
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
          emptyProps={{ title: 'No users found', message: 'Adjust the filters or create a new account.' }}
        />
        <Pagination meta={data?.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>

      {/* Create user */}
      {createOpen ? (
        <Modal
          open
          title="Create user"
          onClose={createBusy ? undefined : () => setCreateOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setCreateOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={submitCreate} disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create user'}
              </button>
            </>
          }
        >
          <div className="form-grid form-grid--2">
            <TextInput
              label="Full name"
              required
              value={createForm.name}
              onChange={(event) => setCreateForm((c) => ({ ...c, name: event.target.value }))}
            />
            <TextInput
              label="Email"
              required
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((c) => ({ ...c, email: event.target.value }))}
            />
            <PasswordInput
              label="Temporary password"
              required
              hint="Minimum 8 characters with letters and numbers."
              value={createForm.password}
              onChange={(event) => setCreateForm((c) => ({ ...c, password: event.target.value }))}
            />
            <Select
              label="Role"
              required
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((c) => ({ ...c, role: event.target.value, department: '' }))
              }
              options={ROLES}
            />
          </div>
          {createForm.role === 'Employee' ? (
            <Select
              label="Department"
              hint="Employees belong to exactly one department."
              value={createForm.department}
              onChange={(event) => setCreateForm((c) => ({ ...c, department: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {departmentOptions.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="form-grid form-grid--2">
            <TextInput
              label="Employee code"
              value={createForm.employeeCode}
              onChange={(event) => setCreateForm((c) => ({ ...c, employeeCode: event.target.value }))}
            />
            <TextInput
              label="Designation"
              value={createForm.designation}
              onChange={(event) => setCreateForm((c) => ({ ...c, designation: event.target.value }))}
            />
          </div>
          <TextInput
            label="Phone"
            value={createForm.phone}
            onChange={(event) => setCreateForm((c) => ({ ...c, phone: event.target.value }))}
          />
        </Modal>
      ) : null}

      {/* Edit user */}
      {editTarget ? (
        <Modal
          open
          title={`Edit ${editTarget.name}`}
          onClose={editBusy ? undefined : () => setEditTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setEditTarget(null)}
                disabled={editBusy}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={submitEdit} disabled={editBusy}>
                {editBusy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          }
        >
          <TextInput
            label="Full name"
            required
            value={editForm.name}
            onChange={(event) => setEditForm((c) => ({ ...c, name: event.target.value }))}
          />
          <Select
            label="Role"
            required
            value={editForm.role}
            onChange={(event) =>
              setEditForm((c) => ({ ...c, role: event.target.value, department: '' }))
            }
            options={ROLES}
            hint="The last active administrator cannot be demoted."
          />
          {editForm.role === 'Employee' ? (
            <Select
              label="Department"
              value={editForm.department}
              onChange={(event) => setEditForm((c) => ({ ...c, department: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {departmentOptions.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="form-grid form-grid--2">
            <TextInput
              label="Employee code"
              value={editForm.employeeCode}
              onChange={(event) => setEditForm((c) => ({ ...c, employeeCode: event.target.value }))}
            />
            <TextInput
              label="Designation"
              value={editForm.designation}
              onChange={(event) => setEditForm((c) => ({ ...c, designation: event.target.value }))}
            />
          </div>
          <TextInput
            label="Phone"
            value={editForm.phone}
            onChange={(event) => setEditForm((c) => ({ ...c, phone: event.target.value }))}
          />
        </Modal>
      ) : null}

      {/* Activate / deactivate */}
      {statusTarget ? (
        <Modal
          open
          title={statusTarget.user.isActive ? 'Deactivate account' : 'Activate account'}
          onClose={statusBusy ? undefined : () => setStatusTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setStatusTarget(null)}
                disabled={statusBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${statusTarget.user.isActive ? 'btn--danger' : ''}`}
                onClick={submitStatusChange}
                disabled={statusBusy}
              >
                {statusBusy ? 'Working…' : statusTarget.user.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </>
          }
        >
          <p className="small">
            {statusTarget.user.isActive
              ? `${statusTarget.user.name} will no longer be able to sign in. Historical records stay visible in reports.`
              : `${statusTarget.user.name} will be able to sign in again.`}
          </p>
          <TextArea
            label="Reason"
            required={statusTarget.user.isActive}
            rows={3}
            hint="Stored in the audit trail and sent to the user as a notification."
            value={statusTarget.reason}
            onChange={(event) => setStatusTarget((c) => ({ ...c, reason: event.target.value }))}
          />
        </Modal>
      ) : null}

      {/* Reset password */}
      {resetTarget ? (
        <Modal
          open
          title={`Reset password for ${resetTarget.name}`}
          onClose={resetBusy ? undefined : () => setResetTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setResetTarget(null)}
                disabled={resetBusy}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={submitResetPassword} disabled={resetBusy}>
                {resetBusy ? 'Resetting…' : 'Reset password'}
              </button>
            </>
          }
        >
          <PasswordInput
            label="New password"
            required
            value={resetForm.newPassword}
            onChange={(event) => setResetForm((c) => ({ ...c, newPassword: event.target.value }))}
          />
          <PasswordInput
            label="Confirm password"
            required
            value={resetForm.confirm}
            onChange={(event) => setResetForm((c) => ({ ...c, confirm: event.target.value }))}
          />
          <p className="small muted">
            The user will be forced to choose a new password the next time they sign in.
          </p>
        </Modal>
      ) : null}

    </>
  );
};

export default UsersPage;
