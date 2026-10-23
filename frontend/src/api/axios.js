import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/",
  headers: { "Content-Type": "application/json" },
});

let refreshing = false;
let waiters = [];

const flush = (token) => {
  waiters.forEach(({ resolve, reject }) => token ? resolve(token) : reject(new Error("refresh failed")));
  waiters = [];
};

const isAuthUrl = (url) => {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].replace(/^\/+|\/+$/g, "");
  return cleanUrl === "login" || cleanUrl === "refresh" || cleanUrl === "api/login" || cleanUrl === "api/refresh";
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token && !isAuthUrl(config.url)) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry || isAuthUrl(original?.url)) {
      return Promise.reject(error);
    }
    const refresh = localStorage.getItem("refresh");
    if (!refresh) return Promise.reject(error);
    original._retry = true;
    if (refreshing) {
      return new Promise((resolve, reject) => waiters.push({ resolve, reject })).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }
    refreshing = true;
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/"}refresh/`, { refresh });
      const token = response.data.access;
      localStorage.setItem("access", token);
      flush(token);
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      flush(null);
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      refreshing = false;
    }
  }
);

export default api;
