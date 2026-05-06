/**
 * savebar.js — Discord-style global unsaved changes bar
 * 
 * Usage: each section that wants to use the save bar should call:
 *   SaveBar.track(containerEl, onSave, onReset)
 *
 * Or manually:
 *   SaveBar.markDirty()       — show the bar
 *   SaveBar.markClean()       — hide the bar
 *   SaveBar.setHandlers(onSave, onReset)
 */

const SaveBar = (() => {
  let _dirty = false;
  let _onSave = null;
  let _onReset = null;
  let _tracked = [];   // { el, originalValues }

  const bar = document.getElementById('globalSaveBar');
  const saveBtn = document.getElementById('globalSaveBarSave');
  const resetBtn = document.getElementById('globalSaveBarReset');

  function show() {
    if (bar) {
      bar.classList.add('visible');
      bar.setAttribute('aria-hidden', 'false');
    }
  }

  function hide() {
    if (bar) {
      bar.classList.remove('visible');
      bar.setAttribute('aria-hidden', 'true');
    }
  }

  function markDirty() {
    if (_dirty) return;
    _dirty = true;
    show();
  }

  function markClean({ clearHandlers = false } = {}) {
    _dirty = false;
    hide();
    if (clearHandlers) {
      untrack();
      _onSave = null;
      _onReset = null;
    }
  }

  function setHandlers(onSave, onReset) {
    _onSave = onSave;
    _onReset = onReset;
  }

  function resnapshot() {
    _tracked = _tracked.map(({ el }) => ({
      el,
      val: el.type === 'checkbox' ? el.checked : el.value,
    }));
  }

  /**
   * Track all inputs/selects/textareas inside `containerEl`.
   * Marks dirty when any value changes from snapshot.
   * onSave() — called when user presses Save changes
   * onReset() — called when user presses Reset; should restore original values
   */
  function track(containerEl, onSave, onReset) {
    if (!containerEl) return;
    untrack();

    _onSave = onSave;
    _onReset = onReset;

    const inputs = containerEl.querySelectorAll('input, select, textarea, [data-track]');
    const snapshot = [];
    inputs.forEach(el => {
      const val = el.type === 'checkbox' ? el.checked : el.value;
      snapshot.push({ el, val });
      el.addEventListener('change', onChange);
      el.addEventListener('input', onChange);
    });
    _tracked = snapshot;
  }

  function onChange() {
    // Check if any tracked input differs from snapshot
    const isDirty = _tracked.some(({ el, val }) => {
      const cur = el.type === 'checkbox' ? el.checked : el.value;
      return cur !== val;
    });
    if (isDirty) markDirty();
    else markClean();
  }

  function untrack() {
    _tracked.forEach(({ el }) => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('input', onChange);
    });
    _tracked = [];
  }

  saveBtn?.addEventListener('click', async () => {
    if (!_onSave) return;
    saveBtn.disabled = true;
    try {
      await _onSave();
      resnapshot();
      markClean();
    } catch (e) {
      console.error('[SaveBar] save error', e);
    } finally {
      saveBtn.disabled = false;
    }
  });

  resetBtn?.addEventListener('click', async () => {
    resetBtn.disabled = true;
    try {
      if (_onReset) await _onReset();
      resnapshot();
      markClean();
    } finally {
      resetBtn.disabled = false;
    }
  });

  return { markDirty, markClean, setHandlers, track, untrack };
})();

window.SaveBar = SaveBar;
