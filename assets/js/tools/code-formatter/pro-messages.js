// Carga (una sola vez) los textos comerciales en el idioma de la INTERFAZ y los registra en i18n.
import { lang, extendMessages } from './i18n.js';

let loaded;
export const loadProMessages = () => (loaded ||= (async () => {
  const es = (await import('./locales-pro/es.js')).default;
  const current = lang === 'es' ? es : (await import(`./locales-pro/${lang}.js`)).default;
  extendMessages({ es, [lang]: current });
})());
