(function () {
  const shell = document.getElementById('appReviewShell');
  if (!shell) return;

  const guildId = shell.dataset.guildId;
  const selectEl = document.getElementById('appReviewFormSelect');
  const listEl = document.getElementById('appReviewList');
  const detailEl = document.getElementById('appReviewDetail');

  let forms = [];
  let submissions = [];
  let activeSubmissionId = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadForms();

    const params = new URLSearchParams(window.location.search);
    const initial = params.get('appId');
    if (initial && forms.some((f) => String(f._id) === initial)) {
      selectEl.value = initial;
      await loadSubmissions(initial);
    }

    selectEl.addEventListener('change', async () => {
      activeSubmissionId = null;
      if (!selectEl.value) {
        submissions = [];
        renderList();
        renderDetail();
        return;
      }
      await loadSubmissions(selectEl.value);
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

  async function loadForms() {
    try {
      forms = await apiFetch(`/guild/${guildId}/applications/reviewable`);
      renderForms();
    } catch (err) {
      listEl.innerHTML = `<div class="commands-loading" style="color:#fca5a5">${escHtml(err.message)}</div>`;
    }
  }

  function renderForms() {
    const options = forms.map((f) => `<option value="${f._id}">${escHtml(f.name)}</option>`).join('');
    selectEl.innerHTML = '<option value="">Select an application…</option>' + options;
  }

  async function loadSubmissions(applicationId) {
    try {
      listEl.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading submissions…</div>';
      submissions = await apiFetch(`/guild/${guildId}/applications/${applicationId}/submissions`);
      activeSubmissionId = submissions[0]?._id || null;
      renderList();
      renderDetail();
    } catch (err) {
      listEl.innerHTML = `<div class="commands-loading" style="color:#fca5a5">${escHtml(err.message)}</div>`;
      detailEl.innerHTML = '<div class="commands-loading" style="color:#fca5a5">Failed to load submission details.</div>';
    }
  }

  function renderList() {
    if (!submissions.length) {
      listEl.innerHTML = '<div class="commands-loading" style="color:var(--text-2)">No submissions found for this application.</div>';
      return;
    }

    listEl.innerHTML = submissions.map((sub) => {
      const isActive = sub._id === activeSubmissionId;
      return `
        <article class="app-review-item ${isActive ? 'active' : ''}" data-id="${sub._id}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
            <strong>${escHtml(sub.applicantUsername)}</strong>
            <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;color:#67e8f9">${escHtml(sub.status)}</span>
          </div>
          <div style="font-size:0.78rem;color:var(--text-3);margin-top:5px">${new Date(sub.createdAt).toLocaleString()}</div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('.app-review-item').forEach((item) => {
      item.addEventListener('click', () => {
        activeSubmissionId = item.dataset.id;
        renderList();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    const sub = submissions.find((s) => s._id === activeSubmissionId);
    if (!sub) {
      detailEl.innerHTML = '<div class="commands-loading" style="color:var(--text-2)">Select a submission to review.</div>';
      return;
    }

    const answersHtml = (sub.answers || []).map((ans) => `
      <div class="app-review-answer">
        <div style="font-size:0.8rem;color:var(--text-3)">${escHtml(ans.label)}</div>
        <div style="margin-top:4px;white-space:pre-wrap">${escHtml(ans.value || '—')}</div>
      </div>
    `).join('');

    detailEl.innerHTML = `
      <h3 style="margin-bottom:5px">${escHtml(sub.applicantUsername)}</h3>
      <div style="font-size:0.82rem;color:var(--text-3);margin-bottom:10px">User ID: ${escHtml(sub.applicantUserId)}</div>

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px">
        <label class="rr-label">Status
          <select id="reviewStatus">
            <option value="pending" ${sub.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in_review" ${sub.status === 'in_review' ? 'selected' : ''}>In Review</option>
            <option value="approved" ${sub.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${sub.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </label>
        <label class="rr-label">Reviewed At
          <input type="text" disabled value="${sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleString() : 'Not reviewed'}">
        </label>
      </div>

      <label class="rr-label">Review Note
        <textarea id="reviewNote" rows="4" maxlength="2000" placeholder="Add a note for audit trail…">${escHtml(sub.reviewNote || '')}</textarea>
      </label>

      <div style="margin:10px 0 16px;display:flex;justify-content:flex-end">
        <button class="btn btn-primary" id="reviewSaveBtn">Save Review</button>
      </div>

      <div>${answersHtml}</div>
    `;

    const saveBtn = document.getElementById('reviewSaveBtn');
    saveBtn?.addEventListener('click', () => saveReview(sub));
  }

  async function saveReview(sub) {
    const applicationId = selectEl.value;
    if (!applicationId) return;

    const status = document.getElementById('reviewStatus')?.value;
    const reviewNote = document.getElementById('reviewNote')?.value || '';

    const btn = document.getElementById('reviewSaveBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }

    try {
      const updated = await apiFetch(`/guild/${guildId}/applications/${applicationId}/submissions/${sub._id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNote }),
      });

      const idx = submissions.findIndex((s) => s._id === sub._id);
      if (idx !== -1) submissions[idx] = updated;
      renderList();
      renderDetail();
    } catch (err) {
      alert(`Failed to save review: ${err.message}`);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save Review';
      }
    }
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
