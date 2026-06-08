/**
 * application-editor.js — Full-page application form editor
 * Renders on /dashboard/:guildId/applications/new and /edit/:id
 */
(function () {
  'use strict';

  const GUILD_ID  = window.__AEP_GUILD_ID;
  const APP_ID    = window.__AEP_APP_ID || null;
  let   appData   = window.__AEP_APP_DATA; // null or object from server
  let   fields    = [];
  let   dirty     = false;
  let   embedTemplates = [];

  const STATUS_KEYS   = ['pending', 'in_review', 'approved', 'rejected'];
  const STATUS_LABELS = { pending: '📬 On Submit', in_review: '🔍 In Review', approved: '✅ Approved', rejected: '❌ Rejected' };

  const $ = (id) => document.getElementById(id);

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initTopbar();
    initFieldActions();
    initDividerDrag();
    initDeviceToggle();
    initColorSync();
    await ensureEmbeds();
    renderStatusTemplates();

    if (appData) {
      loadAppData(appData);
    } else {
      fields = getDefaultFields();
      renderFieldBuilder();
      renderPreview();
    }
  });

  // ── Tabs ──────────────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.aep-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.aep-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.aep-tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById('aep-tab-' + tab.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ── Topbar actions ────────────────────────────────────────
  function initTopbar() {
    $('aepNameInput')?.addEventListener('input', () => {
      dirty = true;
      $('aepBreadcrumb').textContent = $('aepNameInput').value || 'Untitled';
      renderPreview();
    });

    $('aepSaveBtn')?.addEventListener('click', saveApplication);
    $('aepCancelBtn')?.addEventListener('click', () => {
      window.location.href = `/dashboard/${GUILD_ID}#applications`;
    });

    $('aepPreviewToggle')?.addEventListener('click', () => {
      const right = $('aepRight');
      if (!right) return;
      const visible = right.style.display !== 'none';
      right.style.display = visible ? 'none' : '';
      $('aepDivider').style.display = visible ? 'none' : '';
      $('aepPreviewToggle').classList.toggle('aep-btn-ghost', visible);
      $('aepPreviewToggle').classList.toggle('aep-btn-secondary', !visible);
    });

    // Mark dirty on settings changes
    ['aepDescription','aepRecipientType','aepRecipientTargetId','aepReviewerRoleIds',
     'aepTranscriptChannelId','aepStyleAnim','aepCooldown','aepMaxSubmissions',
     'aepIsActive','aepOnePerUser','aepBlockPending','aepNotifyEnabled',
     'aepShowApplicationField','aepShowStatusField'
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => { dirty = true; renderPreview(); });
      el.addEventListener('input',  () => { dirty = true; });
    });

    // Accent color hex sync
    $('aepStyleAccentHex')?.addEventListener('input', () => {
      const v = $('aepStyleAccentHex').value;
      if (/^#[0-9a-fA-F]{6}$/.test(v) && $('aepStyleAccent')) $('aepStyleAccent').value = v;
      dirty = true;
      renderPreview();
    });

    // JSON sync
    $('aepFieldsJson')?.addEventListener('change', () => {
      try {
        const parsed = JSON.parse($('aepFieldsJson').value);
        if (Array.isArray(parsed)) {
          fields = parsed.map(normalizeField);
          renderFieldBuilder();
          renderPreview();
        }
      } catch {
        showStatus('Invalid JSON — check the fields JSON format.', 'error');
      }
    });
  }

  // ── Color sync ────────────────────────────────────────────
  function initColorSync() {
    $('aepStyleAccent')?.addEventListener('input', () => {
      if ($('aepStyleAccentHex')) $('aepStyleAccentHex').value = $('aepStyleAccent').value;
      dirty = true;
      renderPreview();
    });
  }

  // ── Field actions ─────────────────────────────────────────
  function initFieldActions() {
    $('aepAddSection')?.addEventListener('click', () => {
      fields.push(createDefaultSection());
      renderFieldBuilder();
      renderPreview();
      dirty = true;
    });
    $('aepAddQuestion')?.addEventListener('click', () => {
      fields.push(createDefaultQuestion());
      renderFieldBuilder();
      renderPreview();
      dirty = true;
    });
  }

  // ── Device toggle (preview) ───────────────────────────────
  function initDeviceToggle() {
    document.querySelectorAll('.aep-device-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.aep-device-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const inner = $('aepPreviewInner');
        if (inner) {
          inner.classList.toggle('mobile', btn.dataset.device === 'mobile');
        }
      });
    });
  }

  // ── Divider drag ──────────────────────────────────────────
  function initDividerDrag() {
    const divider = $('aepDivider');
    const left    = $('aepLeft');
    if (!divider || !left) return;
    let dragging = false;
    divider.addEventListener('mousedown', () => { dragging = true; });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const body = $('aepBody');
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const w = Math.min(Math.max(e.clientX - rect.left, 280), rect.width - 280);
      left.style.width = w + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ── Default fields ────────────────────────────────────────
  function uid() { return Math.random().toString(36).slice(2, 9); }

  function createDefaultSection() {
    return { fieldId: uid(), type: 'section', label: 'Section', helpText: '', required: false,
             sectionStyle: 'default', options: [], placeholder: '', minLength: null, maxLength: null };
  }
  function createDefaultQuestion() {
    return { fieldId: uid(), type: 'text', label: 'Question', helpText: '', required: false,
             placeholder: '', options: [], minLength: null, maxLength: null };
  }
  function normalizeField(f) {
    return {
      fieldId: f.fieldId || uid(),
      type: f.type || 'text',
      label: f.label || '',
      helpText: f.helpText || '',
      required: !!f.required,
      placeholder: f.placeholder || '',
      options: Array.isArray(f.options) ? f.options : [],
      minLength: f.minLength != null ? Number(f.minLength) : null,
      maxLength: f.maxLength != null ? Number(f.maxLength) : null,
      sectionStyle: f.sectionStyle || 'default',
    };
  }
  function getDefaultFields() {
    return [
      { fieldId: uid(), type: 'section', label: 'Basic Information', helpText: 'Tell us about yourself', required: false, sectionStyle: 'accent', options: [], placeholder: '', minLength: null, maxLength: null },
      { fieldId: uid(), type: 'text', label: 'Your Age', helpText: 'How old are you?', required: true, placeholder: '18', options: [], minLength: null, maxLength: 3 },
      { fieldId: uid(), type: 'textarea', label: 'Why do you want to join?', helpText: '', required: true, placeholder: 'Tell us why you are a great fit.', options: [], minLength: null, maxLength: 800 },
    ];
  }

  // ── Render field builder ──────────────────────────────────
  function renderFieldBuilder() {
    const container = $('aepFieldBuilder');
    const empty     = $('aepBuilderEmpty');
    if (!container) return;
    container.innerHTML = '';
    if (!fields.length) {
      if (empty) empty.style.display = '';
      syncJsonField();
      return;
    }
    if (empty) empty.style.display = 'none';

    fields.forEach((field, idx) => {
      const el = document.createElement('div');
      el.className = 'aep-field-item' + (field.type === 'section' ? ' section' : '');
      el.dataset.idx = idx;
      el.draggable = true;

      const typeLbl = { section: 'Section', text: 'Short Text', textarea: 'Long Text', select: 'Select', checkbox: 'Checkbox' }[field.type] || field.type;

      el.innerHTML = `
        <div class="aep-field-item-header">
          <span class="aep-field-drag-handle" title="Drag to reorder">⠿</span>
          <span class="aep-field-type-badge">${escHtml(typeLbl)}</span>
          <span class="aep-field-label-text">${escHtml(field.label || 'Untitled')}</span>
          <div class="aep-field-actions-row">
            <button class="aep-field-action-btn" data-action="toggle" title="Expand/Collapse">✎</button>
            <button class="aep-field-action-btn" data-action="moveup" title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="aep-field-action-btn" data-action="movedown" title="Move down" ${idx === fields.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="aep-field-action-btn del" data-action="delete" title="Delete">✕</button>
          </div>
        </div>
        <div class="aep-field-expanded" style="display:none">
          ${renderFieldExpanded(field, idx)}
        </div>`;

      // Actions
      el.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const exp = el.querySelector('.aep-field-expanded');
        if (exp) exp.style.display = exp.style.display === 'none' ? '' : 'none';
      });
      el.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        fields.splice(idx, 1);
        renderFieldBuilder();
        renderPreview();
        dirty = true;
      });
      el.querySelector('[data-action="moveup"]')?.addEventListener('click', () => {
        if (idx === 0) return;
        [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
        renderFieldBuilder();
        renderPreview();
        dirty = true;
      });
      el.querySelector('[data-action="movedown"]')?.addEventListener('click', () => {
        if (idx === fields.length - 1) return;
        [fields[idx + 1], fields[idx]] = [fields[idx], fields[idx + 1]];
        renderFieldBuilder();
        renderPreview();
        dirty = true;
      });

      // Live inline edits
      el.querySelectorAll('[data-field-prop]').forEach((input) => {
        const prop = input.dataset.fieldProp;
        input.addEventListener('input', () => {
          const val = input.type === 'checkbox' ? input.checked : input.value;
          fields[idx][prop] = (prop === 'required') ? !!val : val;
          // Update label in header without re-rendering fully
          if (prop === 'label') {
            el.querySelector('.aep-field-label-text').textContent = val || 'Untitled';
          }
          syncJsonField();
          renderPreview();
          dirty = true;
        });
        input.addEventListener('change', () => {
          const val = input.type === 'checkbox' ? input.checked : input.value;
          fields[idx][prop] = (prop === 'required') ? !!val : val;
          syncJsonField();
          renderPreview();
          dirty = true;
        });
      });

      // Drag-and-drop reorder
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', idx); el.style.opacity = '0.5'; });
      el.addEventListener('dragend', ()  => { el.style.opacity = ''; });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.borderColor = 'rgba(88,101,242,.6)'; });
      el.addEventListener('dragleave', () => { el.style.borderColor = ''; });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.borderColor = '';
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const toIdx = parseInt(el.dataset.idx);
        if (fromIdx === toIdx) return;
        const moved = fields.splice(fromIdx, 1)[0];
        fields.splice(toIdx, 0, moved);
        renderFieldBuilder();
        renderPreview();
        dirty = true;
      });

      container.appendChild(el);
    });

    syncJsonField();
  }

  function renderFieldExpanded(field, idx) {
    const typeOptions = ['text','textarea','select','checkbox'].map((t) =>
      `<option value="${t}" ${field.type === t ? 'selected' : ''}>${{text:'Short Text',textarea:'Long Text',select:'Dropdown Select',checkbox:'Checkbox'}[t]}</option>`
    ).join('');

    return `
      <div class="aep-field-group">
        <label class="aep-label">Label</label>
        <input type="text" class="aep-input" data-field-prop="label" value="${escHtml(field.label || '')}">
      </div>
      ${field.type !== 'section' ? `
      <div class="aep-two-col">
        <div class="aep-field-group">
          <label class="aep-label">Type</label>
          <select class="aep-select" data-field-prop="type">${typeOptions}</select>
        </div>
        <div class="aep-field-group">
          <label class="aep-label">Placeholder</label>
          <input type="text" class="aep-input" data-field-prop="placeholder" value="${escHtml(field.placeholder || '')}">
        </div>
      </div>
      <div class="aep-field-group">
        <label class="aep-label">Help Text</label>
        <input type="text" class="aep-input" data-field-prop="helpText" value="${escHtml(field.helpText || '')}">
      </div>
      <div class="aep-two-col">
        <div class="aep-field-group">
          <label class="aep-label">Min Length</label>
          <input type="number" class="aep-input" data-field-prop="minLength" value="${field.minLength ?? ''}" min="0">
        </div>
        <div class="aep-field-group">
          <label class="aep-label">Max Length</label>
          <input type="number" class="aep-input" data-field-prop="maxLength" value="${field.maxLength ?? ''}" min="1">
        </div>
      </div>
      <label class="aep-toggle-row" style="border:none;padding:0.3rem 0">
        <span class="aep-toggle-label" style="font-size:0.83rem">Required</span>
        <label class="aep-switch"><input type="checkbox" data-field-prop="required" ${field.required ? 'checked' : ''}><span class="aep-switch-slider"></span></label>
      </label>
      ${field.type === 'select' ? `
        <div class="aep-field-group">
          <label class="aep-label">Options <span class="aep-hint-inline">(one per line)</span></label>
          <textarea class="aep-textarea" data-field-prop="options" rows="4">${(field.options || []).join('\n')}</textarea>
        </div>` : ''}
      ` : `
      <div class="aep-field-group">
        <label class="aep-label">Subtitle</label>
        <input type="text" class="aep-input" data-field-prop="helpText" value="${escHtml(field.helpText || '')}">
      </div>
      `}`;
  }

  function syncJsonField() {
    const el = $('aepFieldsJson');
    if (el) el.value = JSON.stringify(fields, null, 2);
  }

  // ── Live preview ──────────────────────────────────────────
  function renderPreview() {
    const inner = $('aepPreviewInner');
    if (!inner) return;
    const name  = $('aepNameInput')?.value || 'Untitled Application';
    const desc  = $('aepDescription')?.value || '';
    const accentColor = $('aepStyleAccent')?.value || '#22d3ee';

    let html = `
      <div class="aep-pv-header">
        <div class="aep-pv-title" style="color:${escHtml(accentColor)}">${escHtml(name)}</div>
        ${desc ? `<div class="aep-pv-desc">${escHtml(desc)}</div>` : ''}
      </div>`;

    fields.forEach((field) => {
      if (field.type === 'section') {
        html += `
          <div class="aep-pv-section-header">
            <div class="aep-pv-section-title">${escHtml(field.label || 'Section')}</div>
            ${field.helpText ? `<div class="aep-pv-section-sub">${escHtml(field.helpText)}</div>` : ''}
          </div>`;
      } else {
        html += `
          <div class="aep-pv-field">
            <div class="aep-pv-field-label">${escHtml(field.label || 'Question')}${field.required ? '<span class="req">*</span>' : ''}</div>
            ${field.helpText ? `<div class="aep-pv-field-help">${escHtml(field.helpText)}</div>` : ''}
            ${renderPreviewInput(field)}
          </div>`;
      }
    });

    html += `<button class="aep-pv-submit-btn" disabled style="background:${escHtml(accentColor)}">Submit Application</button>`;
    inner.innerHTML = html;
  }

  function renderPreviewInput(field) {
    switch (field.type) {
      case 'textarea':
        return `<textarea class="aep-pv-textarea" placeholder="${escHtml(field.placeholder || '')}" disabled></textarea>`;
      case 'select':
        return `<select class="aep-pv-select" disabled>
          <option value="">${escHtml(field.placeholder || 'Select an option...')}</option>
          ${(field.options || []).map((o) => `<option>${escHtml(o)}</option>`).join('')}
        </select>`;
      case 'checkbox':
        return `<label style="display:flex;align-items:center;gap:0.5rem;cursor:default">
          <input type="checkbox" disabled> <span style="font-size:0.88rem;color:var(--text-2)">${escHtml(field.label || '')}</span>
        </label>`;
      default:
        return `<input type="text" class="aep-pv-input" placeholder="${escHtml(field.placeholder || '')}" disabled>`;
    }
  }

  // ── Load existing app data ────────────────────────────────
  function loadAppData(data) {
    if (!data) return;
    $('aepNameInput').value    = data.name || '';
    $('aepBreadcrumb').textContent = data.name || 'Untitled';
    if ($('aepDescription'))           $('aepDescription').value           = data.description || '';
    if ($('aepRecipientType'))          $('aepRecipientType').value          = data.recipient?.type || 'channel';
    if ($('aepRecipientTargetId'))      $('aepRecipientTargetId').value      = data.recipient?.targetId || '';
    if ($('aepReviewerRoleIds'))        $('aepReviewerRoleIds').value        = (data.reviewerRoleIds || []).join(', ');
    if ($('aepTranscriptChannelId'))    $('aepTranscriptChannelId').value    = data.transcriptChannelId || '';
    if ($('aepStyleAccent'))            $('aepStyleAccent').value            = data.style?.accentColor || '#22d3ee';
    if ($('aepStyleAccentHex'))         $('aepStyleAccentHex').value         = data.style?.accentColor || '#22d3ee';
    if ($('aepStyleAnim'))              $('aepStyleAnim').value              = data.style?.animation || 'wave';
    if ($('aepCooldown'))               $('aepCooldown').value               = data.cooldownMinutes ?? 60;
    if ($('aepMaxSubmissions'))         $('aepMaxSubmissions').value         = data.maxSubmissionsPerUser ?? 3;
    if ($('aepIsActive'))               $('aepIsActive').checked             = data.isActive !== false;
    if ($('aepOnePerUser'))             $('aepOnePerUser').checked           = data.oneSubmissionPerUser !== false;
    if ($('aepBlockPending'))           $('aepBlockPending').checked         = data.blockNewWhilePending !== false;
    if ($('aepNotifyEnabled'))          $('aepNotifyEnabled').checked        = data.notifyOnStatus !== false;
    if ($('aepShowApplicationField'))   $('aepShowApplicationField').checked = data.showApplicationField !== false;
    if ($('aepShowStatusField'))        $('aepShowStatusField').checked      = data.showStatusField !== false;

    fields = (data.fields || []).map(normalizeField);
    if (!fields.length) fields = getDefaultFields();
    renderFieldBuilder();
    renderStatusTemplates(data.statusTemplates || {});
    renderPreview();
    dirty = false;
  }

  // ── Status templates ──────────────────────────────────────
  async function ensureEmbeds() {
    try {
      const res = await fetch(`/api/guild/${GUILD_ID}/embeds`);
      if (res.ok) embedTemplates = await res.json();
    } catch { embedTemplates = []; }
  }

  function renderStatusTemplates(current = {}) {
    const container = $('aepStatusTemplates');
    if (!container) return;
    const embedOptions = embedTemplates.map((t) => `<option value="${t._id}">${escHtml(t.name)}</option>`).join('');
    container.innerHTML = STATUS_KEYS.map((key) => `
      <div class="aep-status-template-row">
        <span class="aep-status-badge ${key}">${STATUS_LABELS[key]}</span>
        <select class="aep-select aep-status-select" id="aepStatusTpl_${key}">
          <option value="">No DM</option>
          <option value="generic" ${current[key] === 'generic' ? 'selected' : ''}>Generic embed</option>
          ${embedOptions}
        </select>
      </div>`).join('');

    // Pre-select existing values
    STATUS_KEYS.forEach((key) => {
      const sel = document.getElementById(`aepStatusTpl_${key}`);
      if (sel && current[key]) sel.value = current[key];
    });
  }

  // ── Build payload ─────────────────────────────────────────
  function buildPayload() {
    const reviewerRoleIds = ($('aepReviewerRoleIds')?.value || '')
      .split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));

    const statusTemplates = {};
    STATUS_KEYS.forEach((key) => {
      const val = document.getElementById(`aepStatusTpl_${key}`)?.value || '';
      if (val) statusTemplates[key] = val;
    });

    return {
      name: $('aepNameInput')?.value?.trim() || 'Untitled',
      description: $('aepDescription')?.value?.trim() || '',
      recipient: {
        type: $('aepRecipientType')?.value || 'channel',
        targetId: $('aepRecipientTargetId')?.value?.trim() || '',
      },
      reviewerRoleIds,
      transcriptChannelId: $('aepTranscriptChannelId')?.value?.trim() || null,
      style: {
        accentColor: $('aepStyleAccent')?.value || '#22d3ee',
        animation: $('aepStyleAnim')?.value || 'wave',
      },
      cooldownMinutes:       parseInt($('aepCooldown')?.value) || 60,
      maxSubmissionsPerUser: parseInt($('aepMaxSubmissions')?.value) || 3,
      isActive:              $('aepIsActive')?.checked ?? true,
      oneSubmissionPerUser:  $('aepOnePerUser')?.checked ?? true,
      blockNewWhilePending:  $('aepBlockPending')?.checked ?? true,
      notifyOnStatus:        $('aepNotifyEnabled')?.checked ?? true,
      showApplicationField:  $('aepShowApplicationField')?.checked ?? true,
      showStatusField:       $('aepShowStatusField')?.checked ?? true,
      statusTemplates,
      fields,
    };
  }

  // ── Save ──────────────────────────────────────────────────
  async function saveApplication() {
    const payload = buildPayload();
    if (!payload.name) { showStatus('Please enter an application name.', 'error'); return; }
    if (!payload.recipient.targetId) { showStatus('Please enter a target channel or user ID.', 'error'); return; }

    const btn = $('aepSaveBtn');
    if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

    try {
      const method = APP_ID ? 'PATCH' : 'POST';
      const url    = APP_ID
        ? `/api/guild/${GUILD_ID}/applications/${APP_ID}`
        : `/api/guild/${GUILD_ID}/applications`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      dirty = false;
      showStatus('Saved successfully!', 'ok');

      // If new, redirect to edit page
      if (!APP_ID && data._id) {
        setTimeout(() => {
          window.location.href = `/dashboard/${GUILD_ID}/applications/edit/${data._id}`;
        }, 800);
      }
    } catch (err) {
      showStatus('Save failed: ' + err.message, 'error');
    } finally {
      if (btn) { btn.textContent = '💾 Save Application'; btn.disabled = false; }
    }
  }

  // ── Status bar ────────────────────────────────────────────
  function showStatus(msg, type) {
    const bar = $('aepStatusBar');
    const txt = $('aepStatusMsg');
    if (!bar || !txt) return;
    txt.textContent = msg;
    bar.className = 'aep-statusbar' + (type === 'error' ? ' error' : '');
    bar.style.display = '';
    clearTimeout(bar._timer);
    bar._timer = setTimeout(() => { bar.style.display = 'none'; }, 4000);
  }

  // ── Before unload warning ─────────────────────────────────
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Utilities ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
