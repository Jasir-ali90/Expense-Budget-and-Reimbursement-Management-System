import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import uiReducer from '../features/ui/uiSlice';
import notificationReducer from '../features/notifications/notificationsSlice';

/**
 * Redux Toolkit store.
 *
 * Holds the cross-cutting state every screen needs (session, toasts,
 * notification badge). Page level data is fetched per screen with the
 * useApiQuery hook so lists and dashboards always reflect server state.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    notifications: notificationReducer,
  },
  devTools: import.meta.env.MODE !== 'production',
});

export default store;
