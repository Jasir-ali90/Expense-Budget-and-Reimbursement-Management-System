import api, { UPLOADS_BASE_URL, downloadCsv, downloadFile } from './client';

/**
 * Every REST call the UI makes, grouped by feature.
 * Keeping them here means pages never build URLs or unwrap envelopes by hand.
 */

/** Unwrap the standard { success, data, meta } envelope. */
const unwrap = (response) => response.data?.data ?? null;

/** Query params: drop empty values so the API receives only real filters. */
export const cleanParams = (params = {}) => {
  const output = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    output[key] = value;
  });
  return output;
};

export const buildFileUrl = (fileOrPath) => {
  if (!fileOrPath) return null;
  const value = typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.url || fileOrPath.fileName;
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${UPLOADS_BASE_URL}/${String(value).replace(/^\/+/, '')}`;
};

/** Read the paginated payload shape used by every list endpoint. */
const unwrapList = (response) => ({
  items: response.data?.data || [],
  meta: response.data?.meta,
});

/* ------------------------------------------------------------------ auth -- */
export const authApi = {
  login: async (payload) => unwrap(await api.post('/auth/login', payload)),
  me: async () => unwrap(await api.get('/auth/me')),
  logout: async () => unwrap(await api.post('/auth/logout')),
  changePassword: async (payload) => unwrap(await api.post('/auth/change-password', payload)),
};

/* ----------------------------------------------------------------- users -- */
export const userApi = {
  list: async (params) => unwrapList(await api.get('/users', { params: cleanParams(params) })),
  get: async (id) => unwrap(await api.get(`/users/${id}`)),
  create: async (payload) => unwrap(await api.post('/users', payload)),
  update: async (id, payload) => unwrap(await api.put(`/users/${id}`, payload)),
  setStatus: async (id, payload) => unwrap(await api.patch(`/users/${id}/status`, payload)),
  resetPassword: async (id, payload) => unwrap(await api.post(`/users/${id}/reset-password`, payload)),
  /** Self-service profile picture - available to every signed in role. */
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(response);
  },
  removeAvatar: async () => unwrap(await api.delete('/users/me/avatar')),
};

/* ----------------------------------------------------------- departments -- */
export const departmentApi = {
  list: async (params) => unwrapList(await api.get('/departments', { params: cleanParams(params) })),
  create: async (payload) => unwrap(await api.post('/departments', payload)),
  update: async (id, payload) => unwrap(await api.put(`/departments/${id}`, payload)),
  archive: async (id, payload) => unwrap(await api.patch(`/departments/${id}/archive`, payload)),
  restore: async (id, payload) => unwrap(await api.patch(`/departments/${id}/restore`, payload)),
};

/* ------------------------------------------------------------ categories -- */
export const categoryApi = {
  list: async (params) => unwrapList(await api.get('/categories', { params: cleanParams(params) })),
  create: async (payload) => unwrap(await api.post('/categories', payload)),
  update: async (id, payload) => unwrap(await api.put(`/categories/${id}`, payload)),
  archive: async (id, payload) => unwrap(await api.patch(`/categories/${id}/archive`, payload)),
  restore: async (id, payload) => unwrap(await api.patch(`/categories/${id}/restore`, payload)),
};

/* --------------------------------------------------------------- budgets -- */
export const budgetApi = {
  list: async (params) => unwrapList(await api.get('/budgets', { params: cleanParams(params) })),
  get: async (id) => unwrap(await api.get(`/budgets/${id}`)),
  create: async (payload) => unwrap(await api.post('/budgets', payload)),
  revise: async (id, payload) => unwrap(await api.post(`/budgets/${id}/revise`, payload)),
  remove: async (id) => unwrap(await api.delete(`/budgets/${id}`)),
};

/* ----------------------------------------------------- dashboard/settings -- */
export const dashboardApi = {
  get: async (params) => unwrap(await api.get('/dashboard', { params: cleanParams(params) })),
};

export const settingApi = {
  get: async () => unwrap(await api.get('/settings')),
  update: async (payload) => unwrap(await api.put('/settings', payload)),
};

/* -------------------------------------------------------------- expenses -- */
export const expenseApi = {
  list: async (params) => unwrapList(await api.get('/expenses', { params: cleanParams(params) })),
  get: async (id) => unwrap(await api.get(`/expenses/${id}`)),
  create: async (payload) => unwrap(await api.post('/expenses', payload)),
  update: async (id, payload) => unwrap(await api.put(`/expenses/${id}`, payload)),
  submit: async (id) => unwrap(await api.post(`/expenses/${id}/submit`)),
  approve: async (id, payload) => unwrap(await api.post(`/expenses/${id}/approve`, payload || {})),
  reject: async (id, payload) => unwrap(await api.post(`/expenses/${id}/reject`, payload)),
  pay: async (id, payload) => unwrap(await api.post(`/expenses/${id}/pay`, payload)),
  adjust: async (id, payload) => unwrap(await api.post(`/expenses/${id}/adjustments`, payload)),
  remove: async (id) => unwrap(await api.delete(`/expenses/${id}`)),
  uploadReceipt: async (id, file) => {
    const formData = new FormData();
    formData.append('receipt', file);
    const response = await api.post(`/expenses/${id}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(response);
  },
  /** Export every expense matching the active filters (not just the page). */
  exportCsv: async (params) => downloadFile('/expenses', params, 'expenses.csv', 'csv'),
  /** Branded, printable PDF of the same filtered result set. */
  exportPdf: async (params) => downloadFile('/expenses', params, 'expenses.pdf', 'pdf'),
};

/* ---------------------------------------------------------------- claims -- */
export const claimApi = {
  list: async (params) => unwrapList(await api.get('/claims', { params: cleanParams(params) })),
  get: async (id) => unwrap(await api.get(`/claims/${id}`)),
  create: async (payload) => unwrap(await api.post('/claims', payload)),
  update: async (id, payload) => unwrap(await api.put(`/claims/${id}`, payload)),
  remove: async (id) => unwrap(await api.delete(`/claims/${id}`)),
  submit: async (id) => unwrap(await api.post(`/claims/${id}/submit`)),
  approve: async (id, payload) => unwrap(await api.post(`/claims/${id}/approve`, payload || {})),
  reject: async (id, payload) => unwrap(await api.post(`/claims/${id}/reject`, payload)),
  returnForCorrection: async (id, payload) => unwrap(await api.post(`/claims/${id}/return`, payload)),
  requestReceipt: async (id, payload) => unwrap(await api.post(`/claims/${id}/request-receipt`, payload)),
  reassign: async (id, payload) => unwrap(await api.post(`/claims/${id}/reassign`, payload)),
  pay: async (id, payload) => unwrap(await api.post(`/claims/${id}/payments`, payload)),
  adjust: async (id, payload) => unwrap(await api.post(`/claims/${id}/adjustments`, payload)),
  financeManagers: async () => unwrap(await api.get('/claims/finance-managers')),
  uploadItemReceipt: async (id, itemId, file) => {
    const formData = new FormData();
    formData.append('receipt', file);
    const response = await api.post(`/claims/${id}/items/${itemId}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(response);
  },
};

/* --------------------------------------------------------- notifications -- */
export const notificationApi = {
  list: async (params) => unwrapList(await api.get('/notifications', { params: cleanParams(params) })),
  unreadCount: async () => unwrap(await api.get('/notifications/unread-count')),
  markRead: async (id) => unwrap(await api.patch(`/notifications/${id}/read`)),
  markAllRead: async () => unwrap(await api.patch('/notifications/read-all')),
  remove: async (id) => unwrap(await api.delete(`/notifications/${id}`)),
};

/* ------------------------------------------------------------ audit logs -- */
export const auditApi = {
  list: async (params) => unwrapList(await api.get('/audit-logs', { params: cleanParams(params) })),
  entityHistory: async (entityType, entityId) =>
    unwrap(await api.get(`/audit-logs/entity/${entityType}/${entityId}`)),
  exportCsv: async (params) => downloadCsv('/audit-logs/export', params, 'audit-log.csv'),
  exportPdf: async (params) => downloadFile('/audit-logs/export', params, 'audit-log.pdf', 'pdf'),
};

/* --------------------------------------------------------------- reports -- */
export const reportApi = {
  get: async (type, params) => unwrap(await api.get(`/reports/${type}`, { params: cleanParams(params) })),
  /** Download the filtered report as CSV (spreadsheet friendly). */
  exportCsv: async (type, params) => downloadFile(`/reports/${type}`, params, `${type}.csv`, 'csv'),
  /** Download the filtered report as a branded PDF. */
  exportPdf: async (type, params) => downloadFile(`/reports/${type}`, params, `${type}.pdf`, 'pdf'),
};

export { api };

