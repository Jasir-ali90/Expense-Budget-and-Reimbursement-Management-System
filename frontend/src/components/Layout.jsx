import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { selectUser, logout } from '../features/auth/authSlice';
import { fetchUnreadCount, selectUnread } from '../features/notifications/notificationsSlice';
import Avatar from './Avatar';

/**
 * Authenticated application shell: sidebar navigation (filtered by role),
 * topbar with the notification badge and the signed in user chip.
 */

const NAV = [
  { to: '/dashboard', label: 'Dashboard', roles: ['Admin', 'Finance Manager', 'Employee'] },
  { to: '/claims', label: 'My Claims', roles: ['Employee'] },
  { to: '/claims/new', label: 'New Claim', roles: ['Employee'] },
  { to: '/claims', label: 'Claims', roles: ['Admin', 'Finance Manager'] },
  { to: '/approvals', label: 'Approvals', roles: ['Admin', 'Finance Manager'] },
  { to: '/payments', label: 'Payments', roles: ['Admin', 'Finance Manager'] },
  { to: '/expenses', label: 'Expenses', roles: ['Admin', 'Finance Manager'] },
  { to: '/budgets', label: 'Budgets', roles: ['Admin', 'Finance Manager'] },
  { to: '/reports', label: 'Reports', roles: ['Admin', 'Finance Manager'] },
  { section: 'Administration', roles: ['Admin'] },
  { to: '/admin/users', label: 'Users', roles: ['Admin'] },
  { to: '/admin/departments', label: 'Departments', roles: ['Admin'] },
  { to: '/admin/categories', label: 'Categories', roles: ['Admin'] },
  { to: '/admin/audit-logs', label: 'Audit Log', roles: ['Admin', 'Finance Manager'] },
  { to: '/admin/settings', label: 'Settings', roles: ['Admin'] },
  { section: 'Account', roles: ['Admin', 'Finance Manager', 'Employee'] },
  { to: '/notifications', label: 'Notifications', roles: ['Admin', 'Finance Manager', 'Employee'] },
  { to: '/profile', label: 'Profile', roles: ['Admin', 'Finance Manager', 'Employee'] },
];

const Layout = ({ children, title }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const unread = useSelector(selectUnread);
  const role = user?.role;

  // Poll the unread notification count so the badge stays fresh.
  useEffect(() => {
    dispatch(fetchUnreadCount());
    const timer = setInterval(() => dispatch(fetchUnreadCount()), 60000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <strong>Expense &amp; Budget Manager</strong>
          <span>Local demo build</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.filter((item) => item.roles.includes(role)).map((item) =>
            item.section ? (
              <div className="sidebar__section" key={item.section}>
                {item.section}
              </div>
            ) : (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                end={item.to === '/claims'}
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar__footer">
          Signed in as
          <br />
          <strong>{user?.name}</strong>
          <br />
          {role}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__title">{title}</div>
          <div className="topbar__right">
            <Link to="/notifications" className="inline" title="Notifications">
              Notifications
              {unread > 0 ? <span className="badge badge--danger">{unread}</span> : null}
            </Link>
            <Link to="/profile" className="user-chip" title="Profile">
              <Avatar user={user} size="sm" />
              <span>
                {user?.name}
                <br />
                <span className="small muted">{role}</span>
              </span>
            </Link>
            <button type="button" className="btn btn--secondary btn--sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
