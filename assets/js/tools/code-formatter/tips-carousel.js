// Carrusel interactivo de Weekly Tips, filtros por lenguaje, vista rápida y canales automáticos.
// Seguridad: cero innerHTML con datos dinámicos; todo se construye con document.createElement y textContent.
import { t, lang, SUPPORTED_LANGS, intlLocale, MAX_CODE_BYTES } from './i18n.js';
import { toast } from './actions.js';

const CONTENT_BASE = '../../content/code-formatter-tips/';
const MANIFEST_URL = `${CONTENT_BASE}code-formatter-manifest.json`;
const FALLBACK_CHAIN = { 'pt-PT': ['pt-BR'], 'pt-BR': ['pt-PT'] };

const TIP_CATEGORY_PATH = {
  python: 'tips/python/',
  javascript: 'tips/javascript/',
  typescript: 'tips/javascript/',
  java: 'tips/java/',
  csharp: 'tips/csharp/',
  php: 'tips/php/',
  sql: 'tips/sql-dax/',
  dax: 'tips/sql-dax/',
  json: 'tips/json-yaml/',
  yaml: 'tips/json-yaml/',
};

const LANG_DISPLAY = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php: 'PHP',
  sql: 'SQL & DAX',
  dax: 'SQL & DAX',
  java: 'Java',
  csharp: 'C#',
  json: 'JSON',
  yaml: 'YAML',
};

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'dataset' && v && typeof v === 'object') Object.assign(node.dataset, v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  });
  node.append(...children);
  return node;
};

const availableLangs = (tip) =>
  SUPPORTED_LANGS.filter((l) => l === 'es' || Boolean(tip.translations && tip.translations[l]));

function variantFor(tip) {
  const have = availableLangs(tip);
  const locale = [lang, ...(FALLBACK_CHAIN[lang] || []), 'en', 'es'].find((l) => have.includes(l)) || 'es';
  const tr = locale === 'es' ? null : tip.translations?.[locale];
  return {
    locale,
    title: tr?.title || tip.title,
    category: tr?.category || tip.category || '',
    file: tr?.file || tip.file,
  };
}

function fmtDate(iso) {
  try {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  } catch {
    return iso;
  }
}

function tipFullPageUrl(tip, locale) {
  const catPath = TIP_CATEGORY_PATH[tip.language] || 'tips/python/';
  return `${catPath}${encodeURIComponent(tip.slug)}/${encodeURIComponent(locale)}/`;
}

function parseMarkdownDetails(md) {
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const tags = [];
  if (fmMatch) {
    const tagLine = fmMatch[1].match(/^tags:\s*(.+)$/m);
    if (tagLine) {
      tagLine[1]
        .replace(/[\[\]"']/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => tags.push(s));
    }
  }
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const codeMatch = body.match(/```([a-zA-Z0-9_#-]*)\r?\n([\s\S]*?)```/);
  const codeLang = codeMatch ? codeMatch[1].trim().toLowerCase() : '';
  const codeSnippet = codeMatch ? codeMatch[2].trimEnd() : '';

  const textOnly = body.replace(/```[\s\S]*?```/g, '');
  const paragraphs = textOnly
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !/^[-*]\s/.test(p) && !/^\|/.test(p))
    .map((p) => p.replace(/[`*]/g, '').replace(/\s+/g, ' '));

  const excerpt = (paragraphs[0] || '').slice(0, 170);
  const summary = paragraphs.slice(0, 2).join('\n\n') || excerpt;
  return { tags, codeLang, codeSnippet, excerpt, summary };
}

function deriveTags(tip, v, parsed) {
  const raw = [];
  if (parsed?.tags?.length) raw.push(...parsed.tags);
  if (v.category) {
    v.category
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => raw.push(s));
  }
  return [...new Set(raw)].slice(0, 4);
}

function mapEditorLanguage(tipLang, codeLang) {
  const candidate = (codeLang || tipLang || '').toLowerCase();
  if (candidate === 'py' || candidate === 'python') return 'python';
  if (candidate === 'js' || candidate === 'javascript') return 'javascript';
  if (candidate === 'ts' || candidate === 'typescript') return 'typescript';
  if (candidate === 'cs' || candidate === 'csharp' || candidate === 'c#') return 'csharp';
  if (['sql', 'dax', 'java', 'php', 'json', 'yaml'].includes(candidate)) return candidate;
  return ['python', 'javascript', 'typescript', 'sql', 'dax', 'java', 'csharp', 'php', 'json', 'yaml'].includes(
    tipLang,
  )
    ? tipLang
    : 'auto';
}

export async function initTipsShowcase({ onLoadSnippet } = {}) {
  const section = document.getElementById('cf-weekly-tips');
  if (!section) return;

  const filtersEl = document.getElementById('cf-tips-filters');
  const countEl = document.getElementById('cf-tips-count');
  const viewportEl = document.getElementById('cf-tips-viewport');
  const trackEl = document.getElementById('cf-tips-track');
  const prevBtn = document.getElementById('cf-tips-prev');
  const nextBtn = document.getElementById('cf-tips-next');
  const toggleBtn = document.getElementById('cf-tips-toggle');
  const rssLink = document.getElementById('cf-channel-rss');
  const discordBtn = document.getElementById('cf-channel-discord');
  const discordModal = document.getElementById('cf-discord-modal');
  const modal = document.getElementById('cf-tip-detail-modal');

  const mdCache = new Map();
  let tips = [];
  let activeFilter = 'all';
  let activeTip = null;
  let userPaused = false;
  let hoverPaused = false;
  let focusPaused = false;
  let touchPaused = false;
  let rafId = null;
  let lastTs = 0;
  let hasLoopClone = false;

  const reducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isPaused = () => userPaused || hoverPaused || focusPaused || touchPaused || reducedMotion();

  function updateRssLink() {
    if (!rssLink) return;
    const feedLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    rssLink.setAttribute('href', `tips/feed.${feedLang}.xml`);
  }

  function updateToggleButton() {
    if (!toggleBtn) return;
    const paused = userPaused || reducedMotion();
    toggleBtn.textContent = paused ? '▶' : '⏸';
    toggleBtn.setAttribute('aria-pressed', String(paused));
    toggleBtn.setAttribute('aria-label', paused ? t('tipsPlayCarousel') : t('tipsPauseCarousel'));
    toggleBtn.setAttribute('title', paused ? t('tipsPlayCarousel') : t('tipsPauseCarousel'));
  }

  async function ensureMarkdown(tip, variant) {
    const key = `${tip.slug}:${variant.locale}`;
    if (mdCache.has(key)) return mdCache.get(key);
    try {
      const res = await fetch(`${CONTENT_BASE}${variant.file}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      const parsed = parseMarkdownDetails(md);
      mdCache.set(key, parsed);
      return parsed;
    } catch {
      const fallback = { tags: [], codeLang: tip.language, codeSnippet: '', excerpt: variant.title, summary: variant.title };
      mdCache.set(key, fallback);
      return fallback;
    }
  }

  function filteredTips() {
    if (activeFilter === 'all') return tips;
    if (activeFilter === 'sql') return tips.filter((item) => item.language === 'sql' || item.language === 'dax');
    return tips.filter((item) => item.language === activeFilter);
  }

  function renderCount(n) {
    if (!countEl) return;
    countEl.textContent = n === 1 ? t('tipsCountOne') : t('tipsCountLabel', { n });
  }

  function renderFilters() {
    if (!filtersEl) return;
    const counts = new Map();
    tips.forEach((tip) => {
      const key = tip.language === 'dax' ? 'sql' : tip.language;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const buttons = [];
    const allBtn = el('button', {
      type: 'button',
      className: `cf-filter-btn${activeFilter === 'all' ? ' is-active' : ''}`,
      role: 'tab',
      'aria-selected': activeFilter === 'all' ? 'true' : 'false',
      'aria-pressed': activeFilter === 'all' ? 'true' : 'false',
      textContent: `${t('tipsFilterAll')} (${tips.length})`,
    });
    allBtn.addEventListener('click', () => {
      activeFilter = 'all';
      renderFilters();
      renderCards();
    });
    buttons.push(allBtn);

    [...counts.entries()].forEach(([langKey, count]) => {
      const label = LANG_DISPLAY[langKey] || langKey.toUpperCase();
      const active = activeFilter === langKey;
      const btn = el('button', {
        type: 'button',
        className: `cf-filter-btn${active ? ' is-active' : ''}`,
        role: 'tab',
        'aria-selected': active ? 'true' : 'false',
        'aria-pressed': active ? 'true' : 'false',
        textContent: `${label} (${count})`,
      });
      btn.addEventListener('click', () => {
        activeFilter = langKey;
        renderFilters();
        renderCards();
      });
      buttons.push(btn);
    });

    filtersEl.replaceChildren(...buttons);
  }

  function buildCard(tip, isClone = false) {
    const v = variantFor(tip);
    const parsed = mdCache.get(`${tip.slug}:${v.locale}`);
    const tags = deriveTags(tip, v, parsed);
    const langClass = `cf-lang-badge--${tip.language || 'generic'}`;
    const langLabel = LANG_DISPLAY[tip.language] || (tip.language || 'code').toUpperCase();

    const head = el(
      'div',
      { className: 'cf-tip-carousel-card__head' },
      el('span', { className: `cf-lang-badge ${langClass}`, textContent: langLabel }),
      el('time', { className: 'cf-tip-carousel-card__date', datetime: tip.published_at, textContent: fmtDate(tip.published_at) }),
    );

    const tagsRow = el(
      'div',
      { className: 'cf-tip-carousel-card__tags' },
      ...tags.map((tg) => el('span', { className: 'cf-tip-tag', textContent: tg })),
    );

    const titleEl = el('h3', { className: 'cf-tip-carousel-card__title', textContent: v.title });
    const excerptText = parsed?.excerpt || v.category || v.title;
    const excerptEl = el('p', {
      className: 'cf-tip-carousel-card__excerpt',
      textContent: excerptText.length >= 165 ? `${excerptText}…` : excerptText,
    });

    const foot = el(
      'div',
      { className: 'cf-tip-carousel-card__foot' },
      el('span', { className: 'cf-tip-carousel-card__cta', textContent: t('tipsReadMore') }),
    );

    const card = el(
      'article',
      {
        className: 'cf-card cf-tip-carousel-card',
        tabindex: isClone ? '-1' : '0',
        role: 'button',
        'aria-label': v.title,
        ...(isClone ? { 'aria-hidden': 'true' } : {}),
      },
      head,
      tagsRow,
      titleEl,
      excerptEl,
      foot,
    );

    const activate = () => openTipModal(tip);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });

    return card;
  }

  function renderCards() {
    if (!trackEl || !viewportEl) return;
    const list = filteredTips();
    renderCount(list.length);
    const primaryNodes = list.map((tip) => buildCard(tip, false));
    hasLoopClone = list.length >= 3;
    const allNodes = hasLoopClone
      ? [...primaryNodes, ...list.map((tip) => buildCard(tip, true))]
      : primaryNodes;

    trackEl.replaceChildren(...allNodes);
    viewportEl.scrollLeft = 0;
  }

  async function openTipModal(tip) {
    if (!modal) return;
    activeTip = tip;
    const v = variantFor(tip);
    const parsed = await ensureMarkdown(tip, v);
    const tags = deriveTags(tip, v, parsed);

    const titleNode = document.getElementById('cf-tip-modal-title');
    const langNode = document.getElementById('cf-tip-modal-lang');
    const dateNode = document.getElementById('cf-tip-modal-date');
    const tagsNode = document.getElementById('cf-tip-modal-tags');
    const summaryNode = document.getElementById('cf-tip-modal-summary');
    const codeWrap = document.getElementById('cf-tip-modal-code-wrap');
    const codeNode = document.getElementById('cf-tip-modal-code');
    const fullBtn = document.getElementById('cf-tip-modal-full');
    const loadBtn = document.getElementById('cf-tip-modal-load');

    if (titleNode) titleNode.textContent = v.title;
    if (langNode) {
      langNode.className = `cf-lang-badge cf-lang-badge--${tip.language || 'generic'}`;
      langNode.textContent = LANG_DISPLAY[tip.language] || (tip.language || 'code').toUpperCase();
    }
    if (dateNode) {
      dateNode.textContent = fmtDate(tip.published_at);
      dateNode.setAttribute('datetime', tip.published_at);
    }
    if (tagsNode) {
      tagsNode.replaceChildren(...tags.map((tg) => el('span', { className: 'cf-tip-tag', textContent: tg })));
    }
    if (summaryNode) summaryNode.textContent = parsed.summary || v.title;

    if (codeWrap && codeNode) {
      if (parsed.codeSnippet) {
        codeNode.textContent = parsed.codeSnippet;
        codeWrap.hidden = false;
      } else {
        codeNode.textContent = '';
        codeWrap.hidden = true;
      }
    }

    if (fullBtn) {
      fullBtn.setAttribute('href', tipFullPageUrl(tip, v.locale));
    }
    if (loadBtn) {
      loadBtn.hidden = !parsed.codeSnippet;
      loadBtn.onclick = () => {
        if (!parsed.codeSnippet) return;
        const byteLen = new TextEncoder().encode(parsed.codeSnippet).length;
        if (byteLen > MAX_CODE_BYTES) {
          toast(t('tooBig', { kb: MAX_CODE_BYTES / 1024 }));
          return;
        }
        const editorLang = mapEditorLanguage(tip.language, parsed.codeLang);
        if (typeof onLoadSnippet === 'function') {
          onLoadSnippet({ lang: editorLang, code: parsed.codeSnippet });
        } else {
          document.dispatchEvent(
            new CustomEvent('cf:load-snippet', { detail: { lang: editorLang, code: parsed.codeSnippet } }),
          );
        }
        modal.close();
        toast(t('tipsLoadedInEditor'));
      };
    }

    if (!modal.open) modal.showModal();
  }

  function stepAutoScroll(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(ts - lastTs, 64);
    lastTs = ts;

    if (!isPaused() && viewportEl && trackEl) {
      const maxScroll = trackEl.scrollWidth - viewportEl.clientWidth;
      if (maxScroll > 8) {
        viewportEl.scrollLeft += (dt * 0.042); // ~42 px/s fluido derecha -> izquierda
        if (hasLoopClone) {
          const half = trackEl.scrollWidth / 2;
          if (viewportEl.scrollLeft >= half) {
            viewportEl.scrollLeft -= half;
          }
        } else if (viewportEl.scrollLeft >= maxScroll - 1) {
          viewportEl.scrollLeft = 0;
        }
      }
    }
    rafId = requestAnimationFrame(stepAutoScroll);
  }

  function scrollManual(direction) {
    if (!viewportEl) return;
    const step = Math.max(280, Math.round(viewportEl.clientWidth * 0.65));
    viewportEl.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  // Eventos de pausa automática UX & accesibilidad
  viewportEl?.addEventListener('mouseenter', () => { hoverPaused = true; });
  viewportEl?.addEventListener('mouseleave', () => { hoverPaused = false; });
  viewportEl?.addEventListener('focusin', () => { focusPaused = true; });
  viewportEl?.addEventListener('focusout', () => { focusPaused = false; });
  viewportEl?.addEventListener('touchstart', () => { touchPaused = true; }, { passive: true });
  viewportEl?.addEventListener('touchend', () => { setTimeout(() => { touchPaused = false; }, 1200); }, { passive: true });

  prevBtn?.addEventListener('click', () => scrollManual(-1));
  nextBtn?.addEventListener('click', () => scrollManual(1));
  toggleBtn?.addEventListener('click', () => {
    userPaused = !userPaused;
    updateToggleButton();
  });

  // Cierre de modales (clic en backdrop o botón cerrar)
  [modal, discordModal].forEach((dlg) => {
    if (!dlg) return;
    dlg.querySelectorAll('[data-cf-close]').forEach((btn) => btn.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  });

  discordBtn?.addEventListener('click', () => {
    if (discordModal && !discordModal.open) discordModal.showModal();
  });

  updateRssLink();
  updateToggleButton();

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tips = Array.isArray(data?.tips) ? [...data.tips].reverse() : [];
    renderFilters();
    renderCards();

    // Precarga asíncrona de extractos y snippets Markdown sin bloquear el primer render
    Promise.allSettled(tips.map((tip) => ensureMarkdown(tip, variantFor(tip)))).then(() => {
      renderCards();
    });

    if (!rafId) rafId = requestAnimationFrame(stepAutoScroll);
  } catch (err) {
    console.warn('[code-formatter] no se pudo cargar el manifiesto de tips:', err.message);
  }

  document.addEventListener('cf:lang', () => {
    updateRssLink();
    updateToggleButton();
    renderFilters();
    renderCards();
    Promise.allSettled(tips.map((tip) => ensureMarkdown(tip, variantFor(tip)))).then(() => {
      renderCards();
      if (modal?.open && activeTip) openTipModal(activeTip);
    });
  });
}

if (typeof document !== 'undefined' && document.getElementById('cf-weekly-tips')) {
  initTipsShowcase().catch((err) => console.warn('[code-formatter] carrusel de tips no iniciado:', err.message));
}
