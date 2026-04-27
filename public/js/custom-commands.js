/**
 * custom-commands.js — Custom Commands dashboard section
 */

let _ccCmds = [];
let _ccInitDone = false;

async function initCustomCommands(guildId) {
  if (_ccInitDone) return;
  _ccInitDone = true;
  await refreshCustomCommands(guildId);
}

async function refreshCustomCommands(guildId) {
  const container = document.getElementById('customCommandsContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/custom-commands`);
    if (!res.ok) throw new Error('Failed to load custom commands');
    _ccCmds = await res.json();
    renderCustomCommands(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escCC(e.message)}</div>`;
  }
}

function renderCustomCommands(container, guildId) {
  container.innerHTML = `
    <div id="ccSaveStatus" class="save-status" style="display:none"></div>

    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Your Custom Commands (${_ccCmds.length})</h3>
        <button class="btn btn-sm btn-primary" id="ccAddBtn">+ New Command</button>
      </div>
      <div class="ec-card-body">
        <div id="ccList">${renderCCList()}</div>
      </div>
    </div>

    <!-- Modal -->
    <div id="ccModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal" style="max-width:640px">
        <h3 id="ccModalTitle">New Custom Command</h3>
        <div class="ec-grid-2">
          <label class="ec-field"><span>Name (unique) <span class="required">*</span></span><input type="text" id="ccName" class="ec-input" maxlength="50" /></label>
          <label class="ec-field"><span>Trigger Type</span>
            <select id="ccTriggerType" class="ec-input">
              <option value="exact">Exact match</option>
              <option value="contains">Contains</option>
              <option value="startsWith">Starts with</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <label class="ec-field" style="grid-column:1/-1"><span>Trigger <span class="required">*</span></span><input type="text" id="ccTrigger" class="ec-input" maxlength="100" placeholder="e.g. !hello or trigger phrase" /></label>
          <label class="ec-field"><span>Response Type</span>
            <select id="ccType" class="ec-input">
              <option value="text">Text</option>
              <option value="embed">Embed</option>
            </select>
          </label>
          <label class="ec-field"><span>Cooldown (seconds)</span><input type="number" id="ccCooldown" class="ec-input" value="0" min="0" max="86400" /></label>
        </div>
        <label class="ec-field" style="margin-top:0.75rem"><span>Response Text <span class="required">*</span></span>
          <textarea id="ccResponse" class="ec-input" rows="3" maxlength="2000" placeholder="Use {user}, {username}, {server}, {channel}, {membercount}"></textarea>
        </label>
        <div id="ccEmbedFields" style="display:none;margin-top:0.75rem">
          <div class="ec-grid-2">
            <label class="ec-field"><span>Embed Title</span><input type="text" id="ccEmbedTitle" class="ec-input" maxlength="256" /></label>
            <label class="ec-field"><span>Embed Color</span><input type="color" id="ccEmbedColor" class="ec-input" value="#0f52ba" style="height:38px;padding:0.25rem" /></label>
          </div>
          <label class="ec-field" style="margin-top:0.75rem"><span>Embed Description</span>
            <textarea id="ccEmbedDesc" class="ec-input" rows="3" maxlength="2000"></textarea>
          </label>
        </div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem">
          <label class="ec-toggle-row" style="gap:0.5rem"><input type="checkbox" id="ccCaseSensitive" /> <span style="font-size:0.85rem">Case sensitive</span></label>
          <label class="ec-toggle-row" style="gap:0.5rem"><input type="checkbox" id="ccDeleteMsg" /> <span style="font-size:0.85rem">Delete user's message</span></label>
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="ccModalCancel">Cancel</button>
          <button class="btn btn-primary" id="ccModalConfirm">Save Command</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('ccAddBtn')?.addEventListener('click', () => openCCModal(guildId, null));
  document.getElementById('ccModalCancel')?.addEventListener('click', closeCCModal);
  document.getElementById('ccModalConfirm')?.addEventListener('click', () => submitCCModal(guildId));
  document.getElementById('ccType')?.addEventListener('change', toggleEmbedFields);
  wireCCListButtons(guildId);
}

function renderCCList() {
  if (!_ccCmds.length) return '<p class="ec-empty">No custom commands yet. Create one above.</p>';
  return `<table class="ec-table">
    <thead><tr><th>Name</th><th>Trigger</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${_ccCmds.map(cmd => `
      <tr>
        <td><strong>${escCC(cmd.name)}</strong></td>
        <td><code>${escCC(cmd.trigger)}</code> <small style="opacity:0.5">(${escCC(cmd.triggerType)})</small></td>
        <td>${escCC(cmd.type)}</td>
        <td><span class="cc-badge ${cmd.enabled ? 'cc-badge-on' : 'cc-badge-off'}">${cmd.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-sm" data-cc-action="edit" data-cc-id="${escCC(cmd._id)}">Edit</button>
          <button class="btn btn-sm" data-cc-action="toggle" data-cc-id="${escCC(cmd._id)}" data-cc-enabled="${cmd.enabled}">${cmd.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-sm btn-danger" data-cc-action="delete" data-cc-id="${escCC(cmd._id)}">Delete</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

function wireCCListButtons(guildId) {
  document.querySelectorAll('[data-cc-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.ccAction;
      const id = btn.dataset.ccId;
      if (action === 'edit') {
        openCCModal(guildId, id);
      } else if (action === 'toggle') {
        const enabled = btn.dataset.ccEnabled === 'true';
        try {
          const res = await fetch(`/api/guild/${guildId}/custom-commands/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !enabled }),
          });
          if (res.ok) {
            const updated = await res.json();
            const idx = _ccCmds.findIndex(c => c._id === id);
            if (idx >= 0) _ccCmds[idx] = updated;
            document.getElementById('ccList').innerHTML = renderCCList();
            wireCCListButtons(guildId);
          }
        } catch {}
      } else if (action === 'delete') {
        if (!confirm('Delete this custom command?')) return;
        try {
          const res = await fetch(`/api/guild/${guildId}/custom-commands/${id}`, { method: 'DELETE' });
          if (res.ok) {
            _ccCmds = _ccCmds.filter(c => c._id !== id);
            document.getElementById('ccList').innerHTML = renderCCList();
            wireCCListButtons(guildId);
          }
        } catch {}
      }
    });
  });
}

function openCCModal(guildId, id) {
  const cmd = id ? _ccCmds.find(c => c._id === id) : null;
  document.getElementById('ccModalTitle').textContent = cmd ? 'Edit Command' : 'New Custom Command';
  document.getElementById('ccName').value = cmd?.name || '';
  document.getElementById('ccTrigger').value = cmd?.trigger || '';
  document.getElementById('ccTriggerType').value = cmd?.triggerType || 'exact';
  document.getElementById('ccType').value = cmd?.type || 'text';
  document.getElementById('ccResponse').value = cmd?.response || '';
  document.getElementById('ccCooldown').value = cmd?.cooldownSeconds ?? 0;
  document.getElementById('ccCaseSensitive').checked = !!cmd?.caseSensitive;
  document.getElementById('ccDeleteMsg').checked = !!cmd?.deleteUserMessage;
  if (cmd?.type === 'embed') {
    document.getElementById('ccEmbedTitle').value = cmd.embedTitle || '';
    document.getElementById('ccEmbedColor').value = cmd.embedColor || '#0f52ba';
    document.getElementById('ccEmbedDesc').value = cmd.embedDescription || '';
  }
  toggleEmbedFields();
  document.getElementById('ccModal').dataset.editId = id || '';
  document.getElementById('ccModal').style.display = 'flex';
}

function closeCCModal() {
  document.getElementById('ccModal').style.display = 'none';
  document.getElementById('ccModal').dataset.editId = '';
}

function toggleEmbedFields() {
  const type = document.getElementById('ccType')?.value;
  const fields = document.getElementById('ccEmbedFields');
  if (fields) fields.style.display = type === 'embed' ? '' : 'none';
}

async function submitCCModal(guildId) {
  const modal = document.getElementById('ccModal');
  const editId = modal.dataset.editId;
  const name = document.getElementById('ccName').value.trim();
  const trigger = document.getElementById('ccTrigger').value.trim();
  const response = document.getElementById('ccResponse').value.trim();
  if (!name || !trigger || !response) { alert('Name, trigger, and response are required.'); return; }

  const body = {
    name,
    trigger,
    triggerType: document.getElementById('ccTriggerType').value,
    response,
    type: document.getElementById('ccType').value,
    embedTitle: document.getElementById('ccEmbedTitle').value.trim(),
    embedColor: document.getElementById('ccEmbedColor').value,
    embedDescription: document.getElementById('ccEmbedDesc').value.trim(),
    cooldownSeconds: parseInt(document.getElementById('ccCooldown').value) || 0,
    caseSensitive: document.getElementById('ccCaseSensitive').checked,
    deleteUserMessage: document.getElementById('ccDeleteMsg').checked,
  };

  const btn = document.getElementById('ccModalConfirm');
  btn.disabled = true;
  try {
    let res;
    if (editId) {
      res = await fetch(`/api/guild/${guildId}/custom-commands/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`/api/guild/${guildId}/custom-commands`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    if (editId) {
      const idx = _ccCmds.findIndex(c => c._id === editId);
      if (idx >= 0) _ccCmds[idx] = data;
    } else {
      _ccCmds.push(data);
    }
    document.getElementById('ccList').innerHTML = renderCCList();
    wireCCListButtons(guildId);
    closeCCModal();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function escCC(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'custom-commands') return;
    if (!_ccInitDone) initCustomCommands(gId);
  });
});

window.initCustomCommands = initCustomCommands;
