import React from 'react';

/** Loading / empty / error states used by every screen. */

export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="state" role="status" aria-live="polite">
    <div className="spinner" />
    <div>{label}</div>
  </div>
);

export const EmptyState = ({ title = 'Nothing to show yet', message, action }) => (
  <div className="state">
    <div className="state__title">{title}</div>
    {message ? <div className="small">{message}</div> : null}
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);

export const ErrorState = ({ error, onRetry }) => {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || 'Something went wrong while loading this page.';

  return (
    <div className="state state--error" role="alert">
      <div className="state__title">Could not load this section</div>
      <div className="small">{message}</div>
      {onRetry ? (
        <div className="mt-1">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const InlineAlert = ({ tone = 'info', children }) => (
  <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
    {children}
  </div>
);

/**
 * Renders the right state for a screen:
 * loading -> error -> empty -> children.
 */
export const AsyncBoundary = ({
  loading,
  error,
  isEmpty = false,
  emptyProps = {},
  onRetry,
  loadingLabel,
  children,
}) => {
  if (loading) return <LoadingState label={loadingLabel} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState {...emptyProps} />;
  return children;
};
