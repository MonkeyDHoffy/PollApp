import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const supabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabasePublishableKey
);