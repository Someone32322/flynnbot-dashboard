/**
 * leveling.js — Dashboard leveling section logic
 * Loaded on server.ejs. Fetches channels/roles from API then manages
 * config load/save, leaderboard pagination, and role rewards.
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  let guildId = null;
  let channels = [];
  let roles = [];
  let rewards = [];
  let lbPage = 1;
  let lbTotalPages = 1;
  let dirty = false;
  let initialized = false;
  let dataLoaded = false;

  // ── Element helpers ───────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function markDirty() {
    dirty = true;
    window.SaveBar?.markDirty();
  }

  function showStatus(msg, ok = true) {
    const el = $('lvSaveStatus');
    if (!el) {
      if (window.showToast) window.showToast(msg, ok ? 'success' : 'error');
      return;
    }
    el.textContent = msg;
    el.style.color = ok ? '#4ade80' : '#f87171';
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  function bindSaveBar() {
    const section = document.getElementById('section-levels');
    if (!section || !window.SaveBar) return;
    window.SaveBar.track(section, saveConfig, async () => {
      await loadAll();
    });
    window.SaveBar.markClean();
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const pageData = $('pageData');
    guildId = pageData?.dataset?.guildId;
    if (!guildId) return;

    // Wire reset
    $('lvResetBtn')?.addEventListener('click', confirmReset);

    // Wire add-reward modal
    $('lvAddRewardBtn')?.addEventListener('click', () => {
      openRewardModal().catch((err) => {
        console.error('[leveling] openRewardModal', err);
        window.showToast?.('Could not open reward modal. Please try again.', 'error');
      });
    });
    $('lvRewardClose')?.addEventListener('click', closeRewardModal);
    $('lvRewardCancel')?.addEventListener('click', closeRewardModal);
    $('lvRewardConfirm')?.addEventListener('click', addRewardFromModal);
    $('lvRewardBackdrop')?.addEventListener('click', (e) => {
      if (e.target === $('lvRewardBackdrop')) closeRewardModal();
    });

    // Mark dirty on any change
    ['lvXpRate', 'lvXpCooldown', 'lvLevelUpMessage', 'lvLevelUpChannel',
      'lvRoleStack', 'lvFormulaA', 'lvFormulaB', 'lvFormulaC'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', markDirty);
      if (el.tagName === 'TEXTAREA') el.addEventListener('input', markDirty);
    });

    // Fallback delegated handler in case the button is replaced/re-rendered
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#lvAddRewardBtn');
      if (!btn) return;
      e.preventDefault();
      openRewardModal().catch((err) => {
        console.error('[leveling] delegated openRewardModal', err);
        window.showToast?.('Could not open reward modal. Please try again.', 'error');
      });
    });

    // Watch for section activation
    const section = document.getElementById('section-levels');
    if (!section) return;

    const observer = new MutationObserver(() => {
      if (section.style.display !== 'none' && !initialized) {
        initialized = true;
        observer.disconnect();
        loadAll();
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['style'] });
    if (section.style.display !== 'none') {
      initialized = true;
      loadAll();
    }

    // Also load when navigation announces section activation
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section !== 'levels') return;
      if (!initialized) initialized = true;
      if (!dataLoaded) loadAll();
    });
  }

  // ── Load everything ───────────────────────────────────────
  async function loadAll() {
    try {
      const [cfgRes, rolesRes, chRes] = await Promise.allSettled([
        fetch(`/api/guild/${guildId}/levels`),
        fetch(`/api/guild/${guildId}/roles`),
        fetch(`/api/guild/${guildId}/channels`),
      ]);

      if (rolesRes.status === 'fulfilled' && rolesRes.value.ok)
        roles = await rolesRes.value.json();
      if (chRes.status === 'fulfilled' && chRes.value.ok)
        channels = await chRes.value.json();

      if (cfgRes.status === 'fulfilled' && cfgRes.value.ok) {
        const cfg = await cfgRes.value.json();
        applyConfig(cfg);
      }

      populateRoleSelector();
      loadLeaderboard(1);
      dataLoaded = true;
      bindSaveBar();
    } catch (err) {
      console.error('[leveling] loadAll', err);
      const el = document.getElementById('home-levels-stats');
      if (el && el.textContent === 'Loading…') el.textContent = '—';
    }
  }

  async function ensureCoreData() {
    if (!guildId) return;
    if (roles.length && channels.length) return;
    try {
      const [rolesRes, chRes] = await Promise.allSettled([
        fetch(`/api/guild/${guildId}/roles`),
        fetch(`/api/guild/${guildId}/channels`),
      ]);

      if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) {
        roles = await rolesRes.value.json();
      }
      if (chRes.status === 'fulfilled' && chRes.value.ok) {
        channels = await chRes.value.json();
      }
      populateRoleSelector();
      populateLevelUpChannelSelector($('lvLevelUpChannel')?.value || '');
    } catch (err) {
      console.error('[leveling] ensureCoreData', err);
    }
  }

  // ── Update home card stat ─────────────────────────────────
  function updateHomeLevelsStats(cfg) {
    const el = document.getElementById('home-levels-stats');
    if (!el) return;
    if (cfg.enabled === false) {
      el.textContent = 'Disabled';
    } else {
      const rewardCount = (cfg.rewards || []).length;
      el.textContent = rewardCount
        ? `Enabled · ${rewardCount} role reward${rewardCount !== 1 ? 's' : ''}`
        : 'Enabled';
    }
  }

  // ── Apply config to form ──────────────────────────────────
  function applyConfig(cfg) {
    updateHomeLevelsStats(cfg);
    const enabled = $('lvEnabled');
    if (enabled) {
      enabled.checked = cfg.enabled !== false;
      updateContentVisibility(cfg.enabled !== false);
      // Re-attach listener without duplicating
      enabled.onchange = function () {
        updateContentVisibility(this.checked);
        markDirty();
      };
    }

    setVal('lvXpRate', cfg.xpRate ?? 15);
    setVal('lvXpCooldown', cfg.xpCooldown ?? 60);
    setVal('lvLevelUpMessage', cfg.levelUpMessage ?? '');
    setVal('lvFormulaA', cfg.formula?.a ?? 5);
    setVal('lvFormulaB', cfg.formula?.b ?? 50);
    setVal('lvFormulaC', cfg.formula?.c ?? 100);

    const roleStack = $('lvRoleStack');
    if (roleStack) roleStack.checked = cfg.roleStack !== false;

    populateChannelSelector(cfg.xpChannels || []);
    populateLevelUpChannelSelector(cfg.levelUpChannelId || '');

    rewards = (cfg.rewards || []).map((r) => ({ level: r.level, roleId: r.roleId }));
    renderRewards();

    dirty = false;
    window.SaveBar?.markClean();
    bindSaveBar();
  }

  function updateContentVisibility(show) {
    const content = $('lvContent');
    if (content) content.style.display = show ? '' : 'none';
  }

  function setVal(id, val) {
    const el = $(id);
    if (el) el.value = val;
  }

  // ── Channel selectors ─────────────────────────────────────
  function populateChannelSelector(selected) {
    const wrap = $('lvChannelsSelect');
    if (!wrap) return;
    wrap.innerHTML = '';
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
    if (!textChannels.length) {
      wrap.innerHTML = '<span class="lv-hint">No text channels available.</span>';
      return;
    }
    textChannels.forEach((ch) => {
      const chip = document.createElement('div');
      chip.className = 'lv-channel-chip' + (selected.includes(ch.id) ? ' active' : '');
      chip.dataset.id = ch.id;
      chip.innerHTML = `<span class="lv-chip-icon">#</span>${escHtml(ch.name)}`;
      chip.addEventListener('click', () => { chip.classList.toggle('active'); markDirty(); });
      wrap.appendChild(chip);
    });
  }

  function populateLevelUpChannelSelector(currentId) {
    const sel = $('lvLevelUpChannel');
    if (!sel) return;
    sel.innerHTML = '<option value="">Same channel as message</option>';
    channels.filter((c) => c.type === 0 || c.type === 5).forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `#${ch.name}`;
      if (ch.id === currentId) opt.selected = true;
      sel.appendChild(opt);
    });
    if (window.refreshCustomSelects) window.refreshCustomSelects(sel.closest('label') || sel.parentElement);
  }

  // ── Role rewards ──────────────────────────────────────────
  function populateRoleSelector() {
    const sel = $('lvRewardRole');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select a role…</option>';
    roles.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      sel.appendChild(opt);
    });
  }

  function renderRewards() {
    const list = $('lvRewardsList');
    const empty = $('lvRewardsEmpty');
    if (!list) return;
    list.innerHTML = '';
    if (!rewards.length) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    [...rewards].sort((a, b) => a.level - b.level).forEach((r) => {
      const role = roles.find((x) => x.id === r.roleId);
      const row = document.createElement('div');
      row.className = 'lv-reward-row';
      row.innerHTML = `
        <span class="lv-reward-level">Level ${r.level}</span>
        <span class="lv-reward-role">${escHtml(role ? role.name : r.roleId)}</span>
        <button class="lv-reward-del" title="Remove" data-level="${r.level}" data-roleid="${escHtml(r.roleId)}">✕</button>`;
      row.querySelector('.lv-reward-del').addEventListener('click', (e) => {
        const { level, roleid } = e.currentTarget.dataset;
        rewards = rewards.filter((x) => !(x.level == level && x.roleId === roleid));
        renderRewards();
        markDirty();
      });
      list.appendChild(row);
    });
  }

  async function openRewardModal() {
    await ensureCoreData();
    if (!roles.length) {
      window.showToast?.('No roles found. Please check bot permissions and try again.', 'warning');
      return;
    }
    const bd = $('lvRewardBackdrop');
    if (bd) { bd.style.display = 'flex'; bd.removeAttribute('aria-hidden'); }
    if ($('lvRewardRole')?.options?.length <= 1) populateRoleSelector();
    if (window.refreshCustomSelects) window.refreshCustomSelects(bd);
    $('lvRewardLevel')?.focus();
  }

  function closeRewardModal() {
    const bd = $('lvRewardBackdrop');
    if (bd) { bd.style.display = ''; bd.setAttribute('aria-hidden', 'true'); }
    if ($('lvRewardLevel')) $('lvRewardLevel').value = '';
    if ($('lvRewardRole')) $('lvRewardRole').value = '';
  }

  function addRewardFromModal() {
    const level = parseInt($('lvRewardLevel')?.value);
    const roleId = $('lvRewardRole')?.value;
    if (!level || level < 1 || !roleId) { window.showToast?.('Please enter a valid level and select a role.', 'warning'); return; }
    rewards = rewards.filter((r) => r.level !== level);
    rewards.push({ level, roleId });
    rewards.sort((a, b) => a.level - b.level);
    renderRewards();
    markDirty();
    closeRewardModal();
  }

  // ── Save ──────────────────────────────────────────────────
  async function saveConfig() {
    const body = {
      enabled: $('lvEnabled')?.checked ?? true,
      xpRate: Number($('lvXpRate')?.value) || 15,
      xpCooldown: Number($('lvXpCooldown')?.value) ?? 60,
      levelUpMessage: $('lvLevelUpMessage')?.value || '',
      levelUpChannelId: $('lvLevelUpChannel')?.value || null,
      roleStack: $('lvRoleStack')?.checked ?? true,
      formula: {
        a: Number($('lvFormulaA')?.value) || 5,
        b: Number($('lvFormulaB')?.value) || 50,
        c: Number($('lvFormulaC')?.value) || 100,
      },
      rewards,
      xpChannels: [...($('lvChannelsSelect')?.querySelectorAll('.lv-channel-chip.active') || [])]
        .map((c) => c.dataset.id),
    };

    try {
      const res = await fetch(`/api/guild/${guildId}/levels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        showStatus('Save failed: ' + (err.error || res.statusText), false);
        return;
      }
      dirty = false;
      window.SaveBar?.markClean();
      bindSaveBar();
      showStatus('Saved!', true);
    } catch (err) {
      showStatus('Network error', false);
      console.error('[leveling] saveConfig', err);
    }
  }

  // ── Reset ─────────────────────────────────────────────────
  async function confirmReset() {
    if (!await window.showConfirm('Permanently delete ALL XP data for this server? This cannot be undone.', { title: 'Reset Leaderboard', confirmText: 'Reset All XP' })) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/levels/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      window.showToast?.(`Deleted ${data.deleted} user records. Leaderboard reset.`, 'success');
      loadLeaderboard(1);
    } catch (err) {
      window.showToast?.('Reset failed: ' + err.message, 'error');
    }
  }

  // ── Leaderboard ───────────────────────────────────────────
  async function loadLeaderboard(page) {
    lbPage = page;
    const wrap = $('lvLeaderboard');
    if (!wrap) return;
    wrap.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading…</div>';
    try {
      const res = await fetch(`/api/guild/${guildId}/levels/leaderboard?page=${page}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      lbTotalPages = data.totalPages || 1;
      renderLeaderboard(data.rows, data.total);
      renderLbPagination();
    } catch (err) {
      wrap.innerHTML = '<p class="lv-hint" style="text-align:center">Failed to load leaderboard.</p>';
      console.error('[leveling] loadLeaderboard', err);
    }
  }

  function renderLeaderboard(rows, total) {
    const wrap = $('lvLeaderboard');
    if (!wrap) return;
    if (!rows?.length) { wrap.innerHTML = '<p class="lv-hint" style="text-align:center">No data yet.</p>'; return; }
    const rankClass = (n) => n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
    wrap.innerHTML = `
      <table class="lv-lb-table">
        <thead><tr><th>#</th><th>User ID</th><th>Level</th><th>XP</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td class="lv-lb-rank ${rankClass(r.rank)}">${r.rank}</td>
            <td class="lv-lb-userid">${escHtml(r.userId)}</td>
            <td class="lv-lb-level">${r.level}</td>
            <td class="lv-lb-xp">${r.xp.toLocaleString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="lv-hint" style="text-align:right;margin-top:0.4rem">${total} member${total !== 1 ? 's' : ''} total</div>`;
  }

  function renderLbPagination() {
    const wrap = $('lvLbPagination');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (lbTotalPages <= 1) return;
    for (let i = 1; i <= lbTotalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm' + (i === lbPage ? ' btn-primary' : ' btn-secondary');
      btn.textContent = i;
      btn.addEventListener('click', () => loadLeaderboard(i));
      wrap.appendChild(btn);
    }
  }

  // ── Home card stat ─────────────────────────────────────────
  async function loadHomeStats() {
    try {
      const res = await fetch(`/api/guild/${guildId}/levels`);
      if (!res.ok) return;
      const cfg = await res.json();
      const el = $('home-levels-stats');
      if (el) el.textContent = cfg.enabled
        ? `Enabled · ${cfg.rewards?.length || 0} reward${cfg.rewards?.length !== 1 ? 's' : ''}`
        : 'Disabled';
    } catch (_) {}
  }

  // ── Utilities ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
    // Only load home stats if guildId available
    const pageData = document.getElementById('pageData');
    if (pageData?.dataset?.guildId) {
      guildId = pageData.dataset.guildId;
      loadHomeStats();
    }
  });
})();

