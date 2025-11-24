// Service de synchronisation SRS + decks.
// Utilise Supabase si VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY sont définis,
// sinon fallback sur localStorage.

let supabase = null;
const LOCAL_KEY_PREFIX = 'jt_remote_';
let authListener = null;

export async function initSync() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    // dynamic import so bundler doesn't fail when the package isn't present or env not set
    const mod = await import('@supabase/supabase-js');
    const createClient = mod.createClient || mod.default?.createClient;
    if (!createClient) {
      console.warn('Supabase client not found in module');
      return false;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    return !!supabase;
  } catch (e) {
    console.error('Failed to init Supabase client', e);
    supabase = null;
    return false;
  }
}

// AUTH helpers ------------------------------------------------------
export async function signInWithEmail(email, redirectTo = null) {
  if (!supabase) throw new Error('Supabase not initialized');
  try {
    // v2 API: pass emailRedirectTo inside options so Supabase builds a link to a known origin
    const opts = redirectTo ? { emailRedirectTo: redirectTo } : undefined;
    const res = await supabase.auth.signInWithOtp({ email, options: opts });
    return res;
  } catch (e) {
    console.error('signInWithEmail error', e);
    throw e;
  }
}

export async function signOut() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('signOut failed', e);
  }
}

export async function getUser() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch (e) {
    console.warn('getUser failed', e);
    return null;
  }
}

export function onAuthStateChange(cb) {
  if (!supabase) return () => {};
  // remove previous listener if any
  if (authListener && authListener.subscription) authListener.subscription.unsubscribe();
  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    // event: 'SIGNED_IN' | 'SIGNED_OUT' etc.
    cb(event, session);
  });
  authListener = { subscription };
  return () => {
    try { subscription.unsubscribe(); } catch(e){}
  };
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
  try {
    const { data, error } = await supabase
      .from('srs')
      .select('payload, updated_at')
      .eq('user_id', userId)
      .eq('deck', deckKey)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('Supabase loadSrs error', error);
      return {};
    }
    if (!data) return {};
    return data.payload || {};
  } catch (e) {
    console.error('loadSrs unexpected error', e);
    return {};
  }
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
  try {
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
  } catch (e) {
    console.error('saveSrs unexpected error', e);
    return { ok: false, error: e };
  }
}

// Load decks JSON from Supabase storage bucket or from table 'decks' (if configured).
// Fallback: return null to mean "use local src/data/decks.js".
export async function loadDecksRemote() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('decks').select('key,payload').limit(1000);
    if (error) {
      console.warn('loadDecksRemote error:', error);
      return null;
    }
    const out = {};
    (data || []).forEach(r => {
      out[r.key] = r.payload;
    });
    return out;
  } catch (e) {
    console.error('loadDecksRemote unexpected error', e);
    return null;
  }
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
