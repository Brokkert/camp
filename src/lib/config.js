// Verbinding met je eigen (gratis) Supabase-project.
//
// Vul deze twee waarden in met wat er in Supabase onder Settings → API staat.
// De publishable key hoort in de broncode thuis: hij is bedoeld om openbaar te
// zijn en geeft in zijn eentje nergens toegang toe — dat regelt Row Level
// Security in de database (zie supabase/schema.sql).
//
// Zolang hier niets staat draait Camp in "lokale kluis"-modus: alles blijft in
// deze browser, en delen is uitgeschakeld.
export const SUPABASE_URL = 'https://hyaaujbbpilhaqllxwml.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_aBflg80lHit2_57p0PRong_evinGGf_';

// Handig om zonder herbouwen te testen: wat je in Instellingen invult, wint.
const OVERRIDE_KEY = 'camp:supabase';

export function readConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null');
    if (saved?.url && saved?.key) return { url: saved.url, key: saved.key, source: 'lokaal' };
  } catch {
    /* kapotte localStorage negeren we gewoon */
  }
  if (SUPABASE_URL && SUPABASE_KEY) {
    return { url: SUPABASE_URL, key: SUPABASE_KEY, source: 'ingebouwd' };
  }
  return { url: '', key: '', source: 'geen' };
}

export function writeConfig(url, key) {
  if (!url || !key) localStorage.removeItem(OVERRIDE_KEY);
  else localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }));
}

export const isConfigured = () => Boolean(readConfig().url);
