import React from 'react';
import { formatMoney, formatPercent } from '../utils/format';

/** KPI card used across the dashboards and report summaries. */
export const StatCard = ({ label, value, hint, tone, isMoney = true, currency, symbol }) => (
  <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
    <div className="stat__label">{label}</div>
    <div className="stat__value">
      {isMoney ? formatMoney(value, { currency, symbol }) : value}
    </div>
    {hint ? <div className="stat__hint">{hint}</div> : null}
  </div>
);

/** Allocated vs used/committed progress bar for a budget row. */
export const BudgetBar = ({ usage }) => {
  if (!usage) return null;
  const committedPercent = Math.min(100, usage.usedPercent + usage.committedPercent);
  const className = usage.isExceeded
    ? 'budget-bar__fill--danger'
    : usage.isWarning
      ? 'budget-bar__fill--warning'
      : '';

  return (
    <div>
      <div className="budget-bar" title={`${formatPercent(usage.usagePercent)} of allocation used`}>
        <div className="budget-bar__fill" style={{ width: `${Math.min(100, usage.usedPercent)}%` }} />
        <div
          className={`budget-bar__fill ${className}`}
          style={{
            width: `${Math.max(0, committedPercent - Math.min(100, usage.usedPercent))}%`,
            marginTop: '-9px',
            opacity: 0.55,
          }}
        />
      </div>
      <div className="small muted mt-1">
        {formatPercent(usage.usagePercent)} used (incl. committed)
      </div>
    </div>
  );
};

/** Dependency free monthly bar chart (two series: direct vs reimbursements). */
export const BarChart = ({ data = [], series = [], valueKey = 'total', labelKey = 'month' }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(
    ...data.map((row) => {
      if (series.length === 0) return Number(row[valueKey]) || 0;
      return series.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0);
    }),
    1,
  );

  return (
    <div>
      <div className="chart">
        {data.map((row) => (
          <div key={row[labelKey] || row.period} className="chart__col">
            <div className="chart__value">
              {formatMoney(Number(row[valueKey]) || 0, { symbol: '' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: '100%' }}>
              {(series.length > 0 ? series : [{ key: valueKey }]).map((item, index) => {
                const value = Number(row[item.key]) || 0;
                const height = Math.max(3, Math.round((value / max) * 130));
                return (
                  <div
                    key={item.key}
                    className={`chart__bar${index > 0 ? ' chart__bar--alt' : ''}`}
                    style={{ height: `${height}px`, maxWidth: series.length > 1 ? '24px' : '46px' }}
                    title={`${item.label || item.key}: ${formatMoney(value)}`}
                  />
                );
              })}
            </div>
            <div className="chart__label">{String(row[labelKey] || row.period).slice(0, 12)}</div>
          </div>
        ))}
      </div>
      {series.length > 0 ? (
        <div className="inline mt-1 small muted">
          {series.map((item, index) => (
            <span key={item.key} className="inline">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: index > 0 ? 'var(--color-accent)' : 'var(--color-primary)',
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** Simple horizontal ranking list (top categories / vendors). */
export const RankList = ({ rows = [], labelKey = 'name', valueKey = 'total', emptyLabel = 'No data' }) => {
  if (rows.length === 0) return <div className="small muted">{emptyLabel}</div>;
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="stack">
      {rows.map((row) => (
        <div key={row[labelKey]}>
          <div className="inline">
            <span>{row[labelKey] || '—'}</span>
            <span className="spacer" />
            <strong>{formatMoney(row[valueKey])}</strong>
          </div>
          <div className="budget-bar mt-1">
            <div
              className="budget-bar__fill"
              style={{ width: `${Math.round(((Number(row[valueKey]) || 0) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatCard;
