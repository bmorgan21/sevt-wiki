import { ApiError } from './errors';

export interface DbError { code?: string; message: string; details?: string | null }

function duplicateMessage(message: string): string {
  if (/pages_/i.test(message)) return 'A page with this title already exists here.';
  if (/folders_/i.test(message)) return 'A folder with this name already exists here.';
  if (/invitations_/i.test(message)) return 'That email already has a pending invitation.';
  return 'That already exists.';
}

/**
 * Turns Postgres / PostgREST / Auth errors into the ApiError the UI understands.
 * PT401/403/404/409/422 are raised on purpose by the functions in supabase/sql/02_functions.sql.
 */
export function toApiError(e: DbError): ApiError {
  const msg = e.message || 'Something went wrong.';
  switch (e.code) {
    case 'PT401':
    case '28000':
      return new ApiError('auth', msg);
    case 'PT403':
      return new ApiError('forbidden', msg);
    case '42501':
      return new ApiError('forbidden', 'You don’t have permission to do that.');
    case 'PT404':
      return new ApiError('not_found', msg);
    case '22P02': // not a valid uuid in the URL
    case '23503': // referenced row is gone
      return new ApiError('not_found', 'That item no longer exists.');
    case 'PT409':
      return new ApiError('conflict', msg, { currentVersion: Number(e.details) || undefined });
    case 'PT422':
    case '22023':
      return new ApiError('validation', msg);
    case '23505':
      return new ApiError('validation', duplicateMessage(msg));
    case '23514':
    case '22001':
      return new ApiError('validation', 'One of the values is too long or isn’t allowed.');
  }
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt/i.test(msg)) {
    return new ApiError('auth', 'Your session expired. Sign in again.');
  }
  return new ApiError('unknown', msg);
}
