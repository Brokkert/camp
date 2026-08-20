import { createClient } from '@supabase/supabase-js';
import { readConfig } from './config.js';

let client = null;

/** De Supabase-client, of null als Camp in lokale-kluis-modus draait. */
export function getClient() {
  if (client) return client;
  const { url, key } = readConfig();
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // De magic link komt binnen als #access_token=... in de URL.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

/** Na het wijzigen van de instellingen opnieuw opbouwen. */
export function resetClient() {
  client = null;
}
