import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.DEV 
    ? 'http://localhost:5000/api' 
    : 'https://jeans-api.onrender.com/api',
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error;

    if (status === 401 || (status === 403 && message === 'Invalid or expired token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
