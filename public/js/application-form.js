(function () {
  const shell = document.getElementById('applicationShell');
  if (!shell) return;

  const guildId = shell.dataset.guildId;
  const applicationId = shell.dataset.applicationId;

  const titleEl = document.getElementById('appPublicTitle');
  const descEl = document.getElementById('appPublicDesc');
  const formEl = document.getElementById('appPublicForm');
  const statusEl = document.getElementById('appPublicStatus');

  let formConfig = null;

  document.addEventListener('DOMContentLoaded', loadApplication);

  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadApplication() {
    try {
      formConfig = await apiFetch(`/applications/public/${guildId}/${applicationId}`);
      render();
    } catch (err) {
      titleEl.textContent = 'Application unavailable';
      descEl.textContent = err.message;
      formEl.innerHTML = '';
    }
  }

  function render() {
    titleEl.textContent = formConfig.name;
    descEl.textContent = formConfig.description || 'Complete the form below.';

    shell.style.setProperty('--app-accent', formConfig.style?.accent || '#22d3ee');
    shell.style.setProperty('--app-gradient-a', formConfig.style?.gradientA || '#0b1028');
    shell.style.setProperty('--app-gradient-b', formConfig.style?.gradientB || '#172554');
    shell.style.setProperty('--app-radius', `${formConfig.style?.cardRadius || 18}px`);
    shell.dataset.animPreset = formConfig.style?.animationPreset || 'wave';

    formEl.innerHTML = '';

    (formConfig.fields || []).forEach((field, idx) => {
      const card = document.createElement('section');
      card.className = 'app-public-card';
      card.style.animationDelay = `${idx * 0.03}s`;

      if (field.type === 'section') {
        card.classList.add('app-public-section', `app-public-section--${field.sectionStyle || 'accent'}`);
        const title = document.createElement('h3');
        title.className = 'app-public-section-title';
        title.textContent = field.label || 'Section';
        card.appendChild(title);
        if (field.helpText) {
          const sectionHelp = document.createElement('div');
          sectionHelp.className = 'app-public-section-help';
          sectionHelp.textContent = field.helpText;
          card.appendChild(sectionHelp);
        }
        formEl.appendChild(card);
        return;
      }

      const label = document.createElement('label');
      label.className = 'app-public-label';
      label.htmlFor = `appField_${field.fieldId}`;
      label.textContent = `${field.label}${field.required ? ' *' : ''}`;

      card.appendChild(label);

      if (field.helpText) {
        const help = document.createElement('div');
        help.className = 'app-public-help';
        help.textContent = field.helpText;
        card.appendChild(help);
      }

      const input = buildInput(field);
      card.appendChild(input);
      formEl.appendChild(card);
    });

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary app-public-submit';
    submit.textContent = formConfig.submitButtonText || 'Submit Application';
    formEl.appendChild(submit);

    formEl.addEventListener('submit', handleSubmit);
  }

  function buildInput(field) {
    const id = `appField_${field.fieldId}`;

    if (field.type === 'textarea') {
      const el = document.createElement('textarea');
      el.className = 'app-public-textarea';
      el.id = id;
      el.name = field.fieldId;
      el.placeholder = field.placeholder || '';
      if (field.required) el.required = true;
      if (field.maxLength) el.maxLength = field.maxLength;
      if (field.minLength) el.minLength = field.minLength;
      return el;
    }

    if (field.type === 'select') {
      const el = document.createElement('select');
      el.className = 'app-public-select';
      el.id = id;
      el.name = field.fieldId;
      if (field.required) el.required = true;

      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Select an option';
      el.appendChild(blank);

      (field.options || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        el.appendChild(option);
      });
      return el;
    }

    if (field.type === 'boolean') {
      const wrap = document.createElement('div');
      wrap.className = 'app-public-card';
      wrap.style.padding = '10px';

      const yes = document.createElement('label');
      yes.innerHTML = `<input type="radio" name="${field.fieldId}" value="true" ${field.required ? 'required' : ''}> Yes`;
      const no = document.createElement('label');
      no.style.marginLeft = '12px';
      no.innerHTML = `<input type="radio" name="${field.fieldId}" value="false" ${field.required ? 'required' : ''}> No`;

      wrap.appendChild(yes);
      wrap.appendChild(no);
      return wrap;
    }

    const input = document.createElement('input');
    input.className = 'app-public-input';
    input.id = id;
    input.name = field.fieldId;
    input.type = field.type === 'number' ? 'number' : 'text';
    input.placeholder = field.placeholder || '';
    if (field.required) input.required = true;
    if (field.maxLength) input.maxLength = field.maxLength;
    if (field.minLength) input.minLength = field.minLength;
    return input;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    statusEl.textContent = '';

    const submitBtn = formEl.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      const answers = {};
      (formConfig.fields || []).forEach((field) => {
        if (field.type === 'section') return;
        const name = field.fieldId;
        if (field.type === 'boolean') {
          const checked = formEl.querySelector(`input[name="${cssEscape(name)}"]:checked`);
          answers[name] = checked ? checked.value : '';
          return;
        }
        const el = formEl.querySelector(`[name="${cssEscape(name)}"]`);
        answers[name] = el ? String(el.value || '').trim() : '';
      });

      const result = await apiFetch(`/applications/public/${guildId}/${applicationId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });

      statusEl.style.color = '#86efac';
      statusEl.textContent = result.message || formConfig.successMessage || 'Submitted successfully.';
      formEl.reset();
    } catch (err) {
      statusEl.style.color = '#fca5a5';
      statusEl.textContent = err.message;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = formConfig.submitButtonText || 'Submit Application';
      }
    }
  }

  function cssEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }
})();
