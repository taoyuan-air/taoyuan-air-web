const API_BASE = '/api';

async function apiFetch(path: string, options: RequestInit = {}, isFormData = false): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: isFormData
      ? { ...options.headers }
      : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshRes.ok) {
      return apiFetch(path, options, isFormData);
    }
  }
  return res;
}

export const authApi = {
  register: (data: unknown) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: unknown) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/auth/me'),
  updateSecurity: (data: unknown) =>
    apiFetch('/users/me/security', { method: 'PATCH', body: JSON.stringify(data) }),
  updateHealth: (data: unknown) =>
    apiFetch('/users/me/health', { method: 'PATCH', body: JSON.stringify(data) }),
  updateNotifications: (data: unknown) =>
    apiFetch('/users/me/notifications', { method: 'PATCH', body: JSON.stringify(data) }),
  updateProfile: (data: unknown) =>
    apiFetch('/users/me/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadAvatar: (form: FormData) =>
    apiFetch('/users/me/avatar', { method: 'POST', body: form }, true),
  deleteAccount: () =>
    apiFetch('/users/me', { method: 'DELETE' }),
};
