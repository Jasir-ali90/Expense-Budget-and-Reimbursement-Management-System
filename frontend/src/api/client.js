import axios from 'axios';

/**
 * Centralised API client.
 *
 * - Reads the API base URL from the environment (see .env.example).
 * - Attaches the JWT to every request.
 * - Normalises every failure into an Error carrying `status`, `message` and
 *   optional `details`, so pages never have to inspect axios internals.
 * - Broadcasts an `auth:unauthorized` event when the token expires so the
 *   auth slice can log the user out and the router can redirect to /login.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const UPLOADS_BASE_URL =
  import.meta.env.VITE_UPLOADS_BASE_URL || 'http://localhost:5000';

export const TOKEN_STORAGE_KEY = 'ebrms.token';

export const getStoredToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

export const setStoredToken = (token) => {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage can be unavailable in private mode - the app still works */
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Build a clean, displayable error from any axios failure. */
export const normaliseError = (error) => {
  if (error?.isAppError) return error;

  const normalised = new Error('Something went wrong. Please try again.');
  normalised.isAppError = true;

  if (error?.code === 'ECONNABORTED') {
    normalised.message = 'The request timed out. Please try again.';
    normalised.status = 0;
    return normalised;
  }

  if (!error?.response) {
    normalised.message =
      'Cannot reach the API server. Make sure the backend is running on port 5000.';
    normalised.status = 0;
    return normalised;
  }

  const { status, data } = error.response;
  normalised.status = status;
  normalised.details = data?.details;

  if (data?.message) {
    normalised.message = data.message;
  } else if (status === 403) {
    normalised.message = 'You do not have permission to perform this action.';
  } else if (status === 404) {
    normalised.message = 'The requested record was not found.';
  } else if (status >= 500) {
    normalised.message = 'The server encountered an error. Please try again.';
  }

  return normalised;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalised = normaliseError(error);

    // Expired / invalid token: drop it and let the app redirect to login.
    if (normalised.status === 401 && !String(error?.config?.url || '').includes('/auth/login')) {
      setStoredToken(null);
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    return Promise.reject(normalised);
  },
);

/**
 * Download a generated file (CSV or PDF) through the authenticated axios client.
 *
 * A plain <a href> link cannot be used because every API route expects the JWT
 * in the Authorization header. The blob is turned into a temporary object URL,
 * clicked programmatically and released straight away.
 */
export const downloadFile = async (url, params = {}, fallbackName = 'export.csv', format = 'csv') => {
  const response = await api.get(url, {
    params: { ...params, format },
    responseType: 'blob',
  });

  const disposition = response.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = match ? match[1] : fallbackName;

  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);

  return fileName;
};

/** Spreadsheet export helper (kept for the existing CSV buttons). */
export const downloadCsv = (url, params = {}, fallbackName = 'export.csv') =>
  downloadFile(url, params, fallbackName, 'csv');

export default api;
