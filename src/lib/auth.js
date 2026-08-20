// Inloggen met een magic link. Geen wachtwoorden om te vergeten, en vrienden
// die alleen even willen kijken hoeven niets te bedenken.
//
// Supabase stuurt in dezelfde mail zowel een link als een code van zes cijfers
// (mits je de template aanpast, zie SUPABASE_SETUP.md). De code is er voor het
// geval je de mail op je telefoon opent en de app op je laptop hebt staan.

import { useEffect, useState } from 'react';
import { getClient } from './supabase.js';

export function useSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) {
      setReady(true);
      return;
    }
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next ?? null);
      setReady(true);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { session, ready, user: session?.user ?? null };
}

/** Waar de magic link naartoe moet terugkeren. */
function redirectTarget() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

/**
 * Stuurt een inlogmail.
 *
 * Zonder uitnodigingscode maakt dit nooit een nieuwe gebruiker aan
 * (shouldCreateUser: false) — een onbekend adres krijgt gewoon een foutmelding.
 * Mét code mag er wel een account bij, en gaat de code mee in options.data zodat
 * de trigger in de database hem kan controleren.
 */
export async function sendMagicLink(email, { invite = null } = {}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Camp is nog niet aan een Supabase-project gekoppeld.');

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTarget(),
      shouldCreateUser: Boolean(invite),
      ...(invite ? { data: { invite } } : {}),
    },
  });
  if (error) throw error;
}

export async function verifyCode(email, code) {
  const supabase = getClient();
  if (!supabase) throw new Error('Camp is nog niet aan een Supabase-project gekoppeld.');
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signOut() {
  await getClient()?.auth.signOut();
}

export async function loadProfile() {
  const supabase = getClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from('camp_profiles')
    .select('id, handle, display_name, emoji')
    .eq('id', auth.user.id)
    .maybeSingle();
  return data ?? null;
}

export async function saveProfile(patch) {
  const supabase = getClient();
  if (!supabase) throw new Error('Niet verbonden.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('Niet ingelogd.');
  const { error } = await supabase
    .from('camp_profiles')
    .update(patch)
    .eq('id', auth.user.id);
  if (error) throw error;
}
