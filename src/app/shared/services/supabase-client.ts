import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const supabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'pollapp-auth',
      lock: <T>(_name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> => fn(),
    },
  }
);