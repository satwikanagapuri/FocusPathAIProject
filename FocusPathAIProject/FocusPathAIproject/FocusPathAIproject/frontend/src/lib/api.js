import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";

const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

export const api = axios.create({
  baseURL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function apiGet(path, params) {
  const { data } = await api.get(path, { params });
  return data;
}

export async function apiPost(path, body) {
  const { data } = await api.post(path, body);
  return data;
}

export async function apiPut(path, body) {
  const { data } = await api.put(path, body);
  return data;
}

export async function apiPatch(path, body) {
  const { data } = await api.patch(path, body);
  return data;
}

export async function apiDelete(path) {
  const { data } = await api.delete(path);
  return data;
}

