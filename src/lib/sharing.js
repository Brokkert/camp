// Delen zonder de plek weg te geven.
//
// Het token van een deel-link wordt in de browser verzonnen en gaat alleen als
// SHA-256-hash naar de server. Het token zelf staat uitsluitend in de URL die
// jij doorstuurt — en dan nog achter een # , zodat het niet in serverlogs of
// in de Referer-header belandt.

import { getClient } from './supabase.js';
import { PRECISION_RADIUS } from './fuzz.js';

/** 160 bits willekeur, url-veilig. Ruim genoeg om nooit geraden te worden. */
export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** De link die je doorstuurt. Het token staat achter de #, dus na de server. */
export function shareUrl(token) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/s/${token}`;
}

export async function createLinkShare(spotId, options = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Delen kan alleen met een Supabase-project erachter.');

  const token = generateToken();
  const { error } = await supabase.rpc('camp_create_link_share', {
    p_spot_id: spotId,
    p_token_hash: await hashToken(token),
    p_precision: options.precision || 'exact',
    p_pass: options.passphrase || null,
    p_label: options.label || '',
    p_expires_at: options.expiresAt || null,
    p_max_views: options.maxViews || null,
    p_show_notes: options.showNotes !== false,
    p_show_photos: options.showPhotos !== false,
    p_show_visits: Boolean(options.showVisits),
  });
  if (error) throw error;

  // Alleen hier bestaat het token nog in leesbare vorm.
  return { token, url: shareUrl(token) };
}

export async function shareWithUser(spotId, userId, options = {}) {
  const { error } = await getClient().from('camp_shares').insert({
    spot_id: spotId,
    owner_id: (await getClient().auth.getUser()).data.user.id,
    kind: 'user',
    target_user_id: userId,
    precision: options.precision || 'fine',
    label: options.label || '',
    show_notes: options.showNotes !== false,
    show_photos: options.showPhotos !== false,
    show_visits: Boolean(options.showVisits),
    expires_at: options.expiresAt || null,
  });
  if (error) throw error;
}

export async function shareWithCircle(spotId, circleId, options = {}) {
  const { error } = await getClient().from('camp_shares').insert({
    spot_id: spotId,
    owner_id: (await getClient().auth.getUser()).data.user.id,
    kind: 'circle',
    target_circle_id: circleId,
    precision: options.precision || 'area',
    label: options.label || '',
    show_notes: options.showNotes !== false,
    show_photos: options.showPhotos !== false,
    show_visits: Boolean(options.showVisits),
    expires_at: options.expiresAt || null,
  });
  if (error) throw error;
}

/** Alle shares van één plek, met wie of wat de ontvanger is. */
export async function listShares(spotId) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('camp_shares')
    .select('*')
    .eq('spot_id', spotId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listAllShares() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('camp_shares')
    .select('*, camp_spots(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revokeShare(shareId) {
  const { error } = await getClient()
    .from('camp_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId);
  if (error) throw error;
}

export async function deleteShare(shareId) {
  const { error } = await getClient().from('camp_shares').delete().eq('id', shareId);
  if (error) throw error;
}

export async function updateShare(shareId, patch) {
  const { error } = await getClient().from('camp_shares').update(patch).eq('id', shareId);
  if (error) throw error;
}

/** Een deel-link openen. Werkt ook zonder account. */
export async function openShare(token, passphrase = null) {
  const supabase = getClient();
  if (!supabase) throw new Error('Camp is nog niet aan een Supabase-project gekoppeld.');
  const { data, error } = await supabase.rpc('camp_open_share', {
    p_token: token,
    p_pass: passphrase,
  });
  if (error) throw error;
  return data;
}

export async function sharedWithMe() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('camp_shared_with_me');
  if (error) throw error;
  return data || [];
}

/** Waarom een link niet werkt, in gewoon Nederlands. */
export const SHARE_ERRORS = {
  not_found: 'Deze link bestaat niet (meer).',
  revoked: 'Deze link is ingetrokken door wie hem stuurde.',
  expired: 'Deze link is verlopen.',
  used_up: 'Deze link is al zo vaak bekeken als was toegestaan.',
  needs_pass: 'Er hoort een wachtwoord bij deze link.',
  wrong_pass: 'Dat wachtwoord klopt niet.',
};

export function shareStatus(share) {
  if (share.revoked_at) return { id: 'revoked', label: 'Ingetrokken', tone: 'bad' };
  if (share.expires_at && new Date(share.expires_at) < new Date())
    return { id: 'expired', label: 'Verlopen', tone: 'bad' };
  if (share.max_views && share.view_count >= share.max_views)
    return { id: 'used_up', label: 'Opgebruikt', tone: 'bad' };
  return { id: 'active', label: 'Actief', tone: 'good' };
}

export const radiusFor = (precision) => PRECISION_RADIUS[precision] ?? 0;
