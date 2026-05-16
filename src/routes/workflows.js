'use strict';

/**
 * routes/workflows.js — Workflow CRUD API
 *
 * All routes are mounted under /api by src/index.js:
 *   GET    /api/guild/:guildId/workflows
 *   POST   /api/guild/:guildId/workflows
 *   GET    /api/guild/:guildId/workflows/:workflowId
 *   PATCH  /api/guild/:guildId/workflows/:workflowId
 *   DELETE /api/guild/:guildId/workflows/:workflowId
 *   PATCH  /api/guild/:guildId/workflows/:workflowId/toggle
 *   POST   /api/guild/:guildId/workflows/:workflowId/validate
 *   POST   /api/guild/:guildId/workflows/:workflowId/duplicate
 *   GET    /api/workflow-blocks  (public registry for the editor UI)
 */

const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const Workflow          = require('../models/Workflow');
const WorkflowValidator = require('../lib/workflow/validator');
const { CATEGORY_META, getByCategory, getBlock, getDefaults } = require('../lib/workflow/registry');
const { LIMITS }        = require('../lib/workflow/types');

const validator = new WorkflowValidator();

// ── Auth guards (same pattern as api.js) ─────────────────────

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function hasAdmin(permissions) {
  try { return (BigInt(permissions) & 0x8n) !== 0n; } catch { return false; }
}

function requireGuildAdmin(req, res, next) {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID' });
  const guild = req.user.guilds?.find((g) => g.id === guildId && hasAdmin(g.permissions));
  if (!guild) return res.status(403).json({ error: 'Missing administrator permission' });
  req.userGuild = guild;
  return next();
}

// ── Helpers ───────────────────────────────────────────────────

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Sanitise the writable fields from req.body.
 * Only picks known fields — never allows injecting arbitrary keys.
 */
function sanitiseBody(body) {
  const out = {};

  if (typeof body.name        === 'string')  out.name        = body.name.trim().slice(0, 50);
  if (typeof body.description === 'string')  out.description = body.description.trim().slice(0, 200);
  if (typeof body.enabled     === 'boolean') out.enabled     = body.enabled;

  if (body.trigger && typeof body.trigger === 'object') {
    out.trigger = {
      type:        String(body.trigger.type        || '').slice(0, 50),
      value:       String(body.trigger.value       || '').slice(0, 100),
      description: String(body.trigger.description || '').slice(0, 200),
      options:     Array.isArray(body.trigger.options) ? body.trigger.options.slice(0, 25) : [],
    };
  }

  if (body.permissions && typeof body.permissions === 'object') {
    const p = body.permissions;
    out.permissions = {
      allowedRoles:        Array.isArray(p.allowedRoles)        ? p.allowedRoles.slice(0, 50)        : [],
      allowedChannels:     Array.isArray(p.allowedChannels)     ? p.allowedChannels.slice(0, 50)     : [],
      requiredPermissions: Array.isArray(p.requiredPermissions) ? p.requiredPermissions.slice(0, 20) : [],
      caseSensitive:       typeof p.caseSensitive  === 'boolean' ? p.caseSensitive  : false,
      deleteUserMessage:   typeof p.deleteUserMessage === 'boolean' ? p.deleteUserMessage : false,
      cooldownSeconds:     typeof p.cooldownSeconds === 'number'
                             ? Math.min(Math.max(0, p.cooldownSeconds), 86400) : 0,
      cooldownScope:       ['user', 'guild', 'channel'].includes(p.cooldownScope) ? p.cooldownScope : 'user',
      ephemeralErrors:     typeof p.ephemeralErrors === 'boolean' ? p.ephemeralErrors : true,
    };
  }

  if (Array.isArray(body.blocks))    out.blocks    = body.blocks.slice(0, LIMITS.MAX_BLOCKS + 10);
  if (Array.isArray(body.variables)) out.variables = body.variables.slice(0, 50);

  return out;
}

// ── GET /api/workflow-blocks ──────────────────────────────────
// Public (still needs auth) — returns the full block registry for the editor.
router.get('/workflow-blocks', requireAuth, (req, res) => {
  const categories = CATEGORY_META.map((cat) => ({
    ...cat,
    blocks: getByCategory(cat.id).map(({ type, label, description, fields, defaults }) => ({
      type, label, description, fields, defaults,
    })),
  }));
  res.json({ categories });
});

// ── GET /api/guild/:guildId/workflows ─────────────────────────
router.get('/guild/:guildId/workflows', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const workflows = await Workflow
      .find({ guildId }, 'name description enabled trigger.type metadata createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ workflows });
  } catch (err) {
    console.error('[Workflows] GET list error:', err);
    res.status(500).json({ error: 'Failed to load workflows.' });
  }
});

// ── POST /api/guild/:guildId/workflows ────────────────────────
router.post('/guild/:guildId/workflows', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Check per-guild limit
    const count = await Workflow.countDocuments({ guildId });
    if (count >= LIMITS.MAX_WORKFLOWS_PER_GUILD) {
      return res.status(400).json({
        error: `Guild has reached the maximum of ${LIMITS.MAX_WORKFLOWS_PER_GUILD} workflows.`,
      });
    }

    const fields = sanitiseBody(req.body);
    const result = validator.validate({ ...fields, guildId });
    if (!result.valid) {
      return res.status(422).json({ error: 'Validation failed.', details: result.errors });
    }

    const wf = await Workflow.create({
      guildId,
      ...fields,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    res.status(201).json({ workflow: wf });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A workflow with that name already exists in this server.' });
    }
    console.error('[Workflows] POST create error:', err);
    res.status(500).json({ error: 'Failed to create workflow.' });
  }
});

// ── GET /api/guild/:guildId/workflows/:workflowId ─────────────
router.get('/guild/:guildId/workflows/:workflowId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const wf = await Workflow.findOne({ _id: workflowId, guildId }).lean();
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });

    res.json({ workflow: wf });
  } catch (err) {
    console.error('[Workflows] GET single error:', err);
    res.status(500).json({ error: 'Failed to load workflow.' });
  }
});

// ── PATCH /api/guild/:guildId/workflows/:workflowId ───────────
router.patch('/guild/:guildId/workflows/:workflowId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const existing = await Workflow.findOne({ _id: workflowId, guildId });
    if (!existing) return res.status(404).json({ error: 'Workflow not found.' });

    const fields = sanitiseBody(req.body);
    const merged = Object.assign(existing.toObject(), fields);
    const result = validator.validate(merged);
    if (!result.valid) {
      return res.status(422).json({ error: 'Validation failed.', details: result.errors });
    }

    Object.assign(existing, fields, { updatedBy: req.user.id });
    const updated = await existing.save();

    res.json({ workflow: updated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A workflow with that name already exists in this server.' });
    }
    console.error('[Workflows] PATCH update error:', err);
    res.status(500).json({ error: 'Failed to update workflow.' });
  }
});

// ── DELETE /api/guild/:guildId/workflows/:workflowId ──────────
router.delete('/guild/:guildId/workflows/:workflowId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const result = await Workflow.deleteOne({ _id: workflowId, guildId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Workflow not found.' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Workflows] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete workflow.' });
  }
});

// ── PATCH /api/guild/:guildId/workflows/:workflowId/toggle ────
router.patch('/guild/:guildId/workflows/:workflowId/toggle', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const wf = await Workflow.findOne({ _id: workflowId, guildId });
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });

    wf.enabled    = !wf.enabled;
    wf.updatedBy  = req.user.id;
    await wf.save();

    res.json({ enabled: wf.enabled });
  } catch (err) {
    console.error('[Workflows] PATCH toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle workflow.' });
  }
});

// ── POST /api/guild/:guildId/workflows/:workflowId/validate ───
router.post('/guild/:guildId/workflows/:workflowId/validate', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const existing = await Workflow.findOne({ _id: workflowId, guildId }).lean();
    if (!existing) return res.status(404).json({ error: 'Workflow not found.' });

    // Validate the request body (partial diff) merged with the stored workflow
    const fields = sanitiseBody(req.body);
    const merged = Object.assign({}, existing, fields);
    const result = validator.validate(merged);

    res.json(result);
  } catch (err) {
    console.error('[Workflows] POST validate error:', err);
    res.status(500).json({ error: 'Failed to validate workflow.' });
  }
});

// ── POST /api/guild/:guildId/workflows/:workflowId/duplicate ──
router.post('/guild/:guildId/workflows/:workflowId/duplicate', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, workflowId } = req.params;
    if (!isValidObjectId(workflowId)) return res.status(400).json({ error: 'Invalid workflow ID.' });

    const count = await Workflow.countDocuments({ guildId });
    if (count >= LIMITS.MAX_WORKFLOWS_PER_GUILD) {
      return res.status(400).json({
        error: `Guild has reached the maximum of ${LIMITS.MAX_WORKFLOWS_PER_GUILD} workflows.`,
      });
    }

    const original = await Workflow.findOne({ _id: workflowId, guildId }).lean();
    if (!original) return res.status(404).json({ error: 'Workflow not found.' });

    // Generate a unique name by appending _copy or _copy_N
    let baseName = `${original.name}_copy`.slice(0, 50);
    let newName  = baseName;
    let attempt  = 1;
    while (await Workflow.exists({ guildId, name: newName })) {
      newName = `${baseName.slice(0, 45)}_${attempt++}`;
      if (attempt > 20) {
        return res.status(409).json({ error: 'Could not generate a unique name for the duplicate.' });
      }
    }

    const { _id, createdAt, updatedAt, metadata, version, ...rest } = original;
    const copy = await Workflow.create({
      ...rest,
      name:      newName,
      enabled:   false,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    res.status(201).json({ workflow: copy });
  } catch (err) {
    console.error('[Workflows] POST duplicate error:', err);
    res.status(500).json({ error: 'Failed to duplicate workflow.' });
  }
});

module.exports = router;
