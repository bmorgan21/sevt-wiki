import type { WikiApi } from './types';
import { createMockApi } from './mockApi';

/**
 * Swap this line when the real backend exists:
 *   export const api: WikiApi = createSupabaseApi(supabase);
 */
export const api: WikiApi = createMockApi();
export { ApiError, errorMessage } from './errors';
