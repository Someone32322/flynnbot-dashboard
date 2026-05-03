/* ============================================================
   CUSTOM SELECT — replaces native <select> with a styled popup
   ============================================================
   Usage:
     initCustomSelect(selectElement)
     — or —
     initAllCustomSelects()   // auto-converts all [data-cs] selects

   The component mirrors the native select value so existing
   code that reads select.value / sets select.value / fires
   select.dispatchEvent(new Event('change')) keeps working.
   ============================================================ */

(function () {
  'use strict';

  // Track open instance so only one popup is open at a time
  let openInstance = null;

  /* ── Build the custom select ──────────────────────────────── */
  function initCustomSelect(nativeSelect) {
    if (!nativeSelect || nativeSelect._csInitialized) return;
    nativeSelect._csInitialized = true;

    // Hide native select but keep it in DOM so .value still works
    nativeSelect.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-wrapper';
    if (nativeSelect.disabled) wrapper.classList.add('cs-disabled');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerText = document.createElement('span');
    triggerText.className = 'cs-trigger-text';

    const triggerArrow = document.createElement('span');
    triggerArrow.className = 'cs-trigger-arrow';
    triggerArrow.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    trigger.appendChild(triggerText);
    trigger.appendChild(triggerArrow);

    const popup = document.createElement('div');
    popup.className = 'cs-popup';
    popup.setAttribute('role', 'listbox');

    wrapper.appendChild(trigger);
    wrapper.appendChild(popup);
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);
    wrapper.appendChild(nativeSelect);

    // Build options list
    function buildOptions() {
      popup.innerHTML = '';
      Array.from(nativeSelect.options).forEach((opt) => {
        if (opt.disabled && !opt.value) {
          // placeholder / divider
          if (opt.textContent.trim()) {
            const header = document.createElement('div');
            header.className = 'cs-option-header';
            header.textContent = opt.textContent.trim();
            popup.appendChild(header);
          }
          return;
        }
        const item = document.createElement('div');
        item.className = 'cs-option';
        item.setAttribute('role', 'option');
        item.dataset.value = opt.value;
        item.textContent = opt.textContent.trim();
        if (opt.value === nativeSelect.value) {
          item.classList.add('selected');
          item.setAttribute('aria-selected', 'true');
        }
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectValue(opt.value);
          close();
        });
        popup.appendChild(item);
      });
    }

    // Sync display text from current native select value
    function syncTriggerText() {
      const opt = nativeSelect.options[nativeSelect.selectedIndex];
      triggerText.textContent = opt ? opt.textContent.trim() : '';
    }

    function selectValue(val) {
      nativeSelect.value = val;
      syncTriggerText();
      buildOptions();
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function positionPopup() {
      const rect = trigger.getBoundingClientRect();
      const popupH = Math.min(280, popup.scrollHeight + 14);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < popupH + 12 && spaceAbove > spaceBelow;

      popup.style.width = rect.width + 'px';
      popup.style.left = rect.left + window.scrollX + 'px';

      if (openUp) {
        popup.style.top = '';
        popup.style.bottom = (window.innerHeight - rect.top - window.scrollY) + 6 + 'px';
        popup.classList.add('cs-popup-up');
      } else {
        popup.style.bottom = '';
        popup.style.top = rect.bottom + window.scrollY + 6 + 'px';
        popup.classList.remove('cs-popup-up');
      }
    }

    function open() {
      if (wrapper.classList.contains('cs-disabled')) return;
      if (openInstance && openInstance !== wrapper) {
        closeInstance(openInstance);
      }
      openInstance = wrapper;
      buildOptions();

      // Move popup to body so it escapes any overflow:hidden ancestors
      if (popup.parentNode !== document.body) {
        document.body.appendChild(popup);
      }

      wrapper.classList.add('cs-open');
      trigger.setAttribute('aria-expanded', 'true');

      requestAnimationFrame(() => {
        positionPopup();
      });
    }

    function close() {
      wrapper.classList.remove('cs-open');
      trigger.setAttribute('aria-expanded', 'false');
      popup.classList.remove('cs-popup-up');
      if (openInstance === wrapper) openInstance = null;
    }

    function toggle() {
      wrapper.classList.contains('cs-open') ? close() : open();
    }

    // Keyboard nav
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!wrapper.classList.contains('cs-open')) { open(); return; }
        const items = Array.from(popup.querySelectorAll('.cs-option'));
        const cur = popup.querySelector('.cs-option.focused');
        let idx = cur ? items.indexOf(cur) : -1;
        if (cur) cur.classList.remove('focused');
        idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
        items[idx]?.classList.add('focused');
        items[idx]?.scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') {
        const focused = popup.querySelector('.cs-option.focused');
        if (focused) { selectValue(focused.dataset.value); close(); }
      }
    });

    trigger.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

    // Close when native select value changes programmatically
    const obs = new MutationObserver(syncTriggerText);
    obs.observe(nativeSelect, { attributes: true, attributeFilter: ['value'] });

    // Watch for option changes (for dynamically populated selects)
    const childObs = new MutationObserver(() => { buildOptions(); syncTriggerText(); });
    childObs.observe(nativeSelect, { childList: true, subtree: true });

    // Expose methods
    wrapper._csClose = close;
    wrapper._csSelect = selectValue;
    wrapper._csReposition = positionPopup;
    nativeSelect._csWrapper = wrapper;

    // Initial state
    syncTriggerText();

    // Copy size/class hint
    if (nativeSelect.dataset.csClass) wrapper.classList.add(...nativeSelect.dataset.csClass.split(' '));
  }

  function closeInstance(w) {
    if (w && w._csClose) w._csClose();
  }

  /* ── Global close on outside click ───────────────────────── */
  document.addEventListener('click', () => {
    if (openInstance) closeInstance(openInstance);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openInstance) closeInstance(openInstance);
  });
  // Reposition on scroll/resize
  var _reposition = function () {
    if (openInstance && openInstance._csReposition) openInstance._csReposition();
  };
  window.addEventListener('scroll', _reposition, true);
  window.addEventListener('resize', _reposition);

  /* ── Auto-init any selects with data-cs attribute ─────────── */
  function initAllCustomSelects(root) {
    const container = root || document;
    container.querySelectorAll('select[data-cs]').forEach(initCustomSelect);
  }

  /* ── Re-init after dynamic content is added ──────────────── */
  function refreshCustomSelects(root) {
    initAllCustomSelects(root);
    // Also re-sync any already-initialized ones within root
    const container = root || document;
    container.querySelectorAll('select[data-cs]').forEach((sel) => {
      if (sel._csWrapper) {
        const opt = sel.options[sel.selectedIndex];
        if (opt) sel._csWrapper.querySelector('.cs-trigger-text').textContent = opt.textContent.trim();
      }
    });
  }

  /* ── Expose globally ─────────────────────────────────────── */
  window.initCustomSelect = initCustomSelect;
  window.initAllCustomSelects = initAllCustomSelects;
  window.refreshCustomSelects = refreshCustomSelects;
})();
