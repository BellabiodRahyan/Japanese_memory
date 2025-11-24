// Service de synchronisation SRS + decks.
// Utilise Supabase si VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY sont définis,
// sinon fallback sur localStorage.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

const LOCAL_KEY_PREFIX = 'jt_remote_';

export async function initSync() {
  // noop for now — client already created if env present
  return !!supabase;
}

// Load SRS for user (userId can be null → fallback local)
export async function loadSrs(userId, deckKey) {
  if (!userId || !supabase) {
    // fallback: read localStorage key for this deck
    try {
      const raw = localStorage.getItem(`${LOCAL_KEY_PREFIX}srs:${deckKey}`);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  // Supabase table schema expected: srs (id uuid primary key, user_id text, deck text, payload jsonb, updated_at timestamptz)
  const { data, error } = await supabase
    .from('srs')
    .select('payload, updated_at')
    .eq('user_id', userId)
    .eq('deck', deckKey)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Supabase loadSrs error', error);
    // fallback to local
    return {};
  }
  if (!data) return {};
  return data.payload || {};
}

// Save SRS for user/deck (overwrites server copy)
export async function saveSrs(userId, deckKey, srsMap) {
  if (!userId || !supabase) {
    try {
      localStorage.setItem(`${LOCAL_KEY_PREFIX}srs:${deckKey}`, JSON.stringify(srsMap));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }
  // upsert into supabase
  const payload = srsMap || {};
  const { data, error } = await supabase
    .from('srs')
    .upsert({ user_id: userId, deck: deckKey, payload }, { onConflict: ['user_id','deck'] })
    .select()
    .maybeSingle();
  if (error) {
    console.error('Supabase saveSrs error', error);
    return { ok: false, error };
  }
  return { ok: true, data };
}

// Load decks JSON from Supabase storage bucket or from table 'decks' (if configured).
// Fallback: return null to mean "use local src/data/decks.js".
export async function loadDecksRemote() {
  if (!supabase) return null;
  // try to fetch from table 'decks' (schema: id, key, payload jsonb)
  const { data, error } = await supabase.from('decks').select('key,payload').limit(1000);
  if (error) {
    console.warn('loadDecksRemote error:', error);
    return null;
  }
  // convert to object { key: payload }
  const out = {};
  (data || []).forEach(r => {
    out[r.key] = r.payload;
  });
  return out;
}

// Utility: merge remote and local srsMaps (remote wins unless local.lastReviewed > remote)
export function mergeSrs(localMap = {}, remoteMap = {}) {
  const out = { ...remoteMap };
  for (const id of Object.keys(localMap)) {
    const l = localMap[id];
    const r = remoteMap[id];
    if (!r) {
      out[id] = l;
      continue;
    }
    const lTime = l.lastReviewed || 0;
    const rTime = r.lastReviewed || 0;
    out[id] = lTime > rTime ? l : r;
  }
  return out;
}
