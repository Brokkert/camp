// De kluis: je plekken en je logboek.
//
// Camp draait in twee standen. Met een Supabase-project erachter staat alles in
// de database, per gebruiker afgeschermd met Row Level Security. Zonder — of
// als je niet ingelogd bent — is er de lokale kluis: alles in deze browser,
// niets naar buiten, geen delen. Dezelfde vorm, dezelfde schermen.
//
// In de cloudstand houden we daarnaast een kopie in localStorage, zodat je in
// het bos zonder bereik je plekken nog steeds kunt inzien.

import { useCallback, useEffect, useState } from 'react';
import { getClient } from './supabase.js';
import { emptySpot } from '../data/taxonomy.js';

const LOCAL_KEY = 'camp:vault:v1';
const cacheKey = (userId) => `camp:cache:${userId}`;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* vol of geblokkeerd; niet fataal */
  }
};

const newId = () =>
  crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// --- lokale kluis -----------------------------------------------------------

const readLocal = () => readJson(LOCAL_KEY, { spots: [], visits: [] });
const writeLocal = (state) => writeJson(LOCAL_KEY, state);

export function localVaultSize() {
  const { spots } = readLocal();
  return spots.length;
}

// --- velden die de database kent --------------------------------------------
// Alles wat de client verzint en de database niet heeft (zoals afstand tot je
// huidige positie) moet er hier uit, anders klaagt PostgREST.
const SPOT_COLUMNS = [
  'name', 'lat', 'lng', 'kind', 'rating', 'notes', 'access',
  'tags', 'best_months', 'capacity', 'elevation', 'legal', 'photos', 'archived',
];

function spotForDb(spot) {
  const row = {};
  for (const column of SPOT_COLUMNS) {
    if (spot[column] !== undefined) row[column] = spot[column];
  }
  // Lege getalvelden komen uit <input type="number"> als '' binnen.
  for (const numeric of ['rating', 'capacity', 'elevation']) {
    if (row[numeric] === '' || Number.isNaN(row[numeric])) row[numeric] = null;
  }
  return row;
}

/**
 * useVault geeft de plekken plus de handelingen erop. Of het nu lokaal of in
 * de cloud staat, merkt de rest van de app niet.
 */
export function useVault(user) {
  const cloud = Boolean(getClient() && user);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    if (!cloud) {
      setSpots(readLocal().spots);
      setLoading(false);
      return;
    }
    const supabase = getClient();
    const { data, error: err } = await supabase
      .from('camp_spots')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      // Geen bereik? Val terug op de kopie van de laatste keer.
      const cached = readJson(cacheKey(user.id), null);
      if (cached) {
        setSpots(cached);
        setOffline(true);
      } else {
        setError(err.message);
      }
    } else {
      setSpots(data || []);
      setOffline(false);
      writeJson(cacheKey(user.id), data || []);
    }
    setLoading(false);
  }, [cloud, user?.id]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const saveSpot = useCallback(
    async (spot) => {
      const clean = spotForDb({ ...emptySpot(), ...spot });

      if (!cloud) {
        const state = readLocal();
        if (spot.id) {
          state.spots = state.spots.map((s) =>
            s.id === spot.id ? { ...s, ...clean, id: spot.id, updated_at: new Date().toISOString() } : s
          );
        } else {
          state.spots.unshift({
            ...clean,
            id: newId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        writeLocal(state);
        setSpots(state.spots);
        return state.spots[0];
      }

      const supabase = getClient();
      if (spot.id) {
        const { data, error: err } = await supabase
          .from('camp_spots')
          .update({ ...clean, updated_at: new Date().toISOString() })
          .eq('id', spot.id)
          .select()
          .single();
        if (err) throw err;
        setSpots((prev) => prev.map((s) => (s.id === data.id ? data : s)));
        return data;
      }

      const { data, error: err } = await supabase
        .from('camp_spots')
        .insert({ ...clean, owner_id: user.id })
        .select()
        .single();
      if (err) throw err;
      setSpots((prev) => [data, ...prev]);
      return data;
    },
    [cloud, user?.id]
  );

  const deleteSpot = useCallback(
    async (id) => {
      if (!cloud) {
        const state = readLocal();
        state.spots = state.spots.filter((s) => s.id !== id);
        state.visits = state.visits.filter((v) => v.spot_id !== id);
        writeLocal(state);
        setSpots(state.spots);
        return;
      }
      const { error: err } = await getClient().from('camp_spots').delete().eq('id', id);
      if (err) throw err;
      setSpots((prev) => prev.filter((s) => s.id !== id));
    },
    [cloud]
  );

  /** Meerdere plekken tegelijk (import). */
  const addSpots = useCallback(
    async (incoming) => {
      const rows = incoming.map((s) => spotForDb({ ...emptySpot(), ...s }));
      if (!rows.length) return 0;

      if (!cloud) {
        const state = readLocal();
        const now = new Date().toISOString();
        state.spots = [
          ...rows.map((r) => ({ ...r, id: newId(), created_at: now, updated_at: now })),
          ...state.spots,
        ];
        writeLocal(state);
        setSpots(state.spots);
        return rows.length;
      }

      const { data, error: err } = await getClient()
        .from('camp_spots')
        .insert(rows.map((r) => ({ ...r, owner_id: user.id })))
        .select();
      if (err) throw err;
      setSpots((prev) => [...(data || []), ...prev]);
      return data?.length || 0;
    },
    [cloud, user?.id]
  );

  return { spots, loading, error, offline, cloud, refresh, saveSpot, deleteSpot, addSpots };
}

// --- logboek ----------------------------------------------------------------

export async function loadVisits(spotId, user) {
  if (!getClient() || !user) {
    return readLocal().visits.filter((v) => v.spot_id === spotId);
  }
  const { data, error } = await getClient()
    .from('camp_visits')
    .select('*')
    .eq('spot_id', spotId)
    .order('visited_on', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveVisit(visit, user) {
  const row = {
    spot_id: visit.spot_id,
    visited_on: visit.visited_on,
    nights: Number(visit.nights) || 1,
    rating: visit.rating || null,
    companions: visit.companions || '',
    notes: visit.notes || '',
    weather: visit.weather || null,
  };

  if (!getClient() || !user) {
    const state = readLocal();
    if (visit.id) {
      state.visits = state.visits.map((v) => (v.id === visit.id ? { ...v, ...row } : v));
    } else {
      state.visits.unshift({ ...row, id: newId(), created_at: new Date().toISOString() });
    }
    writeLocal(state);
    return state.visits[0];
  }

  const supabase = getClient();
  if (visit.id) {
    const { data, error } = await supabase
      .from('camp_visits').update(row).eq('id', visit.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('camp_visits').insert({ ...row, owner_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVisit(id, user) {
  if (!getClient() || !user) {
    const state = readLocal();
    state.visits = state.visits.filter((v) => v.id !== id);
    writeLocal(state);
    return;
  }
  const { error } = await getClient().from('camp_visits').delete().eq('id', id);
  if (error) throw error;
}

/** Alles uit de lokale kluis naar je account tillen, na het inloggen. */
export async function migrateLocalToCloud(user) {
  const state = readLocal();
  if (!state.spots.length || !getClient() || !user) return 0;

  const idMap = new Map();
  const { data, error } = await getClient()
    .from('camp_spots')
    .insert(state.spots.map((s) => ({ ...spotForDb(s), owner_id: user.id })))
    .select();
  if (error) throw error;

  state.spots.forEach((oude, i) => idMap.set(oude.id, data[i]?.id));

  const visits = state.visits
    .map((v) => ({
      spot_id: idMap.get(v.spot_id),
      owner_id: user.id,
      visited_on: v.visited_on,
      nights: v.nights,
      rating: v.rating,
      companions: v.companions,
      notes: v.notes,
    }))
    .filter((v) => v.spot_id);
  if (visits.length) await getClient().from('camp_visits').insert(visits);

  writeLocal({ spots: [], visits: [] });
  return data.length;
}
