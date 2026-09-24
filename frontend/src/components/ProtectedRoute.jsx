import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { loadCurrentUser, logout, selectAuth } from '../features/auth/authSlice';
import { LoadingState } from './StateViews';

/**
 * Route guard.
 *
 * - Waits for the stored token to be verified before rendering anything.
 * - Redirects anonymous users to /login (keeping the requested location).
 * - Blocks roles that are not allowed on a route.
 * - Reacts to the global `auth:unauthorized` event emitted by the API client
 *   whenever the backend rejects an expired token.
 */
const ProtectedRoute = ({ roles, children }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { status, user } = useSelector(selectAuth);

  useEffect(() => {
    if (status === 'loading') {
      dispatch(loadCurrentUser());
    }
  }, [status, dispatch]);

  useEffect(() => {
    const onUnauthorized = () => dispatch(logout());
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [dispatch]);

  if (status === 'loading') {
    return (
      <div className="content">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="content">
        <div className="state state--error">
          <div className="state__title">Access denied</div>
          <div className="small">
            Your role ({user.role}) is not allowed to open this page.
          </div>
          <div className="mt-1">
            <a className="btn btn--secondary btn--sm" href="/dashboard">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
