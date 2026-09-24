import { createSlice } from '@reduxjs/toolkit';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { authApi, userApi } from '../../api';
import { getStoredToken, setStoredToken } from '../../api/client';

/**
 * Session state: the signed in user, the JWT and the auth loading flags.
 * The token is persisted in localStorage so a refresh keeps the session.
 */

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const data = await authApi.login(credentials);
    setStoredToken(data.token);
    return data;
  } catch (error) {
    return rejectWithValue(error.message || 'Unable to sign in');
  }
});

export const loadCurrentUser = createAsyncThunk('auth/loadMe', async (_, { rejectWithValue }) => {
  try {
    return await authApi.me();
  } catch (error) {
    return rejectWithValue(error.message || 'Session expired');
  }
});

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (payload, { rejectWithValue }) => {
    try {
      await authApi.changePassword(payload);
      return true;
    } catch (error) {
      return rejectWithValue(error.message || 'Unable to change the password');
    }
  },
);

/** Profile picture upload / removal (self service for every role). */
export const uploadAvatar = createAsyncThunk(
  'auth/uploadAvatar',
  async (file, { rejectWithValue }) => {
    try {
      return await userApi.uploadAvatar(file);
    } catch (error) {
      return rejectWithValue(error.message || 'Unable to upload the picture');
    }
  },
);

export const removeAvatar = createAsyncThunk('auth/removeAvatar', async (_, { rejectWithValue }) => {
  try {
    return await userApi.removeAvatar();
  } catch (error) {
    return rejectWithValue(error.message || 'Unable to remove the picture');
  }
});

const token = getStoredToken();

const initialState = {
  token,
  user: null,
  /** 'idle' | 'loading' | 'authenticated' | 'anonymous' */
  status: token ? 'loading' : 'anonymous',
  error: null,
  passwordChangeMessage: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      state.status = 'anonymous';
      state.error = null;
      setStoredToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    },
    clearPasswordMessage(state) {
      state.passwordChangeMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'anonymous';
        state.user = null;
        state.token = null;
        setStoredToken(null);
        state.error = action.payload || 'Unable to sign in';
      })
      .addCase(loadCurrentUser.pending, (state) => {
        state.status = state.token ? 'loading' : 'anonymous';
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(loadCurrentUser.rejected, (state) => {
        state.status = 'anonymous';
        state.user = null;
        state.token = null;
        setStoredToken(null);
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.passwordChangeMessage = 'Password changed successfully. Please sign in again.';
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(uploadAvatar.fulfilled, (state, action) => {
        state.user = action.payload?.user || state.user;
      })
      .addCase(removeAvatar.fulfilled, (state, action) => {
        state.user = action.payload?.user || state.user;
      });
  },
});

export const { logout, clearAuthError, clearPasswordMessage } = authSlice.actions;

export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectRole = (state) => state.auth.user?.role || null;
export const selectIsAuthenticated = (state) => state.auth.status === 'authenticated';

export default authSlice.reducer;
