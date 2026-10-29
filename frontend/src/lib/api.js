import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL|| 'https://haven-pg-management-backend.onrender.com/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let csrfToken;
api.interceptors.request.use(async (config) => {
  if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    if (!csrfToken) {
      const response = await api.get('/auth/csrf');
      csrfToken = response.data.data.csrfToken;
    }
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

export function getErrorMessage(error) {
  const body = error.response?.data;
  const message = body?.error?.message || 'Something went wrong. Please try again.';
  return body?.requestId ? `${message} (Reference: ${body.requestId})` : message;
}
