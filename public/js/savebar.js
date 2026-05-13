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

/* =============================================
   GLOBAL TOAST NOTIFICATIONS
   ============================================= */
window.showToast = (function () {
  let container = null;

  function getContainer() {
    if (container) return container;
    container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none';
      document.body.appendChild(container);
    }
    return container;
  }

  return function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)', warning: 'var(--yellow)' };
    toast.style.cssText = `background:var(--bg-2);border:1px solid ${colors[type] || colors.info};border-left:4px solid ${colors[type] || colors.info};color:var(--text);padding:0.75rem 1.1rem;border-radius:var(--r-md,8px);font-size:0.9rem;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:auto;max-width:360px;opacity:0;transform:translateY(8px);transition:opacity 0.2s ease,transform 0.2s ease;word-break:break-word`;
    toast.textContent = message;
    getContainer().appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 220);
    }, 4000);
  };
}());

/* =============================================
   GLOBAL CONFIRM DIALOG (async, non-blocking)
   ============================================= */
window.showConfirm = (function () {
  return function showConfirm(message, { title = 'Confirm', confirmText = 'Confirm', type = 'danger' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px)';

      const accentColor = type === 'danger' ? 'var(--red)' : type === 'warning' ? 'var(--yellow)' : 'var(--accent)';
      overlay.innerHTML = `<div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r-lg,12px);padding:1.75rem;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <h3 style="margin:0 0 0.75rem;font-size:1.05rem;font-weight:700;color:var(--text)">${escDlg(title)}</h3>
        <p style="margin:0 0 1.5rem;font-size:0.9rem;color:var(--text-2);line-height:1.5">${escDlg(message)}</p>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end">
          <button id="_dlgCancel" style="background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);padding:0.5rem 1.1rem;border-radius:var(--r-md,8px);cursor:pointer;font-size:0.9rem;transition:background 0.15s">Cancel</button>
          <button id="_dlgConfirm" style="background:${accentColor};border:none;color:#fff;padding:0.5rem 1.1rem;border-radius:var(--r-md,8px);cursor:pointer;font-size:0.9rem;font-weight:600;transition:opacity 0.15s">${escDlg(confirmText)}</button>
        </div>
      </div>`;

      function escDlg(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

      function finish(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('#_dlgCancel').addEventListener('click', () => finish(false));
      overlay.querySelector('#_dlgConfirm').addEventListener('click', () => finish(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', esc); finish(false); }
      }, { once: true });

      document.body.appendChild(overlay);
      overlay.querySelector('#_dlgConfirm').focus();
    });
  };
}());
