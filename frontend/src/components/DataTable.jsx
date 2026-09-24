import React from 'react';
import { LoadingState, EmptyState, ErrorState } from './StateViews';

/**
 * Server driven table.
 *
 * Columns: { key, label, sortable, render(row), numeric, className }
 * Sorting and paging are executed by the API - the component only reports
 * the user's intent back to the page.
 */
const DataTable = ({
  columns = [],
  rows = [],
  loading = false,
  error = null,
  onRetry,
  emptyProps,
  sortState = { field: null, direction: null },
  onSort,
  rowKey = (row) => row._id || row.id,
  onRowClick,
  compact = false,
}) => {
  if (loading) return <LoadingState label="Loading records…" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState {...emptyProps} />;

  return (
    <div className="table-wrap">
      <table className={`table${compact ? ' table--compact' : ''}`}>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sortState.field === column.key;
              return (
                <th key={column.key} className={column.numeric ? 'numeric' : undefined}>
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      className="table__sort"
                      onClick={() => onSort(column.key)}
                      title={`Sort by ${column.label}`}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {isSorted ? (sortState.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? 'numeric' : column.className}>
                  {column.render ? column.render(row) : row[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Pagination controls bound to the API meta payload. */
export const Pagination = ({ meta, onPage, onLimit }) => {
  if (!meta) return null;
  const { page = 1, limit = 10, total = 0, totalPages = 1 } = meta;

  return (
    <div className="pagination">
      <span>
        Showing {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <div className="pagination__buttons">
        {onLimit ? (
          <select
            className="select"
            style={{ width: 'auto' }}
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="nowrap">
          Page {page} of {totalPages || 1}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= (totalPages || 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default DataTable;
