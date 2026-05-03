/**
 * modconfig.js — client-side moderation configuration
 * Handles all sub-pages: privacy, channel locking, predefined reasons,
 * user notifications, immune roles, punish settings, message histories,
 * appeals, user reports wizard.
 */

/* ── Globals ──────────────────────────────────────────────── */
let _modConfigInitDone = false;
let _modConfigGuildId  = null;
let _modConfig         = null;
let _guildChannels     = [];
let _guildRoles        = [];
const MODCONFIG_API    = (path) => `/api/guild/${_modConfigGuildId}${path}`;

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('sectionActivated', (e) => {
  if (e.detail?.section !== 'cases') return;
  const guildId = document.getElementById('pageData')?.dataset?.guildId;
  if (!guildId) return;
  _modConfigGuildId = guildId;
  if (!_modConfigInitDone) {
    _modConfigInitDone = true;
    _initModConfig();
  }
});

async function _initModConfig() {
  await _loadModConfig();
  _bindDashboard();
  _bindModals();
}

async function _loadModConfig() {
  try {
    const [cfgRes, chRes, rolesRes] = await Promise.all([
      fetch(MODCONFIG_API('/modconfig/full')),
      fetch(MODCONFIG_API('/channels')),
      fetch(MODCONFIG_API('/roles')),
    ]);
    if (cfgRes.ok)   _modConfig     = await cfgRes.json();
    if (chRes.ok)    _guildChannels  = (await chRes.json()) || [];
    if (rolesRes.ok) _guildRoles     = (await rolesRes.json()) || [];
    if (_modConfig) {
      const el = document.getElementById('purgePinnedToggle');
      if (el) el.checked = !!_modConfig.purgePinned;
    }
    _updateUserReportsCard();
  } catch (err) {
    console.error('[modconfig] load error', err);
  }
}

/* ── Dashboard binding ────────────────────────────────────── */
function _bindDashboard() {
  document.querySelectorAll('.mod-settings-row[data-subpage]').forEach(row => {
    const subpage = row.dataset.subpage;
    if (!subpage) return;
    row.addEventListener('click', () => _openSubpage(subpage));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openSubpage(subpage); }
    });
  });

  const purgePinnedToggle = document.getElementById('purgePinnedToggle');
  if (purgePinnedToggle) {
    purgePinnedToggle.addEventListener('change', async () => {
      await _patchModConfig({ purgePinned: purgePinnedToggle.checked });
      if (_modConfig) _modConfig.purgePinned = purgePinnedToggle.checked;
    });
  }

  document.getElementById('modAppealsBtn')?.addEventListener('click', () => _openSubpage('appeals'));
}

function _updateUserReportsCard() {
  const actions = document.getElementById('modUserReportsActions');
  const sub     = document.getElementById('modUserReportsSub');
  if (!_modConfig || !actions) return;
  const enabled = _modConfig.userReports?.enabled;
  if (enabled) {
    sub.textContent = 'Active — users can submit reports';
    actions.innerHTML = `
      <button class="btn btn-sm" id="modUserReportsConfigureBtn">Configure</button>
      <button class="btn btn-sm btn-danger" id="modUserReportsDisableBtn">Disable</button>`;
    document.getElementById('modUserReportsConfigureBtn')?.addEventListener('click', () => _openSubpage('user-reports'));
    document.getElementById('modUserReportsDisableBtn')?.addEventListener('click', async () => {
      if (!confirm('Disable user reports?')) return;
      await _patchModConfig({ 'userReports.enabled': false });
      if (_modConfig) _modConfig.userReports.enabled = false;
      _updateUserReportsCard();
    });
  } else {
    sub.textContent = 'Set up user reports for your server';
    actions.innerHTML = `<button class="btn btn-sm btn-primary" id="modUserReportsSetupBtn">Set up</button>`;
    document.getElementById('modUserReportsSetupBtn')?.addEventListener('click', () => _openUserReportsWizard());
  }
}

/* ── Sub-page navigation ──────────────────────────────────── */
const SUBPAGE_MAP = {
  'punish-settings':    'modSubPunishSettings',
  'immune-roles':       'modSubImmuneRoles',
  'user-notifications': 'modSubUserNotifications',
  'predefined-reasons': 'modSubPredefinedReasons',
  'channel-locking':    'modSubChannelLocking',
  'privacy':            'modSubPrivacy',
  'message-histories':  'modSubMessageHistories',
  'appeals':            'modSubAppeals',
  'user-reports':       'modSubUserReports',
};

function _openSubpage(key) {
  const targetId = SUBPAGE_MAP[key];
  if (!targetId) return;
  document.getElementById('modDashboard').style.display = 'none';
  Object.values(SUBPAGE_MAP).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(targetId);
  if (target) {
    target.style.display = '';
    target.classList.add('mod-subpage-enter');
    setTimeout(() => target.classList.remove('mod-subpage-enter'), 350);
  }
  const render = {
    'punish-settings':    _renderPunishSettings,
    'immune-roles':       _renderImmuneRoles,
    'user-notifications': _renderUserNotifications,
    'predefined-reasons': _renderPredefinedReasons,
    'channel-locking':    _renderChannelLocking,
    'privacy':            _renderPrivacy,
    'message-histories':  _renderMessageHistories,
    'appeals':            _renderAppeals,
    'user-reports':       _renderUserReports,
  }[key];
  if (render) render();
}

function _backToDashboard() {
  Object.values(SUBPAGE_MAP).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('modCasesView').style.display = 'none';
  document.getElementById('modCaseDetail').style.display = 'none';
  const dash = document.getElementById('modDashboard');
  dash.style.display = '';
  dash.classList.add('mod-subpage-enter');
  setTimeout(() => dash.classList.remove('mod-subpage-enter'), 350);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.mod-subpage-back')) _backToDashboard();
});

/* ── API helpers ──────────────────────────────────────────── */
async function _patchModConfig(data) {
  try {
    const res = await fetch(MODCONFIG_API('/modconfig/full'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    _modConfig = updated;
    return updated;
  } catch (err) {
    console.error('[modconfig] patch error', err);
    _toast('Failed to save changes', 'error');
    return null;
  }
}

function _toast(msg, type = 'success') {
  const existing = document.getElementById('modToast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'modToast';
  t.className = `mod-toast mod-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('mod-toast--show'), 10);
  setTimeout(() => { t.classList.remove('mod-toast--show'); setTimeout(() => t.remove(), 300); }, 2800);
}

/* ── Render: Privacy ──────────────────────────────────────── */
function _renderPrivacy() {
  const el = document.getElementById('privacyContent');
  const p  = _modConfig?.privacy || {};
  const cmdVisible = p.cmdOutputVisible || [];
  const dmVisible  = p.dmDetailsVisible !== undefined ? p.dmDetailsVisible : ['author','proof','verifiedProof'];

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Command output message details</h4>
        <p class="mod-section-card-desc">These details are hidden by default. Toggle to make them visible in command output.</p>
      </div>
      <div class="privacy-visibility-row" data-key="cmdOutput">
        ${_privacyChip('author','Author','cmdOutput',cmdVisible)}
        ${_privacyChip('proof','Proof','cmdOutput',cmdVisible)}
        ${_privacyChip('verifiedProof','Verified proof','cmdOutput',cmdVisible)}
      </div>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Direct message details</h4>
        <p class="mod-section-card-desc">These details are visible in DMs to users by default. Toggle to hide them.</p>
      </div>
      <div class="privacy-visibility-row" data-key="dm">
        ${_privacyChip('author','Author','dm',dmVisible)}
        ${_privacyChip('proof','Proof','dm',dmVisible)}
        ${_privacyChip('verifiedProof','Verified proof','dm',dmVisible)}
      </div>
    </div>
    <div class="mod-save-row" id="privacySaveRow" style="display:none">
      <button class="btn btn-primary btn-sm" id="privacySaveBtn">Save changes</button>
    </div>`;

  el.querySelectorAll('.privacy-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('privacy-chip--active');
      el.querySelector('#privacySaveRow').style.display = '';
    });
  });

  el.querySelector('#privacySaveBtn')?.addEventListener('click', async () => {
    const cmdOut = [...el.querySelectorAll('.privacy-chip[data-group="cmdOutput"].privacy-chip--active')].map(c => c.dataset.value);
    const dm     = [...el.querySelectorAll('.privacy-chip[data-group="dm"].privacy-chip--active')].map(c => c.dataset.value);
    await _patchModConfig({ privacy: { cmdOutputVisible: cmdOut, dmDetailsVisible: dm } });
    el.querySelector('#privacySaveRow').style.display = 'none';
    _toast('Privacy settings saved');
  });
}

function _privacyChip(value, label, group, activeList) {
  const active = activeList.includes(value) ? 'privacy-chip--active' : '';
  return `<button class="privacy-chip ${active}" data-group="${group}" data-value="${value}">${label}</button>`;
}

/* ── Render: Channel locking ──────────────────────────────── */
function _renderChannelLocking() {
  const el = document.getElementById('channelLockingContent');
  const cl = _modConfig?.channelLock || {};
  const ignoredRoles    = cl.ignoredRoles    || [];
  const lockAllChannels = cl.lockAllChannels || [];

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Ignored roles</h4>
        <p class="mod-section-card-desc">When a channel is locked, users with these roles will still be able to type in it.</p>
      </div>
      <div class="mod-role-chips-row" id="ignoredRolesChips">
        ${ignoredRoles.length ? _renderRoleChips(ignoredRoles,'ignored') : '<span class="mod-chips-empty">+ No roles added</span>'}
      </div>
      ${_renderRolePicker('ignoredRoleAdd','Add role',_guildRoles,ignoredRoles)}
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Channels to lock when using <code>/lockall</code></h4>
        <p class="mod-section-card-desc">When using /lockall, only these channels will be locked. Leave empty to lock all.</p>
      </div>
      <div class="mod-channel-chips-row" id="lockAllChannelsChips">
        ${lockAllChannels.length ? _renderChannelChips(lockAllChannels,'lockall') : '<span class="mod-chips-empty">+ No channels added</span>'}
      </div>
      ${_renderChannelPicker('lockAllChannelAdd','Add channel',_guildChannels,lockAllChannels)}
    </div>
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="channelLockSaveBtn">Save changes</button>
    </div>`;

  _bindChipRemove(el, 'ignored', null, 'ignoredRolesChips');
  _bindChipRemove(el, 'lockall', null, 'lockAllChannelsChips');
  _bindPickerAdd(el, 'ignoredRoleAdd', 'ignoredRolesChips', 'ignored', 'role');
  _bindPickerAdd(el, 'lockAllChannelAdd', 'lockAllChannelsChips', 'lockall', 'channel');
  if (window.refreshCustomSelects) window.refreshCustomSelects(el);

  el.querySelector('#channelLockSaveBtn')?.addEventListener('click', async () => {
    const ignoredIds = [...el.querySelectorAll('.mod-chip[data-group="ignored"]')].map(c => c.dataset.id);
    const lockallIds = [...el.querySelectorAll('.mod-chip[data-group="lockall"]')].map(c => c.dataset.id);
    await _patchModConfig({ channelLock: { ignoredRoles: ignoredIds, lockAllChannels: lockallIds } });
    _toast('Channel locking saved');
    _renderChannelLocking();
  });
}

/* ── Render: Predefined reasons ───────────────────────────── */
let _predefinedReasons = null; // { ban:[], kick:[], mute:[], warn:[] }
let _predefinedReasonsLoaded = false;

async function _loadPredefinedReasons() {
  try {
    const res = await fetch(MODCONFIG_API('/predefined-reasons'));
    if (res.ok) _predefinedReasons = await res.json();
  } catch (err) {
    console.error('[modconfig] load predefined-reasons', err);
  }
}

const REASON_ACTIONS = ['ban','kick','mute','warn'];
const REASON_ACTION_LABELS = { ban:'Ban', kick:'Kick', mute:'Mute', warn:'Warn' };
let _reasonActiveTab = 'ban';

function _renderPredefinedReasons() {
  const el = document.getElementById('predefinedReasonsContent');
  el.innerHTML = `<div class="commands-loading"><div class="spinner"></div></div>`;
  _loadPredefinedReasons().then(() => {
    _predefinedReasonsLoaded = true;
    _drawPredefinedReasons(el);
  });
}

function _drawPredefinedReasons(el) {
  const reasons = _predefinedReasons || { ban:[], kick:[], mute:[], warn:[] };
  const activeReasons = reasons[_reasonActiveTab] || [];

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Autocomplete suggestions</h4>
        <p class="mod-section-card-desc">These appear as autocomplete options when moderators use commands. Select a punishment type to manage its reasons.</p>
      </div>
      <div class="mod-reason-action-tabs" id="reasonActionTabs">
        ${REASON_ACTIONS.map(a => `
          <button class="mod-reason-tab${a===_reasonActiveTab?' active':''}" data-action="${a}">
            ${REASON_ACTION_LABELS[a]}
          </button>`).join('')}
      </div>
      <div class="mod-reasons-list" id="reasonsList">
        ${activeReasons.length === 0
          ? '<p class="mod-empty-state">No reasons for this action yet. Add one below.</p>'
          : activeReasons.map((r,i) => _reasonRowSimple(r,i)).join('')}
      </div>
      <div class="mod-reason-add-row">
        <input type="text" id="newReasonInput" class="modal-input" placeholder="Enter a reason…" maxlength="200" style="flex:1">
        <button class="btn btn-primary btn-sm" id="addReasonInline">Add</button>
      </div>
    </div>`;

  // Tab switching
  el.querySelectorAll('.mod-reason-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _reasonActiveTab = tab.dataset.action;
      _drawPredefinedReasons(el);
    });
  });

  // Add reason inline
  const newInput = el.querySelector('#newReasonInput');
  el.querySelector('#addReasonInline')?.addEventListener('click', () => _addReason(el, newInput));
  newInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _addReason(el, newInput); }
  });

  // Delete buttons
  el.querySelectorAll('.mod-reason-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      const list = _predefinedReasons[_reasonActiveTab] || [];
      list.splice(idx, 1);
      _saveReasonAction(_reasonActiveTab, list).then(() => _drawPredefinedReasons(el));
    });
  });
}

function _reasonRowSimple(reason, idx) {
  return `<div class="mod-reason-row">
    <div class="mod-reason-text">${_esc(reason)}</div>
    <button class="mod-reason-delete btn-icon-ghost" data-idx="${idx}" title="Delete reason">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>
  </div>`;
}

async function _addReason(el, input) {
  const reason = input?.value.trim();
  if (!reason) { _toast('Please enter a reason.','error'); return; }
  if (!_predefinedReasons) _predefinedReasons = { ban:[], kick:[], mute:[], warn:[] };
  const list = [...(_predefinedReasons[_reasonActiveTab] || []), reason];
  const saved = await _saveReasonAction(_reasonActiveTab, list);
  if (saved) { input.value = ''; _drawPredefinedReasons(el); }
}

async function _saveReasonAction(action, reasons) {
  try {
    const res = await fetch(MODCONFIG_API(`/predefined-reasons/${action}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasons }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!_predefinedReasons) _predefinedReasons = { ban:[], kick:[], mute:[], warn:[] };
    _predefinedReasons[action] = data.reasons;
    _toast('Reasons saved');
    return true;
  } catch (err) {
    console.error('[modconfig] save reasons', err);
    _toast('Failed to save reasons','error');
    return false;
  }
}

/* ── Render: User notifications ───────────────────────────── */
function _renderUserNotifications() {
  const el = document.getElementById('userNotificationsContent');
  const un = _modConfig?.userNotifications || {};

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Notification settings</h4>
        <p class="mod-section-card-desc">Choose which events trigger a direct message to the punished user.</p>
      </div>
      ${_notifRow('un-enabled','Enable user notifications','Master toggle. When disabled, no DMs are sent.',un.enabled!==false)}
      ${_notifRow('un-onPunish','Notify users on punish','DM the user when they receive a ban, kick, mute, or warning.',un.onPunish!==false)}
      ${_notifRow('un-onUnpunish','Notify users on unpunish','DM the user when their punishment is removed.',un.onUnpunish!==false)}
      ${_notifRow('un-onPunishByOther','Notify on punish by another bot','Send a DM when punished by another bot or integration.',!!un.onPunishByOther)}
      ${_notifRow('un-onUnpunishByOther','Notify on unpunish by another bot','Send a DM when unpunished by another bot or integration.',!!un.onUnpunishByOther)}
      ${_notifRow('un-sendAttachments','Send proof attachments','Include proof image/file attachments in the DM if available.',!!un.sendAttachments)}
    </div>
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="userNotifSaveBtn">Save changes</button>
    </div>`;

  el.querySelector('#userNotifSaveBtn')?.addEventListener('click', async () => {
    const get = (id) => !!el.querySelector(`#${id}`)?.checked;
    await _patchModConfig({
      userNotifications: {
        enabled:           get('un-enabled'),
        onPunish:          get('un-onPunish'),
        onUnpunish:        get('un-onUnpunish'),
        onPunishByOther:   get('un-onPunishByOther'),
        onUnpunishByOther: get('un-onUnpunishByOther'),
        sendAttachments:   get('un-sendAttachments'),
      }
    });
    _toast('User notification settings saved');
  });
}

function _notifRow(id, label, desc, checked) {
  return `<div class="mod-toggle-row">
    <div class="mod-toggle-row-info">
      <div class="mod-toggle-row-label">${label}</div>
      <div class="mod-toggle-row-desc">${desc}</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" id="${id}"${checked ? ' checked' : ''}>
      <span class="toggle-slider"></span>
    </label>
  </div>`;
}

/* ── Render: Immune roles ─────────────────────────────────── */
function _renderImmuneRoles() {
  const el = document.getElementById('immuneRolesContent');
  const ir = _modConfig?.immuneRoles || {};

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">General</h4>
      </div>
      ${_notifRow('ir-hierarchy','Use role hierarchy','When enabled, users with a higher role than the moderator cannot be punished.',!!ir.useHierarchy)}
    </div>
    ${['global','ban','kick','mute','warn'].map(type => `
    <div class="mod-section-card" style="margin-top:0.75rem" id="ir-card-${type}">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">${type.charAt(0).toUpperCase()+type.slice(1)}</h4>
        <p class="mod-section-card-desc">${type === 'global' ? 'Roles that are immune to all punishment types.' : 'Roles that are immune to '+type+'s.'}</p>
      </div>
      <div class="mod-role-chips-row" id="ir-chips-${type}">
        ${(ir[type]||[]).length ? _renderRoleChips(ir[type]||[],'ir-'+type) : '<span class="mod-chips-empty">+ No roles added</span>'}
      </div>
      ${_renderRolePicker('ir-add-'+type,'Add role',_guildRoles,ir[type]||[])}
    </div>`).join('')}
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="immuneSaveBtn">Save changes</button>
    </div>`;

  ['global','ban','kick','mute','warn'].forEach(type => {
    _bindPickerAdd(el, `ir-add-${type}`, `ir-chips-${type}`, `ir-${type}`, 'role');
    _bindChipRemove(el, `ir-${type}`, null, `ir-chips-${type}`);
  });
  if (window.refreshCustomSelects) window.refreshCustomSelects(el);

  el.querySelector('#immuneSaveBtn')?.addEventListener('click', async () => {
    const getIds = (group) => [...el.querySelectorAll(`.mod-chip[data-group="${group}"]`)].map(c => c.dataset.id);
    await _patchModConfig({
      immuneRoles: {
        useHierarchy: !!el.querySelector('#ir-hierarchy')?.checked,
        global: getIds('ir-global'),
        ban:    getIds('ir-ban'),
        kick:   getIds('ir-kick'),
        mute:   getIds('ir-mute'),
        warn:   getIds('ir-warn'),
      }
    });
    _toast('Immune roles saved');
  });
}

/* ── Render: Punish settings ──────────────────────────────── */
const PUNISH_TYPES = ['ban','kick','mute','warn'];

function _renderPunishSettings() {
  const el = document.getElementById('punishSettingsContent');
  const ps = _modConfig?.punishSettings || {};

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Punishment types</h4>
        <p class="mod-section-card-desc">Click a punishment type to configure its default settings.</p>
      </div>
      <div class="punish-type-list">
        ${PUNISH_TYPES.map(t => `
        <div class="punish-type-row" data-punish-type="${t}" tabindex="0" role="button">
          <div class="punish-type-row-icon punish-type-row-icon--${t}">${_punishTypeIcon(t)}</div>
          <div class="punish-type-row-info">
            <div class="punish-type-row-label">${t.charAt(0).toUpperCase()+t.slice(1)}</div>
            <div class="punish-type-row-sub">${_punishTypeSummary(t, ps[t])}</div>
          </div>
          <svg class="mod-settings-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>`).join('')}
      </div>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">General settings</h4>
      </div>
      ${_notifRow('ps-reply','Reply to message','Reply to the message that triggered the punishment command instead of sending a new message.',ps.replyToMsg!==false)}
      ${_notifRow('ps-confirm','Confirm recent case','Show a confirmation when a user was recently punished.',ps.confirmRecentCase!==false)}
      ${_notifRow('ps-logExpired','Log expired punishments','Create a log entry when a punishment expires.',ps.logExpiredOutside!==false)}
      ${_notifRow('ps-cacheDeleted','Cache deleted messages','Keep a cache of deleted messages for context in moderation actions.',!!ps.cacheDeleted)}
    </div>
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="punishGenSaveBtn">Save general settings</button>
    </div>`;

  el.querySelectorAll('.punish-type-row').forEach(row => {
    const type = row.dataset.punishType;
    row.addEventListener('click', () => _openPunishTypeModal(type));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openPunishTypeModal(type); }
    });
  });

  el.querySelector('#punishGenSaveBtn')?.addEventListener('click', async () => {
    const get = (id) => !!el.querySelector(`#${id}`)?.checked;
    await _patchModConfig({
      'punishSettings.replyToMsg':        get('ps-reply'),
      'punishSettings.confirmRecentCase': get('ps-confirm'),
      'punishSettings.logExpiredOutside': get('ps-logExpired'),
      'punishSettings.cacheDeleted':      get('ps-cacheDeleted'),
    });
    _toast('General settings saved');
  });
}

function _punishTypeIcon(t) {
  const icons = {
    ban:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>',
    kick: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    mute: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>',
  };
  return icons[t] || '';
}

function _punishTypeSummary(type, cfg) {
  if (!cfg) return 'Default settings';
  const parts = [];
  if (cfg.defaultReason)   parts.push('Default reason set');
  if (cfg.defaultDuration) parts.push('Duration: '+cfg.defaultDuration);
  if (cfg.forceReason)     parts.push('Force reason');
  return parts.length ? parts.join(' · ') : 'Default settings';
}

function _openPunishTypeModal(type) {
  const ps  = _modConfig?.punishSettings || {};
  const cfg = ps[type] || {};
  document.getElementById('punishTypeModalTitle').textContent = type.charAt(0).toUpperCase()+type.slice(1)+' settings';
  const body = document.getElementById('punishTypeModalBody');
  const showMute = type === 'mute';
  body.innerHTML = `
    <div class="modal-field">
      <label class="modal-label">DEFAULT REASON</label>
      <input type="text" id="ptDefaultReason" class="modal-input" placeholder="No default reason" value="${_esc(cfg.defaultReason||'')}">
    </div>
    <div class="modal-field">
      <label class="modal-label">DEFAULT DURATION</label>
      <input type="text" id="ptDefaultDuration" class="modal-input" placeholder="e.g. 7d, 1h, permanent" value="${_esc(cfg.defaultDuration||'')}">
    </div>
    <div class="modal-divider"></div>
    ${_notifRow('pt-forceReason','Force reason','Moderators must provide a reason to use this command.',!!cfg.forceReason)}
    ${_notifRow('pt-alwaysReview','Always review','Show a review dialog before confirming the punishment.',!!cfg.alwaysReview)}
    ${_notifRow('pt-deleteProofMsg','Delete proof message','Delete the proof attachment message after it is processed.',!!cfg.deleteProofMsg)}
    ${showMute ? _notifRow('pt-allowMultiple','Allow multiple mutes','Allow a user to be muted more than once at a time.',!!cfg.allowMultiple) : ''}
    ${showMute ? _notifRow('pt-linkTimeouts','Link with timeouts','Automatically apply a Discord timeout when muting.',!!cfg.linkWithTimeouts) : ''}
    ${showMute ? _notifRow('pt-extendTimeouts','Extend timeouts','Extend existing Discord timeout instead of replacing it.',!!cfg.extendTimeouts) : ''}`;
  document.getElementById('punishTypeModal')._currentType = type;
  _openModal('punishTypeModal');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#punishTypeSave')) return;
  const modal = document.getElementById('punishTypeModal');
  const type  = modal._currentType;
  if (!type) return;
  const get  = (id) => !!document.querySelector('#punishTypeModalBody #'+id)?.checked;
  const val  = (id) => document.querySelector('#punishTypeModalBody #'+id)?.value || '';
  const data = {
    ['punishSettings.'+type+'.defaultReason']:  val('ptDefaultReason'),
    ['punishSettings.'+type+'.defaultDuration']: val('ptDefaultDuration'),
    ['punishSettings.'+type+'.forceReason']:     get('pt-forceReason'),
    ['punishSettings.'+type+'.alwaysReview']:    get('pt-alwaysReview'),
    ['punishSettings.'+type+'.deleteProofMsg']:  get('pt-deleteProofMsg'),
  };
  if (type === 'mute') {
    data['punishSettings.'+type+'.allowMultiple']  = get('pt-allowMultiple');
    data['punishSettings.'+type+'.linkWithTimeouts'] = get('pt-linkTimeouts');
    data['punishSettings.'+type+'.extendTimeouts']   = get('pt-extendTimeouts');
  }
  _patchModConfig(data).then(updated => {
    if (updated) {
      _closeModal('punishTypeModal');
      _toast(type.charAt(0).toUpperCase()+type.slice(1)+' settings saved');
      _renderPunishSettings();
    }
  });
});

/* ── Render: Message Histories ────────────────────────────── */
function _renderMessageHistories() {
  const el = document.getElementById('messageHistoriesContent');
  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header" style="flex-direction:row;align-items:center;justify-content:space-between">
        <div>
          <h4 class="mod-section-card-title">Message archives</h4>
          <p class="mod-section-card-desc">Archived message histories from your server.</p>
        </div>
      </div>
      <div class="mh-toolbar">
        <div class="mh-search-wrap">
          <svg class="mh-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="mh-search-input" id="mhSearch" placeholder="Search by user or channel…">
        </div>
      </div>
      <div class="mh-list" id="mhList">
        <div class="mod-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          <p>No message histories found.</p>
          <p class="mod-empty-hint">Use <code>/archive</code> in your server to create one.</p>
        </div>
      </div>
    </div>`;
}

/* ── Render: Appeals ──────────────────────────────────────── */
function _renderAppeals() {
  const el      = document.getElementById('appealsContent');
  const ap      = _modConfig?.appeals || {};
  const questions = ap.questions || [];

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Appeal form questions</h4>
        <p class="mod-section-card-desc">When a user submits an appeal, they will be asked to answer these questions.</p>
      </div>
      <div class="appeals-questions-list" id="appealsQuestionsList">
        ${questions.length === 0
          ? '<p class="mod-empty-state">No questions yet. Add one below.</p>'
          : questions.map(q => _appealQRow(q)).join('')}
      </div>
      <button class="btn btn-ghost btn-sm mod-add-btn" id="openAddAppealQModal">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Add question
      </button>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Settings</h4>
      </div>
      ${_notifRow('ap-enabled','Enable appeals','Allow users to submit appeals for their punishments.',ap.enabled!==false)}
      ${_notifRow('ap-allowBan','Allow ban appeals','Allow users who have been banned to appeal.',ap.allowBanAppeals!==false)}
      ${_notifRow('ap-allowMute','Allow mute appeals','Allow users who have been muted to appeal.',ap.allowMuteAppeals!==false)}
      ${_notifRow('ap-notifyUser','Notify user on review','Send the user a DM when their appeal has been reviewed.',ap.notifyUser!==false)}
      <div class="modal-field" style="padding:0.75rem 1rem 0.5rem">
        <label class="modal-label">COOLDOWN (days)</label>
        <input type="number" id="ap-cooldown" class="modal-input" style="max-width:100px" min="0" value="${ap.cooldownDays ?? 7}">
        <p class="modal-hint">Minimum days a user must wait before submitting another appeal.</p>
      </div>
      <div class="modal-field" style="padding:0 1rem 0.75rem">
        <label class="modal-label">APPEAL CHANNEL</label>
        <select id="ap-channelId" class="modal-input" data-cs data-cs-placeholder="No channel selected">
          <option value="">No channel selected</option>
          ${_guildChannels.filter(c=>c.type===0).map(c=>`<option value="${c.id}"${c.id===ap.channelId?' selected':''}>#${_esc(c.name)}</option>`).join('')}
        </select>
        <p class="modal-hint">Appeals will be sent to this channel for your moderation team to review.</p>
      </div>
    </div>
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="appealsSaveBtn">Save settings</button>
    </div>`;

  el.querySelector('#openAddAppealQModal')?.addEventListener('click', () => {
    document.getElementById('appealQLabel').value = '';
    document.getElementById('appealQRequired').checked = false;
    document.querySelectorAll('#appealQTypeTabs .mod-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === 'textarea'));
    _openModal('addAppealQModal');
  });
  if (window.refreshCustomSelects) window.refreshCustomSelects(el);

  el.querySelectorAll('.appeals-q-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const qId = e.currentTarget.dataset.id;
      if (!confirm('Delete this question?')) return;
      const res = await fetch(MODCONFIG_API('/modconfig/appeals/questions/'+qId), { method: 'DELETE' });
      if (res.ok) {
        if (_modConfig?.appeals) _modConfig.appeals.questions = _modConfig.appeals.questions.filter(q => q.id !== qId);
        _renderAppeals();
        _toast('Question deleted');
      }
    });
  });

  el.querySelector('#appealsSaveBtn')?.addEventListener('click', async () => {
    const get = (id) => !!el.querySelector('#'+id)?.checked;
    await _patchModConfig({
      appeals: {
        ...(_modConfig?.appeals || {}),
        enabled:          get('ap-enabled'),
        allowBanAppeals:  get('ap-allowBan'),
        allowMuteAppeals: get('ap-allowMute'),
        notifyUser:       get('ap-notifyUser'),
        cooldownDays:     parseInt(el.querySelector('#ap-cooldown')?.value || '7', 10),
        channelId:        el.querySelector('#ap-channelId')?.value || null,
      }
    });
    _toast('Appeal settings saved');
  });
}

function _appealQRow(q) {
  const typeLabel = { text:'Short text', textarea:'Long text', select:'Select' }[q.type] || q.type;
  return `<div class="appeals-q-row">
    <div class="appeals-q-drag-handle">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"/></svg>
    </div>
    <div class="appeals-q-info">
      <div class="appeals-q-label">${_esc(q.label)}${q.required ? ' <span class="required-badge">required</span>' : ''}</div>
      <div class="appeals-q-type">${typeLabel}</div>
    </div>
    <button class="appeals-q-delete btn-icon-ghost" data-id="${q.id}" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>
  </div>`;
}

/* ── Render: User reports full config ─────────────────────── */
function _renderUserReports() {
  const el = document.getElementById('userReportsContent');
  const ur = _modConfig?.userReports || {};

  el.innerHTML = `
    <div class="mod-section-card">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Report channel</h4>
      </div>
      <div class="modal-field" style="padding:0.5rem 1rem 0.75rem">
        <select id="ur-channelId" class="modal-input" data-cs data-cs-placeholder="No channel selected">
          <option value="">No channel selected</option>
          ${_guildChannels.filter(c=>c.type===0).map(c=>`<option value="${c.id}"${c.id===ur.reportChannelId?' selected':''}>#${_esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Ways to report</h4>
      </div>
      <div class="ur-way-row">
        <label class="toggle-switch"><input type="checkbox" id="ur-slash"${ur.slashCommand?' checked':''}><span class="toggle-slider"></span></label>
        <div class="ur-way-info"><span class="ur-way-label">Slash command</span>
          <input type="text" class="ur-way-name-input" id="ur-slashName" placeholder="report" value="${_esc(ur.slashCommandName||'report')}">
        </div>
      </div>
      <div class="ur-way-row">
        <label class="toggle-switch"><input type="checkbox" id="ur-userCtx"${ur.userContext?' checked':''}><span class="toggle-slider"></span></label>
        <div class="ur-way-info"><span class="ur-way-label">User context menu</span>
          <input type="text" class="ur-way-name-input" id="ur-userCtxName" placeholder="Report user" value="${_esc(ur.userContextName||'Report user')}">
        </div>
      </div>
      <div class="ur-way-row">
        <label class="toggle-switch"><input type="checkbox" id="ur-msgCtx"${ur.msgContext?' checked':''}><span class="toggle-slider"></span></label>
        <div class="ur-way-info"><span class="ur-way-label">Message context menu</span>
          <input type="text" class="ur-way-name-input" id="ur-msgCtxName" placeholder="Report message" value="${_esc(ur.msgContextName||'Report message')}">
        </div>
      </div>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Predefined reasons</h4>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 1rem">
        <label class="toggle-switch"><input type="checkbox" id="ur-allowCustomReason"${ur.allowCustomReason!==false?' checked':''}><span class="toggle-slider"></span></label>
        <span style="font-size:0.85rem;color:var(--text-2)">Allow custom reason</span>
      </div>
      <div class="ur-reasons-list" id="urReasonsListFull">
        ${(ur.predefinedReasons||[]).length === 0
          ? '<p class="mod-empty-state" style="padding:0.5rem 1rem">No predefined reasons.</p>'
          : (ur.predefinedReasons||[]).map(r => `<div class="ur-reason-row">
            <span class="ur-reason-label">${_esc(r.label)}</span>
            <button class="btn-icon-ghost ur-reason-delete" data-label="${_esc(r.label)}" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm mod-add-btn" id="urAddReasonFull">+ Add reason</button>
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Ping roles</h4>
      </div>
      <div class="mod-role-chips-row" id="ur-pingRolesChips">
        ${(ur.pingRoles||[]).length ? _renderRoleChips(ur.pingRoles||[],'ur-ping') : '<span class="mod-chips-empty">+ No roles added</span>'}
      </div>
      ${_renderRolePicker('ur-pingRoleAdd','Add role',_guildRoles,ur.pingRoles||[])}
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">User notifications</h4>
      </div>
      ${_notifRow('ur-notifyCreate','Notify on report created','Confirm to the reporter that their report was submitted.',!!ur.notifyOnCreate)}
      ${_notifRow('ur-notifyUpdate','Notify on report updated','DM the reporter when their report status changes.',ur.notifyOnUpdate!==false)}
    </div>
    <div class="mod-section-card" style="margin-top:0.75rem">
      <div class="mod-section-card-header">
        <h4 class="mod-section-card-title">Limits</h4>
      </div>
      <div class="modal-field" style="padding:0.5rem 1rem 0.25rem">
        <label class="modal-label">MAX OPEN REPORTS (server)</label>
        <input type="number" id="ur-maxServer" class="modal-input" style="max-width:120px" min="1" max="500" value="${ur.maxOpenPerServer||20}">
      </div>
      <div class="modal-field" style="padding:0.25rem 1rem 0.75rem">
        <label class="modal-label">MAX OPEN REPORTS (per user)</label>
        <input type="number" id="ur-maxUser" class="modal-input" style="max-width:120px" min="1" max="100" value="${ur.maxPerUser||5}">
      </div>
    </div>
    <div class="mod-save-row">
      <button class="btn btn-primary btn-sm" id="urSaveBtn">Save changes</button>
    </div>`;

  _bindPickerAdd(el, 'ur-pingRoleAdd', 'ur-pingRolesChips', 'ur-ping', 'role');
  _bindChipRemove(el, 'ur-ping', null, 'ur-pingRolesChips');
  if (window.refreshCustomSelects) window.refreshCustomSelects(el);

  el.querySelector('#urAddReasonFull')?.addEventListener('click', () => {
    const label = prompt('Enter reason label:');
    if (!label?.trim()) return;
    const reasons = _modConfig?.userReports?.predefinedReasons || [];
    reasons.push({ label: label.trim(), order: reasons.length });
    _patchModConfig({ 'userReports.predefinedReasons': reasons }).then(() => _renderUserReports());
  });

  el.querySelectorAll('.ur-reason-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const label = e.currentTarget.dataset.label;
      const reasons = (_modConfig?.userReports?.predefinedReasons||[]).filter(r => r.label !== label);
      _patchModConfig({ 'userReports.predefinedReasons': reasons }).then(() => _renderUserReports());
    });
  });

  el.querySelector('#urSaveBtn')?.addEventListener('click', async () => {
    const get  = (id) => !!el.querySelector('#'+id)?.checked;
    const val  = (id) => el.querySelector('#'+id)?.value || '';
    const pingIds = [...el.querySelectorAll('.mod-chip[data-group="ur-ping"]')].map(c => c.dataset.id);
    await _patchModConfig({
      userReports: {
        ...(_modConfig?.userReports || {}),
        reportChannelId:  val('ur-channelId') || null,
        slashCommand:     get('ur-slash'),
        slashCommandName: val('ur-slashName'),
        userContext:      get('ur-userCtx'),
        userContextName:  val('ur-userCtxName'),
        msgContext:       get('ur-msgCtx'),
        msgContextName:   val('ur-msgCtxName'),
        allowCustomReason:get('ur-allowCustomReason'),
        pingRoles:        pingIds,
        notifyOnCreate:   get('ur-notifyCreate'),
        notifyOnUpdate:   get('ur-notifyUpdate'),
        maxOpenPerServer: parseInt(val('ur-maxServer')||'20',10),
        maxPerUser:       parseInt(val('ur-maxUser')||'5',10),
      }
    });
    _toast('User report settings saved');
  });
}

/* ── User Reports Wizard ──────────────────────────────────── */
let _urWizardStep = 0;

function _openUserReportsWizard() {
  _urWizardStep = 0;
  _urShowStep(0);

  // Populate step 3 channel picker
  const chWrap = document.getElementById('urChannelPickerWrap');
  if (chWrap) {
    chWrap.innerHTML = _renderChannelPicker('urWizardChannelId', 'Select a channel…', _guildChannels, []);
    if (window.refreshCustomSelects) window.refreshCustomSelects(chWrap);
  }

  // Populate step 4 role picker
  const roleWrap = document.getElementById('urPingRolesWrap');
  if (roleWrap) {
    roleWrap.innerHTML = `
      <div class="mod-role-chips-row" id="urPingRolesChipsWizard"></div>
      ${_renderRolePicker('urPingRoleAddWizard','Add role',_guildRoles,[])}`;
    _bindPickerAdd(roleWrap, 'urPingRoleAddWizard', 'urPingRolesChipsWizard', 'ur-ping-wiz', 'role');
    if (window.refreshCustomSelects) window.refreshCustomSelects(roleWrap);
  }

  _openModal('userReportsWizardModal');
}

function _urShowStep(n) {
  document.querySelectorAll('#urWizardCard .ur-wizard-step').forEach(s => {
    s.style.display = +s.dataset.step === n ? '' : 'none';
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#urWizardStart')) { _urWizardStep=1; _urShowStep(1); return; }
  if (e.target.closest('.ur-wizard-next')) { _urWizardStep++; _urShowStep(_urWizardStep); return; }
  if (e.target.closest('.ur-wizard-prev')) { _urWizardStep=Math.max(0,_urWizardStep-1); _urShowStep(_urWizardStep); return; }
  if (e.target.closest('#urWizardFinish')) { _urFinishWizard(); return; }
  if (e.target.closest('#urAddReason')) {
    const label = prompt('Reason label:');
    if (!label?.trim()) return;
    const list = document.getElementById('urReasonsList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ur-reason-row';
    row.innerHTML = `<span class="ur-reason-label">${_esc(label.trim())}</span>
      <button class="btn-icon-ghost ur-reason-delete" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>`;
    row.querySelector('.ur-reason-delete').addEventListener('click', () => row.remove());
    list.querySelector('.mod-empty-state')?.remove();
    list.appendChild(row);
  }
});

async function _urFinishWizard() {
  const get = (id) => !!document.querySelector('#'+id)?.checked;
  const val = (id) => document.querySelector('#'+id)?.value || '';
  const reasonLabels = [...document.querySelectorAll('#urReasonsList .ur-reason-label')].map((el,i) => ({ label: el.textContent.trim(), order: i }));
  const channelId    = val('urWizardChannelId') || null;
  const pingRoles    = [...document.querySelectorAll('#urPingRolesChipsWizard .mod-chip')].map(c => c.dataset.id);
  const res = await _patchModConfig({
    userReports: {
      enabled:           true,
      reportChannelId:   channelId,
      pingRoles:         pingRoles,
      slashCommand:      get('urWaySlash'),
      slashCommandName:  val('urWaySlashName'),
      userContext:       get('urWayUserCtx'),
      userContextName:   val('urWayUserCtxName'),
      msgContext:        get('urWayMsgCtx'),
      msgContextName:    val('urWayMsgCtxName'),
      reactions:         get('urWayReaction'),
      allowCustomReason: get('urAllowCustomReason'),
      predefinedReasons: reasonLabels,
    }
  });
  if (res) {
    _closeModal('userReportsWizardModal');
    _updateUserReportsCard();
    _toast('User reports enabled!');
  }
}

/* ── Modal helpers ────────────────────────────────────────── */
function _openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('modal-overlay--show'));
}

function _closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('modal-overlay--show');
  setTimeout(() => { el.style.display = 'none'; }, 200);
}

function _bindModals() {
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-modal]');
    if (closeBtn && !closeBtn.classList.contains('mod-settings-row') && !closeBtn.classList.contains('punish-type-row')) {
      _closeModal(closeBtn.dataset.modal); return;
    }
    if (e.target.classList.contains('modal-overlay') && e.target.id) {
      _closeModal(e.target.id);
    }
  });

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('#appealQTypeTabs .mod-type-tab');
    if (!tab) return;
    document.querySelectorAll('#appealQTypeTabs .mod-type-tab').forEach(t => t.classList.toggle('active', t === tab));
  });

  document.getElementById('addAppealQSave')?.addEventListener('click', async () => {
    const label    = document.getElementById('appealQLabel')?.value.trim();
    const type     = document.querySelector('#appealQTypeTabs .mod-type-tab.active')?.dataset.type || 'textarea';
    const required = !!document.getElementById('appealQRequired')?.checked;
    if (!label) { _toast('Please enter a question label.','error'); return; }
    const res = await fetch(MODCONFIG_API('/modconfig/appeals/questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, type, required }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (_modConfig?.appeals) _modConfig.appeals.questions = updated;
      _closeModal('addAppealQModal');
      _renderAppeals();
      _toast('Question added');
    }
  });

  const aliasInput = document.getElementById('aliasTagInput');
  if (aliasInput) {
    aliasInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = aliasInput.value.trim().replace(/,/g,'');
        if (v) { _addAliasTag(v); aliasInput.value = ''; }
      }
      if (e.key === 'Backspace' && !aliasInput.value) {
        document.querySelector('#aliasTagsList .alias-tag:last-child')?.remove();
      }
    });
  }
}

function _addAliasTag(value) {
  const list = document.getElementById('aliasTagsList');
  if (!list) return;
  const tag = document.createElement('div');
  tag.className = 'alias-tag';
  tag.dataset.value = value;
  tag.innerHTML = `${_esc(value)}<button class="alias-tag-remove" type="button" aria-label="Remove">×</button>`;
  tag.querySelector('.alias-tag-remove').addEventListener('click', () => tag.remove());
  list.appendChild(tag);
}

function _clearAliasInput() {
  const list = document.getElementById('aliasTagsList');
  if (list) list.innerHTML = '';
  const input = document.getElementById('aliasTagInput');
  if (input) input.value = '';
}

/* ── Chip helpers ─────────────────────────────────────────── */
function _renderRoleChips(roleIds, group) {
  return roleIds.map(id => {
    const role  = _guildRoles.find(r => r.id === id);
    const name  = role ? role.name : id;
    const color = role?.color ? '#'+role.color.toString(16).padStart(6,'0') : null;
    return `<div class="mod-chip mod-chip--role" data-id="${id}" data-group="${group}">
      ${color ? `<span class="mod-chip-dot" style="background:${color}"></span>` : ''}
      @${_esc(name)}<button class="mod-chip-remove" title="Remove">×</button>
    </div>`;
  }).join('');
}

function _renderChannelChips(channelIds, group) {
  return channelIds.map(id => {
    const ch = _guildChannels.find(c => c.id === id);
    return `<div class="mod-chip mod-chip--channel" data-id="${id}" data-group="${group}">
      #${_esc(ch?.name||id)}<button class="mod-chip-remove" title="Remove">×</button>
    </div>`;
  }).join('');
}

function _renderRolePicker(pickerId, placeholder, roles, existing) {
  const available = roles.filter(r => !existing.includes(r.id));
  return `<select class="mod-picker-select" id="${pickerId}" data-cs data-cs-placeholder="${placeholder}">
    <option value="">${placeholder}</option>
    ${available.map(r => `<option value="${r.id}">@${_esc(r.name)}</option>`).join('')}
  </select>`;
}

function _renderChannelPicker(pickerId, placeholder, channels, existing) {
  const available = channels.filter(c => c.type === 0 && !existing.includes(c.id));
  return `<select class="mod-picker-select" id="${pickerId}" data-cs data-cs-placeholder="${placeholder}">
    <option value="">${placeholder}</option>
    ${available.map(c => `<option value="${c.id}">#${_esc(c.name)}</option>`).join('')}
  </select>`;
}

function _bindPickerAdd(container, pickerId, chipsId, group, type) {
  const picker = container?.querySelector ? container.querySelector('#'+pickerId) : document.getElementById(pickerId);
  if (!picker) return;
  picker.addEventListener('change', () => {
    const id = picker.value;
    if (!id) return;
    const chipsEl = document.getElementById(chipsId);
    if (!chipsEl || chipsEl.querySelector(`.mod-chip[data-id="${id}"]`)) { picker.value=''; return; }
    const item  = type === 'role' ? _guildRoles.find(r=>r.id===id) : _guildChannels.find(c=>c.id===id);
    const chip  = document.createElement('div');
    chip.className = `mod-chip mod-chip--${type}`;
    chip.dataset.id    = id;
    chip.dataset.group = group;
    if (type === 'role' && item?.color) {
      const color = '#'+item.color.toString(16).padStart(6,'0');
      chip.innerHTML = `<span class="mod-chip-dot" style="background:${color}"></span>@${_esc(item?.name||id)}<button class="mod-chip-remove" title="Remove">×</button>`;
    } else {
      chip.innerHTML = `${type==='channel'?'#':'@'}${_esc(item?.name||id)}<button class="mod-chip-remove" title="Remove">×</button>`;
    }
    chipsEl.querySelector('.mod-chips-empty')?.remove();
    chipsEl.appendChild(chip);
    chip.querySelector('.mod-chip-remove').addEventListener('click', () => chip.remove());
    picker.querySelector(`option[value="${id}"]`)?.remove();
    picker.value = '';
  });
}

function _bindChipRemove(container, group, onRemove, chipsId) {
  const el = chipsId ? document.getElementById(chipsId) : container;
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (!e.target.classList.contains('mod-chip-remove')) return;
    const chip = e.target.closest('.mod-chip');
    if (!chip) return;
    chip.remove();
    if (onRemove) {
      const remaining = [...(document.getElementById(chipsId) || el).querySelectorAll(`.mod-chip[data-group="${group}"]`)].map(c => c.dataset.id);
      onRemove(remaining);
    }
  });
}

/* ── Utility ──────────────────────────────────────────────── */
function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
