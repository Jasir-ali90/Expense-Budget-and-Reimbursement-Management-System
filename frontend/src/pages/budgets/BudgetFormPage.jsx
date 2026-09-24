import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { budgetApi } from '../../api';
import { useApiQuery } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import { InlineAlert, LoadingState } from '../../components/StateViews';
import { formatDateTime, formatMoney, formatPercent } from '../../utils/format';

const BudgetFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ allocatedAmount: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const budgetQuery = useApiQuery(() => budgetApi.get(id), [id], { immediate: isEdit });
  const budget = budgetQuery.data?.budget;

  useEffect(() => {
    if (budget) {
      setForm({
        allocatedAmount: String(budget.usage?.allocated || budget.allocatedAmount || ''),
        reason: '',
      });
    }
  }, [budget]);

  if (isEdit && budgetQuery.loading) return <LoadingState label="Loading budget…" />;
  if (isEdit && budgetQuery.error)
    return <InlineAlert tone="error">{budgetQuery.error?.message}</InlineAlert>;
  if (isEdit && !budget) return <InlineAlert tone="error">Budget not found.</InlineAlert>;

  const save = async () => {
    const next = {};
    const amount = Number(form.allocatedAmount);
    if (!Number.isFinite(amount) || amount < 0) next.allocatedAmount = 'Enter a valid amount';
    if (!form.reason.trim()) next.reason = 'A revision reason is mandatory';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await budgetApi.revise(id, { allocatedAmount: amount, reason: form.reason.trim() });
      toast.success('Budget revised', 'The budget has been updated and the change audited.');
      navigate('/budgets');
    } catch (error) {
      toast.error('Could not revise the budget', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Revise budget {budget?.period || ''}</h1>
          <p className="page-header__sub">
            Revising the {budget?.period} budget for{' '}
            {budget?.departmentName || budget?.department?.name || 'a department'}
          </p>
        </div>
        <Link className="btn btn--secondary" to="/budgets">
          Cancel
        </Link>
      </div>

      <div className="grid grid--stats mb-1">
        <div className="stat">
          <div className="stat__label">Department</div>
          <div className="stat__value" style={{ fontSize: '1rem' }}>
            {budget?.departmentName || budget?.department?.name || '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Category</div>
          <div className="stat__value" style={{ fontSize: '1rem' }}>
            {budget?.categoryName || budget?.category?.name || '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Current allocated</div>
          <div className="stat__value">
            {formatMoney(budget?.usage?.allocated || budget?.allocatedAmount)}
          </div>
        </div>
        <div className="stat">
          <div className="stat__label">Used + Committed</div>
          <div className="stat__value">
            {formatMoney((budget?.usage?.used || 0) + (budget?.usage?.committed || 0))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Revise budget</h2>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">
              New allocated amount<span className="req">*</span>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              className={`input${errors.allocatedAmount ? ' input--error' : ''}`}
              value={form.allocatedAmount}
              onChange={(event) =>
                setForm((current) => ({ ...current, allocatedAmount: event.target.value }))
              }
            />
            {errors.allocatedAmount ? (
              <span className="field__error">{errors.allocatedAmount}</span>
            ) : null}
          </label>
          <label className="field">
            <span className="field__label">
              Revision reason<span className="req">*</span>
            </span>
            <input
              className={`input${errors.reason ? ' input--error' : ''}`}
              value={form.reason}
              maxLength={500}
              placeholder="e.g. Additional conference travel approved by Admin"
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            />
            {errors.reason ? <span className="field__error">{errors.reason}</span> : null}
            <span className="field__hint">
              A reason is mandatory and is stored in the budget history and audit trail.
            </span>
          </label>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Revising…' : 'Revise budget'}
          </button>
        </div>
      </div>

      <BudgetHistory budget={budget} />
    </>
  );
};

/**
 * Revision history for one budget.
 * Every entry is written by the backend inside the budget document, so nothing
 * shown here can be edited from the UI.
 */
const BudgetHistory = ({ budget }) => {
  const entries = [...(budget?.history || [])].reverse();

  return (
    <div className="card mt-2">
      <div className="card__header">
        <h2 className="card__title">Revision history</h2>
        <span className="small muted">
          {entries.length} change{entries.length === 1 ? '' : 's'} recorded
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="small muted">
          The allocated amount has not been revised since this budget was created.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>When</th>
                <th>Revised by</th>
                <th className="numeric">Previous</th>
                <th className="numeric">New</th>
                <th className="numeric">Threshold</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id || `${entry.date}-${entry.newAmount}`}>
                  <td>{formatDateTime(entry.date)}</td>
                  <td>{entry.revisedByName || 'Administrator'}</td>
                  <td className="numeric">{formatMoney(entry.previousAmount)}</td>
                  <td className="numeric">{formatMoney(entry.newAmount)}</td>
                  <td className="numeric">
                    {entry.newWarningThresholdPercent
                      ? formatPercent(entry.newWarningThresholdPercent)
                      : '—'}
                  </td>
                  <td>{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BudgetFormPage;
