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
    scrollReveal: {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    },
    particles: {
      count: 60,
      color: 'rgba(251, 178, 0, 0.4)',
      connectionDistance: 120,
      speed: 0.5
    },
    testimonials: {
      autoplayInterval: 5000
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     UTILIDADES
     ───────────────────────────────────────────────────────────────────────────── */
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const on = (el, event, handler, options = false) => el.addEventListener(event, handler, options);
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
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && CONFIG.lang.supported.includes(saved)) return saved;
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

      // Update toggle button
      const toggleBtn = $('#lang-toggle');
      const flagEl = $('#current-flag');
      const labelEl = $('#current-lang');
      if (toggleBtn && flagEl && labelEl) {
        flagEl.textContent = lang === 'es' ? '🇪🇸' : '🇺🇸';
        labelEl.textContent = lang.toUpperCase();
        toggleBtn.setAttribute('aria-label', 
          lang === 'es' ? 'Cambiar idioma / Switch language' : 'Switch language / Cambiar idioma');
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
     5. TESTIMONIALS CAROUSEL
     ───────────────────────────────────────────────────────────────────────────── */
  const TestimonialsCarousel = (() => {
    let currentIndex = 0;
    let autoplayTimer;
    let totalSlides = 0;

    function getSlidesPerView() {
      if (window.innerWidth >= 1200) return 3;
      if (window.innerWidth >= 992) return 2;
      return 1;
    }

    function updateTrack() {
      const track = $('#testimonials-track');
      const dots = $$('.dot');
      if (!track) return;

      const slidesPerView = getSlidesPerView();
      const maxIndex = Math.max(0, totalSlides - slidesPerView);
      const clampedIndex = Math.min(currentIndex, maxIndex);

      const slideWidth = 100 / slidesPerView;
      track.style.transform = `translateX(-${clampedIndex * slideWidth}%)`;

      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === clampedIndex);
      });
    }

    function goTo(index) {
      const slidesPerView = getSlidesPerView();
      const maxIndex = Math.max(0, totalSlides - slidesPerView);
      currentIndex = Math.max(0, Math.min(index, maxIndex));
      updateTrack();
    }

    function next() {
      const slidesPerView = getSlidesPerView();
      const maxIndex = Math.max(0, totalSlides - slidesPerView);
      currentIndex = currentIndex >= maxIndex ? 0 : currentIndex + 1;
      updateTrack();
    }

    function prev() {
      const slidesPerView = getSlidesPerView();
      const maxIndex = Math.max(0, totalSlides - slidesPerView);
      currentIndex = currentIndex <= 0 ? maxIndex : currentIndex - 1;
      updateTrack();
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(next, CONFIG.testimonials.autoplayInterval);
    }

    function stopAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
    }

    function init() {
      const track = $('#testimonials-track');
      if (!track) return;

      const cards = $$('.testimonial-card', track);
      totalSlides = cards.length;
      if (totalSlides === 0) return;

      // Navigation buttons
      const prevBtn = $('#prev-btn');
      const nextBtn = $('#next-btn');
      if (prevBtn) on(prevBtn, 'click', () => { prev(); stopAutoplay(); });
      if (nextBtn) on(nextBtn, 'click', () => { next(); stopAutoplay(); });

      // Dots
      const dots = $$('.dot');
      dots.forEach((dot, i) => {
        on(dot, 'click', () => { goTo(i); stopAutoplay(); });
      });

      // Touch/swipe support
      let startX = 0;
      let isDragging = false;

      on(track, 'touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        stopAutoplay();
      }, { passive: true });

      on(track, 'touchmove', () => {
        if (!isDragging) return;
      }, { passive: true });

      on(track, 'touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        if (Math.abs(diff) > 50) {
          diff > 0 ? next() : prev();
        }
      }, { passive: true });

      // Keyboard navigation
      on(document, 'keydown', (e) => {
        const section = $('#testimonios');
        if (!section) return;
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          if (e.key === 'ArrowLeft') { prev(); stopAutoplay(); }
          if (e.key === 'ArrowRight') { next(); stopAutoplay(); }
        }
      });

      // Resize handler
      on(window, 'resize', throttle(() => {
        updateTrack();
      }, 250));

      // Pause autoplay when not visible
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          startAutoplay();
        } else {
          stopAutoplay();
        }
      }, { threshold: 0.3 });
      observer.track = track;

      updateTrack();
      startAutoplay();

      // Pause on hover
      const wrapper = $('.testimonials-wrapper');
      if (wrapper) {
        on(wrapper, 'mouseenter', stopAutoplay);
        on(wrapper, 'mouseleave', startAutoplay);
      }
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    function showMessage(container, message, type) {
      if (!container) return;
      container.textContent = message;
      container.className = `form-message ${type}`;
      setTimeout(() => {
        container.textContent = '';
        container.className = 'form-message';
      }, 5000);
    }

    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function handleContactForm(e) {
      e.preventDefault();
      const form = e.target;
      const statusEl = $('#contact-message-status');

      const name = form.querySelector('[name="name"]')?.value.trim();
      const email = form.querySelector('[name="email"]')?.value.trim();
      const message = form.querySelector('[name="message"]')?.value.trim();

      if (!name || !email || !message) {
        showMessage(statusEl, 
          LangSwitcher.getCurrent() === 'es' ? 'Por favor completa todos los campos obligatorios.' : 'Please fill in all required fields.',
          'error');
        return;
      }

      if (!validateEmail(email)) {
        showMessage(statusEl,
          LangSwitcher.getCurrent() === 'es' ? 'Por favor ingresa un email válido.' : 'Please enter a valid email.',
          'error');
        return;
      }

      // Track event
      if (typeof gtag !== 'undefined') {
        gtag('event', 'submit_form', {
          event_category: 'contact',
          event_label: 'contact_form'
        });
      }

      // Submit to Formspree
      const formData = new FormData(form);
      fetch(form.action, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      })
      .then(response => {
        if (response.ok) {
          showMessage(statusEl,
            LangSwitcher.getCurrent() === 'es' ? '¡Mensaje enviado! Te contactaremos en menos de 24 horas.' : 'Message sent! We will contact you within 24 hours.',
            'success');
          form.reset();
        } else {
          throw new Error('Formspree error');
        }
      })
      .catch(() => {
        showMessage(statusEl,
          LangSwitcher.getCurrent() === 'es' ? 'Hubo un error. Por favor escríbenos directamente a contact@jw-solutions.com' : 'There was an error. Please email us directly at contact@jw-solutions.com',
          'error');
      });
    }

    function handleNewsletterForm(e) {
      e.preventDefault();
      const form = e.target;
      const statusEl = $('#newsletter-message');
      const email = form.querySelector('[name="email"]')?.value.trim();

      if (!email || !validateEmail(email)) {
        showMessage(statusEl,
          LangSwitcher.getCurrent() === 'es' ? 'Por favor ingresa un email válido.' : 'Please enter a valid email.',
          'error');
        return;
      }

      // Track event
      if (typeof gtag !== 'undefined') {
        gtag('event', 'submit_form', {
          event_category: 'newsletter',
          event_label: 'newsletter_subscribe'
        });
      }

      // Brevo API integration placeholder
      // Replace with actual Brevo API key and list ID
      showMessage(statusEl,
        LangSwitcher.getCurrent() === 'es' ? '¡Gracias por suscribirte! Revisa tu email para confirmar.' : 'Thanks for subscribing! Check your email to confirm.',
        'success');
      form.reset();
    }

    function init() {
      const contactForm = $('#contact-form');
      if (contactForm) {
        on(contactForm, 'submit', handleContactForm);
      }

      const newsletterForm = $('#newsletter-form');
      if (newsletterForm) {
        on(newsletterForm, 'submit', handleNewsletterForm);
      }

      // Input validation feedback
      $$('input[required], textarea[required]').forEach(input => {
        on(input, 'blur', () => {
          if (!input.value.trim()) {
            input.style.borderColor = '#f87171';
          } else {
            input.style.borderColor = '';
          }
        });
        on(input, 'focus', () => {
          input.style.borderColor = '';
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
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.scrollY - headerOffset;

            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
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
      $$('.footer-copyright').forEach(el => {
        el.innerHTML = el.innerHTML.replace('2026', year);
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

  function runInit() {
    LangSwitcher.init();
    MobileMenu.init();
    HeaderScroll.init();
    Particles.init();
    TestimonialsCarousel.init();
    FAQAccordion.init();
    ScrollReveal.init();
    BackToTop.init();
    Forms.init();
    SmoothScroll.init();
    LazyImages.init();
    CurrentYear.init();
    Analytics.init();
    PWA.init();

    console.log('%c JW Solutions ', 'background: #fbb200; color: #000; font-size: 16px; font-weight: bold; padding: 4px 8px; border-radius: 4px;', 'v1.0 loaded successfully');
  }

  init();

})();