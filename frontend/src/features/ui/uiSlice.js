import { createSlice, nanoid } from '@reduxjs/toolkit';

/**
 * Cross cutting UI state: the toast queue shown after every action.
 * Success / error / warning feedback for the whole app funnels through here.
 */

const initialState = {
  toasts: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);
        // Keep the stack short so the screen never fills with old messages.
        if (state.toasts.length > 4) state.toasts.shift();
      },
      prepare({ title, message, tone = 'success' }) {
        return { payload: { id: nanoid(), title: title || '', message: message || '', tone } };
      },
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
    clearToasts(state) {
      state.toasts = [];
    },
  },
});

export const { pushToast, dismissToast, clearToasts } = uiSlice.actions;

export const selectToasts = (state) => state.ui.toasts;

export default uiSlice.reducer;
