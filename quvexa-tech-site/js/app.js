(() => {
  'use strict';

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
  const submitBtn = form.querySelector('.btn-submit');

  const validators = {
    name: (v) => v.trim().length > 1,
    businessType: (v) => v.trim().length > 0,
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fields = Array.from(form.querySelectorAll('.field')).filter(f =>
      f.querySelector('input[required], select[required], textarea[required]')
    );
    const allValid = fields.map(validateField).every(Boolean);
    if (!allValid) {
      const firstInvalid = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    window.setTimeout(() => {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
      form.reset();
      form.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
      formSuccess.hidden = false;
      formSuccess.setAttribute('tabindex', '-1');
      formSuccess.focus();
    }, 900);
  });

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
