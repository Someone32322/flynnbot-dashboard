/**
 * responses.js — Bot Messages editor (Visual / Raw / Variables)
 * Replaces old custom-responses system with full embed template editor.
 */

let _bmTypes = [];          // [{ key, label, group }]
let _bmTemplates = {};      // { [messageType]: templateObj }
let _bmActive = null;       // currently selected messageType key
let _bmDirty = false;
let _bmGuildId = null;
let _bmInitDone = false;

// ── Default template values ──────────────────────────────────────────────────
function bmDefaults(key) {
  return {
    messageType: key,
    enabled: true,
    content: '',
    embedEnabled: true,
    embedColor: '#6366f1',
    embedAuthor: '',
    embedTitle: '',
    embedDescription: '',
    embedFooter: '',
    embedThumbnail: false,
    embedFields: [],
    messageStyle: 'success',
    removeTitleEmoji: false,
    removeEmptyLines: false,
  };
}

function escBm(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function initResponses(guildId) {
  if (_bmInitDone) return;
  _bmInitDone = true;
  _bmGuildId = guildId;
  await loadBmData(guildId);
}

async function loadBmData(guildId) {
  const sidebar = document.getElementById('bmSidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '<div class="commands-loading"><div class="spinner"></div></div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/bot-messages`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    _bmTypes = data.types || [];
    _bmTemplates = data.templates || {};
    renderBmSidebar();
  } catch (e) {
    sidebar.innerHTML = `<div class="error-message">❌ ${escBm(e.message)}</div>`;
  }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function renderBmSidebar() {
  const sidebar = document.getElementById('bmSidebar');
  if (!sidebar) return;

  // Group types
  const groups = {};
  _bmTypes.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });

  let html = '';
  for (const [groupName, items] of Object.entries(groups)) {
    html += `<div class="bm-sidebar-group-label">${escBm(groupName)}</div>`;
    items.forEach(t => {
      const isCustom = !!_bmTemplates[t.key];
      html += `<button class="bm-sidebar-item${_bmActive === t.key ? ' active' : ''}" data-bm-key="${escBm(t.key)}">
        <span class="bm-sidebar-dot ${isCustom ? 'custom' : 'default'}"></span>
        <span>${escBm(t.label)}</span>
      </button>`;
    });
  }
  sidebar.innerHTML = html;

  sidebar.querySelectorAll('[data-bm-key]').forEach(btn => {
    btn.addEventListener('click', () => selectBmType(btn.dataset.bmKey));
  });

  if (_bmActive) selectBmType(_bmActive, false);
}

// ── Select a message type ─────────────────────────────────────────────────────
async function selectBmType(key, scrollIntoView = true) {
  if (_bmDirty && _bmActive && _bmActive !== key) {
    if (!await window.showConfirm('You have unsaved changes. Switch away?', { title: 'Unsaved Changes', confirmText: 'Switch', type: 'warning' })) return;
  }
  _bmActive = key;
  _bmDirty = false;

  // Update sidebar active state
  document.querySelectorAll('[data-bm-key]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bmKey === key);
  });

  const typeInfo = _bmTypes.find(t => t.key === key);
  const tmpl = Object.assign({}, bmDefaults(key), _bmTemplates[key] || {});
  renderBmEditor(typeInfo, tmpl);

  if (scrollIntoView) {
    document.getElementById('bmEditor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Editor ───────────────────────────────────────────────────────────────────
let _bmEditorTab = 'visual'; // 'visual' | 'raw' | 'variables'

function renderBmEditor(typeInfo, tmpl) {
  const editor = document.getElementById('bmEditor');
  if (!editor) return;

  editor.innerHTML = `
    <div class="bm-editor-header">
      <div>
        <div class="bm-editor-title">${escBm(typeInfo?.label || tmpl.messageType)}</div>
        <div class="bm-editor-subtitle">${escBm(typeInfo?.group || '')}</div>
      </div>
      <label class="ec-toggle-row" style="gap:0.5rem;margin:0">
        <div class="toggle-switch"><input type="checkbox" id="bmEnabled" ${tmpl.enabled ? 'checked' : ''}/><span class="toggle-slider"></span></div>
        <span style="font-size:0.82rem;color:var(--text-3)">Enabled</span>
      </label>
    </div>

    <!-- Tabs: Visual | Raw | Variables -->
    <div class="bm-tabs" id="bmTabs">
      <button class="bm-tab${_bmEditorTab === 'visual' ? ' active' : ''}" data-bm-tab="visual">Visual</button>
      <button class="bm-tab${_bmEditorTab === 'raw' ? ' active' : ''}" data-bm-tab="raw">Raw JSON</button>
      <button class="bm-tab${_bmEditorTab === 'variables' ? ' active' : ''}" data-bm-tab="variables">Variables</button>
    </div>

    <!-- Tab panels -->
    <div id="bmTabVisual" class="bm-tab-panel" style="display:${_bmEditorTab === 'visual' ? '' : 'none'}">
      ${buildVisualTab(tmpl)}
    </div>
    <div id="bmTabRaw" class="bm-tab-panel" style="display:${_bmEditorTab === 'raw' ? '' : 'none'}">
      ${buildRawTab(tmpl)}
    </div>
    <div id="bmTabVariables" class="bm-tab-panel" style="display:${_bmEditorTab === 'variables' ? '' : 'none'}">
      ${buildVariablesTab(tmpl)}
    </div>

    <!-- Footer actions -->
    <div class="bm-footer">
      <button class="btn btn-ghost btn-sm" id="bmResetBtn">Reset to default</button>
      <div style="display:flex;gap:0.6rem;align-items:center">
        <span class="save-status" id="bmSaveStatus"></span>
        <button class="btn btn-primary btn-sm" id="bmSaveBtn">Save changes</button>
      </div>
    </div>`;

  wireBmEditor(tmpl);
}

// ── Visual tab ───────────────────────────────────────────────────────────────
function buildVisualTab(tmpl) {
  return `
    <div class="bm-visual-section">
      <label class="bm-field-label">Plain text content</label>
      <textarea class="ec-input bm-input" id="bmContent" rows="2" placeholder="Message text before the embed (optional)">${escBm(tmpl.content)}</textarea>
    </div>

    <div class="bm-visual-section">
      <div class="bm-section-title-row">
        <span class="bm-section-title">Embed</span>
        <label class="ec-toggle-row" style="gap:0.4rem;margin:0">
          <div class="toggle-switch" style="--sz:0.85rem">
            <input type="checkbox" id="bmEmbedEnabled" ${tmpl.embedEnabled ? 'checked' : ''}/>
            <span class="toggle-slider"></span>
          </div>
          <span style="font-size:0.78rem;color:var(--text-3)">Show embed</span>
        </label>
      </div>

      <div id="bmEmbedFields" style="${tmpl.embedEnabled ? '' : 'opacity:0.4;pointer-events:none'}">
        <!-- Color bar -->
        <div class="bm-color-row">
          <label class="bm-field-label" style="margin:0">Color</label>
          <input type="color" id="bmEmbedColor" value="${escBm(tmpl.embedColor || '#6366f1')}" class="bm-color-input" />
          <input type="text" id="bmEmbedColorHex" class="ec-input bm-color-hex" value="${escBm(tmpl.embedColor || '#6366f1')}" maxlength="7" />
        </div>

        <label class="bm-field-label">Author</label>
        <input type="text" class="ec-input bm-input" id="bmEmbedAuthor" value="${escBm(tmpl.embedAuthor)}" placeholder="e.g. ${'{'}servername{'}'}" />

        <label class="bm-field-label">Title</label>
        <input type="text" class="ec-input bm-input" id="bmEmbedTitle" value="${escBm(tmpl.embedTitle)}" placeholder="e.g. You have been warned" />

        <label class="bm-field-label">Description</label>
        <textarea class="ec-input bm-input" id="bmEmbedDescription" rows="4" placeholder="Use variables like ${'{'}reason{'}'}, ${'{'}duration{'}'}…">${escBm(tmpl.embedDescription)}</textarea>

        <label class="bm-field-label">Footer</label>
        <input type="text" class="ec-input bm-input" id="bmEmbedFooter" value="${escBm(tmpl.embedFooter)}" placeholder="Footer text" />

        <label class="ec-toggle-row" style="margin-top:0.5rem;gap:0.5rem">
          <div class="toggle-switch"><input type="checkbox" id="bmEmbedThumbnail" ${tmpl.embedThumbnail ? 'checked' : ''}/><span class="toggle-slider"></span></div>
          <span style="font-size:0.82rem">Show user avatar as thumbnail</span>
        </label>
      </div>
    </div>

    <!-- Preview -->
    <div class="bm-visual-section">
      <div class="bm-section-title-row">
        <span class="bm-section-title">Preview</span>
        <button class="btn btn-xs" id="bmRefreshPreview">Refresh</button>
      </div>
      <div id="bmPreviewArea">${buildBmPreview(tmpl)}</div>
    </div>`;
}

function buildBmPreview(tmpl) {
  const color = tmpl.embedColor || '#6366f1';
  if (!tmpl.embedEnabled) return '<div class="bm-preview-empty">No embed</div>';
  return `<div class="bm-discord-preview">
    ${tmpl.content ? `<div class="bm-preview-content">${escBm(tmpl.content)}</div>` : ''}
    <div class="bm-preview-embed" style="border-left:4px solid ${escBm(color)}">
      ${tmpl.embedAuthor ? `<div class="bm-preview-author">${escBm(tmpl.embedAuthor)}</div>` : ''}
      ${tmpl.embedTitle ? `<div class="bm-preview-title">${escBm(tmpl.embedTitle)}</div>` : ''}
      ${tmpl.embedDescription ? `<div class="bm-preview-desc">${escBm(tmpl.embedDescription).replace(/\n/g, '<br>')}</div>` : ''}
      ${tmpl.embedFields?.length ? `<div class="bm-preview-fields">${tmpl.embedFields.map(f => `<div class="bm-preview-field${f.inline ? ' inline' : ''}"><strong>${escBm(f.name)}</strong><div>${escBm(f.value)}</div></div>`).join('')}</div>` : ''}
      ${tmpl.embedFooter ? `<div class="bm-preview-footer">${escBm(tmpl.embedFooter)}</div>` : ''}
    </div>
  </div>`;
}

// ── Raw tab ───────────────────────────────────────────────────────────────────
function buildRawTab(tmpl) {
  const json = JSON.stringify({
    content: tmpl.content,
    embed: tmpl.embedEnabled ? {
      color: tmpl.embedColor,
      author: tmpl.embedAuthor || undefined,
      title: tmpl.embedTitle || undefined,
      description: tmpl.embedDescription || undefined,
      footer: tmpl.embedFooter || undefined,
      thumbnail: tmpl.embedThumbnail || undefined,
      fields: tmpl.embedFields?.length ? tmpl.embedFields : undefined,
    } : null,
  }, null, 2);
  return `
    <div class="bm-raw-hint">Edit the JSON directly. Changes here sync to the Visual tab on save.</div>
    <textarea class="ec-input bm-raw-textarea" id="bmRawJson" rows="18" spellcheck="false">${escBm(json)}</textarea>
    <div class="bm-raw-actions">
      <button class="btn btn-sm" id="bmRawApply">Apply JSON</button>
      <span class="bm-raw-status" id="bmRawStatus"></span>
    </div>`;
}

// ── Variables tab ─────────────────────────────────────────────────────────────
const BM_VARIABLES = {
  'MESSAGE SPECIFIC': ['caseid', 'userid', 'usertag', 'username', 'userglobalnickname', 'usermention', 'useravatarurl'],
  'SERVER': ['servername', 'serverid', 'membercount'],
  'PUNISHMENT': ['type', 'reason', 'duration', 'expiresat'],
  'MODERATOR': ['moderatorid', 'moderatortag', 'moderatorusername', 'moderatormention'],
};

function buildVariablesTab(tmpl) {
  let html = `
    <div class="bm-vars-settings">
      <label class="bm-field-label" style="margin-bottom:0.4rem">Message style</label>
      <select class="ec-input" id="bmMessageStyle" style="max-width:160px">
        <option value="success" ${tmpl.messageStyle === 'success' ? 'selected' : ''}>success</option>
        <option value="error"   ${tmpl.messageStyle === 'error'   ? 'selected' : ''}>error</option>
        <option value="warning" ${tmpl.messageStyle === 'warning' ? 'selected' : ''}>warning</option>
        <option value="info"    ${tmpl.messageStyle === 'info'    ? 'selected' : ''}>info</option>
        <option value="none"    ${tmpl.messageStyle === 'none'    ? 'selected' : ''}>none</option>
      </select>

      <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.75rem">
        <label class="ec-toggle-row" style="gap:0.5rem">
          <div class="toggle-switch"><input type="checkbox" id="bmRemoveTitleEmoji" ${tmpl.removeTitleEmoji ? 'checked' : ''}/><span class="toggle-slider"></span></div>
          <span style="font-size:0.82rem">Remove title emoji</span>
        </label>
        <label class="ec-toggle-row" style="gap:0.5rem">
          <div class="toggle-switch"><input type="checkbox" id="bmRemoveEmptyLines" ${tmpl.removeEmptyLines ? 'checked' : ''}/><span class="toggle-slider"></span></div>
          <span style="font-size:0.82rem">Remove empty lines</span>
        </label>
      </div>
    </div>

    <div class="bm-vars-hint">Click a variable to copy it. Paste it into Title, Description, or Content fields.</div>
    <div class="bm-vars-list">`;

  for (const [category, vars] of Object.entries(BM_VARIABLES)) {
    html += `<div class="bm-vars-category">${escBm(category)}</div>`;
    html += `<div class="bm-vars-chips">`;
    vars.forEach(v => {
      html += `<button class="bm-var-chip" data-bm-var="${escBm(v)}" title="Copy \${${v}}">\${${escBm(v)}}</button>`;
    });
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

// ── Wire events ───────────────────────────────────────────────────────────────
function wireBmEditor(tmpl) {
  // Tab switching
  document.querySelectorAll('[data-bm-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _bmEditorTab = btn.dataset.bmTab;
      document.querySelectorAll('.bm-tab').forEach(t => t.classList.toggle('active', t.dataset.bmTab === _bmEditorTab));
      document.querySelectorAll('.bm-tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`bmTab${_bmEditorTab.charAt(0).toUpperCase() + _bmEditorTab.slice(1)}`)?.style !== undefined &&
        (document.getElementById(`bmTab${_bmEditorTab.charAt(0).toUpperCase() + _bmEditorTab.slice(1)}`).style.display = '');
    });
  });

  // Embed enabled toggle
  document.getElementById('bmEmbedEnabled')?.addEventListener('change', e => {
    document.getElementById('bmEmbedFields').style.cssText = e.target.checked ? '' : 'opacity:0.4;pointer-events:none';
    _bmDirty = true;
  });

  // Color sync
  const colorPicker = document.getElementById('bmEmbedColor');
  const colorHex = document.getElementById('bmEmbedColorHex');
  colorPicker?.addEventListener('input', () => { if (colorHex) colorHex.value = colorPicker.value; _bmDirty = true; });
  colorHex?.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(colorHex.value)) { if (colorPicker) colorPicker.value = colorHex.value; }
    _bmDirty = true;
  });

  // Mark dirty on any input change
  document.querySelectorAll('#bmEditor input, #bmEditor textarea, #bmEditor select').forEach(el => {
    el.addEventListener('change', () => _bmDirty = true);
    el.addEventListener('input', () => _bmDirty = true);
  });

  // Refresh preview
  document.getElementById('bmRefreshPreview')?.addEventListener('click', () => {
    const cur = collectBmValues();
    const area = document.getElementById('bmPreviewArea');
    if (area) area.innerHTML = buildBmPreview(cur);
  });

  // Raw JSON apply
  document.getElementById('bmRawApply')?.addEventListener('click', () => {
    const status = document.getElementById('bmRawStatus');
    try {
      const parsed = JSON.parse(document.getElementById('bmRawJson').value);
      const embed = parsed.embed || {};
      if (document.getElementById('bmContent')) document.getElementById('bmContent').value = parsed.content || '';
      if (document.getElementById('bmEmbedEnabled')) document.getElementById('bmEmbedEnabled').checked = !!parsed.embed;
      if (document.getElementById('bmEmbedColor')) document.getElementById('bmEmbedColor').value = embed.color || '#6366f1';
      if (document.getElementById('bmEmbedColorHex')) document.getElementById('bmEmbedColorHex').value = embed.color || '#6366f1';
      if (document.getElementById('bmEmbedAuthor')) document.getElementById('bmEmbedAuthor').value = embed.author || '';
      if (document.getElementById('bmEmbedTitle')) document.getElementById('bmEmbedTitle').value = embed.title || '';
      if (document.getElementById('bmEmbedDescription')) document.getElementById('bmEmbedDescription').value = embed.description || '';
      if (document.getElementById('bmEmbedFooter')) document.getElementById('bmEmbedFooter').value = embed.footer || '';
      if (status) { status.textContent = '✓ Applied'; status.style.color = '#22c55e'; }
      _bmDirty = true;
      setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    } catch (e) {
      if (status) { status.textContent = '✗ Invalid JSON'; status.style.color = '#ef4444'; }
    }
  });

  // Variable chips — copy to clipboard
  document.querySelectorAll('[data-bm-var]').forEach(chip => {
    chip.addEventListener('click', () => {
      const varStr = '${' + chip.dataset.bmVar + '}';
      navigator.clipboard?.writeText(varStr).then(() => {
        const orig = chip.textContent;
        chip.textContent = 'Copied!';
        setTimeout(() => { chip.textContent = orig; }, 1200);
      });
    });
  });

  // Save
  document.getElementById('bmSaveBtn')?.addEventListener('click', () => saveBmTemplate());

  // Reset
  document.getElementById('bmResetBtn')?.addEventListener('click', async () => {
    if (!await window.showConfirm('Reset this message to default? Your customisation will be lost.', { title: 'Reset to Default', confirmText: 'Reset', type: 'warning' })) return;
    const guildId = _bmGuildId;
    const key = _bmActive;
    try {
      // Delete by saving empty — just clear the template from DB using a special flag
      // We'll just remove from local cache and re-render with defaults
      delete _bmTemplates[key];
      selectBmType(key, false);
      renderBmSidebar();
      // Also persist the cleared state
      await fetch(`/api/guild/${guildId}/bot-messages/${key}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bmDefaults(key)),
      });
    } catch (_) {}
  });
}

// ── Collect current editor values ─────────────────────────────────────────────
function collectBmValues() {
  const get = id => document.getElementById(id);
  return {
    enabled:          get('bmEnabled')?.checked ?? true,
    content:          get('bmContent')?.value ?? '',
    embedEnabled:     get('bmEmbedEnabled')?.checked ?? true,
    embedColor:       get('bmEmbedColorHex')?.value || get('bmEmbedColor')?.value || '#6366f1',
    embedAuthor:      get('bmEmbedAuthor')?.value ?? '',
    embedTitle:       get('bmEmbedTitle')?.value ?? '',
    embedDescription: get('bmEmbedDescription')?.value ?? '',
    embedFooter:      get('bmEmbedFooter')?.value ?? '',
    embedThumbnail:   get('bmEmbedThumbnail')?.checked ?? false,
    messageStyle:     get('bmMessageStyle')?.value ?? 'success',
    removeTitleEmoji: get('bmRemoveTitleEmoji')?.checked ?? false,
    removeEmptyLines: get('bmRemoveEmptyLines')?.checked ?? false,
  };
}

// ── Save template ─────────────────────────────────────────────────────────────
async function saveBmTemplate() {
  const key = _bmActive;
  if (!key) return;
  const btn = document.getElementById('bmSaveBtn');
  const status = document.getElementById('bmSaveStatus');
  btn.disabled = true;
  try {
    const body = collectBmValues();
    const res = await fetch(`/api/guild/${_bmGuildId}/bot-messages/${key}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _bmTemplates[key] = data;
    _bmDirty = false;
    if (status) { status.textContent = '✓ Saved'; status.className = 'save-status success'; }
    renderBmSidebar();
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.className = 'save-status error'; }
  } finally {
    btn.disabled = false;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'responses') return;
    if (!_bmInitDone) initResponses(gId);
  });
});

window.initResponses = initResponses;