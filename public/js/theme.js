/**
 * theme.js — Theme dashboard section
 */

let _themeCfg = null;
let _themeInitDone = false;

async function initTheme(guildId) {
  if (_themeInitDone) return;
  _themeInitDone = true;
  await refreshTheme(guildId);
}

async function refreshTheme(guildId) {
  const container = document.getElementById('themeContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/theme`);
    if (!res.ok) throw new Error('Failed to load theme');
    _themeCfg = await res.json();
    renderTheme(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escT(e.message)}</div>`;
  }
}

function renderTheme(container, guildId) {
  const t = _themeCfg || {};
  container.innerHTML = `
    <div id="themeSaveStatus" class="save-status" style="display:none"></div>

    <div class="ec-card">
      <div class="ec-card-header"><h3>Embed Appearance</h3></div>
      <div class="ec-card-body">
        <div class="ec-grid-2">
          <label class="ec-field">
            <span>Embed Color</span>
            <input type="color" id="themeColor" class="ec-input" value="${escT(t.embedColor || '#0f52ba')}" style="height:38px;padding:0.25rem" />
          </label>
          <div></div>
          <label class="ec-field ec-toggle-row">
            <div class="toggle-switch"><input type="checkbox" id="themeTimestamp" ${t.showTimestamp !== false ? 'checked' : ''} /><span class="toggle-slider"></span></div>
            <span>Show Timestamp on Embeds</span>
          </label>
          <label class="ec-field ec-toggle-row">
            <div class="toggle-switch"><input type="checkbox" id="themeUseServerIcon" ${t.useServerIcon ? 'checked' : ''} /><span class="toggle-slider"></span></div>
            <span>Use Server Icon as Thumbnail</span>
          </label>
        </div>
      </div>
    </div>

    <div class="ec-card" style="margin-top:1rem">
      <div class="ec-card-header"><h3>Footer</h3></div>
      <div class="ec-card-body">
        <div class="ec-grid-2">
          <label class="ec-field" style="grid-column:1/-1"><span>Footer Text <small style="opacity:0.6">(max 200 chars)</small></span>
            <input type="text" id="themeFooterText" class="ec-input" maxlength="200" value="${escT(t.embedFooterText || '')}" placeholder="e.g. Flynn Bot • {server}" />
          </label>
          <label class="ec-field" style="grid-column:1/-1"><span>Footer Icon URL</span>
            <input type="url" id="themeFooterIcon" class="ec-input" value="${escT(t.embedFooterIconUrl || '')}" placeholder="https://example.com/icon.png" />
          </label>
        </div>
      </div>
    </div>

    <div class="ec-card" style="margin-top:1rem">
      <div class="ec-card-header"><h3>Author</h3></div>
      <div class="ec-card-body">
        <div class="ec-grid-2">
          <label class="ec-field" style="grid-column:1/-1"><span>Author Name <small style="opacity:0.6">(max 200 chars)</small></span>
            <input type="text" id="themeAuthorName" class="ec-input" maxlength="200" value="${escT(t.embedAuthorName || '')}" placeholder="Leave blank to disable" />
          </label>
          <label class="ec-field" style="grid-column:1/-1"><span>Author Icon URL</span>
            <input type="url" id="themeAuthorIcon" class="ec-input" value="${escT(t.embedAuthorIconUrl || '')}" placeholder="https://example.com/icon.png" />
          </label>
        </div>
      </div>
    </div>

    <div class="ec-card" style="margin-top:1rem">
      <div class="ec-card-header"><h3>Thumbnail</h3></div>
      <div class="ec-card-body">
        <label class="ec-field"><span>Thumbnail URL <small style="opacity:0.6">(overridden by "Use Server Icon" above)</small></span>
          <input type="url" id="themeThumbnailUrl" class="ec-input" value="${escT(t.thumbnailUrl || '')}" placeholder="https://example.com/thumb.png" />
        </label>
      </div>
    </div>

    <div class="ec-actions" style="margin-top:1rem">
      <button class="btn btn-primary" id="themeSaveBtn">Save Theme</button>
    </div>
  `;

  document.getElementById('themeSaveBtn')?.addEventListener('click', () => saveTheme(guildId));
}

async function saveTheme(guildId) {
  const btn = document.getElementById('themeSaveBtn');
  const status = document.getElementById('themeSaveStatus');
  btn.disabled = true;
  try {
    const body = {
      embedColor: document.getElementById('themeColor').value,
      showTimestamp: document.getElementById('themeTimestamp').checked,
      useServerIcon: document.getElementById('themeUseServerIcon').checked,
      embedFooterText: document.getElementById('themeFooterText').value.trim(),
      embedFooterIconUrl: document.getElementById('themeFooterIcon').value.trim(),
      embedAuthorName: document.getElementById('themeAuthorName').value.trim(),
      embedAuthorIconUrl: document.getElementById('themeAuthorIcon').value.trim(),
      thumbnailUrl: document.getElementById('themeThumbnailUrl').value.trim(),
    };
    const res = await fetch(`/api/guild/${guildId}/theme`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    _themeCfg = await res.json();
    setThemeSaveStatus(status, true);
  } catch (e) {
    setThemeSaveStatus(status, false, e.message);
  } finally {
    btn.disabled = false;
  }
}

function setThemeSaveStatus(el, ok, msg) {
  if (!el) return;
  el.style.display = '';
  el.className = `save-status ${ok ? 'save-ok' : 'save-error'}`;
  el.textContent = ok ? '✅ Theme saved!' : `❌ ${msg || 'Failed to save'}`;
  setTimeout(() => { if (el) el.style.display = 'none'; }, 4000);
}

function escT(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'theme') return;
    if (!_themeInitDone) initTheme(gId);
  });
});

window.initTheme = initTheme;
