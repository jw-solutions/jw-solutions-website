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
      CurrentYear, Analytics, Consent, LegalModals, MobileCTABar, PWA, Featured
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