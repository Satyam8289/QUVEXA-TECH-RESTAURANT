(() => {
  'use strict';

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Logo fallback — if the real logo file is missing, fall back to the placeholder mark.
  // (Kept in JS rather than inline onerror= so the CSP script-src can stay strict.)
  document.querySelectorAll('.brand-logo-img').forEach((img) => {
    img.addEventListener('error', function onLogoError() {
      img.removeEventListener('error', onLogoError);
      img.src = 'assets/logo.svg';
    });
  });

  // Loading screen — hide once everything is painted
  const loader = document.getElementById('loader');
  const hideLoader = () => loader && loader.classList.add('loader-hidden');
  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
    window.setTimeout(hideLoader, 1800); // safety fallback
  }

  // Scroll progress bar
  const scrollProgress = document.getElementById('scrollProgress');
  const updateScrollProgress = () => {
    if (!scrollProgress) return;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
    scrollProgress.style.width = pct + '%';
  };
  updateScrollProgress();
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('resize', updateScrollProgress);

  // Cursor glow — desktop pointer devices only
  const cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('mousemove', (e) => {
      cursorGlow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      cursorGlow.classList.add('active');
    }, { passive: true });
    window.addEventListener('mouseleave', () => cursorGlow.classList.remove('active'));
  }

  // Interactive product tiles — click to expand feature chips
  document.querySelectorAll('.product-tile').forEach((tile) => {
    const toggle = () => {
      const wasExpanded = tile.classList.contains('expanded');
      document.querySelectorAll('.product-tile.expanded').forEach(t => {
        if (t !== tile) t.classList.remove('expanded');
      });
      tile.classList.toggle('expanded', !wasExpanded);
    };
    tile.addEventListener('click', toggle);
    if (tile.getAttribute('role') === 'button') {
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    }
  });

  // Header scroll state
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (window.scrollY > 12) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  const closeMobileNav = () => {
    mobileNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open menu');
  };
  navToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));

  // Scroll-triggered reveal
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  // Contact form validation + submit
  const form = document.getElementById('contactForm');
  const formSuccess = document.getElementById('formSuccess');
  const formErrorBanner = document.getElementById('formErrorBanner');
  const submitBtn = form.querySelector('.btn-submit');

  const validators = {
    name: (v) => v.trim().length > 1,
    businessType: (v) => v.trim().length > 0,
    // Email is optional now: blank passes, but if something's entered it must look like an email.
    email: (v) => v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    phone: (v) => v.trim().length >= 7,
    message: (v) => v.trim().length > 4,
  };

  const validateField = (field) => {
    const input = field.querySelector('input, select, textarea');
    if (!input || !validators[input.name]) return true;
    const valid = validators[input.name](input.value);
    field.classList.toggle('invalid', !valid);
    return valid;
  };

  form.querySelectorAll('.field').forEach(field => {
    const input = field.querySelector('input, select, textarea');
    if (!input) return;
    input.addEventListener('blur', () => validateField(field));
    input.addEventListener('input', () => {
      if (field.classList.contains('invalid')) validateField(field);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot: real users never see or fill this field. If it has a value, silently drop the submit.
    const honeypot = form.querySelector('#company');
    if (honeypot && honeypot.value.trim() !== '') return;

    const fields = Array.from(form.querySelectorAll('.field')).filter(f =>
      f.querySelector('input[required], select[required], textarea[required]')
    );
    const allValid = fields.map(validateField).every(Boolean);
    if (!allValid) {
      const firstInvalid = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    formErrorBanner.hidden = true;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Submission failed');
      }

      form.reset();
      form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
      formSuccess.hidden = false;
      formSuccess.setAttribute('tabindex', '-1');
      formSuccess.focus();
    } catch (err) {
      formErrorBanner.hidden = false;
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });

  // "Send another message" — hide the success state and show the blank form again.
  const sendAnotherBtn = document.getElementById('sendAnotherBtn');
  if (sendAnotherBtn) {
    sendAnotherBtn.addEventListener('click', () => {
      formSuccess.hidden = true;
      const firstField = form.querySelector('input, select, textarea');
      if (firstField) firstField.focus();
    });
  }

  // Newsletter form
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input[type="email"]');
      const btn = newsletterForm.querySelector('button');
      if (!input.value.trim()) return;
      const original = btn.innerHTML;
      btn.innerHTML = '✓';
      input.value = '';
      window.setTimeout(() => { btn.innerHTML = original; }, 1800);
    });
  }
})();
