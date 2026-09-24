/**
 * Display formatters.
 * Money is rounded for display only - every financial total shown in the UI
 * comes from the backend, never from client side arithmetic.
 */

export const formatMoney = (value, { currency = 'USD', symbol } = {}) => {
  const amount = Number(value || 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  if (symbol) {
    return `${symbol}${safe.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Plain number with thousands separators (no currency symbol). */
export const formatNumber = (value, digits = 2) => {
  const amount = Number(value || 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const formatPercent = (value) => `${formatNumber(value, 1)}%`;

export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)}, ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

/** ISO date (yyyy-mm-dd) for <input type="date"> values. */
export const toInputDate = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/** yyyy-mm for month inputs / budget periods. */
export const toInputMonth = (value = new Date()) => toInputDate(value).slice(0, 7);

export const currentMonth = () => toInputMonth(new Date());
export const currentYear = () => String(new Date().getFullYear());

export const monthLabel = (period) => {
  if (!period) return '—';
  const match = /^(\d{4})-(\d{2})$/.exec(String(period));
  if (!match) return String(period);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

export const relativeTime = (value) => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour(s) ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day(s) ago`;
  return formatDate(value);
};

export const initials = (name = '') =>
  String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

/** Map any status string to a badge tone. */
export const statusTone = (status) => {
  switch (String(status)) {
    case 'Paid':
    case 'Approved':
    case 'Active':
      return 'success';
    case 'Submitted':
    case 'Pending':
    case 'Partially Approved':
      return 'info';
    case 'Draft':
    case 'Returned':
    case 'Partially Paid':
      return 'warning';
    case 'Rejected':
    case 'Overdue':
    case 'Exceeded':
      return 'danger';
    default:
      return 'muted';
  }
};

export const isOverdue = (claim) =>
  claim?.status === 'Submitted' && claim?.dueAt && new Date(claim.dueAt).getTime() < Date.now();

export const truncate = (text, length = 60) => {
  const value = String(text || '');
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};
