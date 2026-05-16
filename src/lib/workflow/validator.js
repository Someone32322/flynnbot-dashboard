'use strict';

/**
 * workflow/validator.js — Server-side Workflow Validator
 *
 * Validates a plain workflow object (parsed JSON from the client or DB).
 * Does NOT touch the database.  Used by:
 *   - POST /api/guild/:id/workflows
 *   - PATCH /api/guild/:id/workflows/:wfId
 *   - POST /api/guild/:id/workflows/:wfId/validate
 */

const { TRIGGER_TYPES, LIMITS, BUILTIN_VARS } = require('./types');
const { ALLOWED_TYPES, getBlock }              = require('./registry');

const MAX_ERRORS      = 30;   // stop collecting after this many — client gets the picture
const VAR_NAME_RE     = /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/;
const WF_NAME_RE      = /^[a-z0-9_-]{1,50}$/;
const HTTPS_RE        = /^https:\/\//i;
const ALLOWED_TRIGGER = new Set(Object.values(TRIGGER_TYPES));

class WorkflowValidator {

  /**
   * Validate a workflow object.
   * @param {object} wf  Raw workflow fields (e.g. req.body)
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(wf) {
    const errors = [];
    if (!wf || typeof wf !== 'object') {
      return { valid: false, errors: ['Workflow must be an object.'] };
    }

    this._validateName(wf, errors);
    this._validateTrigger(wf.trigger, errors);
    this._validatePermissions(wf.permissions, errors);
    this._validateVariables(wf.variables, errors);
    this._validateBlocks(wf.blocks, errors, 0);

    return { valid: errors.length === 0, errors };
  }

  // ── Name ──────────────────────────────────────────────────
  _validateName(wf, errors) {
    if (!wf.name) {
      errors.push('Workflow name is required.');
      return;
    }
    if (!WF_NAME_RE.test(wf.name)) {
      errors.push(`Workflow name "${wf.name}" is invalid. Use a-z, 0-9, hyphen, underscore, max 50 chars.`);
    }
    if (wf.description && wf.description.length > 200) {
      errors.push('Description cannot exceed 200 characters.');
    }
  }

  // ── Trigger ───────────────────────────────────────────────
  _validateTrigger(trigger, errors) {
    if (!trigger || typeof trigger !== 'object') {
      errors.push('A trigger is required.');
      return;
    }
    if (!trigger.type) {
      errors.push('Trigger type is required.');
      return;
    }
    if (!ALLOWED_TRIGGER.has(trigger.type)) {
      errors.push(`Unknown trigger type: "${trigger.type}".`);
      return;
    }

    // Types that need a value
    const needsValue = [
      TRIGGER_TYPES.SLASH_COMMAND,
      TRIGGER_TYPES.PREFIX_COMMAND,
      TRIGGER_TYPES.CONTAINS,
      TRIGGER_TYPES.EXACT_MATCH,
      TRIGGER_TYPES.REGEX,
    ];
    if (needsValue.includes(trigger.type)) {
      if (!trigger.value || typeof trigger.value !== 'string' || !trigger.value.trim()) {
        errors.push(`Trigger type "${trigger.type}" requires a trigger value.`);
      } else if (trigger.value.length > 100) {
        errors.push('Trigger value cannot exceed 100 characters.');
      }
    }

    // Regex safety
    if (trigger.type === TRIGGER_TYPES.REGEX && trigger.value) {
      try {
        new RegExp(trigger.value); // eslint-disable-line no-new
      } catch {
        errors.push(`Trigger regex is invalid: ${trigger.value}`);
      }
    }
  }

  // ── Permissions ───────────────────────────────────────────
  _validatePermissions(perms, errors) {
    if (!perms) return; // optional

    if (perms.cooldownSeconds !== undefined) {
      const c = Number(perms.cooldownSeconds);
      if (!Number.isFinite(c) || c < 0 || c > 86400) {
        errors.push('cooldownSeconds must be between 0 and 86400 (24 hours).');
      }
    }
  }

  // ── Workflow Variables ────────────────────────────────────
  _validateVariables(vars, errors) {
    if (!vars) return;
    if (!Array.isArray(vars)) {
      errors.push('Workflow variables must be an array.');
      return;
    }
    const seen = new Set();
    for (const v of vars) {
      if (!v.name) { errors.push('A workflow variable is missing its name.'); continue; }
      if (!VAR_NAME_RE.test(v.name)) {
        errors.push(`Variable name "${v.name}" is invalid. Start with a letter/underscore, a-z0-9_. max 32.`);
      }
      if (BUILTIN_VARS.has(v.name)) {
        errors.push(`Variable name "${v.name}" is reserved. Choose a different name.`);
      }
      if (seen.has(v.name)) {
        errors.push(`Duplicate workflow variable name: "${v.name}".`);
      }
      seen.add(v.name);
    }
  }

  // ── Blocks (recursive) ────────────────────────────────────
  _validateBlocks(blocks, errors, depth) {
    if (!Array.isArray(blocks)) {
      if (blocks !== undefined && blocks !== null) {
        errors.push('Blocks must be an array.');
      }
      return;
    }
    if (depth === 0 && blocks.length > LIMITS.MAX_BLOCKS) {
      errors.push(`Too many blocks (max ${LIMITS.MAX_BLOCKS}).`);
    }
    if (depth > LIMITS.MAX_NESTING_DEPTH) {
      errors.push(`Block nesting too deep (max depth ${LIMITS.MAX_NESTING_DEPTH}).`);
      return;
    }

    for (let i = 0; i < blocks.length; i++) {
      if (errors.length >= MAX_ERRORS) return;
      this._validateBlock(blocks[i], errors, depth, i);
    }
  }

  _validateBlock(block, errors, depth, index) {
    const label = `Block[${index}]`;

    if (!block || typeof block !== 'object') {
      errors.push(`${label} is not an object.`);
      return;
    }
    if (!block.type) {
      errors.push(`${label} is missing a type.`);
      return;
    }
    if (!ALLOWED_TYPES.has(block.type)) {
      errors.push(`${label}: Unknown block type "${block.type}".`);
      return;
    }

    const def = getBlock(block.type);
    const data = block.data || {};

    // Run per-block custom validator
    if (typeof def.validate === 'function') {
      const err = def.validate(data);
      if (err) errors.push(`${label} (${block.type}): ${err}`);
    }

    // Check required fields
    for (const field of (def.fields || [])) {
      if (!field.required) continue;
      const val = data[field.key];
      if (val === undefined || val === null || val === '') {
        errors.push(`${label} (${block.type}): field "${field.label || field.key}" is required.`);
      }
    }

    // Validate URLs for text fields containing https:// checks
    for (const field of (def.fields || [])) {
      if (field.type !== 'text' && field.type !== 'textarea') continue;
      const val = data[field.key];
      if (typeof val === 'string' && val.trim().startsWith('http')) {
        if (!HTTPS_RE.test(val.trim())) {
          errors.push(`${label} (${block.type}): field "${field.label || field.key}" URL must start with https://`);
        }
      }
    }

    // Variable names inside set_variable / get_variable
    if (block.type === 'set_variable' && data.var_name) {
      if (!VAR_NAME_RE.test(data.var_name)) {
        errors.push(`${label}: Variable name "${data.var_name}" must start with a letter/underscore, a-z0-9_, max 32.`);
      }
      if (BUILTIN_VARS.has(data.var_name)) {
        errors.push(`${label}: Cannot assign to built-in variable "${data.var_name}".`);
      }
    }

    // Delay limit
    if (block.type === 'delay' && data.ms !== undefined) {
      const ms = Number(data.ms);
      if (!Number.isFinite(ms) || ms < 100 || ms > LIMITS.MAX_DELAY_MS) {
        errors.push(`${label} (delay): ms must be between 100 and ${LIMITS.MAX_DELAY_MS}.`);
      }
    }

    // Loop iterations limit
    if (block.type === 'loop_times' && data.times !== undefined) {
      const t = Number(data.times);
      if (!Number.isFinite(t) || t < 1 || t > LIMITS.MAX_LOOP_ITERATIONS) {
        errors.push(`${label} (loop_times): times must be between 1 and ${LIMITS.MAX_LOOP_ITERATIONS}.`);
      }
    }

    // Recurse into nested block arrays
    if (def.maxNested) {
      if (block.type === 'condition_if') {
        this._validateBlocks(data.if_blocks,   errors, depth + 1);
        this._validateBlocks(data.else_blocks,  errors, depth + 1);
      }
      if (block.type === 'loop_times') {
        this._validateBlocks(data.loop_blocks, errors, depth + 1);
      }
    }
  }
}

module.exports = WorkflowValidator;
