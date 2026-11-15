export type ApiErrorCode = 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'validation' | 'unknown';

/** Every API implementation (mock or Supabase) should throw this, so the UI never parses backend errors. */
export class ApiError extends Error {
  code: ApiErrorCode;
  details?: Record<string, unknown>;
  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
