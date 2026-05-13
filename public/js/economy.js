/**
 * economy.js — Economy dashboard section logic
 * Loads config, renders settings form, leaderboard, and shop manager.
 */

/* global guildId */

let _economyCfg = null;
let _economyLbPage = 1;
let _economyLbTotal = 1;
let _economyShopItems = [];
let _economyInitDone = false;

// ── Entry point ──────────────────────────────────────────────
async function initEconomy(guildId) {
  if (_economyInitDone) return;
  _economyInitDone = true;
  await refreshEconomy(guildId);
}

async function refreshEconomy(guildId) {
  const container = document.getElementById('economyContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const [cfgRes, shopRes] = await Promise.all([
      fetch(`/api/guild/${guildId}/economy`),
      fetch(`/api/guild/${guildId}/economy/shop`),
    ]);
    if (!cfgRes.ok) throw new Error('Failed to load economy config');
    _economyCfg = await cfgRes.json();
    _economyShopItems = shopRes.ok ? await shopRes.json() : [];
    renderEconomy(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escapeHtml(e.message)}</div>`;
  }
}

function renderEconomy(container, guildId) {
  const cfg = _economyCfg;

  container.innerHTML = `
    <!-- Status bar -->
    <div id="economySaveStatus" class="save-status" style="display:none"></div>

    <!-- Enable toggle -->
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>System Status</h3>
      </div>
      <div class="ec-card-body">
        <label class="ec-toggle-row">
          <span class="ec-toggle-label">Enable Economy System</span>
          <label class="toggle-switch">
            <input type="checkbox" id="ecEnabled" ${cfg.enabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </label>
      </div>
    </div>

    <!-- Currency settings -->
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Currency</h3>
      </div>
      <div class="ec-card-body ec-grid-2">
        <label class="ec-field">
          <span>Currency Name</span>
          <input type="text" id="ecCurrencyName" class="ec-input" value="${escapeHtml(cfg.currencyName || 'coins')}" maxlength="20" />
        </label>
        <label class="ec-field">
          <span>Currency Symbol / Emoji</span>
          <input type="text" id="ecCurrencySymbol" class="ec-input" value="${escapeHtml(cfg.currencySymbol || '🪙')}" maxlength="10" />
        </label>
        <label class="ec-field">
          <span>Starting Balance</span>
          <input type="number" id="ecStartingBalance" class="ec-input" value="${cfg.startingBalance ?? 100}" min="0" />
        </label>
        <label class="ec-field">
          <span>Default Bank Cap</span>
          <input type="number" id="ecDefaultBankCap" class="ec-input" value="${cfg.defaultBankCap ?? 5000}" min="0" />
        </label>
      </div>
    </div>

    <!-- Rewards -->
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Rewards</h3>
      </div>
      <div class="ec-card-body ec-grid-2">
        <label class="ec-field"><span>Daily Amount</span><input type="number" id="ecDailyAmount" class="ec-input" value="${cfg.dailyAmount ?? 200}" min="0" /></label>
        <label class="ec-field"><span>Weekly Amount</span><input type="number" id="ecWeeklyAmount" class="ec-input" value="${cfg.weeklyAmount ?? 1000}" min="0" /></label>
        <label class="ec-field"><span>Work Min</span><input type="number" id="ecWorkMin" class="ec-input" value="${cfg.workMin ?? 50}" min="0" /></label>
        <label class="ec-field"><span>Work Max</span><input type="number" id="ecWorkMax" class="ec-input" value="${cfg.workMax ?? 200}" min="0" /></label>
        <label class="ec-field"><span>Crime Min</span><input type="number" id="ecCrimeMin" class="ec-input" value="${cfg.crimeMin ?? 100}" min="0" /></label>
        <label class="ec-field"><span>Crime Max</span><input type="number" id="ecCrimeMax" class="ec-input" value="${cfg.crimeMax ?? 500}" min="0" /></label>
        <label class="ec-field"><span>Crime Success Rate (%)</span><input type="number" id="ecCrimeSuccessRate" class="ec-input" value="${cfg.crimeSuccessRate ?? 60}" min="0" max="100" /></label>
        <label class="ec-field"><span>Beg Min</span><input type="number" id="ecBegMin" class="ec-input" value="${cfg.begMin ?? 10}" min="0" /></label>
        <label class="ec-field"><span>Beg Max</span><input type="number" id="ecBegMax" class="ec-input" value="${cfg.begMax ?? 50}" min="0" /></label>
        <label class="ec-field"><span>Rob Min (%)</span><input type="number" id="ecRobMin" class="ec-input" value="${cfg.robMin ?? 10}" min="0" max="100" /></label>
        <label class="ec-field"><span>Rob Max (%)</span><input type="number" id="ecRobMax" class="ec-input" value="${cfg.robMax ?? 40}" min="0" max="100" /></label>
        <label class="ec-field"><span>Rob Success Rate (%)</span><input type="number" id="ecRobSuccessRate" class="ec-input" value="${cfg.robSuccessRate ?? 40}" min="0" max="100" /></label>
      </div>
    </div>

    <!-- Gambling limits -->
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Gambling</h3>
      </div>
      <div class="ec-card-body ec-grid-2">
        <label class="ec-field"><span>Min Bet</span><input type="number" id="ecMinBet" class="ec-input" value="${cfg.minBet ?? 10}" min="1" /></label>
        <label class="ec-field"><span>Max Bet</span><input type="number" id="ecMaxBet" class="ec-input" value="${cfg.maxBet ?? 10000}" min="1" /></label>
      </div>
    </div>

    <!-- Save settings -->
    <div class="ec-actions">
      <button class="btn btn-primary" id="ecSaveBtn">Save Settings</button>
      <button class="btn btn-danger" id="ecResetAllBtn">Reset All Balances</button>
    </div>

    <!-- Shop Manager -->
    <div class="ec-card" style="margin-top:2rem">
      <div class="ec-card-header">
        <h3>Shop Manager</h3>
        <button class="btn btn-sm btn-primary" id="ecAddItemBtn">+ Add Item</button>
      </div>
      <div class="ec-card-body">
        <div id="ecShopList">${renderShopList()}</div>
      </div>
    </div>

    <!-- Add item modal -->
    <div id="ecItemModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal">
        <h3 id="ecModalTitle">Add Shop Item</h3>
        <div class="ec-grid-2">
          <label class="ec-field"><span>Name <span class="required">*</span></span><input type="text" id="ecItemName" class="ec-input" maxlength="40" /></label>
          <label class="ec-field"><span>Price <span class="required">*</span></span><input type="number" id="ecItemPrice" class="ec-input" min="1" /></label>
          <label class="ec-field"><span>Emoji</span><input type="text" id="ecItemEmoji" class="ec-input" value="🛒" maxlength="10" /></label>
          <label class="ec-field"><span>Type</span>
            <select id="ecItemType" class="ec-input" data-cs>
              <option value="item">Item</option>
              <option value="role">Role</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label class="ec-field"><span>Stock (-1 = unlimited)</span><input type="number" id="ecItemStock" class="ec-input" value="-1" /></label>
          <label class="ec-field"><span>Role ID (if type=role)</span><input type="text" id="ecItemRoleId" class="ec-input" /></label>
        </div>
        <label class="ec-field" style="margin-top:0.75rem"><span>Description</span><textarea id="ecItemDesc" class="ec-input" rows="2" maxlength="200"></textarea></label>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="ecModalCancel">Cancel</button>
          <button class="btn btn-primary" id="ecModalConfirm">Save Item</button>
        </div>
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="ec-card" style="margin-top:2rem">
      <div class="ec-card-header">
        <h3>Economy Leaderboard</h3>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <button class="btn btn-sm" id="ecLbPrev" disabled>◀</button>
          <span id="ecLbPageLabel" style="font-size:0.85rem;opacity:0.7">Page 1</span>
          <button class="btn btn-sm" id="ecLbNext">▶</button>
        </div>
      </div>
      <div class="ec-card-body">
        <div id="ecLeaderboard"><div class="commands-loading"><div class="spinner"></div> Loading…</div></div>
      </div>
    </div>
  `;

  // Wire up save
  document.getElementById('ecSaveBtn')?.addEventListener('click', () => saveEconomy(guildId));

  // Reset all
  document.getElementById('ecResetAllBtn')?.addEventListener('click', async () => {
    if (!await window.showConfirm('Reset ALL user balances in this server? This cannot be undone.', { title: 'Reset Economy', confirmText: 'Reset All' })) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/economy/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      setEconomySaveStatus(res.ok ? `✅ Reset ${data.deleted} profiles.` : '❌ ' + (data.error || 'Failed'), res.ok);
    } catch {
      setEconomySaveStatus('❌ Network error', false);
    }
  });

  // Shop add
  document.getElementById('ecAddItemBtn')?.addEventListener('click', () => openItemModal(guildId, null));
  document.getElementById('ecModalCancel')?.addEventListener('click', () => closeItemModal());
  document.getElementById('ecModalConfirm')?.addEventListener('click', () => submitItemModal(guildId));

  // Leaderboard pagination
  document.getElementById('ecLbPrev')?.addEventListener('click', () => { _economyLbPage--; loadEconomyLeaderboard(guildId); });
  document.getElementById('ecLbNext')?.addEventListener('click', () => { _economyLbPage++; loadEconomyLeaderboard(guildId); });

  loadEconomyLeaderboard(guildId);
}

function renderShopList() {
  if (!_economyShopItems.length) return '<p class="ec-empty">No shop items yet. Add one above.</p>';
  return `<div class="ec-shop-list">${_economyShopItems.map(item => `
    <div class="ec-shop-item" data-id="${escapeHtml(item.itemId)}">
      <span class="ec-shop-emoji">${escapeHtml(item.emoji || '🛒')}</span>
      <div class="ec-shop-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="ec-shop-meta">${escapeHtml(item.description || '')} · ${escapeHtml(String(item.price))} coins · Stock: ${item.stock === -1 ? '∞' : item.stock}</span>
      </div>
      <div class="ec-shop-btns">
        <button class="btn btn-sm" data-action="edit-item" data-id="${escapeHtml(item.itemId)}">Edit</button>
        <button class="btn btn-sm btn-danger" data-action="delete-item" data-id="${escapeHtml(item.itemId)}">Delete</button>
      </div>
    </div>
  `).join('')}</div>`;
}

function openItemModal(guildId, itemId) {
  const modal = document.getElementById('ecItemModal');
  const item = itemId ? _economyShopItems.find(i => i.itemId === itemId) : null;
  document.getElementById('ecModalTitle').textContent = item ? 'Edit Shop Item' : 'Add Shop Item';
  document.getElementById('ecItemName').value = item?.name || '';
  document.getElementById('ecItemPrice').value = item?.price ?? '';
  document.getElementById('ecItemEmoji').value = item?.emoji || '🛒';
  document.getElementById('ecItemType').value = item?.type || 'item';
  document.getElementById('ecItemStock').value = item?.stock ?? -1;
  document.getElementById('ecItemRoleId').value = item?.roleId || '';
  document.getElementById('ecItemDesc').value = item?.description || '';
  modal.dataset.editId = itemId || '';
  modal.style.display = 'flex';
  if (typeof initAllCustomSelects === 'function') initAllCustomSelects(modal);
}

function closeItemModal() {
  const modal = document.getElementById('ecItemModal');
  modal.style.display = 'none';
  modal.dataset.editId = '';
}

async function submitItemModal(guildId) {
  const modal = document.getElementById('ecItemModal');
  const editId = modal.dataset.editId;
  const name = document.getElementById('ecItemName').value.trim();
  const price = parseInt(document.getElementById('ecItemPrice').value);
  if (!name || isNaN(price)) { window.showToast?.('Name and price are required.', 'warning'); return; }

  const body = {
    name,
    price,
    emoji: document.getElementById('ecItemEmoji').value.trim() || '🛒',
    type: document.getElementById('ecItemType').value,
    stock: parseInt(document.getElementById('ecItemStock').value) ?? -1,
    roleId: document.getElementById('ecItemRoleId').value.trim() || null,
    description: document.getElementById('ecItemDesc').value.trim(),
  };

  const btn = document.getElementById('ecModalConfirm');
  btn.disabled = true;
  try {
    let res;
    if (editId) {
      res = await fetch(`/api/guild/${guildId}/economy/shop/${encodeURIComponent(editId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`/api/guild/${guildId}/economy/shop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _economyShopItems = data.shop || [];
    document.getElementById('ecShopList').innerHTML = renderShopList();
    wireShopButtons(guildId);
    closeItemModal();
  } catch (e) {
    window.showToast?.('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function wireShopButtons(guildId) {
  document.querySelectorAll('[data-action="edit-item"]').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(guildId, btn.dataset.id));
  });
  document.querySelectorAll('[data-action="delete-item"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await window.showConfirm('Delete this shop item?', { title: 'Delete Item', confirmText: 'Delete' })) return;
      try {
        const res = await fetch(`/api/guild/${guildId}/economy/shop/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        _economyShopItems = data.shop || [];
        document.getElementById('ecShopList').innerHTML = renderShopList();
        wireShopButtons(guildId);
      } catch (e) {
        window.showToast?.('Error: ' + e.message, 'error');
      }
    });
  });
}

async function loadEconomyLeaderboard(guildId) {
  const el = document.getElementById('ecLeaderboard');
  const prevBtn = document.getElementById('ecLbPrev');
  const nextBtn = document.getElementById('ecLbNext');
  const pageLabel = document.getElementById('ecLbPageLabel');
  if (!el) return;
  el.innerHTML = '<div class="commands-loading"><div class="spinner"></div></div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/economy/leaderboard?page=${_economyLbPage}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    _economyLbTotal = data.totalPages || 1;
    if (prevBtn) prevBtn.disabled = _economyLbPage <= 1;
    if (nextBtn) nextBtn.disabled = _economyLbPage >= _economyLbTotal;
    if (pageLabel) pageLabel.textContent = `Page ${_economyLbPage} / ${_economyLbTotal}`;
    if (!data.profiles?.length) {
      el.innerHTML = '<p class="ec-empty">No economy profiles yet.</p>';
      return;
    }
    el.innerHTML = `<table class="ec-table">
      <thead><tr><th>#</th><th>User ID</th><th>Wallet</th><th>Bank</th><th>Net Worth</th><th>Actions</th></tr></thead>
      <tbody>${data.profiles.map((p, i) => `
        <tr>
          <td>${(_economyLbPage - 1) * 20 + i + 1}</td>
          <td><code>${escapeHtml(p.userId)}</code></td>
          <td>${escapeHtml(String(p.wallet))}</td>
          <td>${escapeHtml(String(p.bank))}</td>
          <td>${escapeHtml(String(p.netWorth || (p.wallet + p.bank)))}</td>
          <td><button class="btn btn-sm btn-danger" data-action="reset-user" data-uid="${escapeHtml(p.userId)}">Reset</button></td>
        </tr>
      `).join('')}</tbody>
    </table>`;
    el.querySelectorAll('[data-action="reset-user"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await window.showConfirm(`Reset balance for user ${btn.dataset.uid}?`, { title: 'Reset Balance', confirmText: 'Reset' })) return;
        try {
          const r = await fetch(`/api/guild/${guildId}/economy/reset`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: btn.dataset.uid }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Failed');
          loadEconomyLeaderboard(guildId);
        } catch (e) { window.showToast?.('Error: ' + e.message, 'error'); }
      });
    });
  } catch {
    el.innerHTML = '<p class="ec-empty">Failed to load leaderboard.</p>';
  }
}

async function saveEconomy(guildId) {
  const btn = document.getElementById('ecSaveBtn');
  if (btn) btn.disabled = true;
  const body = {
    enabled: document.getElementById('ecEnabled')?.checked ?? false,
    currencyName: document.getElementById('ecCurrencyName')?.value.trim() || 'coins',
    currencySymbol: document.getElementById('ecCurrencySymbol')?.value.trim() || '🪙',
    startingBalance: parseInt(document.getElementById('ecStartingBalance')?.value) || 100,
    defaultBankCap: parseInt(document.getElementById('ecDefaultBankCap')?.value) || 5000,
    dailyAmount: parseInt(document.getElementById('ecDailyAmount')?.value) || 200,
    weeklyAmount: parseInt(document.getElementById('ecWeeklyAmount')?.value) || 1000,
    workMin: parseInt(document.getElementById('ecWorkMin')?.value) || 50,
    workMax: parseInt(document.getElementById('ecWorkMax')?.value) || 200,
    crimeMin: parseInt(document.getElementById('ecCrimeMin')?.value) || 100,
    crimeMax: parseInt(document.getElementById('ecCrimeMax')?.value) || 500,
    crimeSuccessRate: parseInt(document.getElementById('ecCrimeSuccessRate')?.value) || 60,
    begMin: parseInt(document.getElementById('ecBegMin')?.value) || 10,
    begMax: parseInt(document.getElementById('ecBegMax')?.value) || 50,
    robMin: parseInt(document.getElementById('ecRobMin')?.value) || 10,
    robMax: parseInt(document.getElementById('ecRobMax')?.value) || 40,
    robSuccessRate: parseInt(document.getElementById('ecRobSuccessRate')?.value) || 40,
    minBet: parseInt(document.getElementById('ecMinBet')?.value) || 10,
    maxBet: parseInt(document.getElementById('ecMaxBet')?.value) || 10000,
  };
  try {
    const res = await fetch(`/api/guild/${guildId}/economy`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      _economyCfg = data;
      setEconomySaveStatus('✅ Economy settings saved.', true);
    } else {
      setEconomySaveStatus('❌ ' + (data.error || 'Failed to save'), false);
    }
  } catch {
    setEconomySaveStatus('❌ Network error', false);
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

function setEconomySaveStatus(msg, ok) {
  const el = document.getElementById('economySaveStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'save-status ' + (ok ? 'success' : 'error');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Expose init for section loader ───────────────────────────
window.initEconomy = initEconomy;

// Auto-init when section is activated
document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;

  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'economy') return;
    if (!_economyInitDone) initEconomy(gId);
  });

  // Also wire shop buttons after initial render
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="edit-item"]');
    if (btn) openItemModal(gId, btn.dataset.id);
  });
});


