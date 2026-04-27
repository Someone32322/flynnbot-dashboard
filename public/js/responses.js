/**
 * responses.js — Custom Responses dashboard section
 */

let _responsesCfg = null;
let _responsesInitDone = false;

async function initResponses(guildId) {
  if (_responsesInitDone) return;
  _responsesInitDone = true;
  await refreshResponses(guildId);
}

async function refreshResponses(guildId) {
  const container = document.getElementById('responsesContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/responses`);
    if (!res.ok) throw new Error('Failed to load responses');
    _responsesCfg = await res.json();
    renderResponses(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escR(e.message)}</div>`;
  }
}

function renderResponses(container, guildId) {
  const cfg = _responsesCfg || {};
  const available = cfg.availableCommands || [];
  const overrides = cfg.overrides || [];
  const overrideMap = {};
  overrides.forEach(o => { overrideMap[o.commandName] = o.template; });

  container.innerHTML = `
    <div id="responsesSaveStatus" class="save-status" style="display:none"></div>

    <div class="ec-card">
      <div class="ec-card-header"><h3>Custom Responses</h3></div>
      <div class="ec-card-body">
        <label class="ec-toggle-row" style="margin-bottom:1rem">
          <div class="toggle-switch"><input type="checkbox" id="responsesEnabled" ${cfg.enabled ? 'checked' : ''} /><span class="toggle-slider"></span></div>
          <span>Enable Custom Responses</span>
        </label>
        <p style="font-size:0.82rem;opacity:0.65;margin-bottom:1rem">
          Override how the bot replies to commands in this server.<br>
          Available placeholders: <code>{user}</code> <code>{username}</code> <code>{server}</code> <code>{channel}</code> <code>{membercount}</code>
        </p>
        <div id="responsesGrid">${renderResponsesGrid(available, overrideMap, guildId)}</div>
      </div>
    </div>

    <div class="ec-actions" style="margin-top:1rem">
      <button class="btn btn-primary" id="responsesToggleSave">Save</button>
    </div>
  `;

  document.getElementById('responsesToggleSave')?.addEventListener('click', () => saveResponsesToggle(guildId));
  wireResponseButtons(guildId, available, overrideMap);
}

function renderResponsesGrid(available, overrideMap, guildId) {
  if (!available.length) return '<p class="ec-empty">No overridable commands available.</p>';
  return `<table class="ec-table">
    <thead><tr><th>Command</th><th>Custom Reply</th><th>Actions</th></tr></thead>
    <tbody>${available.map(cmd => {
      const template = overrideMap[cmd] || '';
      return `<tr data-response-cmd="${escR(cmd)}">
        <td><code>/${escR(cmd)}</code></td>
        <td style="max-width:280px">
          ${template
            ? `<span class="cc-badge cc-badge-on">Custom</span> <small style="opacity:0.7">${escR(template.slice(0, 60))}${template.length > 60 ? '…' : ''}</small>`
            : '<span class="cc-badge cc-badge-off">Default</span>'}
        </td>
        <td style="display:flex;gap:0.4rem">
          <button class="btn btn-sm" data-resp-action="edit" data-resp-cmd="${escR(cmd)}">Edit</button>
          ${template ? `<button class="btn btn-sm btn-danger" data-resp-action="delete" data-resp-cmd="${escR(cmd)}">Reset</button>` : ''}
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>

  <!-- Edit Modal -->
  <div id="responseEditModal" class="ec-modal-backdrop" style="display:none">
    <div class="ec-modal" style="max-width:540px">
      <h3>Edit Response — <code id="responseEditCmdName"></code></h3>
      <input type="hidden" id="responseEditCmd" />
      <label class="ec-field"><span>Custom Reply Template</span>
        <textarea id="responseEditTemplate" class="ec-input" rows="5" maxlength="2000" placeholder="Use {user}, {username}, {server}, {channel}, {membercount}"></textarea>
      </label>
      <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
        <button class="btn btn-secondary" id="responseEditCancel">Cancel</button>
        <button class="btn btn-primary" id="responseEditConfirm">Save Override</button>
      </div>
    </div>
  </div>`;
}

function wireResponseButtons(guildId, available, overrideMap) {
  document.getElementById('responseEditCancel')?.addEventListener('click', () => {
    document.getElementById('responseEditModal').style.display = 'none';
  });
  document.getElementById('responseEditConfirm')?.addEventListener('click', () => saveResponseOverride(guildId));
  document.querySelectorAll('[data-resp-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.respAction;
      const cmd = btn.dataset.respCmd;
      if (action === 'edit') {
        document.getElementById('responseEditCmd').value = cmd;
        document.getElementById('responseEditCmdName').textContent = `/${cmd}`;
        document.getElementById('responseEditTemplate').value = overrideMap[cmd] || '';
        document.getElementById('responseEditModal').style.display = 'flex';
      } else if (action === 'delete') {
        if (!confirm(`Reset /${cmd} to default?`)) return;
        const res = await fetch(`/api/guild/${guildId}/responses/${cmd}`, { method: 'DELETE' });
        if (res.ok) { _responsesCfg = await res.json(); _responsesInitDone = false; initResponses(guildId); }
      }
    });
  });
}

async function saveResponsesToggle(guildId) {
  const enabled = document.getElementById('responsesEnabled').checked;
  const btn = document.getElementById('responsesToggleSave');
  const status = document.getElementById('responsesSaveStatus');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/guild/${guildId}/responses`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    setRespStatus(status, true);
  } catch (e) {
    setRespStatus(status, false, e.message);
  } finally {
    btn.disabled = false;
  }
}

async function saveResponseOverride(guildId) {
  const cmd = document.getElementById('responseEditCmd').value;
  const template = document.getElementById('responseEditTemplate').value.trim();
  if (!template) { alert('Template cannot be empty.'); return; }
  const btn = document.getElementById('responseEditConfirm');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/guild/${guildId}/responses/${cmd}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _responsesCfg = data;
    document.getElementById('responseEditModal').style.display = 'none';
    _responsesInitDone = false;
    await refreshResponses(guildId);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function setRespStatus(el, ok, msg) {
  if (!el) return;
  el.style.display = '';
  el.className = `save-status ${ok ? 'save-ok' : 'save-error'}`;
  el.textContent = ok ? '✅ Saved!' : `❌ ${msg || 'Failed'}`;
  setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
}

function escR(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'responses') return;
    if (!_responsesInitDone) initResponses(gId);
  });
});

window.initResponses = initResponses;
