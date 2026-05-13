'use strict';
/* ── notes.js — Per-User Notes Viewer ────────────────────── */

window.NotesModule = (() => {
  let guildId = null;
  let notes = [];

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    try { return new Date(d).toLocaleString(); } catch { return '—'; }
  }

  function renderNotes(data) {
    const list = document.getElementById('notesList');
    const emptyEl = document.getElementById('notesEmpty');
    if (!list) return;
    if (!data.length) {
      list.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    list.innerHTML = data.map(n => `
      <div class="note-card" data-note-id="${n._id}">
        <div class="note-card-head">
          <div class="note-target">
            <span class="note-target-name">${escHtml(n.targetTag || 'Unknown User')}</span>
            <span class="note-target-id">${escHtml(n.targetUserId)}</span>
          </div>
          <div class="note-meta">
            <span class="note-by">by ${escHtml(n.addedByTag || n.addedBy)}</span>
            <span class="note-date">${fmtDate(n.createdAt)}</span>
          </div>
        </div>
        <div class="note-content">${escHtml(n.content)}</div>
        ${n.caseId ? `<a class="note-case-link" href="#" data-case="${escHtml(n.caseId)}">Case #${escHtml(n.caseId)}</a>` : ''}
        <div class="note-actions">
          <button class="btn btn-danger btn-sm" data-delete-note="${n._id}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function load(userId = '') {
    const list = document.getElementById('notesList');
    if (list) list.innerHTML = '<div class="notes-empty">Loading…</div>';
    try {
      const params = new URLSearchParams();
      if (userId && /^\d+$/.test(userId)) params.set('userId', userId);
      const res = await fetch(`/api/guild/${guildId}/notes?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load notes');
      notes = data.notes || [];
      renderNotes(notes);
    } catch (err) {
      if (list) list.innerHTML = `<div class="notes-empty" style="color:#ed4245">Error: ${escHtml(err.message)}</div>`;
    }
  }

  async function addNote() {
    const userId = document.getElementById('noteUserId')?.value?.trim();
    const content = document.getElementById('noteContent')?.value?.trim();
    const caseId = document.getElementById('noteCaseId')?.value?.trim();

    if (!userId || !/^\d+$/.test(userId)) { showToast('Enter a valid user ID', 'error'); return; }
    if (!content) { showToast('Note content is required', 'error'); return; }

    const btn = document.getElementById('addNoteBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const res = await fetch(`/api/guild/${guildId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, content, caseId: caseId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      showToast('Note added', 'success');
      document.getElementById('noteUserId').value = '';
      document.getElementById('noteContent').value = '';
      if (document.getElementById('noteCaseId')) document.getElementById('noteCaseId').value = '';
      // Reload notes for this user
      load(document.getElementById('noteSearchId')?.value?.trim() || '');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add Note'; }
    }
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/notes/${noteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      showToast('Note deleted', 'success');
      notes = notes.filter(n => n._id !== noteId);
      renderNotes(notes);
    } catch (err) {
      showToast(err.message, 'error');
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
      if (e.detail?.section === 'notes') load();
    });

    // Search
    const searchBtn = document.getElementById('notesSearchBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const userId = document.getElementById('noteSearchId')?.value?.trim() || '';
        load(userId);
      });
    }

    // Add note
    const addBtn = document.getElementById('addNoteBtn');
    if (addBtn) addBtn.addEventListener('click', addNote);

    // Delete note (delegated)
    const notesList = document.getElementById('notesList');
    if (notesList) {
      notesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-delete-note]');
        if (btn) deleteNote(btn.dataset.deleteNote);
        const caseLink = e.target.closest('[data-case]');
        if (caseLink) {
          e.preventDefault();
          // Navigate to cases section with this case ID
          const caseId = caseLink.dataset.case;
          const caseBtn = document.querySelector('[data-section="cases"]');
          if (caseBtn) {
            caseBtn.click();
            // Set search after navigation
            setTimeout(() => {
              const searchInput = document.getElementById('caseSearch');
              if (searchInput) { searchInput.value = `#${caseId}`; searchInput.dispatchEvent(new Event('input')); }
            }, 300);
          }
        }
      });
    }
  }

  return { init, load };
})();

document.addEventListener('DOMContentLoaded', () => {
  const pd = document.getElementById('pageData');
  if (pd?.dataset?.guildId) NotesModule.init(pd.dataset.guildId);
});
