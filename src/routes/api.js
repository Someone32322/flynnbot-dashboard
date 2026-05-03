const express = require('express');
const path = require('path');
const router = express.Router();

const { GuildConfig } = require('../models/GuildConfig');
const { LoggingConfig } = require('../models/LoggingConfig');
const { EmbedTemplate } = require('../models/EmbedTemplate');
const { ReactionRole } = require('../models/ReactionRole');
const { ScheduledMessage } = require('../models/ScheduledMessage');
const { ApplicationForm } = require('../models/ApplicationForm');
const { ApplicationSubmission } = require('../models/ApplicationSubmission');
const { LevelConfig } = require('../models/LevelConfig');
const { LevelProfile } = require('../models/LevelProfile');
const EconomyConfig = require('../models/EconomyConfig');
const EconomyProfile = require('../models/EconomyProfile');
const AIConfig = require('../models/AIConfig');
const CustomCommand = require('../models/CustomCommand');
const ThemeConfig = require('../models/ThemeConfig');
const ModerationCase = require('../models/ModerationCase');
const { ModerationConfig } = require('../models/ModerationConfig');
const { PredefinedReasons } = require('../models/PredefinedReasons');
const ResponseConfig = require('../models/ResponseConfig');
const BotMessageTemplate = require('../models/BotMessageTemplate');
const discordApi = require('../lib/discord');
const { canReviewSingleApplication } = require('../services/applicationAccess');

// Dashboard-local command manifest so this app can run outside the monorepo.
const COMMAND_MANIFEST = require(path.join(__dirname, '../commands/manifest.json'));
const COMMAND_META = COMMAND_MANIFEST.meta || {};
const COMMAND_DATA = COMMAND_MANIFEST.commandData || {};

// ── Auth guard ────────────────────────────────────────────────
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
  next();
}

function requireGuildMember(req, res, next) {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID' });
  const guild = req.user.guilds?.find((g) => g.id === guildId);
  if (!guild) return res.status(403).json({ error: 'You are not a member of this guild' });
  req.userGuild = guild;
  next();
}

async function requireApplicationReviewer(req, res, next) {
  try {
    const { guildId, appId, applicationId } = req.params;
    const targetAppId = appId || applicationId;
    if (!targetAppId) return res.status(400).json({ error: 'Missing application ID' });

    const app = await ApplicationForm.findOne({ _id: targetAppId, guildId }).lean();
    if (!app) return res.status(404).json({ error: 'Application not found' });

    const access = await canReviewSingleApplication({
      guildId,
      application: app,
      user: req.user,
    });

    if (!access.allowed) {
      return res.status(403).json({ error: 'Missing reviewer permission' });
    }

    req.targetApplication = app;
    req.reviewerAccess = access;
    next();
  } catch (err) {
    console.error('[API] requireApplicationReviewer', err);
    res.status(500).json({ error: 'Failed to validate reviewer permissions' });
  }
}

// ── GET /api/guild/:guildId/applications/reviewable ───────────
router.get('/guild/:guildId/applications/reviewable', requireAuth, requireGuildMember, async (req, res) => {
  try {
    const { guildId } = req.params;
    const isAdmin = hasAdmin(req.userGuild.permissions);

    let forms = await ApplicationForm.find({ guildId }).sort({ createdAt: -1 }).lean();
    if (!isAdmin) {
      const member = await discordApi.getGuildMember(guildId, req.user.id);
      const memberRoles = new Set(member?.roles || []);
      forms = forms.filter((form) => (form.reviewerRoleIds || []).some((roleId) => memberRoles.has(roleId)));
    }

    res.json(forms.map((f) => ({
      _id: f._id,
      name: f.name,
      description: f.description,
      reviewerRoleIds: f.reviewerRoleIds || [],
      isActive: f.isActive,
    })));
  } catch (err) {
    console.error('[API] GET applications/reviewable', err);
    res.status(500).json({ error: 'Failed to fetch reviewable applications' });
  }
});

// ── GET /api/guild/:guildId/commands ─────────────────────────
// Returns every command in the manifest merged with the guild's saved settings.
router.get('/guild/:guildId/commands', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const config = await GuildConfig.findOne({ guildId });

    const result = Object.entries(COMMAND_META)
      .filter(([, meta]) => !meta.globalOnly)
      .map(([name, meta]) => {
        const saved = config?.commandSettings?.get(name);
        return {
          name,
          category: meta.category,
          description: meta.description,
          usage: meta.usage,
          aliases: meta.aliases ?? [],
          settings: {
            enabled: saved?.enabled ?? false,
            ephemeralMode: saved?.ephemeralMode ?? 'default',
            customDescription: saved?.customDescription ?? '',
            allowedRoles: saved?.allowedRoles ?? [],
            allowedChannels: saved?.allowedChannels ?? [],
            prefixEnabled: saved?.prefixEnabled ?? true,
            discordCommandId: saved?.discordCommandId ?? null,
          },
        };
      });

    res.json(result);
  } catch (err) {
    console.error('[API] GET commands', err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// ── GET /api/guild/:guildId/config ────────────────────────────
router.get('/guild/:guildId/config', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const config = await GuildConfig.findOne({ guildId });
    res.json({
      prefixEnabled: config?.prefixEnabled ?? false,
      prefixes: config?.prefixes ?? [],
    });
  } catch (err) {
    console.error('[API] GET config', err);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// ── PATCH /api/guild/:guildId/config ─────────────────────────
router.patch('/guild/:guildId/config', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { prefixEnabled, prefixes } = req.body;

    const update = {};
    if (typeof prefixEnabled === 'boolean') update.prefixEnabled = prefixEnabled;
    if (Array.isArray(prefixes)) {
      // Sanitise: max 5, non-empty strings, max 10 chars each
      update.prefixes = prefixes
        .filter((p) => typeof p === 'string' && p.trim().length > 0 && p.trim().length <= 10)
        .slice(0, 5)
        .map((p) => p.trim());
    }

    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH config', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ── POST /api/guild/:guildId/commands/:name/enable ───────────
// Registers the command in the guild via Discord API and marks it enabled.
router.post('/guild/:guildId/commands/:name/enable', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;
    const meta = COMMAND_META[name];
    if (!meta || meta.globalOnly) return res.status(404).json({ error: 'Command not found' });

    const commandData = COMMAND_DATA[name];
    if (!commandData) {
      return res.status(500).json({ error: `Command data missing for "${name}" in dashboard manifest` });
    }

    // Register in Discord guild
    const registered = await discordApi.registerGuildCommand(guildId, commandData);

    // Persist to DB
    await GuildConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          [`commandSettings.${name}.enabled`]: true,
          [`commandSettings.${name}.discordCommandId`]: registered.id,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({ ok: true, commandId: registered.id });
  } catch (err) {
    console.error('[API] enable command', err);
    res.status(500).json({ error: err.message || 'Failed to enable command' });
  }
});

// ── POST /api/guild/:guildId/commands/:name/disable ──────────
// Removes the command from the guild in Discord and marks it disabled.
router.post('/guild/:guildId/commands/:name/disable', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;

    const config = await GuildConfig.findOne({ guildId });
    const cmdSettings = config?.commandSettings?.get(name);
    const commandId = cmdSettings?.discordCommandId;

    if (commandId) {
      try {
        await discordApi.deleteGuildCommand(guildId, commandId);
      } catch (e) {
        // If already gone from Discord, continue
        if (!e.message?.includes('10063') && !e.message?.includes('Unknown')) throw e;
      }
    }

    await GuildConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          [`commandSettings.${name}.enabled`]: false,
          [`commandSettings.${name}.discordCommandId`]: null,
        },
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] disable command', err);
    res.status(500).json({ error: err.message || 'Failed to disable command' });
  }
});

// ── PATCH /api/guild/:guildId/commands/:name ─────────────────
// Update settings for a command (roles, channels, ephemeral, description, prefix).
router.patch('/guild/:guildId/commands/:name', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, name } = req.params;
    if (!COMMAND_META[name]) return res.status(404).json({ error: 'Command not found' });

    const allowed = ['ephemeralMode', 'customDescription', 'allowedRoles', 'allowedChannels', 'prefixEnabled'];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[`commandSettings.${name}.${key}`] = req.body[key];
      }
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    // If customDescription is set, also patch description in Discord
    const config = await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const cmdSettings = config.commandSettings?.get(name);
    if (cmdSettings?.discordCommandId && req.body.customDescription !== undefined) {
      try {
        const commandData = COMMAND_DATA[name];
        if (!commandData) throw new Error(`Command data missing for "${name}" in dashboard manifest`);
        const desc = req.body.customDescription?.trim() || commandData.description;
        await discordApi.updateGuildCommand(guildId, cmdSettings.discordCommandId, {
          ...commandData,
          description: desc,
        });
      } catch (_) {
        // Non-fatal — DB is already updated
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH command settings', err);
    res.status(500).json({ error: 'Failed to update command settings' });
  }
});

// ── POST /api/guild/:guildId/commands/reset-all ──────────────
// Disables ALL commands: deletes all guild commands from Discord and clears commandSettings.
router.post('/guild/:guildId/commands/reset-all', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Fetch all currently registered guild commands from Discord and delete them
    try {
      const guildCmds = await discordApi.getGuildCommands(guildId);
      await Promise.all(guildCmds.map((cmd) => discordApi.deleteGuildCommand(guildId, cmd.id).catch(() => {})));
    } catch (_) {
      // Non-fatal — continue clearing DB
    }

    // Clear all commandSettings in DB
    await GuildConfig.findOneAndUpdate(
      { guildId },
      { $set: { commandSettings: {} } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] reset-all commands', err);
    res.status(500).json({ error: err.message || 'Failed to reset commands' });
  }
});

// ── GET /api/guild/:guildId/roles ─────────────────────────────
router.get('/guild/:guildId/roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const roles = await discordApi.getGuildRoles(req.params.guildId);
    // Filter out @everyone, sort by position
    const filtered = roles
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    res.json(filtered);
  } catch (err) {
    console.error('[API] GET roles', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// ── GET /api/guild/:guildId/emojis ────────────────────────────
router.get('/guild/:guildId/emojis', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const emojis = await discordApi.getGuildEmojis(req.params.guildId);
    res.json(emojis.map(e => ({ id: e.id, name: e.name, animated: e.animated || false })));
  } catch (err) {
    console.error('[API] GET emojis', err);
    res.status(500).json({ error: 'Failed to fetch emojis' });
  }
});

// ── GET /api/guild/:guildId/channels ──────────────────────────
router.get('/guild/:guildId/channels', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const channels = await discordApi.getGuildChannels(req.params.guildId);
    const mapped = channels
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));
    res.json(mapped);
  } catch (err) {
    console.error('[API] GET channels', err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// ── GET /api/guild/:guildId/logging ──────────────────────────
router.get('/guild/:guildId/logging', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await LoggingConfig.findOne({ guildId: req.params.guildId }).lean();
    res.json({ channels: cfg?.channels ?? {} });
  } catch (err) {
    console.error('[API] GET logging', err);
    res.status(500).json({ error: 'Failed to fetch logging config' });
  }
});

// ── PATCH /api/guild/:guildId/logging ────────────────────────
router.patch('/guild/:guildId/logging', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { channels } = req.body;
    if (typeof channels !== 'object' || Array.isArray(channels)) {
      return res.status(400).json({ error: 'channels must be an object' });
    }

    // Sanitise: values must be string channel IDs or null
    const clean = {};
    for (const [key, val] of Object.entries(channels)) {
      if (val === null || val === '') { clean[key] = null; }
      else if (typeof val === 'string' && /^\d+$/.test(val)) { clean[key] = val; }
    }

    await LoggingConfig.findOneAndUpdate(
      { guildId },
      { $set: { channels: clean } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH logging', err);
    res.status(500).json({ error: 'Failed to update logging config' });
  }
});

// ── GET /api/guild/:guildId/logging/settings ─────────────────
router.get('/guild/:guildId/logging/settings', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await LoggingConfig.findOne({ guildId: req.params.guildId }).lean();
    res.json({
      useWebhooks: cfg?.useWebhooks ?? false,
      ignoreEmbeds: cfg?.ignoreEmbeds ?? false,
      ignoreVoice: cfg?.ignoreVoice ?? false,
      logDeletedPolls: cfg?.logDeletedPolls ?? true,
      logDeletedSticky: cfg?.logDeletedSticky ?? true,
      logDeletedForwarded: cfg?.logDeletedForwarded ?? true,
      logUnrecognized: cfg?.logUnrecognized ?? false,
    });
  } catch (err) {
    console.error('[API] GET logging/settings', err);
    res.status(500).json({ error: 'Failed to fetch logging settings' });
  }
});

// ── PATCH /api/guild/:guildId/logging/settings ───────────────
router.patch('/guild/:guildId/logging/settings', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const allowed = ['useWebhooks', 'ignoreEmbeds', 'ignoreVoice', 'logDeletedPolls', 'logDeletedSticky', 'logDeletedForwarded', 'logUnrecognized'];
    const update = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') update[key] = req.body[key];
    }
    await LoggingConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH logging/settings', err);
    res.status(500).json({ error: 'Failed to save logging settings' });
  }
});

// ── POST /api/guild/:guildId/logging/test ────────────────────
// Send a test embed to the configured logging channel for a specific event type.
router.post('/guild/:guildId/logging/test', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { eventKey, channelId } = req.body;

    if (!eventKey || typeof eventKey !== 'string') {
      return res.status(400).json({ error: 'eventKey is required' });
    }

    if (channelId != null && channelId !== '' && (typeof channelId !== 'string' || !/^\d+$/.test(channelId))) {
      return res.status(400).json({ error: 'channelId must be a numeric string' });
    }

    const cfg = await LoggingConfig.findOne({ guildId }).lean();
    const targetChannelId = channelId || cfg?.channels?.[eventKey];

    if (!targetChannelId) {
      return res.status(400).json({ error: `No logging channel configured for ${eventKey}. Select a channel or save configuration first.` });
    }

    // Build a test embed
    const testEmbed = {
      title: `🧪 Test: ${eventKey}`,
      description: `This is a test message for **${eventKey}** event type.`,
      color: 0x0f52ba,
      fields: [
        { name: 'Timestamp', value: new Date().toISOString(), inline: false },
        { name: 'Guild ID', value: guildId, inline: true },
        { name: 'Test Status', value: '✅ Successful', inline: true },
      ],
      footer: { text: 'FlynnBot Test Message' },
    };

    // Send to Discord
    const response = await discordApi.postMessage(targetChannelId, { embeds: [testEmbed] }).catch((e) => {
      throw new Error(`Failed to send test to channel: ${e.message}`);
    });

    res.json({ ok: true, messageId: response.id, channelId: targetChannelId });
  } catch (err) {
    console.error('[API] POST logging/test', err);
    res.status(500).json({ error: err.message || 'Failed to send test message' });
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  MESSAGE BUILDER — ScheduledMessage CRUD + delivery         ║
// ╚══════════════════════════════════════════════════════════════╝

// ── GET /api/guild/:guildId/messages ────────────────────────────
router.get('/guild/:guildId/messages', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const msgs = await ScheduledMessage.find({ guildId: req.params.guildId }).sort({ createdAt: -1 }).lean();
    res.json(msgs);
  } catch (err) {
    console.error('[API] GET messages', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── POST /api/guild/:guildId/messages ───────────────────────────
router.post('/guild/:guildId/messages', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const data = sanitiseBuilderMsg(req.body);
    if (!data.name) return res.status(400).json({ error: 'name is required' });

    if (data.delivery.type === 'schedule_once' && data.delivery.scheduleAt) {
      data.delivery.nextRun = new Date(data.delivery.scheduleAt);
    } else if (data.delivery.type === 'schedule_repeat' && data.delivery.intervalMins) {
      data.delivery.nextRun = new Date(Date.now() + data.delivery.intervalMins * 60 * 1000);
    }

    const msg = await ScheduledMessage.create({ guildId, ...data });
    res.status(201).json(msg);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A message with that name already exists' });
    console.error('[API] POST messages', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// ── PUT /api/guild/:guildId/messages/:msgId ──────────────────────
router.put('/guild/:guildId/messages/:msgId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const data = sanitiseBuilderMsg(req.body);
    msg.content = data.content;
    msg.embeds   = data.embeds;
    msg.actionRows = data.actionRows;

    const prevDelivery = msg.delivery.toObject ? msg.delivery.toObject() : { ...msg.delivery };
    msg.delivery = { ...prevDelivery, ...data.delivery };

    if (data.delivery.type === 'schedule_once' && data.delivery.scheduleAt) {
      msg.delivery.nextRun     = new Date(data.delivery.scheduleAt);
      msg.delivery.scheduleEnabled = true;
    } else if (data.delivery.type === 'schedule_repeat' && data.delivery.intervalMins) {
      if (!msg.delivery.nextRun || new Date(msg.delivery.nextRun) < new Date()) {
        msg.delivery.nextRun = new Date(Date.now() + data.delivery.intervalMins * 60 * 1000);
      }
      msg.delivery.scheduleEnabled = true;
    }

    msg.markModified('delivery');
    msg.markModified('embeds');
    msg.markModified('actionRows');
    await msg.save();
    res.json(msg);
  } catch (err) {
    console.error('[API] PUT messages', err);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// ── DELETE /api/guild/:guildId/messages/:msgId ───────────────────
router.delete('/guild/:guildId/messages/:msgId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const deleted = await ScheduledMessage.findOneAndDelete({ _id: msgId, guildId });
    if (!deleted) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE messages', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/send ─────────────────
router.post('/guild/:guildId/messages/:msgId/send', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const payload = buildDiscordPayload(msg);
    if (!payload.content && !payload.embeds?.length) {
      return res.status(400).json({ error: 'Message has no content or embeds to send' });
    }

    if (msg.delivery.type === 'webhook' && msg.delivery.webhookUrl) {
      await discordApi.sendWebhook(msg.delivery.webhookUrl, payload);
    } else {
      const channelId = msg.delivery.channelId || req.body.channelId;
      if (!channelId) return res.status(400).json({ error: 'No channel configured for this message' });

      const sent = await discordApi.postMessage(channelId, payload);

      if (msg.delivery.type === 'sticky') {
        // Delete previous sticky bot message if still there
        if (msg.postedMessageId) {
          await discordApi.deleteMessage(channelId, msg.postedMessageId).catch(() => {});
        }
        msg.postedMessageId = sent.id;
        msg.postedChannelId = channelId;
        await msg.save();
      } else {
        // Save posted message reference for all non-sticky sends
        msg.postedMessageId = sent?.id || null;
        msg.postedChannelId = channelId;
        await msg.save();
      }

      // Seed emoji reactions for any emoji-type action rows
      const emojiRows = (msg.actionRows || []).filter((r) => r.rowType === 'emoji');
      if (emojiRows.length && sent?.id) {
        for (const row of emojiRows) {
          for (const opt of row.options || []) {
            if (opt.label) {
              await discordApi.addReaction(channelId, sent.id, opt.label).catch(() => {});
            }
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] POST messages/send', err);
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/attach ─────────────────
// Attaches action rows (components + emoji reactions) to an existing Discord message.
router.post('/guild/:guildId/messages/:msgId/attach', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const { messageUrl } = req.body;

    if (!messageUrl) return res.status(400).json({ error: 'messageUrl is required' });

    const match = String(messageUrl).match(/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (!match) return res.status(400).json({ error: 'Invalid Discord message URL — must include channels/{guildId}/{channelId}/{messageId}' });
    const [, , channelId, discordMsgId] = match;

    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const hasComponents = (msg.actionRows || []).some((r) => r.rowType !== 'emoji');
    const emojiRows = (msg.actionRows || []).filter((r) => r.rowType === 'emoji');

    if (hasComponents) {
      const components = buildARComponents(msg);
      if (components.length) {
        await discordApi.editMessage(channelId, discordMsgId, { components });
      }
    }

    if (emojiRows.length) {
      for (const row of emojiRows) {
        for (const opt of row.options || []) {
          if (opt.label) {
            await discordApi.addReaction(channelId, discordMsgId, opt.label).catch(() => {});
          }
        }
      }
    }

    if (!hasComponents && !emojiRows.length) {
      return res.status(400).json({ error: 'This message has no action rows to attach' });
    }

    // Save target message reference
    msg.postedMessageId = discordMsgId;
    msg.postedChannelId = channelId;
    await msg.save();

    res.json({ ok: true, messageId: discordMsgId, channelId });
  } catch (err) {
    console.error('[API] POST messages/attach', err);
    res.status(500).json({ error: err.message || 'Failed to attach to message' });
  }
});

// ── POST /api/guild/:guildId/messages/:msgId/toggle-schedule ────────────
router.post('/guild/:guildId/messages/:msgId/toggle-schedule', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, msgId } = req.params;
    const msg = await ScheduledMessage.findOne({ _id: msgId, guildId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    msg.delivery.scheduleEnabled = !msg.delivery.scheduleEnabled;
    if (msg.delivery.scheduleEnabled && msg.delivery.type === 'schedule_repeat' && msg.delivery.intervalMins) {
      msg.delivery.nextRun = new Date(Date.now() + msg.delivery.intervalMins * 60 * 1000);
    }
    msg.markModified('delivery');
    await msg.save();
    res.json({ enabled: msg.delivery.scheduleEnabled });
  } catch (err) {
    console.error('[API] toggle-schedule', err);
    res.status(500).json({ error: 'Failed to toggle schedule' });
  }
});

// ── Builder helpers ──────────────────────────────────────────────

function buildDiscordPayload(msg) {
  const embeds = (msg.embeds || []).map((emb) => {
    const obj = {};
    if (emb.title)       obj.title       = emb.title;
    if (emb.description) obj.description = emb.description;
    if (emb.url)         obj.url         = emb.url;
    if (emb.color !== undefined && emb.color !== null) obj.color = emb.color;
    if (emb.authorName)  obj.author  = { name: emb.authorName, icon_url: emb.authorIcon || undefined, url: emb.authorUrl || undefined };
    if (emb.footerText)  obj.footer  = { text: emb.footerText, icon_url: emb.footerIcon || undefined };
    if (emb.imageUrl)    obj.image   = { url: emb.imageUrl };
    if (emb.thumbnail)   obj.thumbnail = { url: emb.thumbnail };
    if (emb.timestamp)   obj.timestamp = new Date().toISOString();
    if (emb.fields?.length) {
      obj.fields = emb.fields.filter((f) => f.name && f.value).map((f) => ({ name: f.name, value: f.value, inline: f.inline || false }));
    }
    return obj;
  }).filter((e) => Object.keys(e).length > 0);

  const result = {};
  if (msg.content) result.content = msg.content;
  if (embeds.length) result.embeds = embeds;

  const components = buildARComponents(msg);
  if (components.length) result.components = components;

  return result;
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try { new URL(url); return url.startsWith('http'); } catch { return false; }
}

function isValidWebhookUrl(url) {
  if (!url) return false;
  return typeof url === 'string' && /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\//.test(url);
}

function sanitiseEmbed(emb) {
  if (!emb || typeof emb !== 'object') return null;
  return {
    title:       emb.title       ? String(emb.title).slice(0, 256)  : null,
    description: emb.description ? String(emb.description).slice(0, 4096) : null,
    url:         isValidUrl(emb.url) ? String(emb.url) : null,
    color:       typeof emb.color === 'number' ? emb.color : 0x0f52ba,
    authorName:  emb.authorName  ? String(emb.authorName).slice(0, 256) : null,
    authorIcon:  isValidUrl(emb.authorIcon) ? String(emb.authorIcon) : null,
    authorUrl:   isValidUrl(emb.authorUrl)  ? String(emb.authorUrl)  : null,
    footerText:  emb.footerText  ? String(emb.footerText).slice(0, 2048) : null,
    footerIcon:  isValidUrl(emb.footerIcon) ? String(emb.footerIcon) : null,
    imageUrl:    isValidUrl(emb.imageUrl)   ? String(emb.imageUrl)   : null,
    thumbnail:   isValidUrl(emb.thumbnail)  ? String(emb.thumbnail)  : null,
    timestamp:   emb.timestamp === true,
    fields: Array.isArray(emb.fields)
      ? emb.fields.slice(0, 25).map((f) => ({
          name:   String(f.name  || '').slice(0, 256),
          value:  String(f.value || '').slice(0, 1024),
          inline: f.inline === true,
        })).filter((f) => f.name && f.value)
      : [],
  };
}

function sanitiseDelivery(d) {
  if (!d || typeof d !== 'object') d = {};
  const VALID = ['template', 'channel', 'webhook', 'schedule_once', 'schedule_repeat', 'sticky', 'command', 'ephemeral', 'dm'];
  const type  = VALID.includes(d.type) ? d.type : 'template';
  return {
    type,
    channelId:             d.channelId && /^\d+$/.test(String(d.channelId)) ? String(d.channelId) : null,
    webhookUrl:            isValidWebhookUrl(d.webhookUrl) ? d.webhookUrl : null,
    scheduleAt:            d.scheduleAt ? new Date(d.scheduleAt) : null,
    intervalMins:          typeof d.intervalMins === 'number' && d.intervalMins > 0 ? Math.floor(d.intervalMins) : null,
    scheduleEnabled:       d.scheduleEnabled !== false,
    commandTrigger:        d.commandTrigger ? String(d.commandTrigger).slice(0, 100).trim() : null,
    commandRequiredRoleId: d.commandRequiredRoleId && /^\d+$/.test(String(d.commandRequiredRoleId)) ? String(d.commandRequiredRoleId) : null,
    responseEmbeds:        Array.isArray(d.responseEmbeds) ? d.responseEmbeds.map(sanitiseEmbed).filter(Boolean) : [],
    responseUseCommand:    d.responseUseCommand === true,
  };
}

function sanitiseAROption(o) {
  if (!o || typeof o !== 'object') return null;
  const STYLES = ['primary', 'secondary', 'success', 'danger', 'link'];
  const ACTIONS = ['role', 'message', 'dm'];
  return {
    optId:       o.optId ? String(o.optId).slice(0, 20) : Math.random().toString(36).slice(2, 10).toUpperCase(),
    label:       o.label ? String(o.label).slice(0, 80) : '',
    emoji:       o.emoji ? String(o.emoji).slice(0, 100) : null,
    description: o.description ? String(o.description).slice(0, 100) : null,
    style:       STYLES.includes(o.style) ? o.style : 'primary',
    url:         isValidUrl(o.url) ? String(o.url) : null,
    action:      ACTIONS.includes(o.action) ? o.action : 'role',
    roleId:      o.roleId && /^\d+$/.test(String(o.roleId)) ? String(o.roleId) : null,
    toggleRole:  o.toggleRole !== false,
    content:     o.content ? String(o.content).slice(0, 2000) : null,
    contentType: o.contentType === 'embed' ? 'embed' : 'message',
  };
}

function sanitiseActionRows(rows) {
  if (!Array.isArray(rows)) return [];
  const ROW_TYPES = ['button', 'select', 'emoji'];
  return rows.slice(0, 5).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const rowType = ROW_TYPES.includes(row.rowType) ? row.rowType : 'button';
    const maxOpts = rowType === 'button' ? 5 : 25;
    return {
      rowId:       row.rowId ? String(row.rowId).slice(0, 20) : Math.random().toString(36).slice(2, 10).toUpperCase(),
      rowType,
      placeholder: row.placeholder ? String(row.placeholder).slice(0, 150) : null,
      options:     Array.isArray(row.options) ? row.options.slice(0, maxOpts).map(sanitiseAROption).filter(Boolean) : [],
    };
  }).filter(Boolean);
}

function buildARComponents(msg) {
  const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const components = [];
  const msgId = String(msg._id);

  for (const row of (msg.actionRows || []).slice(0, 5)) {
    if (row.rowType === 'emoji') continue; // emoji rows are reactions, not components

    if (row.rowType === 'button') {
      const buttons = (row.options || []).slice(0, 5)
        .filter((o) => o.label)
        .map((opt) => {
          const style = styleMap[opt.style] || 1;
          const btn = { type: 2, label: opt.label, style };
          if (style === 5) {
            btn.url = opt.url || 'https://discord.com';
          } else {
            btn.custom_id = `msg:btn:${msgId}:${opt.optId}`;
          }
          if (opt.emoji) btn.emoji = parseEmoji(opt.emoji);
          return btn;
        });
      if (buttons.length) components.push({ type: 1, components: buttons });
    } else if (row.rowType === 'select') {
      const options = (row.options || []).slice(0, 25)
        .filter((o) => o.label)
        .map((opt) => {
          const o = { label: opt.label, value: opt.optId };
          if (opt.description) o.description = opt.description;
          if (opt.emoji) o.emoji = parseEmoji(opt.emoji);
          return o;
        });
      if (options.length) {
        components.push({
          type: 1,
          components: [{
            type: 3,
            custom_id: `msg:sel:${msgId}:${row.rowId}`,
            placeholder: row.placeholder || 'Select an option…',
            min_values: 1,
            max_values: 1,
            options,
          }],
        });
      }
    }
  }
  return components;
}

function sanitiseBuilderMsg(data) {
  if (!data || typeof data !== 'object') data = {};
  return {
    name:       data.name ? String(data.name).slice(0, 60).trim() : undefined,
    content:    data.content ? String(data.content).slice(0, 2000) : null,
    embeds:     Array.isArray(data.embeds) ? data.embeds.slice(0, 10).map(sanitiseEmbed).filter(Boolean) : [],
    actionRows: sanitiseActionRows(data.actionRows),
    delivery:   sanitiseDelivery(data.delivery),
  };
}

// ── GET /api/guild/:guildId/embeds ───────────────────────────
router.get('/guild/:guildId/embeds', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const embeds = await EmbedTemplate.find({ guildId: req.params.guildId }).lean();
    res.json(embeds);
  } catch (err) {
    console.error('[API] GET embeds', err);
    res.status(500).json({ error: 'Failed to fetch embeds' });
  }
});

// ── POST /api/guild/:guildId/embeds ──────────────────────────
router.post('/guild/:guildId/embeds', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { name, title, description, color, footer, imageUrl, thumbnailUrl, author, fields } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const embed = await EmbedTemplate.create({
      guildId,
      name: name.trim(),
      title: title?.trim() || null,
      description: description?.trim() || null,
      color: typeof color === 'number' ? color : 0x0f52ba,
      footer: footer?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      thumbnailUrl: thumbnailUrl?.trim() || null,
      author: author?.trim() || null,
      fields: Array.isArray(fields) ? fields.slice(0, 25) : [],
    });

    res.status(201).json(embed);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An embed with that name already exists' });
    console.error('[API] POST embed', err);
    res.status(500).json({ error: 'Failed to create embed' });
  }
});

// ── PUT /api/guild/:guildId/embeds/:embedId ──────────────────
router.put('/guild/:guildId/embeds/:embedId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, embedId } = req.params;
    const { title, description, color, footer, imageUrl, thumbnailUrl, author, fields } = req.body;

    const embed = await EmbedTemplate.findOneAndUpdate(
      { _id: embedId, guildId },
      {
        $set: {
          title: title?.trim() || null,
          description: description?.trim() || null,
          color: typeof color === 'number' ? color : 0x0f52ba,
          footer: footer?.trim() || null,
          imageUrl: imageUrl?.trim() || null,
          thumbnailUrl: thumbnailUrl?.trim() || null,
          author: author?.trim() || null,
          fields: Array.isArray(fields) ? fields.slice(0, 25) : [],
        },
      },
      { returnDocument: 'after' }
    );

    if (!embed) return res.status(404).json({ error: 'Embed not found' });
    res.json(embed);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An embed with that name already exists' });
    console.error('[API] PUT embed', err);
    res.status(500).json({ error: 'Failed to update embed' });
  }
});

// ── DELETE /api/guild/:guildId/embeds/:embedId ───────────────
router.delete('/guild/:guildId/embeds/:embedId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, embedId } = req.params;
    const deleted = await EmbedTemplate.findOneAndDelete({ _id: embedId, guildId });
    if (!deleted) return res.status(404).json({ error: 'Embed not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE embed', err);
    res.status(500).json({ error: 'Failed to delete embed' });
  }
});

// ── GET /api/guild/:guildId/reaction-roles ───────────────────
router.get('/guild/:guildId/reaction-roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const rrs = await ReactionRole.find({ guildId: req.params.guildId }).lean();
    const normalized = rrs.map((rr) => ({
      ...rr,
      options: Array.isArray(rr.options)
        ? rr.options.map((opt) => ({
            ...opt,
            contentType: opt?.contentType === 'embed' ? 'embed' : 'message',
          }))
        : [],
    }));
    res.json(normalized);
  } catch (err) {
    console.error('[API] GET reaction-roles', err);
    res.status(500).json({ error: 'Failed to fetch reaction roles' });
  }
});

// ── POST /api/guild/:guildId/reaction-roles ──────────────────
router.post('/guild/:guildId/reaction-roles', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { name, type, channelId, messageUrl, embedTitle, embedDescription, embedColor, options } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!['button', 'dropdown', 'emoji'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const sanitizedOptions = sanitiseOptions(options, type);
    const optionsError = validateOptions(sanitizedOptions, type);
    if (optionsError) return res.status(400).json({ error: optionsError });
    if (messageUrl && type !== 'emoji') {
      return res.status(400).json({ error: 'Existing message links are only supported for emoji reaction roles' });
    }

    const rr = await ReactionRole.create({
      guildId,
      name: name.trim(),
      type,
      channelId: channelId || null,
      messageUrl: messageUrl || null,
      embedTitle: embedTitle?.trim() || 'Reaction Roles',
      embedDescription: embedDescription?.trim() || 'Click a button or select an option below.',
      embedColor: typeof embedColor === 'number' ? embedColor : 0x0f52ba,
      options: sanitizedOptions,
    });
    res.status(201).json(rr);
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ error: first?.message || 'Invalid reaction role data' });
    }
    if (err.code === 11000) return res.status(409).json({ error: 'A reaction role group with that name already exists' });
    console.error('[API] POST reaction-roles', err);
    res.status(500).json({ error: 'Failed to create reaction role group' });
  }
});

// ── PUT /api/guild/:guildId/reaction-roles/:rrId ─────────────
router.put('/guild/:guildId/reaction-roles/:rrId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const { channelId, messageUrl, embedTitle, embedDescription, embedColor, options } = req.body;
    const rr = await ReactionRole.findOne({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    if (channelId !== undefined) rr.channelId = channelId || null;
    if (messageUrl !== undefined && messageUrl && rr.type !== 'emoji') {
      return res.status(400).json({ error: 'Existing message links are only supported for emoji reaction roles' });
    }
    if (messageUrl !== undefined) rr.messageUrl = messageUrl || null;
    if (embedTitle !== undefined) rr.embedTitle = embedTitle?.trim() || 'Reaction Roles';
    if (embedDescription !== undefined) rr.embedDescription = embedDescription?.trim() || '';
    if (typeof embedColor === 'number') rr.embedColor = embedColor;
    if (Array.isArray(options)) {
      const sanitizedOptions = sanitiseOptions(options, rr.type);
      const optionsError = validateOptions(sanitizedOptions, rr.type);
      if (optionsError) return res.status(400).json({ error: optionsError });
      rr.options = sanitizedOptions;
      rr.markModified('options');
    }
    await rr.save();
    res.json(rr);
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ error: first?.message || 'Invalid reaction role data' });
    }
    console.error('[API] PUT reaction-roles', err);
    res.status(500).json({ error: 'Failed to update reaction role group' });
  }
});

// ── DELETE /api/guild/:guildId/reaction-roles/:rrId ──────────
router.delete('/guild/:guildId/reaction-roles/:rrId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const rr = await ReactionRole.findOneAndDelete({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    // Clean up the Discord message if it exists
    if (rr.channelId && rr.messageId) {
      try { await discordApi.deleteMessage(rr.channelId, rr.messageId); } catch (_) {}
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE reaction-roles', err);
    res.status(500).json({ error: 'Failed to delete reaction role group' });
  }
});

// ── POST /api/guild/:guildId/reaction-roles/:rrId/post ───────
// Posts (or re-posts) the reaction role message to Discord.
router.post('/guild/:guildId/reaction-roles/:rrId/post', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, rrId } = req.params;
    const rr = await ReactionRole.findOne({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    if (rr.type === 'emoji') {
      // For emoji type: resolve message URL and seed reactions
      const url = rr.messageUrl;
      if (!url) return res.status(400).json({ error: 'No message URL set for emoji reaction role' });
      const match = url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!match) return res.status(400).json({ error: 'Invalid Discord message URL' });
      const [, , chanId, msgId] = match;
      rr.externalChannelId = chanId;
      rr.externalMessageId = msgId;
      await rr.save();

      // Seed reactions so users know what to react with
      for (const opt of rr.options) {
        if (opt.label) {
          try { await discordApi.addReaction(chanId, msgId, normalizeEmojiForReactionApi(opt.label)); } catch (_) {}
        }
      }
      return res.json({ ok: true, messageId: msgId });
    }

    const body = buildMessageBody(rr);

    if (!rr.channelId) return res.status(400).json({ error: 'No channel set for this reaction role group' });

    let postedMessage;
    if (rr.messageId) {
      try {
        postedMessage = await discordApi.editMessage(rr.channelId, rr.messageId, body);
      } catch (editErr) {
        postedMessage = await discordApi.postMessage(rr.channelId, body);
      }
    } else {
      postedMessage = await discordApi.postMessage(rr.channelId, body);
    }

    rr.messageId = postedMessage.id;
    rr.externalChannelId = null;
    rr.externalMessageId = null;
    await rr.save();
    res.json({ ok: true, messageId: postedMessage.id });
  } catch (err) {
    console.error('[API] POST reaction-roles/post', err);
    res.status(500).json({ error: err.message || 'Failed to post reaction role message' });
  }
});

// ── Helpers ──────────────────────────────────────────────────
function sanitiseOptions(raw, type) {
  if (!Array.isArray(raw)) return [];
  const normalizeContentType = (value) => {
    const normalized = String(value || 'message').toLowerCase();
    return normalized === 'embed' ? 'embed' : 'message';
  };

  return raw.slice(0, type === 'dropdown' ? 25 : 25).map((o) => ({
    optId:       String(o.optId || generateOptId()),
    label:       String(o.label || '').slice(0, 80),
    emoji:       o.emoji ? String(o.emoji).slice(0, 100) : null,
    description: o.description ? String(o.description).slice(0, 100) : null,
    style:       ['primary', 'secondary', 'success', 'danger'].includes(o.style) ? o.style : 'primary',
    action:      ['role', 'message', 'dm'].includes(o.action) ? o.action : 'role',
    contentType: normalizeContentType(o.contentType),
    roleId:      o.roleId ? String(o.roleId) : null,
    toggleRole:  o.toggleRole !== false,
    content:     o.content ? String(o.content).slice(0, 2000) : null,
    embedTitle:       o.embedTitle ? String(o.embedTitle).slice(0, 256) : null,
    embedDescription: o.embedDescription ? String(o.embedDescription).slice(0, 4096) : null,
    embedColor:       typeof o.embedColor === 'number' ? o.embedColor : 0x0f52ba,
    embedFooter:      o.embedFooter ? String(o.embedFooter).slice(0, 2048) : null,
    embedImageUrl:    isValidUrl(o.embedImageUrl) ? String(o.embedImageUrl) : null,
    embedThumbnailUrl:isValidUrl(o.embedThumbnailUrl) ? String(o.embedThumbnailUrl) : null,
  }));
}

function generateOptId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function validateOptions(options, type) {
  if (!Array.isArray(options) || !options.length) {
    return 'Add at least one option before saving.';
  }

  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    const n = i + 1;

    if (!opt.label) {
      return type === 'emoji'
        ? `Option ${n}: Emoji is required.`
        : `Option ${n}: Label is required.`;
    }

    if (opt.action === 'role' && !opt.roleId) {
      return `Option ${n}: Select a role for the role action.`;
    }

    if (opt.action === 'message' || opt.action === 'dm') {
      if (opt.contentType === 'embed' && !opt.embedDescription && !opt.embedTitle) {
        return `Option ${n}: Embed title or description is required for ${opt.action.toUpperCase()} action.`;
      }
      if (opt.contentType !== 'embed' && !opt.content) {
        return `Option ${n}: Message content is required for ${opt.action.toUpperCase()} action.`;
      }
    }
  }

  return null;
}

function buildMessageBody(rr) {
  const embeds = (rr.embedTitle || rr.embedDescription) ? [{
    title:       rr.embedTitle || undefined,
    description: rr.embedDescription || undefined,
    color:       rr.embedColor ?? 0x0f52ba,
  }] : [];

  const components = [];

  if (rr.type === 'button') {
    const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4 };
    const buttons = rr.options.map((opt) => {
      const btn = {
        type:      2,
        custom_id: `rr:btn:${rr._id}:${opt.optId}`,
        label:     opt.label,
        style:     styleMap[opt.style] || 1,
      };
      if (opt.emoji) btn.emoji = parseEmoji(opt.emoji);
      return btn;
    });
    // Chunk into rows of 5
    for (let i = 0; i < buttons.length; i += 5) {
      components.push({ type: 1, components: buttons.slice(i, i + 5) });
    }
  } else if (rr.type === 'dropdown') {
    const menuOptions = rr.options.map((opt) => {
      const o = { label: opt.label, value: opt.optId };
      if (opt.description) o.description = opt.description;
      if (opt.emoji) o.emoji = parseEmoji(opt.emoji);
      return o;
    });
    components.push({
      type: 1,
      components: [{
        type:        3,
        custom_id:   `rr:sel:${rr._id}`,
        placeholder: 'Select an option…',
        min_values:  1,
        max_values:  1,
        options:     menuOptions,
      }],
    });
  }

  return {
    embeds:     embeds.length ? embeds : undefined,
    components: components.length ? components : [],
  };
}

function parseEmoji(emoji) {
  const custom = emoji.match(/^<a?:([^:]+):(\d+)>$/);
  if (custom) return { name: custom[1], id: custom[2] };
  return { name: emoji };
}

function normalizeEmojiForReactionApi(emoji) {
  const raw = String(emoji || '').trim();
  const custom = raw.match(/^<a?:([^:]+):(\d+)>$/);
  if (custom) return `${custom[1]}:${custom[2]}`;
  return raw;
}

function normalizeApplicationField(rawField, index) {
  const safeType = ['text', 'textarea', 'select', 'number', 'boolean', 'section'].includes(rawField?.type)
    ? rawField.type
    : 'text';

  const options = Array.isArray(rawField?.options)
    ? rawField.options
      .map((opt) => String(opt || '').trim())
      .filter(Boolean)
      .slice(0, 20)
    : [];

  return {
    fieldId: rawField?.fieldId ? String(rawField.fieldId).slice(0, 40) : `f_${Date.now()}_${index}`,
    label: String(rawField?.label || '').trim().slice(0, 120),
    helpText: String(rawField?.helpText || '').trim().slice(0, 280),
    type: safeType,
    required: safeType === 'section' ? false : rawField?.required !== false,
    placeholder: String(rawField?.placeholder || '').trim().slice(0, 120),
    options,
    sectionStyle: ['plain', 'glass', 'accent'].includes(rawField?.sectionStyle) ? rawField.sectionStyle : 'accent',
    minLength: typeof rawField?.minLength === 'number' ? Math.max(0, Math.min(4000, Math.floor(rawField.minLength))) : null,
    maxLength: typeof rawField?.maxLength === 'number' ? Math.max(1, Math.min(4000, Math.floor(rawField.maxLength))) : null,
    order: typeof rawField?.order === 'number' ? rawField.order : index,
  };
}

function normalizeReviewTemplate(raw, fallback = {}) {
  const mode = ['none', 'generic', 'saved_embed'].includes(raw?.mode) ? raw.mode : (fallback.mode || 'generic');
  const savedEmbedId = typeof raw?.savedEmbedId === 'string' && raw.savedEmbedId.trim().length ? raw.savedEmbedId.trim() : null;
  const genericTitle = String(raw?.genericTitle || fallback.genericTitle || '').slice(0, 120);
  const genericDescription = String(raw?.genericDescription || fallback.genericDescription || '').slice(0, 2000);
  const genericColor = String(raw?.genericColor || fallback.genericColor || '#22d3ee').slice(0, 20);
  return { mode, savedEmbedId, genericTitle, genericDescription, genericColor };
}

function normalizeReviewNotifications(raw) {
  return {
    enabled: raw?.enabled !== false,
    showApplicationField: raw?.showApplicationField !== false,
    showStatusField: raw?.showStatusField !== false,
    templates: {
      pending: normalizeReviewTemplate(raw?.templates?.pending, { mode: 'none' }),
      in_review: normalizeReviewTemplate(raw?.templates?.in_review, {
        mode: 'generic',
        genericTitle: 'Application In Review',
        genericDescription: 'Your application is now being reviewed.',
        genericColor: '#f59e0b',
      }),
      approved: normalizeReviewTemplate(raw?.templates?.approved, {
        mode: 'generic',
        genericTitle: 'Application Approved',
        genericDescription: 'Congratulations. Your application was approved.',
        genericColor: '#22c55e',
      }),
      rejected: normalizeReviewTemplate(raw?.templates?.rejected, {
        mode: 'generic',
        genericTitle: 'Application Rejected',
        genericDescription: 'Your application was not accepted this time.',
        genericColor: '#ef4444',
      }),
    },
  };
}

function parseColorInt(color, fallback = 0x22d3ee) {
  const safe = String(color || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) return fallback;
  return Number.parseInt(safe, 16);
}

function normalizeApplicationPayload(body, actor) {
  const fields = Array.isArray(body?.fields) ? body.fields : [];
  return {
    name: String(body?.name || '').trim().slice(0, 80),
    description: String(body?.description || '').trim().slice(0, 1200),
    isActive: body?.isActive !== false,
    recipient: {
      type: body?.recipient?.type === 'user' ? 'user' : 'channel',
      targetId: typeof body?.recipient?.targetId === 'string' && /^\d+$/.test(body.recipient.targetId)
        ? body.recipient.targetId
        : null,
    },
    reviewerRoleIds: Array.isArray(body?.reviewerRoleIds)
      ? body.reviewerRoleIds.filter((id) => typeof id === 'string' && /^\d+$/.test(id)).slice(0, 20)
      : [],
    transcriptChannelId: typeof body?.transcriptChannelId === 'string' && /^\d+$/.test(body.transcriptChannelId)
      ? body.transcriptChannelId
      : null,
    abuseProtection: {
      oneSubmissionPerUser: body?.abuseProtection?.oneSubmissionPerUser !== false,
      blockIfPendingExists: body?.abuseProtection?.blockIfPendingExists !== false,
      cooldownMinutes: typeof body?.abuseProtection?.cooldownMinutes === 'number'
        ? Math.max(0, Math.min(10080, Math.floor(body.abuseProtection.cooldownMinutes)))
        : 60,
      maxSubmissionsPerUser: typeof body?.abuseProtection?.maxSubmissionsPerUser === 'number'
        ? Math.max(1, Math.min(1000, Math.floor(body.abuseProtection.maxSubmissionsPerUser)))
        : 3,
      autoCloseAt: body?.abuseProtection?.autoCloseAt ? new Date(body.abuseProtection.autoCloseAt) : null,
    },
    identity: {
      requireOAuth: body?.identity?.requireOAuth !== false,
      askUsernameAgain: body?.identity?.askUsernameAgain === true,
      askUserIdAgain: body?.identity?.askUserIdAgain === true,
    },
    style: {
      accent: String(body?.style?.accent || '#22d3ee').slice(0, 20),
      gradientA: String(body?.style?.gradientA || '#0b1028').slice(0, 20),
      gradientB: String(body?.style?.gradientB || '#172554').slice(0, 20),
      animationPreset: ['pulse', 'wave', 'float'].includes(body?.style?.animationPreset)
        ? body.style.animationPreset
        : 'wave',
      cardRadius: typeof body?.style?.cardRadius === 'number'
        ? Math.max(8, Math.min(40, Math.floor(body.style.cardRadius)))
        : 18,
    },
    submitButtonText: String(body?.submitButtonText || 'Submit Application').trim().slice(0, 60),
    successMessage: String(body?.successMessage || 'Application submitted successfully.').trim().slice(0, 280),
    fields: fields.map((field, idx) => normalizeApplicationField(field, idx)).filter((f) => f.label),
    reviewNotifications: normalizeReviewNotifications(body?.reviewNotifications),
    updatedBy: { id: actor?.id || null, username: actor?.username || null },
  };
}

function formatAnswerForEmbed(type, value) {
  if (type === 'boolean') return value === 'true' ? 'Yes' : 'No';
  if (!value) return '—';
  return String(value).slice(0, 1000);
}

function escapeMarkdown(value) {
  return String(value || '').replace(/[\\`*_~|>]/g, '\\$&');
}

async function deliverApplicationResult({ form, submission }) {
  if (!form?.recipient?.targetId) return null;

  const embed = {
    title: `New Application: ${form.name}`,
    color: 0x22d3ee,
    description: `A new application was submitted by **${escapeMarkdown(submission.applicantUsername)}** (<@${submission.applicantUserId}>).`,
    fields: [
      {
        name: 'Applicant',
        value: `User: <@${submission.applicantUserId}>\nID: ${submission.applicantUserId}`,
        inline: false,
      },
      ...submission.answers.slice(0, 20).map((ans) => ({
        name: ans.label,
        value: formatAnswerForEmbed(ans.type, ans.value),
        inline: false,
      })),
    ],
    footer: { text: `Submission ID: ${submission._id}` },
    timestamp: new Date().toISOString(),
  };

  if (form.recipient.type === 'user') {
    const dm = await discordApi.createDmChannel(form.recipient.targetId);
    const msg = await discordApi.postMessage(dm.id, { embeds: [embed] });
    return { recipientType: 'user', recipientTargetId: form.recipient.targetId, messageId: msg?.id || null };
  }

  const msg = await discordApi.postMessage(form.recipient.targetId, { embeds: [embed] });
  return { recipientType: 'channel', recipientTargetId: form.recipient.targetId, messageId: msg?.id || null };
}

async function deliverApplicantReviewStatus({ form, submission, previousStatus }) {
  if (!form?.reviewNotifications?.enabled) return;
  if (submission.status === previousStatus) return;

  const template = form.reviewNotifications.templates?.[submission.status];
  if (!template || template.mode === 'none') return;

  const isSubmitEvent = previousStatus === null; // true when called from the submit endpoint

  let embed;
  if (template.mode === 'saved_embed' && template.savedEmbedId) {
    const saved = await EmbedTemplate.findOne({ _id: template.savedEmbedId, guildId: form.guildId }).lean();
    if (saved) {
      embed = {
        title: saved.title || undefined,
        description: saved.description || undefined,
        color: typeof saved.color === 'number' ? saved.color : 0x22d3ee,
        footer: saved.footer ? { text: saved.footer } : undefined,
        image: saved.imageUrl ? { url: saved.imageUrl } : undefined,
        thumbnail: saved.thumbnailUrl ? { url: saved.thumbnailUrl } : undefined,
        author: saved.author ? { name: saved.author } : undefined,
        fields: Array.isArray(saved.fields)
          ? saved.fields.slice(0, 25).map((f) => ({ name: f.name, value: f.value, inline: !!f.inline }))
          : undefined,
      };
    }
  }

  if (!embed) {
    embed = {
      title: template.genericTitle || (isSubmitEvent ? 'Application Received' : `Application ${submission.status.replace('_', ' ')}`),
      description: template.genericDescription || (isSubmitEvent
        ? `Your application **${form.name}** was received and is pending review.`
        : `Your application status changed to **${submission.status.replace('_', ' ')}**.`),
      color: parseColorInt(template.genericColor),
    };
  }

  if (!embed.fields) embed.fields = [];
  if (form.reviewNotifications.showApplicationField !== false) {
    embed.fields.push({ name: 'Application', value: form.name, inline: true });
  }
  if (!isSubmitEvent && form.reviewNotifications.showStatusField !== false) {
    embed.fields.push({ name: 'New Status', value: submission.status.replace('_', ' '), inline: true });
  }
  if (!isSubmitEvent) {
    if (submission.reviewNote) {
      embed.fields.push({ name: 'Review Note', value: String(submission.reviewNote).slice(0, 1000), inline: false });
    }
  }
  embed.timestamp = new Date().toISOString();

  try {
    const dm = await discordApi.createDmChannel(submission.applicantUserId);
    await discordApi.postMessage(dm.id, { embeds: [embed] });
  } catch (err) {
    console.error('[API] review notification delivery warning', err?.message || err);
  }
}

// ── GET /api/guild/:guildId/applications ─────────────────────
router.get('/guild/:guildId/applications', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const forms = await ApplicationForm.find({ guildId }).sort({ createdAt: -1 }).lean();

    const counts = await ApplicationSubmission.aggregate([
      { $match: { guildId } },
      { $group: { _id: '$applicationId', total: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    const result = forms.map((form) => ({
      ...form,
      stats: {
        totalSubmissions: countMap.get(String(form._id))?.total || 0,
        pendingSubmissions: countMap.get(String(form._id))?.pending || 0,
      },
      publicUrl: `/apply/${guildId}/${form._id}`,
    }));

    res.json(result);
  } catch (err) {
    console.error('[API] GET applications', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ── POST /api/guild/:guildId/applications ────────────────────
router.post('/guild/:guildId/applications', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const payload = normalizeApplicationPayload(req.body, req.user);

    if (!payload.name) return res.status(400).json({ error: 'Application name is required' });
    const answerableFields = payload.fields.filter((f) => f.type !== 'section');
    if (!answerableFields.length) return res.status(400).json({ error: 'Add at least one answerable application field' });
    if (!payload.recipient.targetId) {
      return res.status(400).json({ error: 'Select a destination channel or user to receive results' });
    }

    const form = await ApplicationForm.create({
      guildId,
      ...payload,
      createdBy: { id: req.user.id, username: req.user.username },
    });

    res.status(201).json(form);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An application with that name already exists' });
    }
    console.error('[API] POST applications', err);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// ── PUT /api/guild/:guildId/applications/:appId ──────────────
router.put('/guild/:guildId/applications/:appId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, appId } = req.params;
    const payload = normalizeApplicationPayload(req.body, req.user);

    if (!payload.name) return res.status(400).json({ error: 'Application name is required' });
    const answerableFields = payload.fields.filter((f) => f.type !== 'section');
    if (!answerableFields.length) return res.status(400).json({ error: 'Add at least one answerable application field' });
    if (!payload.recipient.targetId) {
      return res.status(400).json({ error: 'Select a destination channel or user to receive results' });
    }

    const updated = await ApplicationForm.findOneAndUpdate(
      { _id: appId, guildId },
      { $set: payload },
      { returnDocument: 'after' }
    );
    if (!updated) return res.status(404).json({ error: 'Application not found' });

    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An application with that name already exists' });
    }
    console.error('[API] PUT applications', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// ── DELETE /api/guild/:guildId/applications/:appId ───────────
router.delete('/guild/:guildId/applications/:appId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, appId } = req.params;
    const deleted = await ApplicationForm.findOneAndDelete({ _id: appId, guildId });
    if (!deleted) return res.status(404).json({ error: 'Application not found' });

    await ApplicationSubmission.deleteMany({ guildId, applicationId: appId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE applications', err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// ── GET /api/applications/public/:guildId/:applicationId ─────
router.get('/applications/public/:guildId/:applicationId', requireAuth, async (req, res) => {
  try {
    const { guildId, applicationId } = req.params;
    const form = await ApplicationForm.findOne({ guildId, _id: applicationId }).lean();
    if (!form) return res.status(404).json({ error: 'Application not found' });
    if (!form.isActive) return res.status(403).json({ error: 'This application is closed' });

    if (form.abuseProtection?.autoCloseAt && new Date(form.abuseProtection.autoCloseAt) <= new Date()) {
      return res.status(403).json({ error: 'This application is closed' });
    }

    res.json({
      _id: form._id,
      guildId: form.guildId,
      name: form.name,
      description: form.description,
      fields: form.fields || [],
      identity: form.identity || {},
      style: form.style || {},
      submitButtonText: form.submitButtonText,
      successMessage: form.successMessage,
    });
  } catch (err) {
    console.error('[API] GET applications/public', err);
    res.status(500).json({ error: 'Failed to load application' });
  }
});

// ── POST /api/applications/public/:guildId/:applicationId/submit ──
router.post('/applications/public/:guildId/:applicationId/submit', requireAuth, async (req, res) => {
  try {
    const { guildId, applicationId } = req.params;
    const form = await ApplicationForm.findOne({ guildId, _id: applicationId });
    if (!form) return res.status(404).json({ error: 'Application not found' });
    if (!form.isActive) return res.status(403).json({ error: 'This application is closed' });

    const now = new Date();
    if (form.abuseProtection?.autoCloseAt && new Date(form.abuseProtection.autoCloseAt) <= now) {
      return res.status(403).json({ error: 'This application is closed' });
    }

    const applicantUserId = String(req.user.id);
    const applicantUsername = String(req.user.username || 'Unknown User');

    const userCount = await ApplicationSubmission.countDocuments({
      guildId,
      applicationId,
      applicantUserId,
    });

    if (form.abuseProtection?.oneSubmissionPerUser && userCount > 0) {
      return res.status(409).json({ error: 'You have already submitted this application.' });
    }

    if (userCount >= (form.abuseProtection?.maxSubmissionsPerUser || 3)) {
      return res.status(429).json({ error: 'You reached the maximum submission count for this application.' });
    }

    if (form.abuseProtection?.blockIfPendingExists) {
      const pending = await ApplicationSubmission.findOne({ guildId, applicationId, applicantUserId, status: 'pending' }).lean();
      if (pending) {
        return res.status(409).json({ error: 'You already have a pending submission for this application.' });
      }
    }

    const cooldownMinutes = form.abuseProtection?.cooldownMinutes || 0;
    if (cooldownMinutes > 0) {
      const latest = await ApplicationSubmission.findOne({ guildId, applicationId, applicantUserId })
        .sort({ createdAt: -1 })
        .lean();
      if (latest?.createdAt) {
        const waitUntil = new Date(new Date(latest.createdAt).getTime() + cooldownMinutes * 60 * 1000);
        if (waitUntil > now) {
          return res.status(429).json({ error: 'Please wait before submitting another application.' });
        }
      }
    }

    const bodyAnswers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const answerableFields = (form.fields || []).filter((field) => field.type !== 'section');
    const answers = answerableFields.map((field) => {
      const raw = bodyAnswers[field.fieldId];
      const value = raw == null ? '' : String(raw).trim();
      return {
        fieldId: field.fieldId,
        label: field.label,
        type: field.type,
        value: value.slice(0, field.maxLength || 1000),
      };
    });

    const missing = answers.find((ans) => {
      const field = answerableFields.find((f) => f.fieldId === ans.fieldId);
      if (!field?.required) return false;
      return !ans.value;
    });

    if (missing) {
      return res.status(400).json({ error: `Please complete required field: ${missing.label}` });
    }

    const submission = await ApplicationSubmission.create({
      guildId,
      applicationId,
      applicantUserId,
      applicantUsername,
      applicantDisplayTag: `${applicantUsername}#${req.user.discriminator || '0000'}`,
      answers,
      status: 'pending',
    });

    try {
      const delivery = await deliverApplicationResult({ form, submission });
      if (delivery) {
        submission.delivery = {
          ...submission.delivery,
          ...delivery,
          deliveredAt: new Date(),
        };
        await submission.save();
      }
    } catch (deliveryError) {
      console.error('[API] applications delivery warning', deliveryError);
    }

    // Send "on submit" DM to applicant if configured
    try {
      const formObj = form.toObject ? form.toObject() : form;
      await deliverApplicantReviewStatus({ form: formObj, submission, previousStatus: null });
    } catch (notifyErr) {
      console.error('[API] application submit notify warning', notifyErr?.message || notifyErr);
    }

    res.status(201).json({ ok: true, message: form.successMessage || 'Application submitted successfully.' });
  } catch (err) {
    console.error('[API] POST applications/public submit', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ── GET /api/guild/:guildId/applications/:applicationId/submissions ──
router.get('/guild/:guildId/applications/:applicationId/submissions', requireAuth, requireApplicationReviewer, async (req, res) => {
  try {
    const { guildId, applicationId } = req.params;
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';

    const filter = { guildId, applicationId };
    if (['pending', 'in_review', 'approved', 'rejected'].includes(status)) filter.status = status;

    const submissions = await ApplicationSubmission.find(filter).sort({ createdAt: -1 }).lean();
    res.json(submissions);
  } catch (err) {
    console.error('[API] GET application submissions', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ── DELETE /api/guild/:guildId/applications/:applicationId/submissions/:submissionId ──
router.delete('/guild/:guildId/applications/:applicationId/submissions/:submissionId', requireAuth, requireApplicationReviewer, async (req, res) => {
  try {
    const { guildId, applicationId, submissionId } = req.params;

    const submission = await ApplicationSubmission.findOne({ _id: submissionId, guildId, applicationId }).lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Post transcript to the configured channel before deleting
    const form = await ApplicationForm.findOne({ _id: applicationId, guildId }).lean();
    if (form?.transcriptChannelId) {
      try {
        const embed = {
          title: `Application Transcript — ${form.name}`,
          color: 0x94a3b8,
          description: `Submission by **${escapeMarkdown(submission.applicantUsername)}** (<@${submission.applicantUserId}>) was deleted by **${escapeMarkdown(req.user.username)}**.`,
          fields: [
            {
              name: 'Applicant',
              value: `<@${submission.applicantUserId}> (${submission.applicantUserId})`,
              inline: true,
            },
            {
              name: 'Status at Deletion',
              value: submission.status.replace('_', ' '),
              inline: true,
            },
            {
              name: 'Deleted By',
              value: `${escapeMarkdown(req.user.username)} (${req.user.id})`,
              inline: true,
            },
            ...submission.answers.slice(0, 20).map((ans) => ({
              name: ans.label,
              value: formatAnswerForEmbed(ans.type, ans.value),
              inline: false,
            })),
          ],
          footer: { text: `Submission ID: ${submission._id}` },
          timestamp: new Date().toISOString(),
        };
        if (submission.reviewNote) {
          embed.fields.splice(3, 0, {
            name: 'Review Note',
            value: String(submission.reviewNote).slice(0, 1000),
            inline: false,
          });
        }
        await discordApi.postMessage(form.transcriptChannelId, { embeds: [embed] });
      } catch (transcriptErr) {
        console.error('[API] DELETE submission transcript warning', transcriptErr?.message || transcriptErr);
      }
    }

    await ApplicationSubmission.deleteOne({ _id: submissionId, guildId, applicationId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE submission', err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// ── PATCH /api/guild/:guildId/applications/:applicationId/submissions/:submissionId/review ──
router.patch('/guild/:guildId/applications/:applicationId/submissions/:submissionId/review', requireAuth, requireApplicationReviewer, async (req, res) => {
  try {
    const { guildId, applicationId, submissionId } = req.params;
    const nextStatus = ['pending', 'in_review', 'approved', 'rejected'].includes(req.body?.status)
      ? req.body.status
      : null;
    if (!nextStatus) return res.status(400).json({ error: 'Invalid status' });

    const reviewNote = String(req.body?.reviewNote || '').slice(0, 2000);
    const existingSubmission = await ApplicationSubmission.findOne({ _id: submissionId, guildId, applicationId });
    if (!existingSubmission) return res.status(404).json({ error: 'Submission not found' });

    const previousStatus = existingSubmission.status;
    existingSubmission.status = nextStatus;
    existingSubmission.reviewNote = reviewNote;
    existingSubmission.reviewedByUserId = req.user.id;
    existingSubmission.reviewedByUsername = req.user.username;
    existingSubmission.reviewedAt = new Date();
    await existingSubmission.save();

    try {
      const form = await ApplicationForm.findOne({ _id: applicationId, guildId }).lean();
      if (form) {
        await deliverApplicantReviewStatus({
          form,
          submission: existingSubmission,
          previousStatus,
        });
      }
    } catch (notifyErr) {
      console.error('[API] application review notify warning', notifyErr?.message || notifyErr);
    }

    res.json(existingSubmission);
  } catch (err) {
    console.error('[API] PATCH application review', err);
    res.status(500).json({ error: 'Failed to update submission review' });
  }
});

// ── GET /api/guild/:guildId/modconfig ────────────────────────
router.get('/guild/:guildId/modconfig', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const config = await GuildConfig.findOne({ guildId: req.params.guildId });
    res.json({
      moderatorRoleId:    config?.moderation?.moderatorRoleId    ?? null,
      auditLogChannelId:  config?.moderation?.auditLogChannelId  ?? null,
    });
  } catch (err) {
    console.error('[API] GET modconfig', err);
    res.status(500).json({ error: 'Failed to fetch mod config' });
  }
});

// ── PATCH /api/guild/:guildId/modconfig ──────────────────────
router.patch('/guild/:guildId/modconfig', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { moderatorRoleId, auditLogChannelId } = req.body;
    const update = {};
    if (moderatorRoleId !== undefined) {
      update['moderation.moderatorRoleId'] = (typeof moderatorRoleId === 'string' && /^\d+$/.test(moderatorRoleId)) ? moderatorRoleId : null;
    }
    if (auditLogChannelId !== undefined) {
      update['moderation.auditLogChannelId'] = (typeof auditLogChannelId === 'string' && /^\d+$/.test(auditLogChannelId)) ? auditLogChannelId : null;
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    await GuildConfig.findOneAndUpdate({ guildId }, { $set: update }, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] PATCH modconfig', err);
    res.status(500).json({ error: 'Failed to update mod config' });
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║  LEVELING                                                   ║
// ╚══════════════════════════════════════════════════════════════╝

const DEFAULT_FORMULA = { a: 5, b: 50, c: 100 };
const DEFAULT_LEVEL_CONFIG = {
  enabled: true,
  xpRate: 15,
  xpCooldown: 60,
  xpChannels: [],
  rewards: [],
  levelUpMessage: 'Congrats {user}! You reached level {level} in {server}.',
  levelUpChannelId: null,
  roleStack: true,
  formula: { ...DEFAULT_FORMULA },
};

// ── GET /api/guild/:guildId/levels ────────────────────────────
router.get('/guild/:guildId/levels', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await LevelConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $setOnInsert: { guildId: req.params.guildId, ...DEFAULT_LEVEL_CONFIG } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(cfg);
  } catch (err) {
    console.error('[API] GET levels', err);
    res.status(500).json({ error: 'Failed to fetch level config' });
  }
});

// ── PATCH /api/guild/:guildId/levels ─────────────────────────
router.patch('/guild/:guildId/levels', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const body = req.body;
    const update = {};

    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;

    if (typeof body.xpRate === 'number' && body.xpRate >= 1 && body.xpRate <= 500)
      update.xpRate = Math.floor(body.xpRate);

    if (typeof body.xpCooldown === 'number' && body.xpCooldown >= 0 && body.xpCooldown <= 3600)
      update.xpCooldown = Math.floor(body.xpCooldown);

    if (Array.isArray(body.xpChannels))
      update.xpChannels = body.xpChannels.filter((id) => typeof id === 'string' && /^\d+$/.test(id));

    if (typeof body.levelUpMessage === 'string')
      update.levelUpMessage = body.levelUpMessage.slice(0, 500).trim() || DEFAULT_LEVEL_CONFIG.levelUpMessage;

    if (body.levelUpChannelId !== undefined)
      update.levelUpChannelId = (typeof body.levelUpChannelId === 'string' && /^\d+$/.test(body.levelUpChannelId))
        ? body.levelUpChannelId : null;

    if (typeof body.roleStack === 'boolean') update.roleStack = body.roleStack;

    if (body.formula && typeof body.formula === 'object') {
      const a = Number(body.formula.a), b = Number(body.formula.b), c = Number(body.formula.c);
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
        update['formula.a'] = Math.max(0, a);
        update['formula.b'] = Math.max(0, b);
        update['formula.c'] = Math.max(1, c);
      }
    }

    if (Array.isArray(body.rewards)) {
      update.rewards = body.rewards
        .filter((r) => typeof r.level === 'number' && r.level >= 1 && /^\d+$/.test(String(r.roleId || '')))
        .map((r) => ({ level: Math.floor(r.level), roleId: String(r.roleId) }))
        .sort((a, b) => a.level - b.level);
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    const setOnInsertDefaults = { ...DEFAULT_LEVEL_CONFIG };
    for (const key of Object.keys(update)) {
      const topKey = key.split('.')[0];
      delete setOnInsertDefaults[topKey];
    }

    const doc = await LevelConfig.findOneAndUpdate(
      { guildId },
      { $set: update, $setOnInsert: { guildId, ...setOnInsertDefaults } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ ok: true, config: doc });
  } catch (err) {
    console.error('[API] PATCH levels', err);
    res.status(500).json({ error: 'Failed to update level config' });
  }
});

// ── GET /api/guild/:guildId/levels/leaderboard ───────────────
router.get('/guild/:guildId/levels/leaderboard', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      LevelProfile.find({ guildId }).sort({ xp: -1 }).skip(skip).limit(limit).lean(),
      LevelProfile.countDocuments({ guildId }),
    ]);

    res.json({
      rows: rows.map((r, i) => ({
        userId: r.userId,
        xp: r.xp,
        level: r.level,
        rank: skip + i + 1,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[API] GET leaderboard', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── POST /api/guild/:guildId/levels/reset ────────────────────
router.post('/guild/:guildId/levels/reset', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const result = await LevelProfile.deleteMany({ guildId: req.params.guildId });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[API] POST levels/reset', err);
    res.status(500).json({ error: 'Failed to reset leaderboard' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ECONOMY ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/guild/:guildId/economy ──────────────────────────
router.get('/guild/:guildId/economy', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await EconomyConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $setOnInsert: { guildId: req.params.guildId } },
      { upsert: true, new: true }
    ).lean();
    res.json(cfg);
  } catch (err) {
    console.error('[API] GET economy config', err);
    res.status(500).json({ error: 'Failed to fetch economy config' });
  }
});

// ── PATCH /api/guild/:guildId/economy ────────────────────────
router.patch('/guild/:guildId/economy', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const allowed = [
      'enabled', 'currencyName', 'currencySymbol', 'startingBalance',
      'dailyAmount', 'dailyCooldown', 'weeklyAmount', 'weeklyCooldown',
      'workCooldown', 'workMin', 'workMax',
      'crimeCooldown', 'crimeMin', 'crimeMax', 'crimeSuccessRate',
      'begCooldown', 'begMin', 'begMax',
      'robCooldown', 'robMin', 'robMax', 'robSuccessRate',
      'fishCooldown', 'huntCooldown',
      'minBet', 'maxBet', 'defaultBankCap', 'allowedChannels',
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const cfg = await EconomyConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $set: update },
      { upsert: true, new: true }
    ).lean();
    res.json(cfg);
  } catch (err) {
    console.error('[API] PATCH economy config', err);
    res.status(500).json({ error: 'Failed to save economy config' });
  }
});

// ── GET /api/guild/:guildId/economy/leaderboard ──────────────
router.get('/guild/:guildId/economy/leaderboard', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const [profiles, total] = await Promise.all([
      EconomyProfile.find({ guildId: req.params.guildId })
        .sort({ netWorth: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EconomyProfile.countDocuments({ guildId: req.params.guildId }),
    ]);
    res.json({ profiles, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[API] GET economy leaderboard', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── POST /api/guild/:guildId/economy/reset ───────────────────
router.post('/guild/:guildId/economy/reset', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      await EconomyProfile.deleteOne({ guildId: req.params.guildId, userId });
      return res.json({ ok: true, message: 'User profile reset.' });
    }
    const result = await EconomyProfile.deleteMany({ guildId: req.params.guildId });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[API] POST economy/reset', err);
    res.status(500).json({ error: 'Failed to reset economy' });
  }
});

// ── GET /api/guild/:guildId/economy/shop ─────────────────────
router.get('/guild/:guildId/economy/shop', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await EconomyConfig.findOne({ guildId: req.params.guildId }).lean();
    res.json(cfg?.shop || []);
  } catch (err) {
    console.error('[API] GET economy shop', err);
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// ── POST /api/guild/:guildId/economy/shop ────────────────────
router.post('/guild/:guildId/economy/shop', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { name, description, price, emoji, type, roleId, usable, useEffect, useValue, stock } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
    const itemId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = {
      itemId, name, description: description || '', price: Number(price),
      emoji: emoji || '🛒', type: type || 'item',
      roleId: roleId || null, usable: !!usable,
      useEffect: useEffect || null, useValue: Number(useValue) || 0,
      stock: stock != null ? Number(stock) : -1, soldCount: 0, active: true,
    };
    const cfg = await EconomyConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $push: { shop: item } },
      { upsert: true, new: true }
    ).lean();
    res.json({ ok: true, shop: cfg.shop });
  } catch (err) {
    console.error('[API] POST economy shop', err);
    res.status(500).json({ error: 'Failed to add shop item' });
  }
});

// ── PATCH /api/guild/:guildId/economy/shop/:itemId ───────────
router.patch('/guild/:guildId/economy/shop/:itemId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'description', 'price', 'emoji', 'type', 'roleId', 'usable', 'useEffect', 'useValue', 'stock', 'active'];
    const setFields = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) setFields[`shop.$.${key}`] = req.body[key];
    }
    const cfg = await EconomyConfig.findOneAndUpdate(
      { guildId: req.params.guildId, 'shop.itemId': req.params.itemId },
      { $set: setFields },
      { new: true }
    ).lean();
    if (!cfg) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true, shop: cfg.shop });
  } catch (err) {
    console.error('[API] PATCH economy shop item', err);
    res.status(500).json({ error: 'Failed to update shop item' });
  }
});

// ── DELETE /api/guild/:guildId/economy/shop/:itemId ──────────
router.delete('/guild/:guildId/economy/shop/:itemId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await EconomyConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $pull: { shop: { itemId: req.params.itemId } } },
      { new: true }
    ).lean();
    if (!cfg) return res.status(404).json({ error: 'Config not found' });
    res.json({ ok: true, shop: cfg.shop });
  } catch (err) {
    console.error('[API] DELETE economy shop item', err);
    res.status(500).json({ error: 'Failed to delete shop item' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AI ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/guild/:guildId/ai ────────────────────────────────
router.get('/guild/:guildId/ai', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cfg = await AIConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $setOnInsert: { guildId: req.params.guildId } },
      { upsert: true, new: true }
    ).lean();
    res.json(cfg);
  } catch (err) {
    console.error('[API] GET ai config', err);
    res.status(500).json({ error: 'Failed to fetch AI config' });
  }
});

// ── PATCH /api/guild/:guildId/ai ──────────────────────────────
router.patch('/guild/:guildId/ai', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const allowed = ['enabled', 'allowedChannels', 'systemPrompt', 'model', 'temperature', 'maxTokens', 'requireMention'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // Sanitize systemPrompt
    if (update.systemPrompt) update.systemPrompt = String(update.systemPrompt).slice(0, 2000);
    const cfg = await AIConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $set: update },
      { upsert: true, new: true }
    ).lean();
    res.json(cfg);
  } catch (err) {
    console.error('[API] PATCH ai config', err);
    res.status(500).json({ error: 'Failed to save AI config' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CUSTOM COMMANDS ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/guild/:guildId/custom-commands ───────────────────
router.get('/guild/:guildId/custom-commands', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cmds = await CustomCommand.find({ guildId: req.params.guildId }).sort({ name: 1 }).lean();
    res.json(cmds);
  } catch (err) {
    console.error('[API] GET custom-commands', err);
    res.status(500).json({ error: 'Failed to fetch custom commands' });
  }
});

// ── POST /api/guild/:guildId/custom-commands ──────────────────
router.post('/guild/:guildId/custom-commands', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { name, trigger, triggerType, response, type, embedColor, embedTitle, embedDescription,
      allowedRoles, allowedChannels, cooldownSeconds, deleteUserMessage, caseSensitive } = req.body;
    if (!name?.trim() || !trigger?.trim() || !response?.trim()) {
      return res.status(400).json({ error: 'name, trigger, and response are required' });
    }
    const existing = await CustomCommand.findOne({ guildId: req.params.guildId, name: name.trim() });
    if (existing) return res.status(409).json({ error: 'A command with that name already exists' });

    const cmd = await CustomCommand.create({
      guildId: req.params.guildId,
      name: name.trim().slice(0, 50),
      trigger: trigger.trim().slice(0, 100),
      triggerType: triggerType || 'exact',
      response: response.trim().slice(0, 2000),
      type: type || 'text',
      embedColor: embedColor || '#0f52ba',
      embedTitle: (embedTitle || '').slice(0, 256),
      embedDescription: (embedDescription || '').slice(0, 2000),
      allowedRoles: allowedRoles || [],
      allowedChannels: allowedChannels || [],
      cooldownSeconds: Number(cooldownSeconds) || 0,
      deleteUserMessage: !!deleteUserMessage,
      caseSensitive: !!caseSensitive,
      enabled: true,
    });
    res.json(cmd);
  } catch (err) {
    console.error('[API] POST custom-commands', err);
    res.status(500).json({ error: 'Failed to create custom command' });
  }
});

// ── PATCH /api/guild/:guildId/custom-commands/:id ────────────
router.patch('/guild/:guildId/custom-commands/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'trigger', 'triggerType', 'response', 'type', 'embedColor',
      'embedTitle', 'embedDescription', 'enabled', 'allowedRoles', 'allowedChannels',
      'cooldownSeconds', 'deleteUserMessage', 'caseSensitive'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const cmd = await CustomCommand.findOneAndUpdate(
      { _id: req.params.id, guildId: req.params.guildId },
      { $set: update },
      { new: true }
    ).lean();
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    res.json(cmd);
  } catch (err) {
    console.error('[API] PATCH custom-command', err);
    res.status(500).json({ error: 'Failed to update custom command' });
  }
});

// ── DELETE /api/guild/:guildId/custom-commands/:id ───────────
router.delete('/guild/:guildId/custom-commands/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const cmd = await CustomCommand.findOneAndDelete({ _id: req.params.id, guildId: req.params.guildId });
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE custom-command', err);
    res.status(500).json({ error: 'Failed to delete custom command' });
  }
});

// ── THEME CONFIG ─────────────────────────────────────────────

// GET /api/guild/:guildId/theme
router.get('/guild/:guildId/theme', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const theme = await ThemeConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(theme);
  } catch (err) {
    console.error('[API] GET theme', err);
    res.status(500).json({ error: 'Failed to load theme config' });
  }
});

// PATCH /api/guild/:guildId/theme
router.patch('/guild/:guildId/theme', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const allowed = ['embedColor', 'embedFooterText', 'embedFooterIconUrl', 'embedAuthorName', 'embedAuthorIconUrl', 'thumbnailUrl', 'useServerIcon', 'showTimestamp'];
    const update = {};
    for (const key of allowed) {
      if (key in req.body) update[key] = req.body[key];
    }
    const theme = await ThemeConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(theme);
  } catch (err) {
    console.error('[API] PATCH theme', err);
    res.status(500).json({ error: 'Failed to update theme config' });
  }
});

// ── MODERATION CONFIG ────────────────────────────────────────

async function getModConfig(guildId) {
  return ModerationConfig.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

// GET full config
router.get('/guild/:guildId/modconfig/full', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    res.json(await getModConfig(req.params.guildId));
  } catch (err) {
    console.error('[API] GET modconfig/full', err);
    res.status(500).json({ error: 'Failed to load mod config' });
  }
});

// PATCH generic sub-section helper
router.patch('/guild/:guildId/modconfig/full', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const allowed = ['purgePinned','privacy','channelLock','predefinedReasons',
      'userNotifications','immuneRoles','punishSettings','userReports','appeals'];
    const update = {};
    for (const k of allowed) {
      if (k in req.body) update[k] = req.body[k];
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });
    const cfg = await ModerationConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(cfg);
  } catch (err) {
    console.error('[API] PATCH modconfig/full', err);
    res.status(500).json({ error: 'Failed to save mod config' });
  }
});

// POST add predefined reason
router.post('/guild/:guildId/modconfig/reasons', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { aliases, reason } = req.body;
    if (!reason || typeof reason !== 'string') return res.status(400).json({ error: 'reason required' });
    const safeAliases = (Array.isArray(aliases) ? aliases : []).map(a => String(a).trim().slice(0,50)).filter(Boolean);
    const cfg = await ModerationConfig.findOneAndUpdate(
      { guildId },
      { $push: { predefinedReasons: { aliases: safeAliases, reason: String(reason).trim().slice(0,500) } } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(cfg.predefinedReasons);
  } catch (err) {
    console.error('[API] POST reasons', err);
    res.status(500).json({ error: 'Failed to add reason' });
  }
});

// DELETE predefined reason
router.delete('/guild/:guildId/modconfig/reasons/:reasonId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, reasonId } = req.params;
    await ModerationConfig.findOneAndUpdate({ guildId }, { $pull: { predefinedReasons: { _id: reasonId } } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE reason', err);
    res.status(500).json({ error: 'Failed to delete reason' });
  }
});

// POST add appeal question
router.post('/guild/:guildId/modconfig/appeals/questions', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { label, type, required, options, placeholder } = req.body;
    if (!label) return res.status(400).json({ error: 'label required' });
    const question = {
      id: Date.now().toString(36),
      label: String(label).trim().slice(0,200),
      type: ['text','textarea','select'].includes(type) ? type : 'textarea',
      required: !!required,
      options: Array.isArray(options) ? options.map(o => String(o).trim()).filter(Boolean) : [],
      placeholder: String(placeholder||'').trim().slice(0,200),
    };
    const cfg = await ModerationConfig.findOneAndUpdate(
      { guildId },
      { $push: { 'appeals.questions': question } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(cfg.appeals.questions);
  } catch (err) {
    console.error('[API] POST appeal question', err);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// DELETE appeal question
router.delete('/guild/:guildId/modconfig/appeals/questions/:qId', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, qId } = req.params;
    await ModerationConfig.findOneAndUpdate({ guildId }, { $pull: { 'appeals.questions': { id: qId } } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE appeal question', err);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ── Per-action predefined reasons (bot autocomplete) ──────────────────────

// GET /api/guild/:guildId/predefined-reasons — returns { ban:[], kick:[], mute:[], warn:[] }
router.get('/guild/:guildId/predefined-reasons', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const ACTIONS = ['ban', 'kick', 'mute', 'warn'];
    const docs = await PredefinedReasons.find({ guildId, action: { $in: ACTIONS } }).lean();
    const result = {};
    for (const action of ACTIONS) {
      const doc = docs.find((d) => d.action === action);
      result[action] = doc?.reasons || [];
    }
    res.json(result);
  } catch (err) {
    console.error('[API] GET predefined-reasons', err);
    res.status(500).json({ error: 'Failed to fetch predefined reasons' });
  }
});

// PUT /api/guild/:guildId/predefined-reasons/:action — replace reasons list for one action
router.put('/guild/:guildId/predefined-reasons/:action', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, action } = req.params;
    const ACTIONS = ['ban', 'kick', 'mute', 'warn'];
    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    const raw = Array.isArray(req.body.reasons) ? req.body.reasons : [];
    const reasons = raw
      .filter((r) => r && typeof r === 'object' && typeof r.name === 'string' && typeof r.value === 'string')
      .map((r) => ({ name: r.name.trim().slice(0, 100), value: r.value.trim().slice(0, 512) }))
      .filter((r) => r.name && r.value);
    const doc = await PredefinedReasons.findOneAndUpdate(
      { guildId, action },
      { $set: { reasons } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ action, reasons: doc.reasons });
  } catch (err) {
    console.error('[API] PUT predefined-reasons', err);
    res.status(500).json({ error: 'Failed to save reasons' });
  }
});

// ── CASE SYSTEM ──────────────────────────────────────────────

// GET /api/guild/:guildId/cases?page=1&type=&userId=&moderatorId=
router.get('/guild/:guildId/cases', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const query = { guildId };
    if (req.query.type && req.query.type !== 'all') query.type = req.query.type;
    if (req.query.userId) query.targetUserId = req.query.userId;
    if (req.query.moderatorId) query.moderatorId = req.query.moderatorId;
    const [cases, total] = await Promise.all([
      ModerationCase.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ModerationCase.countDocuments(query),
    ]);
    res.json({ cases, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[API] GET cases', err);
    res.status(500).json({ error: 'Failed to load cases' });
  }
});

// GET /api/guild/:guildId/cases/:id
router.get('/guild/:guildId/cases/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const c = await ModerationCase.findOne({ _id: req.params.id, guildId: req.params.guildId }).lean();
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(c);
  } catch (err) {
    console.error('[API] GET case detail', err);
    res.status(500).json({ error: 'Failed to load case' });
  }
});

// POST /api/guild/:guildId/cases — create a moderation case
router.post('/guild/:guildId/cases', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const VALID_TYPES = ['warn', 'mute', 'kick', 'ban', 'unban', 'unmute'];
    const { targetUserId, targetTag, reason, type, duration } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });
    const caseType = VALID_TYPES.includes(type) ? type : 'warn';
    // Generate next case number
    const last = await ModerationCase.findOne({ guildId }).sort({ createdAt: -1 }).lean();
    const lastNum = last ? (parseInt(last.caseNumber) || 0) : 0;
    const caseNumber = String(lastNum + 1);
    const moderatorId = req.user.id;
    const moderatorTag = req.user.username || req.user.id;
    const c = await ModerationCase.create({
      guildId, caseNumber, type: caseType,
      targetUserId, targetTag: targetTag || null,
      moderatorId, moderatorTag,
      reason: reason || 'No reason provided.',
      duration: duration || null,
    });
    res.status(201).json(c);
  } catch (err) {
    console.error('[API] POST case', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

// PATCH /api/guild/:guildId/cases/:id — edit reason / notes (+ DM update)
router.patch('/guild/:guildId/cases/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, id } = req.params;
    const allowed = ['reason', 'notes'];
    const update = {};
    for (const k of allowed) { if (k in req.body) update[k] = req.body[k]; }

    const c = await ModerationCase.findOneAndUpdate(
      { _id: id, guildId }, { $set: update }, { new: true }
    );
    if (!c) return res.status(404).json({ error: 'Case not found' });

    let dmUpdated = false;
    let dmSent = false;

    // If reason was changed and user was DM'd, try to update or resend
    if ('reason' in update && c.targetUserId) {
      const newReason = update.reason || 'No reason provided.';
      const dmContent = `Your case reason has been updated:\n**Reason:** ${newReason}`;

      if (c.dmDelivered && c.dmMessageId && c.dmChannelId) {
        // Try to edit the original DM
        try {
          await discordApi.editMessage(c.dmChannelId, c.dmMessageId, { content: dmContent });
          dmUpdated = true;
        } catch (_) {
          // Editing failed (e.g. DM in a server, too old) — send a new DM
          try {
            const dmChannel = await discordApi.createDmChannel(c.targetUserId);
            if (dmChannel?.id) {
              const msg = await discordApi.postMessage(dmChannel.id, { content: dmContent });
              if (msg?.id) {
                await ModerationCase.findByIdAndUpdate(id, {
                  $set: { dmChannelId: dmChannel.id, dmMessageId: msg.id }
                });
              }
              dmSent = true;
            }
          } catch (_2) { /* ignore - user may have DMs disabled */ }
        }
      } else if (c.dmDelivered && !c.dmMessageId) {
        // dmDelivered but no stored message ID — send a new DM update notification
        try {
          const dmChannel = await discordApi.createDmChannel(c.targetUserId);
          if (dmChannel?.id) {
            const msg = await discordApi.postMessage(dmChannel.id, { content: dmContent });
            if (msg?.id) {
              await ModerationCase.findByIdAndUpdate(id, {
                $set: { dmChannelId: dmChannel.id, dmMessageId: msg.id }
              });
            }
            dmSent = true;
          }
        } catch (_) { /* ignore */ }
      }
    }

    res.json({ ...c.toObject(), dmUpdated, dmSent });
  } catch (err) {
    console.error('[API] PATCH case', err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

// DELETE /api/guild/:guildId/cases/:id
router.delete('/guild/:guildId/cases/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const c = await ModerationCase.findOneAndDelete({ _id: req.params.id, guildId: req.params.guildId });
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE case', err);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// ── CUSTOM RESPONSES ─────────────────────────────────────────

// Supported command names for response overrides
const RESPONSE_COMMANDS = ['daily', 'weekly', 'work', 'crime', 'beg', 'rob', 'balance', 'level', 'rep', 'fish', 'hunt', 'slots', 'coinflip'];

// GET /api/guild/:guildId/responses
router.get('/guild/:guildId/responses', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const cfg = await ResponseConfig.findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ...cfg.toObject(), availableCommands: RESPONSE_COMMANDS });
  } catch (err) {
    console.error('[API] GET responses', err);
    res.status(500).json({ error: 'Failed to load response config' });
  }
});

// PATCH /api/guild/:guildId/responses — toggle enabled
router.patch('/guild/:guildId/responses', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const update = {};
    if (typeof req.body.enabled === 'boolean') update.enabled = req.body.enabled;
    const cfg = await ResponseConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(cfg);
  } catch (err) {
    console.error('[API] PATCH responses', err);
    res.status(500).json({ error: 'Failed to update response config' });
  }
});

// PUT /api/guild/:guildId/responses/:commandName — upsert override
router.put('/guild/:guildId/responses/:commandName', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, commandName } = req.params;
    if (!RESPONSE_COMMANDS.includes(commandName)) return res.status(400).json({ error: 'Unknown command name' });
    const template = String(req.body.template || '').trim().slice(0, 2000);
    if (!template) return res.status(400).json({ error: 'template is required' });
    await ResponseConfig.updateOne(
      { guildId },
      { $pull: { overrides: { commandName } } },
      { upsert: true }
    );
    const cfg = await ResponseConfig.findOneAndUpdate(
      { guildId },
      { $push: { overrides: { commandName, template } } },
      { new: true }
    );
    res.json(cfg);
  } catch (err) {
    console.error('[API] PUT response override', err);
    res.status(500).json({ error: 'Failed to save override' });
  }
});

// DELETE /api/guild/:guildId/responses/:commandName — remove override
router.delete('/guild/:guildId/responses/:commandName', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, commandName } = req.params;
    const cfg = await ResponseConfig.findOneAndUpdate(
      { guildId },
      { $pull: { overrides: { commandName } } },
      { new: true }
    );
    if (!cfg) return res.status(404).json({ error: 'Config not found' });
    res.json(cfg);
  } catch (err) {
    console.error('[API] DELETE response override', err);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

// ── BOT MESSAGE TEMPLATES ────────────────────────────────────

const BOT_MESSAGE_TYPES = [
  { key: 'warn_dm',         label: 'Warn DM',          group: 'Punishment DMs' },
  { key: 'mute_dm',         label: 'Mute DM',          group: 'Punishment DMs' },
  { key: 'kick_dm',         label: 'Kick DM',          group: 'Punishment DMs' },
  { key: 'ban_dm',          label: 'Ban DM',           group: 'Punishment DMs' },
  { key: 'unmute_dm',       label: 'Unmute DM',        group: 'Punishment DMs' },
  { key: 'unban_dm',        label: 'Unban DM',         group: 'Punishment DMs' },
  { key: 'warn_response',   label: 'Warn Response',    group: 'Punishment Responses' },
  { key: 'mute_response',   label: 'Mute Response',    group: 'Punishment Responses' },
  { key: 'kick_response',   label: 'Kick Response',    group: 'Punishment Responses' },
  { key: 'ban_response',    label: 'Ban Response',     group: 'Punishment Responses' },
  { key: 'unmute_response', label: 'Unmute Response',  group: 'Punishment Responses' },
  { key: 'unban_response',  label: 'Unban Response',   group: 'Punishment Responses' },
  { key: 'warn_log',        label: 'Warn Log',         group: 'Logging' },
  { key: 'mute_log',        label: 'Mute Log',         group: 'Logging' },
  { key: 'kick_log',        label: 'Kick Log',         group: 'Logging' },
  { key: 'ban_log',         label: 'Ban Log',          group: 'Logging' },
];

// GET /api/guild/:guildId/bot-messages — list all templates for this guild
router.get('/guild/:guildId/bot-messages', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId } = req.params;
    const templates = await BotMessageTemplate.find({ guildId }).lean();
    const templateMap = {};
    templates.forEach(t => { templateMap[t.messageType] = t; });
    res.json({ types: BOT_MESSAGE_TYPES, templates: templateMap });
  } catch (err) {
    console.error('[API] GET bot-messages', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// GET /api/guild/:guildId/bot-messages/:type — get single template
router.get('/guild/:guildId/bot-messages/:type', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, type } = req.params;
    if (!BOT_MESSAGE_TYPES.find(t => t.key === type)) return res.status(404).json({ error: 'Unknown message type' });
    const tmpl = await BotMessageTemplate.findOne({ guildId, messageType: type }).lean();
    res.json(tmpl || { messageType: type });
  } catch (err) {
    console.error('[API] GET bot-messages/:type', err);
    res.status(500).json({ error: 'Failed to load template' });
  }
});

// PATCH /api/guild/:guildId/bot-messages/:type — save template
router.patch('/guild/:guildId/bot-messages/:type', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const { guildId, type } = req.params;
    if (!BOT_MESSAGE_TYPES.find(t => t.key === type)) return res.status(404).json({ error: 'Unknown message type' });
    const allowed = ['enabled','content','embedEnabled','embedColor','embedAuthor','embedTitle','embedDescription','embedFooter','embedThumbnail','embedFields','messageStyle','removeTitleEmoji','removeEmptyLines'];
    const update = {};
    for (const k of allowed) { if (k in req.body) update[k] = req.body[k]; }
    const tmpl = await BotMessageTemplate.findOneAndUpdate(
      { guildId, messageType: type },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(tmpl);
  } catch (err) {
    console.error('[API] PATCH bot-messages/:type', err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

module.exports = router;
