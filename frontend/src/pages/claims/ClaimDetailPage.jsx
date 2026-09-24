import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { claimApi, buildFileUrl } from '../../api';
import { useApiQuery } from '../../hooks/useApi';
import { selectUser } from '../../features/auth/authSlice';
import { AsyncBoundary, InlineAlert } from '../../components/StateViews';
import DataTable from '../../components/DataTable';
import StatusBadge, { OverdueBadge } from '../../components/StatusBadge';
import { ConfirmModal, Modal } from '../../components/Modal';
import { PAYMENT_METHODS } from '../../utils/options';
import { formatDate, formatDateTime, formatMoney, isOverdue } from '../../utils/format';
import useToast from '../../hooks/useToast';

/**
 * Claim detail.
 *
 * Employees see their own claim, its items, receipts and the full approval
 * timeline. Finance Managers (and Admins) additionally get the review panel:
 * approve (with item level partial approval), reject, return for correction,
 * request a receipt, reassign and record payments/adjustments.
 *
 * Every rule (self approval, read-only states, thresholds, required comments)
 * is enforced by the API - this screen only hides impossible actions.
 */
const ClaimDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSelector(selectUser);

  const { data, loading, error, reload } = useApiQuery(() => claimApi.get(id), [id]);
  const claim = data?.claim;

  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState({ amount: '', method: 'Bank Transfer', referenceNumber: '', note: '' });
  const [adjustment, setAdjustment] = useState({ type: 'Deduct', amount: '', reason: '', affectsPaidTotal: false });
  const [approvals, setApprovals] = useState({});
  const [reassignTo, setReassignTo] = useState('');
  const financeManagers = useApiQuery(() => claimApi.financeManagers(), [], { immediate: user?.role === 'Admin' });

  const isOwner = String(claim?.employee?._id || claim?.employee) === String(user?._id);
  const isEmployee = user?.role === 'Employee';
  const canReview = !isEmployee;
  const editable = claim && ['Draft', 'Returned'].includes(claim.status) && (isOwner || !isEmployee);
  const outstanding = useMemo(
    () => (claim ? Math.max(0, Number(claim.totalApproved || 0) - Number(claim.totalPaid || 0)) : 0),
    [claim],
  );

  const openDialog = (type) => {
    setComment('');
    if (type === 'pay') {
      setPayment({
        amount: outstanding ? String(outstanding) : '',
        method: 'Bank Transfer',
        referenceNumber: '',
        note: '',
      });
    }
    if (type === 'approve') {
      const initial = {};
      (claim?.items || []).forEach((item) => {
        initial[item._id] = String(item.requestedAmount ?? '');
      });
      setApprovals(initial);
    }
    setDialog(type);
  };

  /** Run a review/employee action and refresh the claim afterwards. */
  const runAction = async (action, successTitle, successMessage) => {
    setBusy(true);
    try {
      await action();
      toast.success(successTitle, successMessage);
      setDialog(null);
      await reload();
    } catch (caught) {
      toast.error('Action failed', caught.message);
    } finally {
      setBusy(false);
    }
  };

  if (!claim && (loading || error)) {
    return <AsyncBoundary loading={loading} error={error} onRetry={reload} loadingLabel="Loading claim…" />;
  }
  if (!claim) return null;

  const timeline = claim.timeline || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            {claim.claimNo || 'Claim'} — {claim.title}
          </h1>
          <p className="page-header__sub">
            {claim.employeeName || claim.employee?.name} · {claim.departmentName || claim.department?.name} ·
            submitted {formatDateTime(claim.submittedAt)}
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn btn--secondary" to="/claims">
            Back to list
          </Link>
          {editable ? (
            <Link className="btn btn--secondary" to={`/claims/${claim._id}/edit`}>
              Edit claim
            </Link>
          ) : null}
          {isOwner && ['Draft', 'Returned'].includes(claim.status) ? (
            <button
              type="button"
              className="btn"
              onClick={() =>
                runAction(
                  () => claimApi.submit(claim._id),
                  'Claim submitted',
                  'Your claim is now with the Finance Manager for review.',
                )
              }
              disabled={busy}
            >
              Submit for approval
            </button>
          ) : null}
          {isOwner && claim.status === 'Draft' ? (
            <button type="button" className="btn btn--danger" onClick={() => setDialog('delete')} disabled={busy}>
              Delete draft
            </button>
          ) : null}
        </div>
      </div>

      {isOverdue(claim) ? (
        <InlineAlert tone="warning">
          This claim is past its approval due date ({formatDate(claim.dueAt)}) and is flagged as overdue.
        </InlineAlert>
      ) : null}

      {claim.lastComment && ['Returned', 'Rejected'].includes(claim.status) ? (
        <InlineAlert tone={claim.status === 'Rejected' ? 'error' : 'warning'}>
          <strong>{claim.status} by Finance:</strong> {claim.lastComment}
        </InlineAlert>
      ) : null}

      <div className="grid grid--stats">
        <div className="stat">
          <div className="stat__label">Status</div>
          <div className="stat__value" style={{ fontSize: '1.05rem' }}>
            <StatusBadge status={claim.status} />
            <OverdueBadge show={isOverdue(claim)} />
          </div>
          <div className="stat__hint">
            Assigned to {claim.assignedToName || '—'}
            {claim.dueAt ? ` · due ${formatDate(claim.dueAt)}` : ''}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Requested</div>
          <div className="stat__value">{formatMoney(claim.totalRequested)}</div>
          <div className="stat__hint">Original amount - never overwritten</div>
        </div>
        <div className="stat">
          <div className="stat__label">Approved</div>
          <div className="stat__value">{formatMoney(claim.totalApproved)}</div>
          <div className="stat__hint">Partial approvals included</div>
        </div>
        <div className="stat">
          <div className="stat__label">Paid</div>
          <div className="stat__value">{formatMoney(claim.totalPaid)}</div>
          <div className="stat__hint">{formatMoney(outstanding)} outstanding</div>
        </div>
      </div>

      <ClaimItemsTable claim={claim} />

      <ClaimHistoryPanels claim={claim} timeline={timeline} />

      {canReview ? <ReviewPanel claim={claim} onOpen={openDialog} busy={busy} outstanding={outstanding} /> : null}

      <ClaimDialogs
        claim={claim}
        dialog={dialog}
        busy={busy}
        comment={comment}
        setComment={setComment}
        payment={payment}
        setPayment={setPayment}
        adjustment={adjustment}
        setAdjustment={setAdjustment}
        approvals={approvals}
        setApprovals={setApprovals}
        reassignTo={reassignTo}
        setReassignTo={setReassignTo}
        financeManagers={normaliseManagers(financeManagers.data)}
        onClose={() => setDialog(null)}
        runAction={runAction}
        onDeleted={() => navigate('/claims')}
      />
    </>
  );
};

/** The finance-manager list endpoint may return an array or a wrapper. */
const normaliseManagers = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.financeManagers)) return data.financeManagers;
  if (Array.isArray(data?.users)) return data.users;
  return [];
};

/** Item table with per item approval outcome and receipt links. */
const ClaimItemsTable = ({ claim }) => (
  <div className="card mt-2">
    <div className="card__header">
      <h2 className="card__title">Expense items</h2>
      <span className="small muted">{(claim.items || []).length} item(s)</span>
    </div>
    <DataTable
      compact
      rows={claim.items || []}
      emptyProps={{ title: 'No items on this claim' }}
      columns={[
        { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
        {
          key: 'categoryName',
          label: 'Category',
          render: (row) => row.categoryName || row.category?.name || '—',
        },
        {
          key: 'description',
          label: 'Description',
          render: (row) => (
            <div>
              {row.description}
              {row.merchant ? <div className="small muted">{row.merchant}</div> : null}
            </div>
          ),
        },
        {
          key: 'requestedAmount',
          label: 'Requested',
          numeric: true,
          render: (row) => formatMoney(row.requestedAmount),
        },
        {
          key: 'approvedAmount',
          label: 'Approved',
          numeric: true,
          render: (row) => formatMoney(row.approvedAmount),
        },
        { key: 'status', label: 'Item status', render: (row) => <StatusBadge status={row.status} /> },
        {
          key: 'receipt',
          label: 'Receipt',
          render: (row) =>
            row.receipt ? (
              <a href={buildFileUrl(row.receipt)} target="_blank" rel="noreferrer noopener">
                {row.receipt.originalName || 'View'}
              </a>
            ) : (
              <span className="badge badge--muted">Missing</span>
            ),
        },
      ]}
    />
  </div>
);

/** Approval timeline + payments/adjustments side by side. */
const ClaimHistoryPanels = ({ claim, timeline }) => (
  <div className="grid grid--2 mt-2">
    <div className="card">
      <div className="card__header">
        <h2 className="card__title">Approval timeline</h2>
      </div>
      {timeline.length === 0 ? (
        <div className="small muted">No review activity yet.</div>
      ) : (
        <ol className="timeline">
          {[...timeline].reverse().map((entry, index) => (
            <li
              key={`${entry.timestamp || index}-${entry.action}`}
              className={`timeline__item${
                entry.action === 'Rejected'
                  ? ' timeline__item--danger'
                  : entry.action === 'Approved'
                    ? ' timeline__item--success'
                    : ''
              }`}
            >
              <strong>{entry.action}</strong>
              <div className="timeline__meta">
                {entry.actorName || 'System'}
                {entry.actorRole ? ` (${entry.actorRole})` : ''} · {formatDateTime(entry.timestamp)}
                {entry.previousStatus && entry.newStatus && entry.previousStatus !== entry.newStatus
                  ? ` · ${entry.previousStatus} → ${entry.newStatus}`
                  : ''}
              </div>
              {entry.comment ? <div className="timeline__comment">{entry.comment}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </div>

    <div className="card">
      <div className="card__header">
        <h2 className="card__title">Payments &amp; adjustments</h2>
      </div>
      {(claim.payments || []).length === 0 ? (
        <div className="small muted mb-1">No payments recorded yet.</div>
      ) : (
        <DataTable
          compact
          rows={claim.payments || []}
          columns={[
            { key: 'paidAt', label: 'Date', render: (row) => formatDate(row.paidAt) },
            { key: 'amount', label: 'Amount', numeric: true, render: (row) => formatMoney(row.amount) },
            { key: 'method', label: 'Method' },
            { key: 'referenceNumber', label: 'Reference' },
          ]}
        />
      )}

      {(claim.adjustments || []).length > 0 ? (
        <>
          <h3 className="card__title mt-2">Adjustments</h3>
          <DataTable
            compact
            rows={claim.adjustments || []}
            columns={[
              { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
              { key: 'type', label: 'Type' },
              { key: 'amount', label: 'Amount', numeric: true, render: (row) => formatMoney(row.amount) },
              { key: 'reason', label: 'Reason' },
            ]}
          />
        </>
      ) : null}
    </div>
  </div>
);

/** Finance review actions available for the claim's current status. */
const ReviewPanel = ({ claim, onOpen, busy, outstanding }) => {
  const pending = claim.status === 'Submitted';
  const approved = ['Approved', 'Paid'].includes(claim.status);

  return (
    <div className="card mt-2">
      <div className="card__header">
        <h2 className="card__title">Review actions</h2>
        <span className="small muted">
          Status: <StatusBadge status={claim.status} />
        </span>
      </div>

      {!pending && !approved ? (
        <div className="small muted">
          No review action is available while the claim is in status “{claim.status}”.
        </div>
      ) : null}

      <div className="btn-row">
        {pending ? (
          <>
            <button type="button" className="btn btn--success" onClick={() => onOpen('approve')} disabled={busy}>
              Approve / partially approve
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => onOpen('return')} disabled={busy}>
              Return for correction
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => onOpen('receipt')} disabled={busy}>
              Request receipt / information
            </button>
            <button type="button" className="btn btn--danger" onClick={() => onOpen('reject')} disabled={busy}>
              Reject claim
            </button>
          </>
        ) : null}

        {approved && outstanding > 0 ? (
          <button type="button" className="btn" onClick={() => onOpen('pay')} disabled={busy}>
            Record payment ({formatMoney(outstanding)} outstanding)
          </button>
        ) : null}

        {approved && outstanding <= 0 ? (
          <span className="badge badge--success">Fully paid</span>
        ) : null}

        <button type="button" className="btn btn--secondary" onClick={() => onOpen('adjust')} disabled={busy}>
          Add adjustment
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => onOpen('reassign')} disabled={busy}>
          Reassign approver (Admin)
        </button>
      </div>
    </div>
  );
};

/** Reusable comment-only dialog (reject / return / request receipt). */
const CommentDialog = ({
  open,
  title,
  label,
  confirmLabel,
  tone = 'primary',
  busy,
  comment,
  setComment,
  onClose,
  onSubmit,
}) => (
  <Modal
    open={open}
    title={title}
    onClose={onClose}
    footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn${tone === 'danger' ? ' btn--danger' : ''}`}
          disabled={busy || !comment.trim()}
          onClick={onSubmit}
          title={!comment.trim() ? 'A comment is required' : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </>
    }
  >
    <label className="field">
      <span className="field__label">
        {label}
        <span className="req">*</span>
      </span>
      <textarea
        className="textarea"
        value={comment}
        maxLength={500}
        onChange={(event) => setComment(event.target.value)}
      />
      <span className="field__hint">A comment is mandatory and is stored on the approval timeline.</span>
    </label>
  </Modal>
);

/**
 * Approve / reject / return / request-receipt dialogs.
 * Approve supports item level partial approval by editing the amount per item.
 */
const ClaimDialogs = ({
  claim,
  dialog,
  busy,
  comment,
  setComment,
  payment,
  setPayment,
  adjustment,
  setAdjustment,
  approvals,
  setApprovals,
  reassignTo,
  setReassignTo,
  financeManagers,
  onClose,
  runAction,
  onDeleted,
}) => {
  /** Only send overrides for items the reviewer actually reduced. */
  const approvePayload = () => {
    const overrides = (claim.items || [])
      .map((item) => {
        const value = Number(approvals[item._id]);
        if (!Number.isFinite(value)) return null;
        if (value === Number(item.requestedAmount)) return null;
        return { itemId: item._id, approvedAmount: value };
      })
      .filter(Boolean);
    return overrides.length > 0 ? { overrides } : {};
  };

  const approvedTotal = (claim.items || []).reduce((sum, item) => {
    const value = Number(approvals[item._id]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <>
      <Modal
        open={dialog === 'approve'}
        title="Approve claim"
        onClose={onClose}
        wide
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--success"
              disabled={busy}
              onClick={() =>
                runAction(
                  () => claimApi.approve(claim._id, approvePayload()),
                  'Claim approved',
                  'The employee has been notified.',
                )
              }
            >
              {busy ? 'Approving…' : 'Approve claim'}
            </button>
          </>
        }
      >
        <p className="small muted">
          Reduce an item amount to partially approve it; leave it equal to the requested amount to approve
          in full. Approved total: <strong>{formatMoney(approvedTotal)}</strong> of{' '}
          {formatMoney(claim.totalRequested)}.
        </p>
        <div className="stack">
          {(claim.items || []).map((item) => (
            <div key={item._id} className="inline">
              <span style={{ flex: 1 }}>
                {item.description}
                <div className="small muted">
                  {item.categoryName} · requested {formatMoney(item.requestedAmount)}
                </div>
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                style={{ width: '130px' }}
                value={approvals[item._id] ?? ''}
                onChange={(event) =>
                  setApprovals((current) => ({ ...current, [item._id]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </Modal>

      <CommentDialog
        open={dialog === 'reject'}
        title="Reject claim"
        label="Reason"
        confirmLabel="Reject claim"
        tone="danger"
        busy={busy}
        comment={comment}
        setComment={setComment}
        onClose={onClose}
        onSubmit={() =>
          runAction(
            () => claimApi.reject(claim._id, { comment: comment.trim() }),
            'Claim rejected',
            'The mandatory comment was recorded.',
          )
        }
      />

      <CommentDialog
        open={dialog === 'return'}
        title="Return claim for correction"
        label="What must be corrected?"
        confirmLabel="Return claim"
        busy={busy}
        comment={comment}
        setComment={setComment}
        onClose={onClose}
        onSubmit={() =>
          runAction(
            () => claimApi.returnForCorrection(claim._id, { comment: comment.trim() }),
            'Claim returned',
            'The employee can correct and resubmit it.',
          )
        }
      />

      <CommentDialog
        open={dialog === 'receipt'}
        title="Request receipt or information"
        label="What is required?"
        confirmLabel="Send request"
        busy={busy}
        comment={comment}
        setComment={setComment}
        onClose={onClose}
        onSubmit={() =>
          runAction(
            () => claimApi.requestReceipt(claim._id, { comment: comment.trim() }),
            'Request sent',
            'The employee has been notified.',
          )
        }
      />

      <ClaimMoneyDialogs
        claim={claim}
        dialog={dialog}
        busy={busy}
        comment={comment}
        setComment={setComment}
        payment={payment}
        setPayment={setPayment}
        adjustment={adjustment}
        setAdjustment={setAdjustment}
        reassignTo={reassignTo}
        setReassignTo={setReassignTo}
        financeManagers={financeManagers}
        onClose={onClose}
        runAction={runAction}
        onDeleted={onDeleted}
      />
    </>
  );
};

/** Picker + mandatory reason used by the Admin reassign dialog. */
const ReassignFields = ({ reassignTo, setReassignTo, financeManagers, comment, setComment }) => (
  <div className="form-grid">
    <label className="field">
      <span className="field__label">
        New Finance Manager<span className="req">*</span>
      </span>
      <select className="select" value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
        <option value="">Select a Finance Manager</option>
        {financeManagers.map((manager) => (
          <option key={manager._id} value={manager._id}>
            {manager.name}
            {manager.email ? ` (${manager.email})` : ''}
          </option>
        ))}
      </select>
    </label>
    <label className="field">
      <span className="field__label">
        Reason<span className="req">*</span>
      </span>
      <textarea
        className="textarea"
        value={comment}
        maxLength={500}
        onChange={(event) => setComment(event.target.value)}
        placeholder="e.g. Original approver is on leave"
      />
    </label>
  </div>
);

/**
 * Money and assignment dialogs: record a payment, append an adjustment,
 * reassign the approver (Admin) and delete a draft.
 */
const ClaimMoneyDialogs = ({
  claim,
  dialog,
  busy,
  comment,
  setComment,
  payment,
  setPayment,
  adjustment,
  setAdjustment,
  reassignTo,
  setReassignTo,
  financeManagers,
  onClose,
  runAction,
  onDeleted,
}) => (
  <>
    <Modal
      open={dialog === 'pay'}
      title="Record payment"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              runAction(
                () =>
                  claimApi.pay(claim._id, {
                    amount: Number(payment.amount),
                    method: payment.method,
                    referenceNumber: payment.referenceNumber.trim(),
                    note: payment.note.trim() || undefined,
                  }),
                'Payment recorded',
                'The requested amount is unchanged; a payment entry was appended.',
              )
            }
          >
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </>
      }
    >
      <div className="form-grid form-grid--2">
        <label className="field">
          <span className="field__label">
            Amount<span className="req">*</span>
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="input"
            value={payment.amount}
            onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))}
          />
          <span className="field__hint">
            Outstanding approved amount: {formatMoney(Math.max(0, claim.totalApproved - claim.totalPaid))}
          </span>
        </label>
        <label className="field">
          <span className="field__label">
            Payment method<span className="req">*</span>
          </span>
          <select
            className="select"
            value={payment.method}
            onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value }))}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">
            Transaction reference<span className="req">*</span>
          </span>
          <input
            className="input"
            value={payment.referenceNumber}
            onChange={(event) =>
              setPayment((current) => ({ ...current, referenceNumber: event.target.value }))
            }
          />
        </label>
        <label className="field">
          <span className="field__label">Note (optional)</span>
          <input
            className="input"
            value={payment.note}
            onChange={(event) => setPayment((current) => ({ ...current, note: event.target.value }))}
          />
        </label>
      </div>
    </Modal>

    <AdjustmentDialog
      open={dialog === 'adjust'}
      claim={claim}
      busy={busy}
      adjustment={adjustment}
      setAdjustment={setAdjustment}
      onClose={onClose}
      runAction={runAction}
    />

    <Modal
      open={dialog === 'reassign'}
      title="Reassign approval (Admin)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !reassignTo || !comment.trim()}
            onClick={() =>
              runAction(
                () =>
                  claimApi.reassign(claim._id, {
                    newAssigneeId: reassignTo,
                    reason: comment.trim(),
                  }),
                'Approval reassigned',
                'The reason was recorded in the audit trail.',
              )
            }
          >
            {busy ? 'Reassigning…' : 'Reassign'}
          </button>
        </>
      }
    >
      <ReassignFields
        reassignTo={reassignTo}
        setReassignTo={setReassignTo}
        financeManagers={financeManagers}
        comment={comment}
        setComment={setComment}
      />
    </Modal>

    <ConfirmModal
      open={dialog === 'delete'}
      title="Delete draft claim"
      tone="danger"
      confirmLabel="Delete draft"
      busy={busy}
      message="Only draft claims can be deleted. This cannot be undone."
      onCancel={onClose}
      onConfirm={() =>
        runAction(() => claimApi.remove(claim._id), 'Draft deleted', 'The draft claim was removed.').then(
          onDeleted,
        )
      }
    />
  </>
);

/** Append-only adjustment dialog (corrections never overwrite paid records). */
const AdjustmentDialog = ({ open, claim, busy, adjustment, setAdjustment, onClose, runAction }) => (
  <Modal
    open={open}
    title="Add adjustment"
    onClose={onClose}
    footer={
      <>
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            runAction(
              () =>
                claimApi.adjust(claim._id, {
                  type: adjustment.type,
                  amount: Number(adjustment.amount),
                  reason: adjustment.reason.trim(),
                  affectsPaidTotal: adjustment.affectsPaidTotal,
                }),
              'Adjustment recorded',
              'Corrections are append-only - the original record stays intact.',
            )
          }
        >
          {busy ? 'Saving…' : 'Add adjustment'}
        </button>
      </>
    }
  >
    <div className="form-grid form-grid--2">
      <label className="field">
        <span className="field__label">
          Type<span className="req">*</span>
        </span>
        <select
          className="select"
          value={adjustment.type}
          onChange={(event) => setAdjustment((current) => ({ ...current, type: event.target.value }))}
        >
          <option value="Add">Add</option>
          <option value="Deduct">Deduct</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">
          Amount<span className="req">*</span>
        </span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          className="input"
          value={adjustment.amount}
          onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))}
        />
      </label>
      <label className="field">
        <span className="field__label">
          Reason<span className="req">*</span>
        </span>
        <input
          className="input"
          value={adjustment.reason}
          onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={adjustment.affectsPaidTotal}
          onChange={(event) =>
            setAdjustment((current) => ({ ...current, affectsPaidTotal: event.target.checked }))
          }
        />
        <span>Include in the paid total</span>
      </label>
    </div>
  </Modal>
);

export default ClaimDetailPage;








