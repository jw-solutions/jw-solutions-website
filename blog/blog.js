/* JW SOLUTIONS — BLOG.JS v1.2.0
   Idioma (ES/EN) + calificación por estrellas para las páginas de /blog/.
   Se carga síncrono en <head> para fijar el idioma antes del primer render. */
(function () {
  'use strict';

  var SUPPORTED = ['es', 'en'];
  var LANG_KEY = 'jw_lang';
  var RATING_PREFIX = 'jw_rating:';

  function store(action, key, value) {
    try {
      if (action === 'get') return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* almacenamiento bloqueado */ }
    return null;
  }

  function detectLang() {
    try {
      var q = (new URLSearchParams(window.location.search).get('lang') || '').toLowerCase();
      if (SUPPORTED.indexOf(q) !== -1) return q;
    } catch (e) { /* sin URLSearchParams */ }
    var saved = store('get', LANG_KEY);
    if (SUPPORTED.indexOf(saved) !== -1) return saved;
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (/^(America\/(New_York|Chicago|Denver|Los_Angeles)|Europe\/(London|Dublin)|Australia\/Sydney|Pacific\/Auckland)/.test(tz)) return 'en';
    } catch (e) { /* zona no disponible */ }
    return 'es';
  }

  var lang = detectLang();
  document.documentElement.lang = lang;

  var TEXT = {
    thanks: {
      es: function (n) { return 'Gracias por tu calificación: ' + n + ' de 5.'; },
      en: function (n) { return 'Thanks for your rating: ' + n + ' out of 5.'; }
    },
    copied: { es: '¡Enlace copiado!', en: 'Link copied!' },
    copyFail: { es: 'No se pudo copiar. Copia la URL desde la barra de direcciones.', en: 'Could not copy. Copy the URL from the address bar.' },
    toggle: { es: 'ES · Cambiar idioma a inglés', en: 'EN · Switch language to Spanish' },
    nav: { es: 'Navegación del blog', en: 'Blog navigation' }
  };

  function renderRatingStatus(status, value) {
    status.textContent = value ? TEXT.thanks[lang](value) : '';
  }

  function applyLang(next, persist) {
    lang = next;
    document.documentElement.lang = lang;

    var h1 = document.querySelector('h1[data-lang="' + lang + '"]');
    if (h1) document.title = h1.textContent + ' | JW Solutions';

    var flag = document.getElementById('current-flag');
    var label = document.getElementById('current-lang');
    var btn = document.getElementById('lang-toggle');
    if (flag) flag.textContent = lang === 'es' ? '🇪🇸' : '🇺🇸';
    if (label) label.textContent = lang.toUpperCase();
    if (btn) btn.setAttribute('aria-label', TEXT.toggle[lang]);

    var nav = document.querySelector('.blog-nav');
    if (nav) nav.setAttribute('aria-label', TEXT.nav[lang]);

    if (persist) store('set', LANG_KEY, lang);

    updateShareLinks();

    var status = document.getElementById('rating-status');
    var rating = document.getElementById('rating');
    if (status && rating) {
      renderRatingStatus(status, parseInt(store('get', RATING_PREFIX + rating.getAttribute('data-slug')), 10) || 0);
    }
  }

  function shareData() {
    var canon = document.querySelector('link[rel="canonical"]');
    var h1 = document.querySelector('h1[data-lang="' + lang + '"]');
    return {
      url: canon ? canon.getAttribute('href') : window.location.origin + window.location.pathname,
      title: h1 ? h1.textContent : document.title
    };
  }

  function updateShareLinks() {
    var d = shareData();
    var u = encodeURIComponent(d.url);
    var t = encodeURIComponent(d.title);
    var set = function (id, href) {
      var a = document.getElementById(id);
      if (a) a.setAttribute('href', href);
    };
    set('share-linkedin', 'https://www.linkedin.com/sharing/share-offsite/?url=' + u);
    set('share-whatsapp', 'https://api.whatsapp.com/send?text=' + t + '%20' + u);
    set('share-x', 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'blog-sr';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* sin soporte */ }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }

  function initShare() {
    var status = document.getElementById('share-status');
    var nativeBtn = document.getElementById('share-native');
    var copyBtn = document.getElementById('share-copy');
    var timer;
    var say = function (msg) {
      if (!status) return;
      status.textContent = msg;
      clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; }, 3000);
    };

    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', function () {
        var d = shareData();
        navigator.share({ title: d.title, url: d.url }).catch(function () { /* cancelado por el usuario */ });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyText(shareData().url).then(
          function () { say(TEXT.copied[lang]); },
          function () { say(TEXT.copyFail[lang]); }
        );
      });
    }
  }

  function initRating() {
    var rating = document.getElementById('rating');
    var status = document.getElementById('rating-status');
    if (!rating || !status) return;

    var key = RATING_PREFIX + rating.getAttribute('data-slug');
    var saved = parseInt(store('get', key), 10);
    if (saved >= 1 && saved <= 5) {
      var current = rating.querySelector('input[value="' + saved + '"]');
      if (current) current.checked = true;
      renderRatingStatus(status, saved);
    }

    rating.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || input.name !== 'rating') return;
      var value = parseInt(input.value, 10);
      if (value >= 1 && value <= 5) {
        store('set', key, String(value));
        renderRatingStatus(status, value);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(lang, true);

    var btn = document.getElementById('lang-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        applyLang(lang === 'es' ? 'en' : 'es', true);
      });
    }

    var year = document.getElementById('current-year');
    if (year) year.textContent = String(new Date().getFullYear());

    initRating();
    initShare();
  });
})();
