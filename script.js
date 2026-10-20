/* ═══════════════════════════════════════════════════════════════════════════════
   JW SOLUTIONS — SCRIPT.JS v1.0
   Vanilla JS · Mobile-first · Zero dependencies
   ═══════════════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────────
     CONFIGURACIÓN
     ───────────────────────────────────────────────────────────────────────────── */
  const CONFIG = {
    lang: {
      default: 'es',
      supported: ['es', 'en']
    },
    analytics: {
      id: 'G-ZPCTT7N91T'
    },
    scrollReveal: {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    },
    particles: {
      count: 60,
      color: 'rgba(251, 178, 0, 0.4)',
      connectionDistance: 120,
      speed: 0.5
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────────────────────────────────────── */
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const on = (el, event, handler, options = false) => el.addEventListener(event, handler, options);
  const scrollBehavior = () =>
    (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const throttle = (fn, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     1. LANGUAGE SWITCHER (ES/EN)
     ───────────────────────────────────────────────────────────────────────────── */
  const LangSwitcher = (() => {
    const STORAGE_KEY = 'jw_lang';
    let currentLang = CONFIG.lang.default;

    function detectBrowserLang() {
      const navLang = navigator.language || navigator.userLanguage || '';
      const code = navLang.split('-')[0].toLowerCase();
      return CONFIG.lang.supported.includes(code) ? code : CONFIG.lang.default;
    }

    function detectGeolocationLang() {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const enZones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
          'Europe/London', 'Europe/Dublin', 'Australia/Sydney', 'Pacific/Auckland'];
        return enZones.some(z => tz.includes(z)) ? 'en' : 'es';
      } catch (e) {
        return detectBrowserLang();
      }
    }

    function getInitialLang() {
      // Prioridad 1: parámetro ?lang=xx de la URL (coincide con hreflang del <head>)
      try {
        const urlLang = (new URLSearchParams(window.location.search).get('lang') || '').toLowerCase();
        if (CONFIG.lang.supported.includes(urlLang)) return urlLang;
      } catch (e) {
        // URLSearchParams no disponible: se ignora el parámetro
      }
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && CONFIG.lang.supported.includes(saved)) return saved;
      } catch (e) {
        // Almacenamiento bloqueado (modo privado / cookies deshabilitadas)
      }
      return detectGeolocationLang();
    }

    function applyLang(lang) {
      currentLang = lang;
      document.documentElement.lang = lang;

      // Toggle visibility of all data-lang elements
      $$('[data-lang]').forEach(el => {
        if (el.getAttribute('data-lang') === lang) {
          el.style.display = '';
          el.removeAttribute('hidden');
        } else {
          el.style.display = 'none';
          el.setAttribute('hidden', '');
        }
      });

      // Nombres accesibles según idioma
      $$('section[aria-labelledby], [role="dialog"][aria-labelledby]').forEach(section => {
        const title = section.querySelector(`h2[data-lang="${lang}"]`);
        if (!title) return;
        if (!title.id) title.id = `${section.id}-title-${lang}`;
        section.setAttribute('aria-labelledby', title.id);
      });

      const labels = {
        'mobile-toggle': ['Menú móvil', 'Mobile menu'],
        'back-to-top': ['Volver arriba', 'Back to top'],
        'newsletter-email': ['Correo electrónico', 'Email address'],
        'cookie-banner': ['Consentimiento de cookies', 'Cookie consent'],
        'mobile-cta-bar': ['Acciones rápidas', 'Quick actions']
      };
      Object.keys(labels).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('aria-label', labels[id][lang === 'es' ? 0 : 1]);
      });
      $$('.modal-x').forEach(b => b.setAttribute('aria-label', lang === 'es' ? 'Cerrar' : 'Close'));
      $$('nav[aria-label]').forEach(n => n.setAttribute('aria-label', lang === 'es' ? 'Navegación principal' : 'Main navigation'));

      // Update toggle button
      const toggleBtn = $('#lang-toggle');
      const flagEl = $('#current-flag');
      const labelEl = $('#current-lang');
      if (toggleBtn && flagEl && labelEl) {
        flagEl.textContent = lang === 'es' ? '🇪🇸' : '🇺🇸';
        labelEl.textContent = lang.toUpperCase();
        toggleBtn.setAttribute('aria-label',
          lang === 'es' ? 'ES · Cambiar idioma a inglés' : 'EN · Switch language to Spanish');
      }

      // Update meta tags for SEO
      const ogLocale = $('meta[property="og:locale"]');
      if (ogLocale) ogLocale.setAttribute('content', lang === 'es' ? 'es_ES' : 'en_US');

      // Save preference
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('jw:langchange', { detail: { lang } }));
    }

    function toggle() {
      const next = currentLang === 'es' ? 'en' : 'es';
      applyLang(next);
    }

    function init() {
      const initial = getInitialLang();
      applyLang(initial);

      const toggleBtn = $('#lang-toggle');
      if (toggleBtn) {
        on(toggleBtn, 'click', toggle);
      }
    }

    return { init, getCurrent: () => currentLang, apply: applyLang };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     2. MOBILE MENU (HAMBURGER)
     ───────────────────────────────────────────────────────────────────────────── */
  const MobileMenu = (() => {
    let isOpen = false;

    function toggle() {
      const toggleBtn = $('#mobile-toggle');
      const nav = $('#nav');
      if (!toggleBtn || !nav) return;

      isOpen = !isOpen;
      toggleBtn.classList.toggle('active', isOpen);
      toggleBtn.setAttribute('aria-expanded', isOpen);
      nav.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    }

    function close() {
      if (!isOpen) return;
      toggle();
    }

    function init() {
      const toggleBtn = $('#mobile-toggle');
      if (toggleBtn) {
        on(toggleBtn, 'click', toggle);
      }

      // Close on nav link click
      $$('.nav-link').forEach(link => {
        on(link, 'click', close);
      });

      // Close on Escape key
      on(document, 'keydown', (e) => {
        if (e.key === 'Escape' && isOpen) close();
      });

      // Close on resize to desktop
      on(window, 'resize', throttle(() => {
        if (window.innerWidth >= 768 && isOpen) close();
      }, 250));
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     3. HEADER SCROLL EFFECT
     ───────────────────────────────────────────────────────────────────────────── */
  const HeaderScroll = (() => {
    function update() {
      const header = $('#header');
      if (!header) return;
      const scrolled = window.scrollY > 50;
      header.classList.toggle('scrolled', scrolled);
    }

    function init() {
      on(window, 'scroll', throttle(update, 100), { passive: true });
      update();
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     4. PARTICLES CANVAS (HERO BACKGROUND)
     ───────────────────────────────────────────────────────────────────────────── */
  const Particles = (() => {
    let canvas, ctx, particles = [];
    let animationId;
    let isVisible = true;

    class Particle {
      constructor(w, h) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * CONFIG.particles.speed;
        this.vy = (Math.random() - 0.5) * CONFIG.particles.speed;
        this.radius = Math.random() * 2 + 1;
        this.opacity = Math.random() * 0.5 + 0.2;
      }

      update(w, h) {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
      }

      draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.particles.color.replace('0.4', this.opacity.toFixed(2));
        ctx.fill();
      }
    }

    function drawLines() {
      const { connectionDistance } = CONFIG.particles;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const opacity = (1 - dist / connectionDistance) * 0.2;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(251, 178, 0, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      if (!isVisible) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.update(w, h);
        p.draw(ctx);
      });

      drawLines();
      animationId = requestAnimationFrame(animate);
    }

    function resize() {
      const container = canvas.parentElement;
      if (!container) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = container.offsetWidth * dpr;
      canvas.height = container.offsetHeight * dpr;
      canvas.style.width = container.offsetWidth + 'px';
      canvas.style.height = container.offsetHeight + 'px';
      ctx.scale(dpr, dpr);
    }

    function init() {
      const container = $('#particles');
      if (!container) return;

      // Check for reduced motion preference
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');

      resize();

      const w = container.offsetWidth;
      const h = container.offsetHeight;
      for (let i = 0; i < CONFIG.particles.count; i++) {
        particles.push(new Particle(w, h));
      }

      animate();

      on(window, 'resize', throttle(() => {
        resize();
        particles = [];
        for (let i = 0; i < CONFIG.particles.count; i++) {
          particles.push(new Particle(container.offsetWidth, container.offsetHeight));
        }
      }, 250));

      // Pause when not visible
      const observer = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
      }, { threshold: 0 });
      observer.observe(container);
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     6. FAQ ACCORDION
     ───────────────────────────────────────────────────────────────────────────── */
  const FAQAccordion = (() => {
    function init() {
      const items = $$('.faq-item');
      items.forEach(item => {
        const summary = item.querySelector('summary');
        if (!summary) return;

        on(summary, 'click', (e) => {
          // Close others (optional - comment out for multiple open)
          items.forEach(other => {
            if (other !== item && other.hasAttribute('open')) {
              other.removeAttribute('open');
            }
          });
        });
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     7. SCROLL REVEAL (IntersectionObserver)
     ───────────────────────────────────────────────────────────────────────────── */
  const ScrollReveal = (() => {
    function init() {
      const revealElements = $$('.reveal');
      if (revealElements.length === 0) return;

      // Add reveal class to elements that should animate
      const sections = $$('section');
      sections.forEach((section, i) => {
        const children = section.querySelectorAll('.service-card, .pillar-card, .portfolio-card, .tool-card, .blog-card, .faq-item, .contact-card');
        children.forEach((child, j) => {
          child.classList.add('reveal');
          child.classList.add(`reveal-delay-${(j % 4) + 1}`);
        });
      });

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: CONFIG.scrollReveal.threshold,
        rootMargin: CONFIG.scrollReveal.rootMargin
      });

      $$('.reveal').forEach(el => observer.observe(el));
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     8. BACK TO TOP BUTTON
     ───────────────────────────────────────────────────────────────────────────── */
  const BackToTop = (() => {
    function update() {
      const btn = $('#back-to-top');
      if (!btn) return;
      const show = window.scrollY > 500;
      btn.classList.toggle('visible', show);
    }

    function init() {
      const btn = $('#back-to-top');
      if (!btn) return;

      on(btn, 'click', () => {
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
      });

      on(window, 'scroll', throttle(update, 100), { passive: true });
      update();
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     9. FORM VALIDATION & HANDLING
     ───────────────────────────────────────────────────────────────────────────── */
  const Forms = (() => {
    const TIMEOUT_MS = 15000;
    const t = (es, en) => (LangSwitcher.getCurrent() === 'es' ? es : en);

    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setStatus(el, message, type) {
      if (!el) return;
      el.textContent = message;
      el.className = type ? `form-message ${type}` : 'form-message';
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    }

    function clearFieldError(input) {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      const err = document.getElementById(`${input.id}-error`);
      if (err) err.remove();
    }

    function setFieldError(input, message) {
      clearFieldError(input);
      const err = document.createElement('p');
      err.id = `${input.id}-error`;
      err.className = 'field-error';
      err.textContent = message;
      const anchor = input.closest('.form-group--inline') || input;
      anchor.insertAdjacentElement('afterend', err);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id);
    }

    function fieldProblem(input) {
      const value = input.value.trim();
      if (input.required && !value) {
        return t('Este campo es obligatorio.', 'This field is required.');
      }
      if (input.type === 'email' && value && !validateEmail(value)) {
        return t('Ingresa un email válido.', 'Enter a valid email address.');
      }
      return '';
    }

    function validate(form) {
      let firstInvalid = null;
      $$('input:not([type="hidden"]):not(.hp-field), textarea, select', form).forEach(input => {
        const problem = fieldProblem(input);
        if (problem) {
          setFieldError(input, problem);
          if (!firstInvalid) firstInvalid = input;
        } else {
          clearFieldError(input);
        }
      });
      return firstInvalid;
    }

    function setLoading(form, loading) {
      form.dataset.submitting = loading ? 'true' : 'false';
      form.setAttribute('aria-busy', String(loading));
      $$('button[type="submit"]', form).forEach(btn => {
        btn.disabled = loading;
        btn.classList.toggle('is-loading', loading);
      });
    }

    async function submitForm(e, cfg) {
      e.preventDefault();
      const form = e.currentTarget;
      const statusEl = $(cfg.status);

      // Bloqueo contra doble envío
      if (form.dataset.submitting === 'true') return;

      // Honeypot: un bot rellenó el campo oculto
      const trap = form.querySelector('.hp-field');
      if (trap && trap.value) return;

      setStatus(statusEl, '', null);
      const firstInvalid = validate(form);
      if (firstInvalid) {
        setStatus(statusEl, t('Revisa los campos marcados e inténtalo de nuevo.', 'Please check the highlighted fields and try again.'), 'error');
        firstInvalid.focus();
        return;
      }

      setLoading(form, true);
      setStatus(statusEl, t('Enviando…', 'Sending…'), 'info');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });

        if (!response.ok) {
          let detail = '';
          try {
            const data = await response.json();
            detail = (data.errors || []).map(x => x.message).join(' ');
          } catch (_) { /* respuesta sin JSON */ }
          throw new Error(detail || `HTTP ${response.status}`);
        }

        setStatus(statusEl, cfg.successMsg(), 'success');
        form.reset();
        $$('input, textarea, select', form).forEach(clearFieldError);

        if (typeof gtag !== 'undefined') {
          gtag('event', 'submit_form', { event_category: cfg.category, event_label: cfg.label });
        }
      } catch (err) {
        const timedOut = err && err.name === 'AbortError';
        setStatus(statusEl, timedOut
          ? t('La solicitud tardó demasiado. Inténtalo de nuevo o escríbenos a contact@jw-solutions.com',
              'The request timed out. Try again or email us at contact@jw-solutions.com')
          : t('No pudimos enviar el formulario. Inténtalo de nuevo o escríbenos a contact@jw-solutions.com',
              'We could not send the form. Try again or email us at contact@jw-solutions.com'),
          'error');
      } finally {
        clearTimeout(timer);
        setLoading(form, false);
      }
    }

    function bind(selector, cfg) {
      const form = $(selector);
      if (!form) return;
      form.setAttribute('novalidate', '');
      on(form, 'submit', (e) => submitForm(e, cfg));

      $$('input[required], textarea[required], input[type="email"]', form).forEach(input => {
        on(input, 'blur', () => {
          const problem = fieldProblem(input);
          if (problem) setFieldError(input, problem);
          else clearFieldError(input);
        });
        on(input, 'input', () => {
          if (input.getAttribute('aria-invalid') === 'true' && !fieldProblem(input)) {
            clearFieldError(input);
          }
        });
      });
    }

    function init() {
      bind('#contact-form', {
        status: '#contact-message-status',
        category: 'contact',
        label: 'contact_form',
        successMsg: () => t('¡Mensaje enviado! Te contactaremos en menos de 24 horas.', 'Message sent! We will contact you within 24 hours.')
      });

      bind('#newsletter-form', {
        status: '#newsletter-message',
        category: 'newsletter',
        label: 'newsletter_subscribe',
        successMsg: () => t('¡Gracias por suscribirte!', 'Thanks for subscribing!')
      });

      // Los mensajes de error ya renderizados quedarían en el idioma anterior
      on(window, 'jw:langchange', () => {
        $$('.field-error').forEach(el => el.remove());
        $$('[aria-invalid="true"]').forEach(el => {
          el.removeAttribute('aria-invalid');
          el.removeAttribute('aria-describedby');
        });
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     10. SMOOTH SCROLL ANCHORS
     ───────────────────────────────────────────────────────────────────────────── */
  const SmoothScroll = (() => {
    function init() {
      $$('a[href^="#"]').forEach(anchor => {
        on(anchor, 'click', (e) => {
          const targetId = anchor.getAttribute('href');
          if (targetId === '#') return;

          const target = $(targetId);
          if (target) {
            e.preventDefault();
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.scrollY - headerOffset;

            window.scrollTo({
              top: offsetPosition,
              behavior: scrollBehavior()
            });

            // Update URL without jumping
            if (history.pushState) {
              history.pushState(null, null, targetId);
            }

            // Track anchor click
            if (typeof gtag !== 'undefined') {
              gtag('event', 'click', {
                event_category: 'navigation',
                event_label: targetId
              });
            }
          }
        });
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     11. LAZY LOADING IMAGES (Fallback for older browsers)
     ───────────────────────────────────────────────────────────────────────────── */
  const LazyImages = (() => {
    function init() {
      if ('loading' in HTMLImageElement.prototype) {
        // Native lazy loading supported
        return;
      }

      // Fallback for older browsers
      const images = $$('img[loading="lazy"]');
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src || img.src;
            img.removeAttribute('loading');
            imageObserver.unobserve(img);
          }
        });
      });

      images.forEach(img => imageObserver.observe(img));
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     12. CURRENT YEAR UPDATE
     ───────────────────────────────────────────────────────────────────────────── */
  const CurrentYear = (() => {
    function init() {
      const year = new Date().getFullYear();
      // Recorre nodos de texto (no innerHTML): re-parsear atributos style violaría la CSP
      $$('.footer-copyright').forEach(el => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue.includes('2026')) node.nodeValue = node.nodeValue.replace('2026', year);
        }
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     13. ANALYTICS EVENT TRACKING
     ───────────────────────────────────────────────────────────────────────────── */
  const Analytics = (() => {
    function trackEvent(category, action, label) {
      if (typeof gtag !== 'undefined') {
        gtag('event', action, {
          event_category: category,
          event_label: label
        });
      }
    }

    function init() {
      // Track CTA clicks
      $$('.btn--primary').forEach(btn => {
        on(btn, 'click', () => {
          trackEvent('engagement', 'cta_click', btn.textContent.trim().substring(0, 50));
        });
      });

      // Track service card clicks
      $$('.service-link').forEach(link => {
        on(link, 'click', () => {
          trackEvent('engagement', 'service_interest', link.closest('.service-card')?.querySelector('h3')?.textContent?.substring(0, 50));
        });
      });

      // Track tool/referral clicks
      $$('.tool-link:not(.tool-link--placeholder)').forEach(link => {
        on(link, 'click', () => {
          trackEvent('referral', 'tool_click', link.closest('.tool-card')?.querySelector('h3')?.textContent);
        });
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     14. SERVICE WORKER (OPTIONAL - PWA READY)
     ───────────────────────────────────────────────────────────────────────────── */
  const PWA = (() => {
    function init() {
      if ('serviceWorker' in navigator) {
        // Uncomment when ready to deploy PWA
        // navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    }
    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     15. CONSENTIMIENTO DE COOKIES + CARGA CONDICIONAL DE GA4
     ───────────────────────────────────────────────────────────────────────────── */
  const Consent = (() => {
    const KEY = 'jw_cookie_consent';
    const GA_ID = CONFIG.analytics.id;
    let memory = null;       // respaldo si localStorage no está disponible
    let gaLoaded = false;

    const t = (es, en) => (LangSwitcher.getCurrent() === 'es' ? es : en);

    function read() {
      try {
        const v = localStorage.getItem(KEY);
        if (v === 'granted' || v === 'denied') return v;
      } catch (e) { /* almacenamiento bloqueado */ }
      return memory;
    }

    function write(value) {
      memory = value;
      try { localStorage.setItem(KEY, value); } catch (e) { /* sin persistencia */ }
    }

    // GA4 se inyecta únicamente tras el consentimiento explícito
    function loadGA() {
      window['ga-disable-' + GA_ID] = false;
      if (gaLoaded) return;
      gaLoaded = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      document.head.appendChild(script);
      window.gtag('js', new Date());
      window.gtag('config', GA_ID);
    }

    function removeGACookies() {
      const host = location.hostname;
      const parts = host.split('.');
      const domains = ['', host, '.' + host];
      if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
      document.cookie.split(';').forEach(raw => {
        const name = raw.split('=')[0].trim();
        if (name === '_ga' || name === '_gid' || name === '_gat' || name.indexOf('_ga_') === 0) {
          domains.forEach(d => {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
          });
        }
      });
    }

    function bannerEl() { return $('#cookie-banner'); }

    function syncBannerSpace() {
      const banner = bannerEl();
      if (!banner) return;
      const open = !banner.hidden;
      document.body.classList.toggle('cookie-banner-open', open);
      document.documentElement.style.setProperty('--banner-h', open ? banner.offsetHeight + 'px' : '0px');
    }

    function renderStatus() {
      const value = read();
      const msg = value === 'granted'
        ? t('Estado actual: analíticas aceptadas.', 'Current status: analytics accepted.')
        : value === 'denied'
          ? t('Estado actual: analíticas rechazadas.', 'Current status: analytics rejected.')
          : t('Estado actual: sin decisión (analíticas desactivadas).', 'Current status: no choice yet (analytics off).');
      $$('[data-consent-status]').forEach(el => { el.textContent = msg; });
    }

    function apply(value) {
      const banner = bannerEl();
      // Evita perder el foco cuando el botón pulsado desaparece con el banner
      if (banner && banner.contains(document.activeElement)) {
        const main = $('#main');
        if (main) main.focus({ preventScroll: true });
      }

      write(value);
      if (value === 'granted') {
        loadGA();
      } else {
        window['ga-disable-' + GA_ID] = true;
        removeGACookies();
      }
      if (banner) banner.hidden = true;
      syncBannerSpace();
      renderStatus();
    }

    function init() {
      const value = read();
      if (value === 'granted') loadGA();

      const banner = bannerEl();
      if (banner && !value) {
        banner.hidden = false;
        syncBannerSpace();
      }
      renderStatus();

      on(document, 'click', (e) => {
        const btn = e.target.closest('[data-consent]');
        if (!btn) return;
        apply(btn.getAttribute('data-consent') === 'accept' ? 'granted' : 'denied');
      });

      on(window, 'jw:langchange', () => { renderStatus(); syncBannerSpace(); });
      on(window, 'resize', throttle(syncBannerSpace, 250));
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     16. MODALES LEGALES (diálogo accesible)
     ───────────────────────────────────────────────────────────────────────────── */
  const LegalModals = (() => {
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    let active = null;
    let opener = null;

    function dialogOf(modal) { return modal.querySelector('[role="dialog"]'); }

    function focusables(root) {
      return $$(FOCUSABLE, root).filter(el => el.getClientRects().length > 0);
    }

    function open(id, trigger) {
      const modal = document.getElementById('modal-' + id);
      if (!modal) return;
      if (active) close(true);
      opener = trigger;
      active = modal;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      const dialog = dialogOf(modal);
      dialog.scrollTop = 0;
      dialog.focus();
    }

    function close(silent) {
      if (!active) return;
      active.hidden = true;
      active = null;
      document.body.style.overflow = '';
      if (!silent) {
        const visible = opener && document.contains(opener) && opener.getClientRects().length > 0;
        const target = visible ? opener : $('#main');
        if (target) target.focus({ preventScroll: true });
      }
      opener = null;
    }

    function trapTab(e) {
      const dialog = dialogOf(active);
      const items = focusables(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }

    function init() {
      on(document, 'click', (e) => {
        const trigger = e.target.closest('[data-legal]');
        if (trigger) {
          e.preventDefault();
          open(trigger.getAttribute('data-legal'), trigger);
          return;
        }
        if (!active) return;
        if (e.target.closest('[data-modal-close]') || e.target === active) close();
      });

      on(document, 'keydown', (e) => {
        if (!active) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'Tab') {
          trapTab(e);
        }
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     16b. CALCULADORA DE CAMBIO MONETARIO (VES / USD / EUR)
     ───────────────────────────────────────────────────────────────────────────── */
  const FxCalculator = (() => {
    const SITE = 'https://jw-solutions.com';
    // Orden estricto de tarjetas. `cur` = divisa cotizada en VES. 'avg' se calcula (no viene de la API).
    const DEFS = [
      { id: 'bcv', cur: 'USD', accent: '#FFB800', demo: 880.12, name: { es: 'Oficial BCV', en: 'Official BCV' },
        label: { es: 'Dólar · Banco Central de Venezuela', en: 'US Dollar · Central Bank of Venezuela' }, tagL: { es: 'OFICIAL', en: 'OFFICIAL' },
        source: { es: 'Fuente: DolarApi · oficial', en: 'Source: DolarApi · official' } },
      { id: 'eur', cur: 'EUR', accent: '#34D399', demo: 991.16, name: { es: 'Euro BCV', en: 'Euro BCV' },
        label: { es: 'Euro · Banco Central de Venezuela', en: 'Euro · Central Bank of Venezuela' }, tagL: { es: 'OFICIAL', en: 'OFFICIAL' },
        source: { es: 'Fuente: DolarApi · euro oficial', en: 'Source: DolarApi · official euro' } },
      { id: 'p2p', cur: 'USD', accent: '#A78BFA', demo: 997.95, name: { es: 'Binance P2P', en: 'Binance P2P' },
        label: { es: 'Referencia cripto / P2P', en: 'Crypto / P2P reference' }, tagL: { es: 'CRIPTO', en: 'CRYPTO' },
        source: { es: 'Fuente: DolarApi · paralelo (P2P)', en: 'Source: DolarApi · parallel (P2P)' } },
      { id: 'avg', cur: 'USD', accent: '#38BDF8', demo: 0, name: { es: 'Promedio', en: 'Average' },
        label: { es: 'Media de BCV, Euro BCV y P2P', en: 'Mean of BCV, Euro BCV and P2P' }, tagL: { es: 'PROMEDIO', en: 'AVERAGE' },
        source: { es: 'Calculado: (BCV + Euro + P2P) ÷ 3', en: 'Calculated: (BCV + Euro + P2P) ÷ 3' } }
    ];
    const TXT = {
      es: { live: 'En Vivo', demo: 'Datos DEMO', loading: 'Consultando…', enter: 'Ingresa un monto', eq: 'Equivalente calculado', amt: 'Monto a convertir',
        upd: 'Actualizado', copied: 'Resumen copiado', copyFail: 'No se pudo copiar', none: 'Selecciona al menos una tasa',
        shared: 'Solicitud de compartir enviada.', cancelled: 'Compartir cancelado.', dl: 'Imagen PNG descargada.',
        noShare: 'El navegador no admite compartir archivos: se descargó el PNG y se copió el resumen.',
        shareFail: 'No se pudo compartir. Usa Descargar PNG o Copiar resumen.', imgFail: 'No se pudo generar la imagen.',
        sub: 'Referencias de cambio Venezuela', title: 'Monitor de Tasas', tool: 'Herramienta Gratuita: Calculadora de Cambio Monetario',
        warn: 'Tasas de referencia informativa. Verifica antes de realizar una operación.', gen: 'Generado por JW-SOLUTIONS' },
      en: { live: 'Live', demo: 'DEMO data', loading: 'Fetching…', enter: 'Enter an amount', eq: 'Calculated equivalent', amt: 'Amount to convert',
        upd: 'Updated', copied: 'Summary copied', copyFail: 'Could not copy', none: 'Select at least one rate',
        shared: 'Share request sent.', cancelled: 'Share cancelled.', dl: 'PNG image downloaded.',
        noShare: 'This browser cannot share files: the PNG was downloaded and the summary copied.',
        shareFail: 'Could not share. Use Download PNG or Copy summary.', imgFail: 'Could not generate the image.',
        sub: 'Venezuela exchange references', title: 'Rates Monitor', tool: 'Free Tool: Currency Exchange Calculator',
        warn: 'Informational reference rates. Verify before making a transaction.', gen: 'Generated by JW-SOLUTIONS' }
    };
    const fmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let root, amount, mode, grid, statusEl, statusText, updatedEl, amountLine;
    let shareEl, pickerList, warnEl, previewImg, noteEl, shareBtn, dlBtn, copyBtn;
    let rates = [];
    let state = 'loading';
    let started = false;
    const selected = new Set(DEFS.map(d => d.id));
    let blob = null, blobUrl = null, token = 0;

    const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'es');
    const nowIso = () => new Date().toISOString();
    const withAverage = (list) => {
      const avg = list.find(r => r.id === 'avg');
      const parts = ['bcv', 'eur', 'p2p'].map(id => list.find(r => r.id === id).value);
      avg.value = parts.reduce((a, b) => a + b, 0) / 3; // Promedio = (Oficial BCV + Euro BCV + Binance P2P) / 3
      return list;
    };
    const demoRates = () => withAverage(DEFS.map(d => ({ id: d.id, value: d.demo, updated: nowIso(), live: false })));
    const def = (id) => DEFS.find(d => d.id === id);
    const toVes = () => mode.value === 'USD';
    // USD/EUR → VES: monto × tasa · VES → USD/EUR: monto ÷ tasa (la divisa la define cada tarjeta)
    const resultText = (amt, r) => (toVes() ? `${fmt.format(amt * r.value)} VES` : `${fmt.format(amt / r.value)} ${def(r.id).cur}`);
    const perText = (d) => `VES ${lang() === 'en' ? 'per 1' : 'por 1'} ${d.cur}`;
    const eqLabel = (amt, r) => (amt === null ? TXT[lang()].eq : `${fmt.format(amt)} ${toVes() ? def(r.id).cur : 'VES'} =`);
    const amountText = (amt) => `${TXT[lang()].amt}: ${fmt.format(amt)} ${toVes() ? 'USD / EUR' : 'VES'}`;
    const chosen = () => rates.filter(r => selected.has(r.id));

    // Acepta coma decimal (es-VE) y punto; si hay ambos, el punto es separador de miles.
    function parseAmount(raw) {
      let v = String(raw ?? '').trim().replace(/\s+/g, '').replace(/[^0-9,.]/g, '');
      if (!v) return null;
      const comma = v.includes(','), dot = v.includes('.');
      if (comma && dot) v = v.replace(/\./g, '').replace(',', '.');
      else if (comma) v = v.replace(',', '.');
      else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ''); // "100.000" = cien mil (miles es-VE)
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }

    function fmtDateTime(value) {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(lang() === 'en' ? 'en-US' : 'es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }

    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function render() {
      const L = TXT[lang()];
      const amt = parseAmount(amount.value);
      statusEl.dataset.state = state;
      statusText.textContent = L[state];
      grid.textContent = '';
      rates.forEach((r) => {
        const d = def(r.id);
        const card = el('article', 'fx-card');
        card.style.setProperty('--fx-accent', d.accent);
        const top = el('div', 'fx-card-top');
        const head = el('div');
        head.append(el('h4', 'fx-card-name', d.name[lang()]), el('p', 'fx-card-label', d.label[lang()]));
        top.append(head, el('span', 'fx-tag', d.tagL[lang()]));
        const foot = el('div', 'fx-card-foot');
        foot.append(el('span', 'fx-card-source', r.live ? d.source[lang()] : `Demo · ${d.name[lang()]}`), el('span', '', fmtDateTime(r.updated)));
        card.append(top, el('p', 'fx-card-rate', `${fmt.format(r.value)} VES`), el('div', 'fx-card-unit', perText(d)), el('div', 'fx-card-sep'),
          el('div', 'fx-card-eqlabel', eqLabel(amt, r)), el('p', 'fx-card-result', amt === null ? L.enter : resultText(amt, r)), foot);
        grid.append(card);
      });
      const newest = rates.reduce((m, r) => (r.updated && r.updated > m ? r.updated : m), '');
      amountLine.textContent = amt === null ? '' : amountText(amt);
      updatedEl.textContent = `${L.upd}: ${fmtDateTime(newest || null)}`;
    }

    async function load() {
      state = 'loading';
      render();
      const base = (root.dataset.apiUrl || '').replace(/\/$/, '');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const get = async (path) => {
          const res = await fetch(`${base}/${path}`, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: ctrl.signal });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        };
        const [usd, eur] = await Promise.all([get('dolares'), get('euros')]);
        const next = demoRates();
        let hits = 0;
        const apply = (id, list, fuente) => {
          const it = list.find(x => x.fuente === fuente);
          const value = it ? Number(it.promedio) : NaN;
          const slot = next.find(r => r.id === id);
          if (slot && Number.isFinite(value) && value > 0) { slot.value = value; slot.updated = it.fechaActualizacion || slot.updated; slot.live = true; hits++; }
        };
        apply('bcv', usd, 'oficial');      // Oficial BCV
        apply('eur', eur, 'oficial');      // Euro BCV
        apply('p2p', usd, 'paralelo');     // Binance P2P (DolarApi no expone Binance directo; el paralelo es la referencia P2P)
        if (hits < 3) throw new Error('incomplete'); // las 3 tasas base deben ser reales para publicar el promedio en vivo
        const avg = withAverage(next).find(r => r.id === 'avg');
        avg.live = true;
        avg.updated = next.filter(r => r.id !== 'avg').reduce((m, r) => (r.updated > m ? r.updated : m), '');
        rates = next;
        state = 'live';
      } catch (e) {
        rates = demoRates();
        state = 'demo';
      } finally {
        clearTimeout(timer);
      }
      render();
    }

    // Texto para portapapeles / compartir: la URL va en texto plano para que las apps la vuelvan clickeable.
    function summary() {
      const amt = parseAmount(amount.value);
      const en = lang() === 'en';
      const lines = [`📊 ${en ? 'Rates Monitor' : 'Monitor de Tasas'} · JW-SOLUTIONS`, `📅 ${fmtDateTime(null)}`, ''];
      if (amt !== null) lines.push(amountText(amt));
      chosen().forEach(r => {
        lines.push(`▪️ ${def(r.id).name[lang()]}: ${amt !== null ? resultText(amt, r) : `1 ${def(r.id).cur} = ${fmt.format(r.value)} VES`}`);
      });
      lines.push('', `👉 ${en ? 'Calculate your exchange live here' : 'Calcula tu cambio en vivo aquí'}: ${SITE}`);
      return lines.join('\n');
    }

    const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

    // SVG 1080px de ancho → PNG con Canvas; la altura se ajusta a la cantidad de tarjetas elegidas.
    async function createShareImage(list) {
      const L = TXT[lang()];
      const amt = parseAmount(amount.value);
      const W = 1080, rowStart = 380, rowGap = 205, footerH = 250;
      const H = rowStart + list.length * rowGap + footerH;
      const F = 'font-family="Arial, sans-serif"';
      const rows = list.map((r, i) => {
        const d = def(r.id), y = rowStart + i * rowGap;
        const eq = amt === null ? '—' : resultText(amt, r);
        return `
          <rect x="72" y="${y}" width="936" height="${rowGap - 20}" rx="28" fill="#1E293B" stroke="#334155" stroke-width="2"/>
          <rect x="72" y="${y}" width="10" height="${rowGap - 20}" rx="5" fill="${esc(d.accent)}"/>
          <text x="116" y="${y + 58}" ${F} font-size="36" font-weight="700" fill="#FFFFFF">${esc(d.name[lang()])}</text>
          <text x="116" y="${y + 95}" ${F} font-size="21" fill="#94A3B8">${esc(d.label[lang()])}</text>
          <text x="965" y="${y + 58}" text-anchor="end" ${F} font-size="38" font-weight="700" fill="#FFFFFF">${esc(fmt.format(r.value))}</text>
          <text x="965" y="${y + 95}" text-anchor="end" ${F} font-size="18" fill="#94A3B8">${esc(perText(d))}</text>
          <path d="M116 ${y + 120}H964" stroke="#334155" stroke-width="2"/>
          <text x="116" y="${y + 160}" ${F} font-size="22" fill="#94A3B8">${esc(eqLabel(amt, r))}</text>
          <text x="965" y="${y + 163}" text-anchor="end" ${F} font-size="42" font-weight="700" fill="#FFB800">${esc(eq)}</text>`;
      }).join('');
      const fy = rowStart + list.length * rowGap + 22;
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
          <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#121824"/><stop offset="1" stop-color="#0B0F17"/></linearGradient></defs>
          <rect width="${W}" height="${H}" fill="#0B0F17"/>
          <rect width="${W}" height="330" fill="url(#g)"/>
          <rect y="326" width="${W}" height="4" fill="#FFB800"/>
          <circle cx="980" cy="40" r="190" fill="#FFB800" opacity=".07"/>
          <text x="72" y="130" ${F} font-size="58" font-weight="800" fill="#FFFFFF">JW<tspan fill="#FFB800">-</tspan>SOLUTIONS</text>
          <text x="72" y="215" ${F} font-size="44" font-weight="700" fill="#FFFFFF">${esc(L.title)}</text>
          <text x="72" y="266" ${F} font-size="25" fill="#CBD5E1">${esc(L.title + ' · ' + L.sub)}</text>
          ${amt === null ? '' : `<text x="72" y="310" ${F} font-size="24" font-weight="700" fill="#FFB800">${esc(amountText(amt))}</text>`}
          <text x="1008" y="310" text-anchor="end" ${F} font-size="18" fill="#94A3B8">${esc(fmtDateTime(null))}</text>
          ${rows}
          <path d="M72 ${fy}H1008" stroke="#334155" stroke-width="2"/>
          <text x="72" y="${fy + 48}" ${F} font-size="26" font-weight="700" fill="#FFFFFF">${esc(L.gen)} · ${SITE}</text>
          <text x="72" y="${fy + 90}" ${F} font-size="22" fill="#94A3B8">${esc(L.tool)}</text>
          <text x="72" y="${fy + 128}" ${F} font-size="19" fill="#64748B">${esc(L.warn)}</text>
        </svg>`;
      // data: URL (la CSP del sitio no permite blob: en img-src)
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      {
        await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error(L.imgFail)); });
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        canvas.getContext('2d').drawImage(img, 0, 0, W, H);
        const out = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
        if (!out) throw new Error(L.imgFail);
        return { blob: out, dataUrl: canvas.toDataURL('image/png') };
      }
    }

    const setNote = (t) => { noteEl.textContent = t || ''; };

    async function refreshPreview() {
      const L = TXT[lang()];
      const list = chosen();
      const none = list.length === 0;
      [shareBtn, dlBtn, copyBtn].forEach(b => { b.disabled = none; });
      warnEl.hidden = !none;
      warnEl.textContent = none ? L.none : '';
      if (none) { token++; previewImg.removeAttribute('src'); previewImg.hidden = true; blob = null; return; }
      const mine = ++token;
      try {
        const out = await createShareImage(list);
        if (mine !== token) return;
        blob = out.blob;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(out.blob);
        previewImg.src = out.dataUrl;
        previewImg.hidden = false;
        setNote('');
      } catch (e) {
        if (mine === token) setNote(e.message || L.imgFail);
      }
    }

    function buildPicker() {
      pickerList.textContent = '';
      DEFS.forEach(d => {
        const label = el('label', 'fx-check');
        const input = el('input');
        input.type = 'checkbox'; input.value = d.id; input.checked = selected.has(d.id);
        input.addEventListener('change', () => {
          if (input.checked) selected.add(d.id); else selected.delete(d.id);
          refreshPreview();
        });
        label.append(input, el('span', 'fx-check-box'), el('span', 'fx-check-text', d.name[lang()]));
        pickerList.append(label);
      });
    }

    function openShare() {
      buildPicker();
      shareEl.hidden = false;
      root.inert = true;
      setNote('');
      refreshPreview();
      const first = pickerList.querySelector('input');
      if (first) first.focus();
    }

    function closeShare() {
      if (shareEl.hidden) return;
      shareEl.hidden = true;
      root.inert = false;
      token++;
      const opener = $('#fx-share-open');
      if (opener) opener.focus();
    }

    function download() {
      if (!blob || !blobUrl) return;
      const a = document.createElement('a');
      a.href = blobUrl; a.download = 'tasas-de-cambio-jw-solutions.png'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setNote(TXT[lang()].dl);
    }

    async function copy() {
      const L = TXT[lang()];
      try { await navigator.clipboard.writeText(summary()); setNote(L.copied); } catch (e) { setNote(L.copyFail); }
    }

    async function shareImage() {
      const L = TXT[lang()];
      if (!blob) return;
      const file = new File([blob], 'tasas-de-cambio-jw-solutions.png', { type: 'image/png' });
      try {
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: lang() === 'en' ? 'Exchange rates' : 'Tasas de cambio', text: summary() });
          setNote(L.shared);
        } else {
          download();
          await copy();
          setNote(L.noShare);
        }
      } catch (e) {
        setNote(e && e.name === 'AbortError' ? L.cancelled : L.shareFail);
      }
    }

    function init() {
      root = $('#fx-calc');
      if (!root) return;
      amount = $('#fx-amount'); mode = $('#fx-mode'); grid = $('#fx-grid'); updatedEl = $('#fx-updated'); amountLine = $('#fx-amount-line');
      statusEl = $('#fx-status'); statusText = $('#fx-status-text');
      shareEl = $('#fx-share-modal'); pickerList = $('#fx-picker-list'); warnEl = $('#fx-warn'); previewImg = $('#fx-preview'); noteEl = $('#fx-note');
      shareBtn = $('#fx-share-native'); dlBtn = $('#fx-download'); copyBtn = $('#fx-copy');
      rates = demoRates();
      render();
      // Las tasas se consultan al abrir la modal por primera vez
      on(document, 'click', (e) => {
        if (e.target.closest('[data-legal="tool-fx"]')) { closeShare(); if (!started) { started = true; load(); } }
        if (e.target.closest('[data-modal-close]')) { shareEl.hidden = true; root.inert = false; token++; }
        if (e.target.closest('#lang-toggle')) setTimeout(() => { render(); if (!shareEl.hidden) { buildPicker(); refreshPreview(); } }, 0);
      });
      // Escape cierra primero la vista previa (captura: antes que el cierre de la modal principal)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !shareEl.hidden) { e.preventDefault(); e.stopImmediatePropagation(); closeShare(); }
      }, true);
      on(amount, 'input', render);
      on(amount, 'blur', () => { const v = parseAmount(amount.value); if (v !== null) amount.value = fmt.format(v); });
      on(amount, 'focus', () => { const v = parseAmount(amount.value); if (v !== null) amount.value = String(v).replace('.', ','); amount.select(); });
      on(mode, 'change', render);
      on($('#fx-share-open'), 'click', openShare);
      on($('#fx-share-close'), 'click', closeShare);
      on(shareBtn, 'click', shareImage);
      on(dlBtn, 'click', download);
      on(copyBtn, 'click', copy);
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     16c. ACCESO RÁPIDO A LA CALCULADORA (deep link #calculadora + anclar/instalar)
     ───────────────────────────────────────────────────────────────────────────── */
  const FxQuickAccess = (() => {
    const HASHES = ['#calculadora', '#fx-calc'];
    const HINTS = {
      es: {
        ios: 'En Safari: pulsa Compartir ⎘ y luego «Añadir a la pantalla de inicio» ➕.',
        other: 'Abre el menú del navegador y elige «Instalar app» o «Añadir a la pantalla de inicio». Para volver rápido, guarda esta página en favoritos: jw-solutions.com/#calculadora',
        done: 'Acceso rápido instalado.'
      },
      en: {
        ios: 'In Safari: tap Share ⎘ and then “Add to Home Screen” ➕.',
        other: 'Open the browser menu and choose “Install app” or “Add to Home Screen”. To return quickly, bookmark: jw-solutions.com/#calculadora',
        done: 'Quick access installed.'
      }
    };
    let deferred = null;

    function lang() { return document.documentElement.lang === 'en' ? 'en' : 'es'; }

    function openFromHash() {
      if (!HASHES.includes(window.location.hash.toLowerCase())) return;
      const trigger = $('[data-legal="tool-fx"]');
      if (trigger) trigger.click();
    }

    function hint(text) {
      const el = $('#fx-pin-hint');
      if (!el) return;
      el.textContent = text;
      el.hidden = false;
    }

    async function pin() {
      if (deferred) {
        const evt = deferred;
        deferred = null;
        evt.prompt();
        try {
          const choice = await evt.userChoice;
          if (choice && choice.outcome === 'accepted') hint(HINTS[lang()].done);
        } catch (e) { /* prompt cancelado */ }
        return;
      }
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      hint(HINTS[lang()][ios ? 'ios' : 'other']);
    }

    function init() {
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
      window.addEventListener('appinstalled', () => { deferred = null; hint(HINTS[lang()].done); });
      on($('#fx-pin'), 'click', pin);
      on(window, 'hashchange', openFromHash);
      openFromHash();
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     17. BARRA INFERIOR MÓVIL (Thumb Zone)
     ───────────────────────────────────────────────────────────────────────────── */
  const MobileCTABar = (() => {
    function init() {
      const bar = $('#mobile-cta-bar');
      if (!bar || !('IntersectionObserver' in window)) return;

      // Se oculta cuando el formulario de contacto o el footer ya están a la vista
      const visible = new Set();
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        bar.classList.toggle('is-hidden', visible.size > 0);
      }, { threshold: 0, rootMargin: '0px 0px -96px 0px' });

      ['#contacto', '#footer'].forEach(sel => {
        const el = $(sel);
        if (el) observer.observe(el);
      });
    }

    return { init };
  })();

  /* ─────────────────────────────────────────────────────────────────────────────
     INICIALIZACIÓN GLOBAL
     ───────────────────────────────────────────────────────────────────────────── */
  function init() {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      on(document, 'DOMContentLoaded', runInit);
    } else {
      runInit();
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     ARTÍCULOS DESTACADOS (portada)
     Regenera #featured-articles desde content/articles.json respetando featured.max
     de content/config.json. Si el fetch falla se conserva el HTML estático.
     ───────────────────────────────────────────────────────────────────────────── */
  const Featured = (() => {
    const DEFAULT_MAX = 12;

    function el(tag, className, text, attrs) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      if (attrs) Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
      return node;
    }

    function formatDate(iso, lang) {
      const [y, m, d] = iso.split('-').map(Number);
      const months = {
        es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      };
      return `${String(d).padStart(2, '0')} ${months[lang][m - 1]} ${y}`;
    }

    function buildCard(article) {
      const card = el('article', 'blog-card');
      const meta = el('div', 'blog-meta');
      const time = el('time', 'blog-date', formatDate(article.date, 'es'), { datetime: article.date });
      meta.append(time, el('span', 'blog-tag', article.tag));
      card.append(meta);

      const href = `blog/${encodeURIComponent(article.slug)}/`;
      ['es', 'en'].forEach(lang => {
        card.append(el('h3', 'blog-title', article[lang].title, { 'data-lang': lang }));
      });
      ['es', 'en'].forEach(lang => {
        card.append(el('p', 'blog-excerpt', article[lang].excerpt, { 'data-lang': lang }));
      });
      [['es', 'Leer artículo →', 'Leer artículo: '], ['en', 'Read article →', 'Read article: ']].forEach(([lang, linkText, labelPrefix]) => {
        card.append(el('a', 'blog-link', linkText, {
          href,
          'data-lang': lang,
          'aria-label': labelPrefix + article[lang].title
        }));
      });
      return card;
    }

    function init() {
      const grid = $('#featured-articles');
      if (!grid || !window.fetch) return;

      Promise.all([
        fetch(grid.dataset.config, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
        fetch(grid.dataset.manifest, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null))
      ]).then(([config, manifest]) => {
        if (!manifest || !Array.isArray(manifest.articles)) return;
        const max = Number(config && config.featured && config.featured.max) || DEFAULT_MAX;
        const items = manifest.articles
          .filter(a => a.status === 'published' && a.featured)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, max);
        if (items.length === 0) return;

        $$('.blog-card', grid).forEach(card => card.remove());
        items.forEach(a => grid.append(buildCard(a)));
        LangSwitcher.apply(LangSwitcher.getCurrent());
      }).catch(() => { /* se conserva el contenido estático */ });
    }

    return { init };
  })();

  function hideDecorativeIcons() {
    $$('i.fas, i.fab').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
  }

  function runInit() {
    // Respaldo: asegura que las hojas de estilo no bloqueantes queden activas
    $$('link[data-async-style]').forEach(l => { l.media = 'all'; });
    hideDecorativeIcons();
    const modules = [
      LangSwitcher, MobileMenu, HeaderScroll, Particles,
      FAQAccordion, ScrollReveal, BackToTop, Forms, SmoothScroll, LazyImages,
      CurrentYear, Analytics, Consent, LegalModals, FxCalculator, FxQuickAccess, MobileCTABar, PWA, Featured
    ];

    // Cada módulo se aísla: un fallo no impide inicializar los demás
    modules.forEach(mod => {
      try {
        mod.init();
      } catch (e) {
        /* fallo aislado del módulo */
      }
    });
  }

  init();

})();