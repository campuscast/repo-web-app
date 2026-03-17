import { env } from '@/lib/env';
import { getCsrfTokenFromCookie } from '@/auth/csrf';
import { refreshAccessToken } from '@/services/auth-service';

type ApiSchema<T> = {
  parse: (data: unknown) => T;
};

type RequestOptions<T> = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema?: ApiSchema<T>;
  auth?: boolean;
  skipRefresh?: boolean;
  signal?: AbortSignal;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export class ApiError extends Error {
  readonly status: number;
  readonly payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function parseErrorPayload(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request<T>(options: RequestOptions<T>): Promise<T> {
  const {
    path,
    method = 'GET',
    body,
    schema,
    auth = true,
    skipRefresh = false,
    signal
  } = options;

  const csrfToken = method !== 'GET' ? getCsrfTokenFromCookie() : null;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(`${env.apiPrefix}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutController.signal
    });
  } catch (error) {
    if (timeoutController.signal.aborted) {
      if (signal?.aborted) {
        throw new ApiError(499, 'Request was cancelled');
      }
      throw new ApiError(408, `Request timeout after ${DEFAULT_REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return request<T>({ ...options, skipRefresh: true });
    }
  }

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `Request failed with status ${response.status}`;

    throw new ApiError(response.status, message, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();
  if (schema) {
    return schema.parse(data);
  }

  return data as T;
}

export const apiClient = {
  request,
  get: <T>(path: string, schema?: ApiSchema<T>) => request<T>({ path, schema }),
  post: <T>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request<T>({ path, method: 'POST', body, schema }),
  put: <T>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request<T>({ path, method: 'PUT', body, schema }),
  patch: <T>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request<T>({ path, method: 'PATCH', body, schema }),
  delete: <T>(path: string, body?: unknown, schema?: ApiSchema<T>) =>
    request<T>({ path, method: 'DELETE', body, schema })
};
