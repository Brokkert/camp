// Uitnodigingen.
//
// Aanmelden kan alleen met een link die jij verstuurt. Dat is niet alleen een
// kwestie van het formulier verstoppen — dat houdt hooguit bots tegen die het
// web afstruinen. De echte controle zit in de trigger op auth.users (zie
// supabase/schema.sql): zonder geldige code komt er geen gebruiker in, ook niet
// als iemand de auth-endpoint rechtstreeks aanroept.
//
// Net als bij een deel-link gaat alleen de SHA-256-hash naar de server. De code
// zelf staat uitsluitend in de link die jij doorstuurt.

import { getClient } from './supabase.js';
import { generateToken, hashToken } from './sharing.js';

/** De link die je aan iemand stuurt. Code achter de #, dus buiten serverlogs. */
export function inviteUrl(code) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
}

export async function createInvite({ label = '', maxUses = null, expiresAt = null } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Uitnodigen kan alleen met een Supabase-project erachter.');

  const me = (await supabase.auth.getUser()).data.user;
  if (!me) throw new Error('Niet ingelogd.');

  const code = generateToken();
  const { error } = await supabase.from('camp_invites').insert({
    code_hash: await hashToken(code),
    created_by: me.id,
    label,
    max_uses: maxUses,
    expires_at: expiresAt,
  });
  if (error) throw error;

  // Alleen hier bestaat de code nog in leesbare vorm.
  return { code, url: inviteUrl(code) };
}

export async function listInvites() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('camp_invites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revokeInvite(id) {
  const { error } = await getClient()
    .from('camp_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteInvite(id) {
  const { error } = await getClient().from('camp_invites').delete().eq('id', id);
  if (error) throw error;
}

export function inviteStatus(invite) {
  if (invite.revoked_at) return { label: 'Ingetrokken', tone: 'bad' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date())
    return { label: 'Verlopen', tone: 'bad' };
  if (invite.max_uses && invite.used_count >= invite.max_uses)
    return { label: 'Opgebruikt', tone: 'bad' };
  return { label: 'Geldig', tone: 'good' };
}
