import React from 'react';
import { statusTone } from '../utils/format';

/** Coloured pill for any status value (Draft, Submitted, Paid, …). */
export const StatusBadge = ({ status, tone }) => {
  const resolved = tone || statusTone(status);
  return <span className={`badge badge--${resolved}`}>{status || '—'}</span>;
};

export const OverdueBadge = ({ show }) =>
  show ? <span className="badge badge--danger">Overdue</span> : null;

export const BudgetStateBadge = ({ usage }) => {
  if (!usage) return <StatusBadge status="No budget" tone="muted" />;
  if (usage.isExceeded) return <StatusBadge status="Exceeded" tone="danger" />;
  if (usage.isWarning) return <StatusBadge status="Warning" tone="warning" />;
  return <StatusBadge status="Within budget" tone="success" />;
};

export const RoleBadge = ({ role }) => {
  const tone = role === 'Admin' ? 'danger' : role === 'Finance Manager' ? 'info' : 'success';
  return <StatusBadge status={role} tone={tone} />;
};

export default StatusBadge;
