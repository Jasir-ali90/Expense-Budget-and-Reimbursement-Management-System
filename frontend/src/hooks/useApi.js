import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Small data-fetching hooks.
 *
 * Redux Toolkit owns the session (auth), the toast queue and the notification
 * badge; page level data (lists, dashboards, reports) is fetched with these
 * hooks so each screen owns its own loading / empty / error state.
 */

/**
 * Run an async fetcher and expose loading/error/data + a manual reload.
 * Responses from a stale run are ignored so rapid filter changes cannot
 * overwrite fresh data.
 */
export const useApiQuery = (fetcher, deps = [], { immediate = true } = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const runIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (runIdRef.current === runId) {
        setData(result);
        return result;
      }
      return null;
    } catch (caught) {
      if (runIdRef.current === runId) {
        setError(caught);
      }
      return null;
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!immediate) return undefined;
    load();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: load, setData };
};

/** Debounce a fast changing value (search boxes). */
export const useDebouncedValue = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

/** Stable list state for server side search / filter / sort / pagination. */
export const useListState = (initial = {}) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initial.limit || 10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState(initial.sort || '');
  const [filters, setFilters] = useState(initial.filters || {});

  const debouncedSearch = useDebouncedValue(searchInput, 350);

  useEffect(() => {
    setSearch(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  const updateFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initial.filters || {});
    setSearchInput('');
    setSearch('');
    setPage(1);
  }, [initial.filters]);

  const toggleSort = useCallback(
    (field) => {
      setSort((current) => {
        const [currentField, direction] = String(current).split(':');
        if (currentField === field) {
          return `${field}:${direction === 'asc' ? 'desc' : 'asc'}`;
        }
        return `${field}:desc`;
      });
      setPage(1);
    },
    [],
  );

  const sortState = useMemo(() => {
    const [field, direction] = String(sort).split(':');
    return { field: field || null, direction: direction || null };
  }, [sort]);

  const query = useMemo(
    () => ({ page, limit, search: search || undefined, sort: sort || undefined, ...filters }),
    [page, limit, search, sort, filters],
  );

  return {
    page,
    setPage,
    limit,
    setLimit,
    searchInput,
    setSearchInput,
    sort,
    sortState,
    toggleSort,
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    query,
  };
};
