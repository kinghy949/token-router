import type { AdminStats, AdminUserDetail, PagedUsers, RedeemCodeItem, UsageLogItem } from '../types';

export const TOKEN_KEY = 'token_router_admin_token';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  token?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function login(email: string, password: string): Promise<string> {
  const result = await request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return result.access_token;
}

export function listUsers(token: string, page: number, pageSize: number, q: string) {
  return request<PagedUsers>('/admin/users', {
    token,
    query: { page, pageSize, q: q || undefined },
  });
}

export function getUserDetail(token: string, userId: string) {
  return request<AdminUserDetail>(`/admin/users/${userId}`, { token });
}

export function updateUser(
  token: string,
  userId: string,
  payload: { isActive?: boolean; isAdmin?: boolean },
) {
  return request<AdminUserDetail>(`/admin/users/${userId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export function adjustUserBalance(
  token: string,
  userId: string,
  payload: { amount: number; description?: string },
) {
  return request<{ userId: string; amount: number; balance: number }>(
    `/admin/users/${userId}/balance`,
    {
      method: 'PATCH',
      token,
      body: payload,
    },
  );
}

export function getStats(token: string) {
  return request<AdminStats>('/admin/stats', { token });
}

export function createRedeemCodes(
  token: string,
  payload: { tokenAmount: number; count: number; expiresAt?: string },
) {
  return request<{ items: RedeemCodeItem[] }>('/admin/redeem-codes', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function listRedeemCodes(
  token: string,
  page: number,
  pageSize: number,
  used: 'all' | 'true' | 'false',
) {
  return request<{ page: number; pageSize: number; total: number; items: RedeemCodeItem[] }>(
    '/admin/redeem-codes',
    {
      token,
      query: {
        page,
        pageSize,
        used: used === 'all' ? undefined : used,
      },
    },
  );
}

export function listUsageLogs(
  token: string,
  page: number,
  pageSize: number,
  model: string,
) {
  return request<{ page: number; pageSize: number; total: number; items: UsageLogItem[] }>(
    '/admin/usage-logs',
    {
      token,
      query: {
        page,
        pageSize,
        model: model || undefined,
      },
    },
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = withQuery(`${API_BASE}${path}`, options.query);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = tryParseJson(text);

  if (!response.ok) {
    const message =
      getErrorMessage(payload) || (text.trim().length > 0 ? text.trim() : `请求失败(${response.status})`);
    throw new ApiError(message, response.status);
  }

  if (payload === null) {
    throw new ApiError('服务器返回了无效 JSON', response.status);
  }

  return payload as T;
}

function withQuery(path: string, query: Record<string, string | number | undefined> | undefined) {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      params.set(key, `${value}`);
    }
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  const nested = payload.error;
  if (nested && typeof nested === 'object') {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  const message = payload.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return null;
}
