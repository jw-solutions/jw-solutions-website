// Controlador de UI dinámico: lee features.runtime.json y muestra/oculta funciones y elementos comerciales.
//  - [data-cf-feature="id"]  -> se elimina si la función no está activa.
//  - [data-cf-commercial]    -> se elimina si NO hay ninguna función activa de tier "pay".
// Sin inventario legible se aplica el modo seguro: solo lo gratuito, sin elementos comerciales.
const RUNTIME_URL = new URL('features.runtime.json', document.baseURI);

let active = new Map(); // id -> tier

export const isFeatureOn = (id) => active.has(id);

async function load() {
  try {
    const res = await fetch(RUNTIME_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    active = new Map(data.features.filter((f) => f.active).map((f) => [f.id, f.tier]));
    applyUI();
  } catch (err) {
    console.warn('[code-formatter] features.runtime.json no disponible, modo público seguro:', err.message);
    active = new Map();
    applyUI();
  }
}

function applyUI() {
  const hasPay = [...active.values()].includes('pay');
  document.querySelectorAll('[data-cf-feature]').forEach((el) => {
    if (!active.has(el.dataset.cfFeature)) el.remove();
  });
  if (!hasPay) document.querySelectorAll('[data-cf-commercial]').forEach((el) => el.remove());
  document.documentElement.dataset.cfMode = hasPay ? 'full' : 'public-free';
}

export const featuresReady = load();
