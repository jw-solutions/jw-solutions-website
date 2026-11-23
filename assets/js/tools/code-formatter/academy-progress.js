// Persistencia híbrida (localStorage Free + sync PostgreSQL Pro) y captura de atribución UTM.
import { createInitialState } from './academy-engine.js';

export const ACADEMY_STATE_KEY = 'cf_academy_state_v1';
export const ACADEMY_UTM_KEY = 'cf_academy_utm_v1';

export function loadAcademyState() {
  try {
    const raw = localStorage.getItem(ACADEMY_STATE_KEY);
    if (!raw) return createInitialState();
    return { ...createInitialState(), ...JSON.parse(raw) };
  } catch {
    return createInitialState();
  }
}

export function saveAcademyState(state) {
  try {
    localStorage.setItem(ACADEMY_STATE_KEY, JSON.stringify(state));
  } catch { /* almacenamiento lleno o bloqueado */ }
  return state;
}

export function captureUtmParams(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const params = new URLSearchParams(search);
    const utm_source = params.get('utm_source');
    const utm_medium = params.get('utm_medium');
    const utm_campaign = params.get('utm_campaign');
    if (utm_source || utm_medium || utm_campaign) {
      const payload = {
        ...(utm_source ? { utm_source: utm_source.slice(0, 64) } : {}),
        ...(utm_medium ? { utm_medium: utm_medium.slice(0, 64) } : {}),
        ...(utm_campaign ? { utm_campaign: utm_campaign.slice(0, 128) } : {}),
      };
      sessionStorage.setItem(ACADEMY_UTM_KEY, JSON.stringify(payload));
      return payload;
    }
    const existing = sessionStorage.getItem(ACADEMY_UTM_KEY);
    return existing ? JSON.parse(existing) : null;
  } catch {
    return null;
  }
}

export function getCapturedUtm() {
  try {
    const raw = sessionStorage.getItem(ACADEMY_UTM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function mergeStates(localState, remoteState) {
  if (!remoteState) return localState;
  const completed = [...new Set([...(localState.completed || []), ...(remoteState.completed || [])])];
  const remedialCompleted = [
    ...new Set([...(localState.remedialCompleted || []), ...(remoteState.remedialCompleted || [])]),
  ];
  const achievements = [...new Set([...(localState.achievements || []), ...(remoteState.achievements || [])])];
  return {
    ...localState,
    ...remoteState,
    completed,
    remedialCompleted,
    achievements,
    dailyStreak: Math.max(Number(localState.dailyStreak || 0), Number(remoteState.dailyStreak || 0)),
  };
}

export async function syncAcademyState(localState) {
  try {
    const { postJson } = await import('./services/api.js');
    const res = await postJson('/api/academy/sync', {
      completed: localState.completed || [],
      remedial_completed: localState.remedialCompleted || [],
      achievements: localState.achievements || [],
      daily_streak: Number(localState.dailyStreak || 0),
      last_daily_date: localState.lastDailyDate || null,
    });
    if (!res.ok) return localState;
    const remote = res.data !== undefined ? res.data : (typeof res.json === 'function' ? await res.json() : null);
    if (!remote || typeof remote !== 'object') return localState;
    const merged = mergeStates(localState, {
      completed: remote.completed,
      remedialCompleted: remote.remedial_completed,
      achievements: remote.achievements,
      dailyStreak: remote.daily_streak,
      lastDailyDate: remote.last_daily_date,
    });
    return saveAcademyState(merged);
  } catch {
    return localState;
  }
}
