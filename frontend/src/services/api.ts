const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export function accessToken() {
  return localStorage.getItem('melihik_access_token');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = accessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Request failed');
  return body as ApiResponse<T>;
}
