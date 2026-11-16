// Motor de Progreso, Candados Secuenciales, Entrenamiento Remedial y Racha Diaria.

export function createInitialState() {
  return {
    completed: [],
    remedial: [],
    remedialCompleted: [],
    failuresByLevel: {},
    achievements: [],
    dailyStreak: 0,
    lastDailyDate: null,
    updatedAt: null,
  };
}

/** Determina si un nivel está desbloqueado secuencialmente. */
export function isLevelUnlocked(level, index, levels, state) {
  if (!level) return false;
  if (level.tier === 'pay') return Boolean(state?.isPro);
  if (index === 0) return true;
  const completed = new Set(state?.completed || []);
  const prev = levels[index - 1];
  return Boolean(prev && completed.has(prev.id));
}

/**
 * Registra el resultado de un intento en un nivel.
 * - Si aprueba: marca completado, limpia contador de fallos y libera bandera remedial.
 * - Si falla 2+ veces consecutivas: marca el nivel en `remedial` y selecciona el micro-ejercicio acorde al errorType.
 */
export function recordAttempt(state, level, evaluation) {
  const next = {
    ...createInitialState(),
    ...state,
    completed: [...(state?.completed || [])],
    remedial: [...(state?.remedial || [])],
    remedialCompleted: [...(state?.remedialCompleted || [])],
    failuresByLevel: { ...(state?.failuresByLevel || {}) },
    achievements: [...(state?.achievements || [])],
  };

  if (evaluation.passed) {
    if (!next.completed.includes(level.id)) {
      next.completed.push(level.id);
    }
    delete next.failuresByLevel[level.id];
    next.remedial = next.remedial.filter((id) => id !== level.id);
    next.updatedAt = new Date().toISOString();
    return { state: next, triggerRemedial: false, recommendedDrill: null };
  }

  const prevFails = Number(next.failuresByLevel[level.id] || 0);
  const failCount = prevFails + 1;
  next.failuresByLevel[level.id] = failCount;

  let triggerRemedial = false;
  let recommendedDrill = null;
  if (failCount >= 2) {
    triggerRemedial = true;
    if (!next.remedial.includes(level.id)) {
      next.remedial.push(level.id);
    }
    const drills = level.remedial_drills || [];
    recommendedDrill =
      drills.find((d) => d.error_type === evaluation.errorType) || drills[0] || null;
  }

  next.updatedAt = new Date().toISOString();
  return { state: next, triggerRemedial, recommendedDrill, failCount };
}

/** Registra un micro-ejercicio remedial completado. */
export function completeRemedialDrill(state, levelId, drillId) {
  const next = {
    ...createInitialState(),
    ...state,
    remedialCompleted: [...(state?.remedialCompleted || [])],
    remedial: [...(state?.remedial || [])],
  };
  if (drillId && !next.remedialCompleted.includes(drillId)) {
    next.remedialCompleted.push(drillId);
  }
  if (levelId) {
    next.remedial = next.remedial.filter((id) => id !== levelId);
    next.failuresByLevel = { ...(next.failuresByLevel || {}), [levelId]: 0 };
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Actualiza la racha diaria Clean & Document. */
export function recordDailyCompletion(state, todayIso = new Date().toISOString().slice(0, 10)) {
  const next = { ...createInitialState(), ...state };
  if (next.lastDailyDate === todayIso) return next;

  if (next.lastDailyDate) {
    const prev = new Date(`${next.lastDailyDate}T00:00:00Z`).getTime();
    const curr = new Date(`${todayIso}T00:00:00Z`).getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    next.dailyStreak = diffDays === 1 ? (next.dailyStreak || 0) + 1 : 1;
  } else {
    next.dailyStreak = 1;
  }
  next.lastDailyDate = todayIso;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Evalúa y desbloquea nuevos logros según achievements.json. */
export function evaluateAchievements(state, catalog = []) {
  const unlocked = new Set(state?.achievements || []);
  const newlyUnlocked = [];
  const completedCount = (state?.completed || []).length;
  const remedialCount = (state?.remedialCompleted || []).length;
  const streak = Number(state?.dailyStreak || 0);

  for (const ach of catalog) {
    if (unlocked.has(ach.id)) continue;
    const c = ach.criteria || {};
    let hit = false;
    if (c.type === 'levels_completed' && completedCount >= (c.count || 1)) hit = true;
    if (c.type === 'daily_streak' && streak >= (c.days || 3)) hit = true;
    if (c.type === 'remedials_completed' && remedialCount >= (c.count || 2)) hit = true;
    if (hit) {
      unlocked.add(ach.id);
      newlyUnlocked.push(ach);
    }
  }

  return {
    state: { ...state, achievements: [...unlocked] },
    newlyUnlocked,
  };
}
