import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { notificationApi } from '../api';
import { fetchUnreadCount } from '../features/notifications/notificationsSlice';
import DataTable, { Pagination } from '../components/DataTable';
import useToast from '../hooks/useToast';
import { useListState } from '../hooks/useApi';
import { relativeTime, truncate } from '../utils/format';

/**
 * Notification centre.
 * Every business event (claim submitted/approved/rejected/returned/paid,
 * receipt requested, budget warning or exceeded, account activation) shows
 * up here for the affected user.
 */
const NotificationsPage = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const list = useListState({ filters: { isRead: '' } });

  const [state, setState] = useState({ items: [], meta: null, loading: true, error: null });

  const load = async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await notificationApi.list(list.query);
      setState({ items: result.items, meta: result.meta, loading: false, error: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.query.page, list.query.limit, list.query.isRead, list.query.search]);

  const markRead = async (notification) => {
    try {
      await notificationApi.markRead(notification._id);
      dispatch(fetchUnreadCount());
      load();
    } catch (error) {
      toast.error('Could not update the notification', error.message);
    }
  };

  const markAll = async () => {
    try {
      const result = await notificationApi.markAllRead();
      toast.success('Notifications updated', result?.message || 'All notifications marked as read.');
      dispatch(fetchUnreadCount());
      load();
    } catch (error) {
      toast.error('Could not update notifications', error.message);
    }
  };

  const dismiss = async (notification) => {
    try {
      await notificationApi.remove(notification._id);
      dispatch(fetchUnreadCount());
      load();
    } catch (error) {
      toast.error('Could not dismiss the notification', error.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p className="page-header__sub">Approval decisions, budget alerts and account changes.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={markAll}>
            Mark all as read
          </button>
          <button type="button" className="btn btn--secondary" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div className="filters mb-1">
          <label className="field">
            <span className="field__label">Search</span>
            <input
              className="input"
              placeholder="Title or message"
              value={list.searchInput}
              onChange={(event) => list.setSearchInput(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Read state</span>
            <select
              className="select"
              value={list.filters.isRead ?? ''}
              onChange={(event) => list.updateFilter('isRead', event.target.value)}
            >
              <option value="">All</option>
              <option value="false">Unread</option>
              <option value="true">Read</option>
            </select>
          </label>
        </div>

        <DataTable
          rows={state.items}
          loading={state.loading}
          error={state.error}
          onRetry={load}
          emptyProps={{ title: 'No notifications', message: 'You are all caught up.' }}
          columns={[
            {
              key: 'title',
              label: 'Notification',
              render: (row) => (
                <div>
                  <strong style={{ opacity: row.isRead ? 0.7 : 1 }}>{row.title}</strong>
                  <div className="small muted">{truncate(row.message, 110)}</div>
                </div>
              ),
            },
            { key: 'type', label: 'Type' },
            { key: 'createdAt', label: 'When', render: (row) => relativeTime(row.createdAt) },
            {
              key: 'state',
              label: 'State',
              render: (row) =>
                row.isRead ? <span className="badge badge--muted">Read</span> : <span className="badge badge--info">Unread</span>,
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="table__actions">
                  {row.link ? (
                    <Link className="btn btn--secondary btn--sm" to={row.link}>
                      Open
                    </Link>
                  ) : null}
                  {!row.isRead ? (
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => markRead(row)}>
                      Mark read
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => dismiss(row)}>
                    Dismiss
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination meta={state.meta} onPage={list.setPage} onLimit={list.setLimit} />
      </div>
    </>
  );
};

export default NotificationsPage;
