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

  const addQuestionBtn = document.getElementById('appAddQuestionBtn');
  const addSectionBtn = document.getElementById('appAddSectionBtn');
  const fieldBuilderEl = document.getElementById('appFieldBuilder');
  const fieldsJsonEl = document.getElementById('appFieldsJson');
  const statusTemplatesEl = document.getElementById('appStatusTemplates');
  const notifyEnabledEl = document.getElementById('appNotifyEnabled');

  if (!listEl || !newBtn || !reviewBtn || !backdrop) return;

  let applications = [];
  let editingId = null;
  let embedTemplates = [];
  let builderFields = [];

  const DEFAULT_FIELDS = [
    {
      fieldId: createFieldId(),
      type: 'section',
      label: 'Basic Information',
      helpText: 'Tell us about yourself',
      required: false,
      sectionStyle: 'accent',
      options: [],
      placeholder: '',
      minLength: null,
      maxLength: null,
    },
    {
      fieldId: createFieldId(),
      type: 'text',
      label: 'Age',
      helpText: 'How old are you?',
      required: true,
      placeholder: '18',
      options: [],
      minLength: null,
      maxLength: 3,
    },
    {
      fieldId: createFieldId(),
      type: 'textarea',
      label: 'Why do you want to join?',
      helpText: '',
      required: true,
      placeholder: 'Tell us why you are a great fit.',
      options: [],
      minLength: null,
      maxLength: 800,
    },
  ];

  const STATUS_KEYS = ['pending', 'in_review', 'approved', 'rejected'];

  const STATUS_LABELS = {
    pending: '📬 On Submit',
    in_review: '🔍 In Review',
    approved: '✅ Approved',
    rejected: '❌ Rejected',
  };

  const STATUS_COLORS = {
    pending: '#22d3ee',
    in_review: '#f59e0b',
    approved: '#22c55e',
    rejected: '#ef4444',
  };

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
    closeBtn?.addEventListener('click', closeEditor);
    cancelBtn?.addEventListener('click', closeEditor);
    saveBtn?.addEventListener('click', saveApplication);
    addQuestionBtn?.addEventListener('click', () => {
      builderFields.push(createDefaultQuestion());
      renderFieldBuilder();
    });
    addSectionBtn?.addEventListener('click', () => {
      builderFields.push(createDefaultSection());
      renderFieldBuilder();
    });

    fieldsJsonEl?.addEventListener('change', () => {
      try {
        const parsed = JSON.parse(fieldsJsonEl.value);
        if (Array.isArray(parsed)) {
          builderFields = parsed.map(normalizeFieldClient);
          renderFieldBuilder();
          setStatus('Synced fields from JSON.', 'ok');
        }
      } catch {
        setStatus('Invalid JSON in advanced editor.', 'error');
      }
    });

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

  async function ensureEmbedsLoaded() {
    if (embedTemplates.length) return;
    try {
      embedTemplates = await apiFetch(`/guild/${GUILD_ID}/embeds`);
    } catch {
      embedTemplates = [];
    }
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

  async function openEditor(app) {
    editingId = app?._id || null;
    titleEl.textContent = editingId ? 'Edit Application' : 'Create Application';
    await ensureEmbedsLoaded();

    document.getElementById('appName').value = app?.name || '';
    document.getElementById('appDescription').value = app?.description || '';
    document.getElementById('appRecipientType').value = app?.recipient?.type || 'channel';
    document.getElementById('appRecipientTargetId').value = app?.recipient?.targetId || '';
    document.getElementById('appReviewerRoleIds').value = (app?.reviewerRoleIds || []).join(', ');
    document.getElementById('appTranscriptChannelId').value = app?.transcriptChannelId || '';

    document.getElementById('appStyleAccent').value = app?.style?.accent || '#22d3ee';
    document.getElementById('appStyleAnim').value = app?.style?.animationPreset || 'wave';

    document.getElementById('appIsActive').checked = app?.isActive !== false;
    document.getElementById('appOnePerUser').checked = app?.abuseProtection?.oneSubmissionPerUser !== false;
    document.getElementById('appBlockPending').checked = app?.abuseProtection?.blockIfPendingExists !== false;
    document.getElementById('appCooldown').value = app?.abuseProtection?.cooldownMinutes ?? 60;
    document.getElementById('appMaxSubmissions').value = app?.abuseProtection?.maxSubmissionsPerUser ?? 3;

    builderFields = (app?.fields?.length ? app.fields : DEFAULT_FIELDS).map(normalizeFieldClient);
    renderFieldBuilder();

    notifyEnabledEl.checked = app?.reviewNotifications?.enabled !== false;
    document.getElementById('appShowApplicationField').checked = app?.reviewNotifications?.showApplicationField !== false;
    document.getElementById('appShowStatusField').checked = app?.reviewNotifications?.showStatusField !== false;
    renderStatusTemplates(app?.reviewNotifications?.templates || {});

    fieldsJsonEl.value = JSON.stringify(builderFields, null, 2);

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (window.refreshCustomSelects) window.refreshCustomSelects(backdrop);
  }

  function renderFieldBuilder() {
    if (!fieldBuilderEl) return;
    if (!builderFields.length) {
      fieldBuilderEl.innerHTML = '<div class="apps-empty">No fields yet. Add a section or question to get started.</div>';
      fieldsJsonEl.value = '[]';
      return;
    }

    fieldBuilderEl.innerHTML = builderFields.map((field, idx) => {
      const isSection = field.type === 'section';
      const options = isSection ? '' : `
        <div class="app-field-row">
          <label>Type
            <select data-cs data-field-input="type" data-idx="${idx}">
              ${['text', 'textarea', 'select', 'number', 'boolean'].map((type) => `<option value="${type}" ${type === field.type ? 'selected' : ''}>${type}</option>`).join('')}
            </select>
          </label>
          <label>Required
            <input type="checkbox" data-field-input="required" data-idx="${idx}" ${field.required ? 'checked' : ''}>
          </label>
          <label>Max Length
            <input type="number" data-field-input="maxLength" data-idx="${idx}" value="${field.maxLength || ''}" min="1" max="4000">
          </label>
        </div>
      `;

      return `
        <section class="app-field-card ${isSection ? 'is-section' : ''}" data-idx="${idx}">
          <div class="app-field-head">
            <strong>${isSection ? 'Section' : 'Question'} ${idx + 1}</strong>
            <div>
              <button class="btn btn-ghost btn-sm" type="button" data-move="up" data-idx="${idx}">↑</button>
              <button class="btn btn-ghost btn-sm" type="button" data-move="down" data-idx="${idx}">↓</button>
              <button class="btn btn-ghost btn-sm" type="button" data-remove="${idx}">Delete</button>
            </div>
          </div>

          <label>Label
            <input type="text" data-field-input="label" data-idx="${idx}" value="${escHtml(field.label)}" maxlength="120">
          </label>
          <label>Help Text
            <input type="text" data-field-input="helpText" data-idx="${idx}" value="${escHtml(field.helpText || '')}" maxlength="280">
          </label>

          ${isSection ? `
            <label>Section Style
              <select data-cs data-field-input="sectionStyle" data-idx="${idx}">
                ${['accent', 'glass', 'plain'].map((style) => `<option value="${style}" ${style === (field.sectionStyle || 'accent') ? 'selected' : ''}>${style}</option>`).join('')}
              </select>
            </label>
          ` : options}

          ${field.type === 'select' ? `<label>Options (comma separated)
            <input type="text" data-field-input="options" data-idx="${idx}" value="${escHtml((field.options || []).join(', '))}">
          </label>` : ''}
        </section>
      `;
    }).join('');

    fieldBuilderEl.querySelectorAll('[data-field-input]').forEach((el) => {
      el.addEventListener('input', onFieldInputChanged);
      el.addEventListener('change', onFieldInputChanged);
    });
    if (window.refreshCustomSelects) window.refreshCustomSelects(fieldBuilderEl);

    fieldBuilderEl.querySelectorAll('[data-remove]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.remove);
        builderFields.splice(idx, 1);
        renderFieldBuilder();
      });
    });

    fieldBuilderEl.querySelectorAll('[data-move]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.idx);
        const dir = el.dataset.move;
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= builderFields.length) return;
        const current = builderFields[idx];
        builderFields[idx] = builderFields[target];
        builderFields[target] = current;
        renderFieldBuilder();
      });
    });

    fieldsJsonEl.value = JSON.stringify(builderFields, null, 2);
  }

  function onFieldInputChanged(e) {
    const idx = Number(e.target.dataset.idx);
    const key = e.target.dataset.fieldInput;
    const field = builderFields[idx];
    if (!field) return;

    if (key === 'required') {
      field.required = e.target.checked;
    } else if (key === 'maxLength') {
      const parsed = Number(e.target.value);
      field.maxLength = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } else if (key === 'options') {
      field.options = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
    } else {
      field[key] = e.target.value;
      if (key === 'type' && field.type === 'section') {
        field.required = false;
      }
    }

    fieldsJsonEl.value = JSON.stringify(builderFields, null, 2);
  }

  function renderStatusTemplates(existingTemplates) {
    if (!statusTemplatesEl) return;

    statusTemplatesEl.innerHTML = STATUS_KEYS.map((status) => {
      const template = normalizeTemplate(existingTemplates[status], status);
      const accentColor = STATUS_COLORS[status] || '#22d3ee';
      return `
        <section class="app-status-card" data-status="${status}" style="--status-accent:${accentColor}">
          <div class="app-status-card-head">
            <h5>${STATUS_LABELS[status] || status.replace('_', ' ')}</h5>
            ${status === 'pending' ? '<span class="app-status-badge">DM sent when applicant submits</span>' : ''}
          </div>
          <label>DM Mode
            <select class="app-status-mode-select" data-cs data-template-input="mode" data-status="${status}">
              <option value="none" ${template.mode === 'none' ? 'selected' : ''}>No DM</option>
              <option value="generic" ${template.mode === 'generic' ? 'selected' : ''}>Generic embed</option>
              <option value="saved_embed" ${template.mode === 'saved_embed' ? 'selected' : ''}>Saved embed template</option>
            </select>
          </label>
          <div class="app-status-mode-fields" data-mode-for="${status}">
            <div class="app-status-mode-section app-mode-saved" ${template.mode !== 'saved_embed' ? 'style="display:none"' : ''}>
              <label>Saved Embed Template
                <select data-cs data-template-input="savedEmbedId" data-status="${status}">
                  <option value="">— Select a saved embed —</option>
                  ${embedTemplates.map((emb) => `<option value="${emb._id}" ${String(emb._id) === String(template.savedEmbedId || '') ? 'selected' : ''}>${escHtml(emb.name)}</option>`).join('')}
                </select>
              </label>
            </div>
            <div class="app-status-mode-section app-mode-generic" ${template.mode !== 'generic' ? 'style="display:none"' : ''}>
              <label>Title
                <input type="text" data-template-input="genericTitle" data-status="${status}" value="${escHtml(template.genericTitle || '')}" maxlength="120" placeholder="e.g. Application Received">
              </label>
              <label>Description
                <textarea data-template-input="genericDescription" data-status="${status}" rows="3" maxlength="2000" placeholder="Message body sent to the applicant…">${escHtml(template.genericDescription || '')}</textarea>
              </label>
              <label>Embed Color
                <input type="color" data-template-input="genericColor" data-status="${status}" value="${template.genericColor || accentColor}">
              </label>
            </div>
          </div>
        </section>
      `;
    }).join('');

    // Wire up mode selects to show/hide the relevant sub-fields
    if (window.refreshCustomSelects) window.refreshCustomSelects(statusTemplatesEl);
    statusTemplatesEl.querySelectorAll('.app-status-mode-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const status = sel.dataset.status;
        const modeFields = statusTemplatesEl.querySelector(`[data-mode-for="${status}"]`);
        if (!modeFields) return;
        const savedSection = modeFields.querySelector('.app-mode-saved');
        const genericSection = modeFields.querySelector('.app-mode-generic');
        if (savedSection) savedSection.style.display = sel.value === 'saved_embed' ? '' : 'none';
        if (genericSection) genericSection.style.display = sel.value === 'generic' ? '' : 'none';
      });
    });
  }

  function closeEditor() {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    editingId = null;
  }

  function getTemplateValues() {
    const templates = {};
    STATUS_KEYS.forEach((status) => {
      const read = (key) => statusTemplatesEl.querySelector(`[data-template-input="${key}"][data-status="${status}"]`);
      templates[status] = {
        mode: read('mode')?.value || 'generic',
        savedEmbedId: read('savedEmbedId')?.value || null,
        genericTitle: read('genericTitle')?.value?.trim() || '',
        genericDescription: read('genericDescription')?.value?.trim() || '',
        genericColor: read('genericColor')?.value || '#22d3ee',
      };
    });
    return templates;
  }

  function buildPayloadFromForm() {
    const reviewerRoleIds = document.getElementById('appReviewerRoleIds').value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => /^\d+$/.test(v));

    return {
      name: document.getElementById('appName').value.trim(),
      description: document.getElementById('appDescription').value.trim(),
      isActive: document.getElementById('appIsActive').checked,
      recipient: {
        type: document.getElementById('appRecipientType').value,
        targetId: document.getElementById('appRecipientTargetId').value.trim(),
      },
      reviewerRoleIds,
      transcriptChannelId: document.getElementById('appTranscriptChannelId').value.trim() || null,
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
      fields: builderFields.map(normalizeFieldClient),
      reviewNotifications: {
        enabled: notifyEnabledEl.checked,
        showApplicationField: document.getElementById('appShowApplicationField').checked,
        showStatusField: document.getElementById('appShowStatusField').checked,
        templates: getTemplateValues(),
      },
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
      const answerable = payload.fields.filter((f) => f.type !== 'section');
      if (!answerable.length) {
        throw new Error('Add at least one non-section question in the visual builder.');
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

  function normalizeFieldClient(field) {
    return {
      fieldId: field.fieldId || createFieldId(),
      type: ['text', 'textarea', 'select', 'number', 'boolean', 'section'].includes(field.type) ? field.type : 'text',
      label: String(field.label || '').slice(0, 120),
      helpText: String(field.helpText || '').slice(0, 280),
      required: field.type === 'section' ? false : field.required !== false,
      placeholder: String(field.placeholder || '').slice(0, 120),
      options: Array.isArray(field.options) ? field.options.map((v) => String(v).trim()).filter(Boolean).slice(0, 20) : [],
      minLength: typeof field.minLength === 'number' ? field.minLength : null,
      maxLength: typeof field.maxLength === 'number' ? field.maxLength : null,
      sectionStyle: ['plain', 'glass', 'accent'].includes(field.sectionStyle) ? field.sectionStyle : 'accent',
    };
  }

  function normalizeTemplate(template, status) {
    const defaults = {
      pending: {
        mode: 'none',
        genericTitle: 'Application Received',
        genericDescription: 'Thank you for applying! Your application has been received and is pending review.',
        genericColor: '#22d3ee',
      },
      in_review: {
        mode: 'generic',
        genericTitle: 'Application In Review',
        genericDescription: 'Your application is now being reviewed.',
        genericColor: '#f59e0b',
      },
      approved: {
        mode: 'generic',
        genericTitle: 'Application Approved',
        genericDescription: 'Congratulations. Your application was approved.',
        genericColor: '#22c55e',
      },
      rejected: {
        mode: 'generic',
        genericTitle: 'Application Rejected',
        genericDescription: 'Your application was not accepted this time.',
        genericColor: '#ef4444',
      },
    };
    return {
      ...defaults[status],
      ...(template || {}),
    };
  }

  function createFieldId() {
    return `f_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }

  function createDefaultQuestion() {
    return {
      fieldId: createFieldId(),
      type: 'text',
      label: 'New question',
      helpText: '',
      required: true,
      placeholder: '',
      options: [],
      minLength: null,
      maxLength: null,
      sectionStyle: 'accent',
    };
  }

  function createDefaultSection() {
    return {
      fieldId: createFieldId(),
      type: 'section',
      label: 'New section',
      helpText: 'Add section context here',
      required: false,
      placeholder: '',
      options: [],
      minLength: null,
      maxLength: null,
      sectionStyle: 'accent',
    };
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
