'use strict';
/* ── roles.js — Advanced Role Management ──────────────────── */

window.RolesModule = (() => {
  let guildId = null;
  let allRoles = [];
  const ADMIN_PERM = 0x8n;
  const MOD_PERMS = 0x4n | 0x2n | 0x10n; // kick, ban, manage_guild

  function intToHex(color) {
    if (!color) return '#4f545c';
    return '#' + color.toString(16).padStart(6, '0');
  }

  function hasAdminPerm(perms) {
    try { return (BigInt(perms) & ADMIN_PERM) !== 0n; } catch { return false; }
  }

  function hasModPerm(perms) {
    try { return (BigInt(perms) & MOD_PERMS) !== 0n; } catch { return false; }
  }

  function renderRoles(roles) {
    const listEl = document.getElementById('roleList');
    if (!listEl) return;
    if (!roles.length) {
      listEl.innerHTML = '<div class="notes-empty">No roles found</div>';
      return;
    }
    listEl.innerHTML = roles.map(r => {
      const color = intToHex(r.color);
      const isAdmin = hasAdminPerm(r.permissions || 0);
      const isMod = !isAdmin && hasModPerm(r.permissions || 0);
      const isManaged = r.managed;
      return `
        <div class="role-item${isAdmin ? ' role-item--danger' : ''}">
          <div class="role-color-swatch" style="background:${color}"></div>
          <div class="role-name">${escHtml(r.name)}</div>
          <div class="role-badges">
            ${isAdmin ? '<span class="role-badge role-badge--danger">Admin</span>' : ''}
            ${isMod ? '<span class="role-badge">Mod</span>' : ''}
            ${isManaged ? '<span class="role-badge role-badge--bot">Bot</span>' : ''}
          </div>
          <div class="role-pos">#${r.position}</div>
        </div>`;
    }).join('');

    // Populate role selects
    const sel = document.getElementById('massAssignRole');
    if (sel) {
      sel.innerHTML = '<option value="">Select role…</option>' +
        roles.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('');
    }

    // Update stats
    const totalEl = document.getElementById('rolesTotalCount');
    const dangerEl = document.getElementById('rolesDangerCount');
    const managedEl = document.getElementById('rolesManagedCount');
    if (totalEl) totalEl.textContent = roles.length;
    if (dangerEl) dangerEl.textContent = roles.filter(r => hasAdminPerm(r.permissions || 0)).length;
    if (managedEl) managedEl.textContent = roles.filter(r => r.managed).length;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function load() {
    try {
      const res = await fetch(`/api/guild/${guildId}/roles`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load roles');
      // Discord API doesn't always return permissions on role list — use what we have
      allRoles = (Array.isArray(data) ? data : []).sort((a, b) => (b.position || 0) - (a.position || 0));
      renderRoles(allRoles);
    } catch (err) {
      const listEl = document.getElementById('roleList');
      if (listEl) listEl.innerHTML = `<div class="notes-empty" style="color:#ed4245">Failed to load roles: ${escHtml(err.message)}</div>`;
    }
  }

  async function massAssign() {
    const roleId = document.getElementById('massAssignRole')?.value?.trim();
    const userIdsRaw = document.getElementById('massAssignUsers')?.value?.trim();
    const action = document.getElementById('massAssignAction')?.value || 'add';
    const resultEl = document.getElementById('massAssignResult');

    if (!roleId) { showToast('Select a role', 'error'); return; }
    if (!userIdsRaw) { showToast('Enter at least one user ID', 'error'); return; }

    const userIds = userIdsRaw.split(/[\s,\n]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
    if (!userIds.length) { showToast('No valid user IDs found', 'error'); return; }

    const btn = document.getElementById('massAssignBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    try {
      const res = await fetch(`/api/guild/${guildId}/roles/mass-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId, userIds, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (resultEl) {
        resultEl.classList.add('visible');
        resultEl.innerHTML = `
          <span class="result-ok">✔ ${data.results.ok.length} succeeded</span>
          ${data.results.failed.length ? `&nbsp;·&nbsp;<span class="result-fail">✖ ${data.results.failed.length} failed</span>` : ''}
        `;
      }
      showToast(`Role ${action === 'add' ? 'assigned to' : 'removed from'} ${data.results.ok.length} user(s)`, 'success');
    } catch (err) {
      if (resultEl) {
        resultEl.classList.add('visible');
        resultEl.innerHTML = `<span class="result-fail">Error: ${escHtml(err.message)}</span>`;
      }
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply'; }
    }
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer') || document.body;
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function init(id) {
    guildId = id;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'roles') load();
    });
    const btn = document.getElementById('massAssignBtn');
    if (btn) btn.addEventListener('click', massAssign);
  }

  return { init, load };
})();

document.addEventListener('DOMContentLoaded', () => {
  const pd = document.getElementById('pageData');
  if (pd?.dataset?.guildId) RolesModule.init(pd.dataset.guildId);
});
