(function () {
  const GUILD_ID = document.getElementById('pageData')?.dataset?.guildId;
  if (!GUILD_ID) return;

  const listEl = document.getElementById('appsList');
  const newBtn = document.getElementById('appNewBtn');
  const reviewBtn = document.getElementById('appReviewPageBtn');
  const statusEl = document.getElementById('appGlobalStatus');

  const backdrop = document.getElementById('appEditorBackdrop');
  const closeBtn = document.getElementById('appEditorClose');
  const cancelBtn = document.getElementById('appEditorCancel');
  const saveBtn = document.getElementById('appEditorSave');
  const titleEl = document.getElementById('appEditorTitle');

  if (!listEl || !newBtn || !reviewBtn || !backdrop) return;

  let applications = [];
  let editingId = null;

  const DEFAULT_FIELDS = [
    {
      fieldId: 'why_join',
      label: 'Why do you want to join?',
      type: 'textarea',
      required: true,
      maxLength: 800,
      placeholder: 'Tell us why you are a great fit.'
    },
    {
      fieldId: 'experience',
      label: 'Relevant experience',
      type: 'textarea',
      required: true,
      maxLength: 1000,
      placeholder: 'Share any relevant experience.'
    }
  ];

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadApplications();
  });

  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section === 'applications') {
      loadApplications();
    }
  });

  function bindEvents() {
    newBtn.addEventListener('click', () => openEditor(null));
    closeBtn.addEventListener('click', closeEditor);
    cancelBtn.addEventListener('click', closeEditor);
    saveBtn.addEventListener('click', saveApplication);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeEditor();
    });

    reviewBtn.addEventListener('click', () => {
      window.location.href = reviewBtn.href;
    });
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadApplications() {
    try {
      listEl.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading applications…</div>';
      applications = await apiFetch(`/guild/${GUILD_ID}/applications`);
      renderList();
      setStatus(`Loaded ${applications.length} application${applications.length === 1 ? '' : 's'}.`, 'ok');
    } catch (err) {
      listEl.innerHTML = `<div class="commands-loading" style="color:#fca5a5">Failed to load applications: ${escHtml(err.message)}</div>`;
      setStatus('Failed to load applications.', 'error');
    }
  }

  function renderList() {
    if (!applications.length) {
      listEl.innerHTML = '<div class="apps-empty">No applications yet. Create your first one to start collecting submissions.</div>';
      return;
    }

    listEl.innerHTML = applications.map((app) => {
      const closed = !app.isActive;
      const pending = app.stats?.pendingSubmissions || 0;
      return `
        <article class="app-card ${closed ? 'closed' : ''}">
          <div class="app-card-head">
            <div>
              <h3>${escHtml(app.name)}</h3>
              <p>${escHtml(app.description || 'No description')}</p>
            </div>
            <span class="app-state ${closed ? 'off' : 'on'}">${closed ? 'Closed' : 'Open'}</span>
          </div>
          <div class="app-card-stats">
            <span>Total: <strong>${app.stats?.totalSubmissions || 0}</strong></span>
            <span>Pending: <strong>${pending}</strong></span>
            <span>Recipient: <strong>${escHtml(app.recipient?.type || 'channel')}</strong></span>
          </div>
          <div class="app-card-links">
            <a href="${escHtml(app.publicUrl)}" target="_blank" rel="noopener noreferrer">Open Public Form</a>
            <a href="/dashboard/${GUILD_ID}/applications/review?appId=${app._id}">Review Submissions</a>
          </div>
          <div class="app-card-actions">
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${app._id}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${app._id}">Delete</button>
          </div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const app = applications.find((a) => a._id === btn.dataset.id);
        if (app) openEditor(app);
      });
    });

    listEl.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => deleteApplication(btn.dataset.id));
    });
  }

  function openEditor(app) {
    editingId = app?._id || null;
    titleEl.textContent = editingId ? 'Edit Application' : 'Create Application';

    document.getElementById('appName').value = app?.name || '';
    document.getElementById('appDescription').value = app?.description || '';
    document.getElementById('appRecipientType').value = app?.recipient?.type || 'channel';
    document.getElementById('appRecipientTargetId').value = app?.recipient?.targetId || '';
    document.getElementById('appReviewerRoleIds').value = (app?.reviewerRoleIds || []).join(', ');

    document.getElementById('appStyleAccent').value = app?.style?.accent || '#22d3ee';
    document.getElementById('appStyleAnim').value = app?.style?.animationPreset || 'wave';

    document.getElementById('appIsActive').checked = app?.isActive !== false;
    document.getElementById('appOnePerUser').checked = app?.abuseProtection?.oneSubmissionPerUser !== false;
    document.getElementById('appBlockPending').checked = app?.abuseProtection?.blockIfPendingExists !== false;
    document.getElementById('appCooldown').value = app?.abuseProtection?.cooldownMinutes ?? 60;
    document.getElementById('appMaxSubmissions').value = app?.abuseProtection?.maxSubmissionsPerUser ?? 3;

    document.getElementById('appFieldsJson').value = JSON.stringify(app?.fields || DEFAULT_FIELDS, null, 2);

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    editingId = null;
  }

  function buildPayloadFromForm() {
    const reviewerRoleIds = document.getElementById('appReviewerRoleIds').value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => /^\d+$/.test(v));

    const fields = JSON.parse(document.getElementById('appFieldsJson').value);

    return {
      name: document.getElementById('appName').value.trim(),
      description: document.getElementById('appDescription').value.trim(),
      isActive: document.getElementById('appIsActive').checked,
      recipient: {
        type: document.getElementById('appRecipientType').value,
        targetId: document.getElementById('appRecipientTargetId').value.trim(),
      },
      reviewerRoleIds,
      abuseProtection: {
        oneSubmissionPerUser: document.getElementById('appOnePerUser').checked,
        blockIfPendingExists: document.getElementById('appBlockPending').checked,
        cooldownMinutes: Number(document.getElementById('appCooldown').value || 0),
        maxSubmissionsPerUser: Number(document.getElementById('appMaxSubmissions').value || 1),
      },
      style: {
        accent: document.getElementById('appStyleAccent').value,
        animationPreset: document.getElementById('appStyleAnim').value,
      },
      fields,
    };
  }

  async function saveApplication() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const payload = buildPayloadFromForm();

      if (!payload.name) throw new Error('Application name is required.');
      if (!payload.recipient.targetId || !/^\d+$/.test(payload.recipient.targetId)) {
        throw new Error('Target ID must be a valid Discord ID.');
      }
      if (!Array.isArray(payload.fields) || !payload.fields.length) {
        throw new Error('Provide at least one field in the JSON editor.');
      }

      if (editingId) {
        await apiFetch(`/guild/${GUILD_ID}/applications/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/guild/${GUILD_ID}/applications`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      closeEditor();
      await loadApplications();
      setStatus('Application saved successfully.', 'ok');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Application';
    }
  }

  async function deleteApplication(id) {
    if (!id) return;
    if (!window.confirm('Delete this application and all submissions? This cannot be undone.')) return;

    try {
      await apiFetch(`/guild/${GUILD_ID}/applications/${id}`, { method: 'DELETE' });
      await loadApplications();
      setStatus('Application deleted.', 'ok');
    } catch (err) {
      setStatus(`Delete failed: ${err.message}`, 'error');
    }
  }

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('error', 'ok');
    statusEl.classList.add(type === 'error' ? 'error' : 'ok');
  }

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
