// Vrienden en groepen. Een groep ("Busploeg") is handiger dan tien losse
// shares: je deelt één keer en wie je later toevoegt ziet het meteen.

import { getClient } from './supabase.js';

/**
 * Zoekt mensen op het begin van hun naam. Geeft een lijst terug, want "jas"
 * kan bij meer dan één iemand passen.
 */
export async function searchProfiles(term) {
  const { data, error } = await getClient().rpc('camp_search_profiles', { p_term: term });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function requestFriend(userId) {
  const me = (await getClient().auth.getUser()).data.user;
  const { error } = await getClient().from('camp_friendships').insert({
    requester_id: me.id,
    addressee_id: userId,
  });
  if (error) throw error;
}

export async function acceptFriend(friendshipId) {
  const { error } = await getClient()
    .from('camp_friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriend(friendshipId) {
  const { error } = await getClient().from('camp_friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/**
 * Alle vriendschappen, met het profiel van de ander erbij. RLS laat alleen de
 * rijen zien waar jij bij betrokken bent.
 */
export async function listFriends() {
  const supabase = getClient();
  if (!supabase) return { friends: [], incoming: [], outgoing: [] };

  const me = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase.from('camp_friendships').select('*');
  if (error) throw error;

  const otherIds = [
    ...new Set((data || []).map((f) => (f.requester_id === me.id ? f.addressee_id : f.requester_id))),
  ];
  const profiles = new Map();
  if (otherIds.length) {
    const { data: rows } = await supabase
      .from('camp_profiles')
      .select('id, handle, display_name, emoji')
      .in('id', otherIds);
    for (const p of rows || []) profiles.set(p.id, p);
  }

  const decorate = (f) => ({
    ...f,
    profile: profiles.get(f.requester_id === me.id ? f.addressee_id : f.requester_id) || null,
  });

  return {
    friends: (data || []).filter((f) => f.status === 'accepted').map(decorate),
    incoming: (data || [])
      .filter((f) => f.status === 'pending' && f.addressee_id === me.id)
      .map(decorate),
    outgoing: (data || [])
      .filter((f) => f.status === 'pending' && f.requester_id === me.id)
      .map(decorate),
  };
}

// --- groepen ----------------------------------------------------------------

export async function listCircles() {
  const supabase = getClient();
  if (!supabase) return [];
  const me = (await supabase.auth.getUser()).data.user;

  const { data: circles, error } = await supabase.from('camp_circles').select('*');
  if (error) throw error;

  const { data: members } = await supabase.from('camp_circle_members').select('*');
  const profileIds = [...new Set((members || []).map((m) => m.member_id))];
  const profiles = new Map();
  if (profileIds.length) {
    const { data: rows } = await supabase
      .from('camp_profiles')
      .select('id, handle, display_name, emoji')
      .in('id', profileIds);
    for (const p of rows || []) profiles.set(p.id, p);
  }

  return (circles || []).map((c) => ({
    ...c,
    mine: c.owner_id === me.id,
    members: (members || [])
      .filter((m) => m.circle_id === c.id)
      .map((m) => ({ ...m, profile: profiles.get(m.member_id) || null })),
  }));
}

export async function createCircle(name, emoji = '👥') {
  const me = (await getClient().auth.getUser()).data.user;
  const { data, error } = await getClient()
    .from('camp_circles')
    .insert({ name, emoji, owner_id: me.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCircle(id) {
  const { error } = await getClient().from('camp_circles').delete().eq('id', id);
  if (error) throw error;
}

export async function addToCircle(circleId, memberId) {
  const { error } = await getClient()
    .from('camp_circle_members')
    .insert({ circle_id: circleId, member_id: memberId });
  if (error) throw error;
}

export async function removeFromCircle(circleId, memberId) {
  const { error } = await getClient()
    .from('camp_circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('member_id', memberId);
  if (error) throw error;
}
