(function () {
  const shell = document.getElementById('appReviewShell');
  if (!shell) return;

  const guildId  = shell.dataset.guildId;
  const selectEl = document.getElementById('appReviewFormSelect'); // hidden native select
  const listEl   = document.getElementById('appReviewList');
  const detailEl = document.getElementById('appReviewDetail');
  const wrapEl   = document.getElementById('appReviewWrap');
  const cardsEl  = document.getElementById('appFormCards');

  let forms = [];
  let submissions = [];
  let activeSubmissionId = null;
  let activeFormId = null;

  document.addEventListener('DOMContentLoaded', init);

  // ── Step helpers ──────────────────────────────────────────
  function setStep(step) {
    document.getElementById('stepSelectApp')?.classList.toggle('active', step >= 1);
    document.getElementById('stepSelectSubmission')?.classList.toggle('active', step >= 2);
    document.getElementById('stepReviewDetail')?.classList.toggle('active', step >= 3);
  }

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    await loadForms();

    // Export button
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!activeFormId) return;
        window.location.href = `/api/guild/${guildId}/applications/${activeFormId}/export-csv`;
      });
    }

    // Auto-select from URL param
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('appId');
    if (initial && forms.some((f) => String(f._id) === initial)) {
      await selectForm(initial);
    }
  }

  // ── Load forms ────────────────────────────────────────────
  async function loadForms() {
    try {
      forms = await apiFetch(`/guild/${guildId}/applications/reviewable`);
      renderFormCards();
    } catch (err) {
      if (cardsEl) cardsEl.innerHTML = `<div class="commands-loading" style="color:#fca5a5">${escHtml(err.message)}</div>`;
    }
  }

  function renderFormCards() {
    if (!cardsEl) return;
    if (!forms.length) {
      cardsEl.innerHTML = '<div class="app-review-no-forms">No applications are available for review. Ask a server admin to create and share one.</div>';
      return;
    }
    cardsEl.innerHTML = forms.map((f) => `
      <div class="app-review-form-card" data-id="${f._id}">
        <div class="app-review-form-card-name">${escHtml(f.name)}</div>
        <div class="app-review-form-card-desc">${escHtml(f.description || 'No description')}</div>
        <div class="app-review-form-card-meta">
          <span class="app-review-form-card-status ${f.isActive ? 'open' : 'closed'}">${f.isActive ? 'Open' : 'Closed'}</span>
          <span>${f.stats?.totalSubmissions || 0} submission${(f.stats?.totalSubmissions || 0) !== 1 ? 's' : ''}</span>
        </div>
      </div>`).join('');

    cardsEl.querySelectorAll('.app-review-form-card').forEach((card) => {
      card.addEventListener('click', () => selectForm(card.dataset.id));
    });

    // Populate hidden select
    if (selectEl) {
      selectEl.innerHTML = '<option value="">Select an application…</option>' +
        forms.map((f) => `<option value="${f._id}">${escHtml(f.name)}</option>`).join('');
    }
  }

  async function selectForm(formId) {
    activeFormId = formId;
    if (selectEl) selectEl.value = formId;

    // Show submissions panel
    const pickerArea = document.getElementById('appFormPickerArea');
    if (pickerArea) pickerArea.style.display = 'none';
    if (wrapEl) wrapEl.style.display = '';

    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) exportBtn.style.display = '';

    setStep(2);
    await loadSubmissions(formId);
  }

  // ── Load submissions ──────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
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
      detailEl.innerHTML = '<div class="app-review-detail-empty"><p style="color:#fca5a5">Failed to load submissions.</p></div>';
    }
  }

  // ── Render list ───────────────────────────────────────────
  function renderList() {
    if (!submissions.length) {
      listEl.innerHTML = `
        <div class="app-review-list-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35;margin-bottom:0.5rem"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          <p>No submissions yet for this application.</p>
        </div>`;
      return;
    }

    const statusColors = { pending: '#67e8f9', in_review: '#fcd34d', approved: '#86efac', rejected: '#fca5a5' };

    listEl.innerHTML = `
      <div class="app-review-list-header">
        <span>${submissions.length} submission${submissions.length !== 1 ? 's' : ''}</span>
        <button class="btn btn-ghost btn-sm" id="backToFormsBtn">← Change form</button>
      </div>
      ${submissions.map((sub) => {
        const isActive = sub._id === activeSubmissionId;
        const color = statusColors[sub.status] || 'var(--text-2)';
        return `
          <article class="app-review-item ${isActive ? 'active' : ''}" data-id="${sub._id}">
            <div class="app-review-item-row">
              <strong class="app-review-item-name">${escHtml(sub.applicantUsername || 'Unknown')}</strong>
              <span class="app-review-item-status" style="color:${color}">${escHtml(sub.status || 'pending')}</span>
            </div>
            <div class="app-review-item-date">${new Date(sub.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</div>
          </article>`;
      }).join('')}`;

    listEl.querySelectorAll('.app-review-item').forEach((item) => {
      item.addEventListener('click', () => {
        activeSubmissionId = item.dataset.id;
        setStep(3);
        renderList();
        renderDetail();
      });
    });

    document.getElementById('backToFormsBtn')?.addEventListener('click', () => {
      const pickerArea = document.getElementById('appFormPickerArea');
      if (pickerArea) pickerArea.style.display = '';
      if (wrapEl) wrapEl.style.display = 'none';
      setStep(1);
      const exportBtn = document.getElementById('exportCsvBtn');
      if (exportBtn) exportBtn.style.display = 'none';
    });
  }

  // ── Render detail ─────────────────────────────────────────
  function renderDetail() {
    const sub = submissions.find((s) => s._id === activeSubmissionId);
    if (!sub) {
      detailEl.innerHTML = `
        <div class="app-review-detail-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          <p>Select a submission from the list to review it.</p>
        </div>`;
      return;
    }

    const statusOptions = ['pending', 'in_review', 'approved', 'rejected'].map((s) =>
      `<option value="${s}" ${sub.status === s ? 'selected' : ''}>${{ pending: 'Pending', in_review: 'In Review', approved: 'Approved', rejected: 'Rejected' }[s]}</option>`
    ).join('');

    const answersHtml = (sub.answers || []).map((ans) => `
      <div class="app-review-answer">
        <div class="app-review-answer-label">${escHtml(ans.label || 'Question')}</div>
        <div class="app-review-answer-value">${escHtml(ans.value || '—')}</div>
      </div>`).join('');

    detailEl.innerHTML = `
      <div class="app-review-detail-head">
        <div>
          <div class="app-review-detail-name">${escHtml(sub.applicantUsername || 'Unknown User')}</div>
          <div class="app-review-detail-uid">User ID: ${escHtml(sub.applicantUserId || '—')}</div>
        </div>
        <div class="app-review-detail-meta">
          <span class="app-review-detail-date">Submitted ${new Date(sub.createdAt).toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' })}</span>
          ${sub.reviewedAt ? `<span class="app-review-detail-reviewed">Reviewed ${new Date(sub.reviewedAt).toLocaleDateString()}</span>` : ''}
        </div>
      </div>

      <div class="app-review-detail-actions-row">
        <div class="app-review-detail-status-wrap">
          <label class="app-review-detail-label">Status</label>
          <select id="reviewStatus" class="app-review-status-select">${statusOptions}</select>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-danger btn-sm" id="reviewDeleteBtn">Delete</button>
          <button class="btn btn-primary btn-sm" id="reviewSaveBtn">Save Review</button>
        </div>
      </div>

      <div class="app-review-detail-note">
        <label class="app-review-detail-label">Review Note</label>
        <textarea id="reviewNote" class="app-review-note-input" rows="3" maxlength="2000"
          placeholder="Add an internal review note (not sent to applicant)…">${escHtml(sub.reviewNote || '')}</textarea>
      </div>

      <div class="app-review-answers">${answersHtml || '<p style="color:var(--text-2);font-size:0.85rem">No answers recorded.</p>'}</div>`;

    document.getElementById('reviewSaveBtn')?.addEventListener('click', () => saveReview(sub));
    document.getElementById('reviewDeleteBtn')?.addEventListener('click', () => deleteSubmission(sub));
  }

  // ── Save / delete ─────────────────────────────────────────
  async function saveReview(sub) {
    const status     = document.getElementById('reviewStatus')?.value;
    const reviewNote = document.getElementById('reviewNote')?.value || '';
    const btn        = document.getElementById('reviewSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const updated = await apiFetch(`/guild/${guildId}/applications/${activeFormId}/submissions/${sub._id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNote }),
      });
      const idx = submissions.findIndex((s) => s._id === sub._id);
      if (idx !== -1) submissions[idx] = updated;
      renderList();
      renderDetail();
      window.showToast?.('Review saved.', 'success');
    } catch (err) {
      window.showToast?.('Failed to save: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Review'; }
    }
  }

  async function deleteSubmission(sub) {
    if (!await window.showConfirm?.(`Delete submission from ${sub.applicantUsername}? This cannot be undone.`,
      { title: 'Delete Submission', confirmText: 'Delete' })) return;
    const btn = document.getElementById('reviewDeleteBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    try {
      await apiFetch(`/guild/${guildId}/applications/${activeFormId}/submissions/${sub._id}`, { method: 'DELETE' });
      submissions = submissions.filter((s) => s._id !== sub._id);
      activeSubmissionId = submissions[0]?._id || null;
      renderList();
      renderDetail();
      window.showToast?.('Submission deleted.', 'success');
    } catch (err) {
      window.showToast?.('Failed to delete: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
    }
  }

  // ── Utilities ─────────────────────────────────────────────
  function escHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();

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
      const exportBtn = document.getElementById('exportCsvBtn');
      if (!selectEl.value) {
        submissions = [];
        renderList();
        renderDetail();
        if (exportBtn) exportBtn.style.display = 'none';
        return;
      }
      if (exportBtn) exportBtn.style.display = '';
      await loadSubmissions(selectEl.value);
    });

    // CSV export
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const appId = selectEl.value;
        if (!appId) return;
        window.location.href = `/api/guild/${guildId}/applications/${appId}/export-csv`;
      });
    }
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

      <div style="margin:10px 0 16px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button class="btn btn-danger" id="reviewDeleteBtn">Delete Submission</button>
        <button class="btn btn-primary" id="reviewSaveBtn">Save Review</button>
      </div>

      <div>${answersHtml}</div>
    `;

    const saveBtn = document.getElementById('reviewSaveBtn');
    saveBtn?.addEventListener('click', () => saveReview(sub));

    const deleteBtn = document.getElementById('reviewDeleteBtn');
    deleteBtn?.addEventListener('click', () => deleteSubmission(sub));
  }

  async function deleteSubmission(sub) {
    const applicationId = selectEl.value;
    if (!applicationId) return;

    if (!await window.showConfirm(`Delete this submission from ${sub.applicantUsername}? This cannot be undone.`, { title: 'Delete Submission', confirmText: 'Delete' })) return;

    const btn = document.getElementById('reviewDeleteBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }

    try {
      await apiFetch(`/guild/${guildId}/applications/${applicationId}/submissions/${sub._id}`, { method: 'DELETE' });
      submissions = submissions.filter((s) => s._id !== sub._id);
      activeSubmissionId = submissions[0]?._id || null;
      renderList();
      renderDetail();
    } catch (err) {
      window.showToast?.(`Failed to delete: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Delete Submission'; }
    }
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
      window.showToast?.(`Failed to save review: ${err.message}`, 'error');
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


