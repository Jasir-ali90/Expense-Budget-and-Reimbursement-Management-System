import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { notificationApi } from '../../api';

/**
 * Notification badge state.
 * The header polls the unread count so users see budget warnings, claim
 * decisions and account changes without reloading the page.
 */

export const fetchUnreadCount = createAsyncThunk('notifications/unreadCount', async () => {
  const data = await notificationApi.unreadCount();
  return data?.unread || 0;
});

const initialState = {
  unread: 0,
  loading: false,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setUnread(state, action) {
      state.unread = Math.max(0, Number(action.payload) || 0);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnreadCount.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.loading = false;
        state.unread = action.payload;
      })
      .addCase(fetchUnreadCount.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { setUnread } = notificationSlice.actions;

export const selectUnread = (state) => state.notifications.unread;

export default notificationSlice.reducer;
