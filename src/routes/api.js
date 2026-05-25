const express = require('express');
const path = require('path');
const router = express.Router();

const { GuildConfig } = require('../models/GuildConfig');
const { StoredVariable }      = require('../models/StoredVariable');
const { StoredVariableValue } = require('../models/StoredVariableValue');
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
const Blacklist = require('../models/Blacklist');
const { AutoModConfig } = require('../models/AutoModConfig');
const { WelcomeConfig } = require('../models/WelcomeConfig');
const { TicketConfig } = require('../models/TicketConfig');
const { Ticket } = require('../models/Ticket');
const { StarboardConfig } = require('../models/StarboardConfig');
const { StarboardEntry } = require('../models/StarboardEntry');
const { Giveaway } = require('../models/Giveaway');
const { Poll } = require('../models/Poll');
const { StatsConfig } = require('../models/StatsConfig');
const { AnalyticsEvent } = require('../models/AnalyticsEvent');
const { CommandAnalytics } = require('../models/CommandAnalytics');
const { UserNote } = require('../models/UserNote');
const { InviteTracker, InviteJoin } = require('../models/InviteTracker');
const { EscalationConfig } = require('../models/EscalationConfig');
const { AFKEntry } = require('../models/AFKEntry');
const { SlowmodeConfig } = require('../models/SlowmodeConfig');
const { GuildCommand } = require('../models/GuildCommand');
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
    const includeVoice = req.query.voice === '1';
    const channels = await discordApi.getGuildChannels(req.params.guildId, { includeVoice });
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
      { upsert: true, returnDocument: 'after' }
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
    const { name, type, channelId, messageUrl, content, embedTitle, embedDescription, embedColor, options } = req.body;
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
      content: content?.trim() || null,
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
    const { channelId, messageUrl, content, embedTitle, embedDescription, embedColor, options } = req.body;
    const rr = await ReactionRole.findOne({ _id: rrId, guildId });
    if (!rr) return res.status(404).json({ error: 'Reaction role group not found' });

    if (channelId !== undefined) rr.channelId = channelId || null;
    if (messageUrl !== undefined && messageUrl && rr.type !== 'emoji') {
      return res.status(400).json({ error: 'Existing message links are only supported for emoji reaction roles' });
    }
    if (messageUrl !== undefined) rr.messageUrl = messageUrl || null;
    if (content !== undefined) rr.content = content?.trim() || null;
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
      const url = rr.messageUrl;
      const usingLinkedExistingMessage = Boolean(url);
      let targetChannelId = null;
      let targetMessageId = null;

      if (url) {
        const match = url.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
        if (!match) return res.status(400).json({ error: 'Invalid Discord message URL' });
        const [, , chanId, msgId] = match;
        targetChannelId = chanId;
        targetMessageId = msgId;
      } else {
        targetChannelId = rr.channelId || rr.externalChannelId;
        if (!targetChannelId) return res.status(400).json({ error: 'No channel set for this reaction role group' });

        const body = buildMessageBody(rr);
        let postedMessage;
        const previousMessageId = rr.externalMessageId || rr.messageId;

        if (previousMessageId) {
          try {
            postedMessage = await discordApi.editMessage(targetChannelId, previousMessageId, body);
          } catch {
            postedMessage = await discordApi.postMessage(targetChannelId, body);
          }
        } else {
          postedMessage = await discordApi.postMessage(targetChannelId, body);
        }

        targetMessageId = postedMessage?.id || previousMessageId;
      }

      rr.externalChannelId = targetChannelId;
      rr.externalMessageId = targetMessageId;
      rr.messageId = usingLinkedExistingMessage ? null : targetMessageId;
      await rr.save();

      // Seed reactions so users know what to react with
      for (const opt of rr.options) {
        if (opt.label) {
          try { await discordApi.addReaction(targetChannelId, targetMessageId, normalizeEmojiForReactionApi(opt.label)); } catch (_) {}
        }
      }
      return res.json({ ok: true, messageId: targetMessageId, channelId: targetChannelId });
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
    content:    rr.content || undefined,
    embeds:     embeds.length ? embeds : undefined,
    components: components.length ? components : undefined,
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after' }
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
      { upsert: true, returnDocument: 'after' }
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
      { upsert: true, returnDocument: 'after' }
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
      { returnDocument: 'after' }
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
      { returnDocument: 'after' }
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
      { upsert: true, returnDocument: 'after' }
    ).lean();
    // Mask API key — never send raw key to client
    const safe = { ...cfg };
    if (safe.apiKey) safe.apiKey = '••••••••••••••••••••';
    res.json(safe);
  } catch (err) {
    console.error('[API] GET ai config', err);
    res.status(500).json({ error: 'Failed to fetch AI config' });
  }
});

// ── PATCH /api/guild/:guildId/ai ──────────────────────────────
router.patch('/guild/:guildId/ai', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const allowed = ['enabled', 'allowedChannels', 'systemPrompt', 'model', 'temperature', 'maxTokens', 'requireMention', 'rememberContext', 'apiKey'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // Sanitize systemPrompt
    if (update.systemPrompt) update.systemPrompt = String(update.systemPrompt).slice(0, 2000);
    // Sanitize apiKey — basic format check
    if (update.apiKey !== undefined) {
      const key = String(update.apiKey || '').trim();
      if (key.length > 0 && key.length < 20) return res.status(400).json({ error: 'Invalid API key format' });
      update.apiKey = key.slice(0, 200);
    }
    const cfg = await AIConfig.findOneAndUpdate(
      { guildId: req.params.guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    // Mask API key in response
    const safe = { ...cfg };
    if (safe.apiKey) safe.apiKey = '••••••••••••••••••••';
    res.json(safe);
  } catch (err) {
    console.error('[API] PATCH ai config', err);
    res.status(500).json({ error: 'Failed to save AI config' });
  }
});

// ── POST /api/guild/:guildId/ai/validate-key ──────────────────
router.post('/guild/:guildId/ai/validate-key', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const apiKey = String(req.body.apiKey || '').trim();
    if (!apiKey || apiKey.length < 20) return res.status(400).json({ valid: false, error: 'Key too short' });
    // Attempt a minimal Groq API call to test the key
    const testRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (testRes.ok) {
      res.json({ valid: true });
    } else {
      const body = await testRes.json().catch(() => ({}));
      res.json({ valid: false, error: body?.error?.message || 'Authentication failed' });
    }
  } catch (err) {
    console.error('[API] validate Groq key', err);
    res.status(500).json({ valid: false, error: 'Validation request failed' });
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

// ── Shared CC validation helper ───────────────────────────────
const CC_ALLOWED_BLOCK_TYPES = new Set([
  // Messages
  'reply', 'send_message', 'send_embed', 'dm_user', 'send_to_channel',
  'edit_message', 'delete_message', 'pin_message',
  // Components
  'add_reaction', 'send_buttons', 'send_select_menu', 'send_modal', 'show_modal',
  // Roles
  'add_role', 'remove_role', 'toggle_role',
  // Economy
  'give_coins', 'take_coins', 'set_coins', 'set_balance', 'check_coins', 'check_balance', 'give_item',
  // Leveling
  'give_xp', 'take_xp', 'check_xp', 'check_level', 'get_level',
  // Moderation
  'timeout_user', 'kick_user', 'ban_user', 'warn_user', 'create_mod_case',
  'purge_messages', 'set_nickname', 'mute_user', 'unmute_user',
  'timeout_member', 'kick_member', 'ban_member', 'warn_member', 'remove_timeout',
  // Channels
  'create_thread', 'create_channel', 'delete_channel', 'lock_channel',
  // Variables
  'set_variable', 'get_variable', 'increment_variable', 'delete_variable',
  'random_number', 'random_choice',
  // Utility
  'math', 'format_text', 'string_operation', 'fetch_user_info', 'log_to_channel',
  // Flow
  'condition_if', 'stop_if', 'loop_times', 'stop_flow', 'delay', 'wait',
  // Legacy aliases
  'message', 'embed', 'dm', 'react', 'wait',
  'ban_user', 'kick_user', 'timeout_user', 'mute_user', 'unmute_user', 'warn_user',
  'fetch_user_info', 'get_member_info', 'dm_user', 'send_embed', 'send_message',
]);
const CC_ALLOWED_TRIGGER_TYPES = new Set([
  'slash', 'prefix', 'contains', 'exact', 'regex', 'startsWith',
  'button', 'select_menu',
  'reaction_add', 'reaction_remove',
  'member_join', 'member_leave',
  'voice_join', 'voice_leave',
  'message_delete', 'scheduled',
]);
const CC_TRIGGER_ALIASES = Object.freeze({
  slash_command:  'slash',
  prefix_command: 'prefix',
  exact_match:    'exact',
  startswith:     'startsWith',
  reaction:       'reaction_add', // legacy alias
});

function normalizeCCTriggerType(triggerType) {
  const raw = String(triggerType || '').trim();
  if (!raw) return 'exact';
  // Exact alias match (handles 'startswith' → 'startsWith', 'reaction' → 'reaction_add', etc.)
  if (CC_TRIGGER_ALIASES[raw]) return CC_TRIGGER_ALIASES[raw];
  // Case-insensitive alias match (handles UPPERCASE inputs from old editor)
  const lower = raw.toLowerCase();
  if (CC_TRIGGER_ALIASES[lower]) return CC_TRIGGER_ALIASES[lower];
  // Restore camelCase for startsWith
  if (lower === 'startswith') return 'startsWith';
  return lower;
}

/**
 * Normalise a raw request body into flat CC fields.
 * Supports the workflow-editor's nested format:
 *   { trigger: { type, value }, permissions: { allowedRoles, … }, … }
 * as well as the legacy flat format:
 *   { trigger: "value", triggerType: "slash", allowedRoles: [], … }
 */
// Allowed slash option types (Discord API type numbers)
const CC_SLASH_OPTION_TYPES = new Set([3, 4, 5, 6, 7, 8, 10, 11]);

function sanitizeCCSlashOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 25).map((opt) => {
    if (!opt || typeof opt !== 'object') return null;
    const name = String(opt.name || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (!name) return null;
    const type = CC_SLASH_OPTION_TYPES.has(Number(opt.type)) ? Number(opt.type) : 3;
    return {
      name,
      type,
      description: String(opt.description || `${name} option`).slice(0, 100),
      required:    opt.required === true,
      autocomplete: opt.autocomplete === true && type === 3,
      choices:     Array.isArray(opt.choices)
        ? opt.choices.slice(0, 25).map((c) => ({
            name:  String(c.name || '').slice(0, 100),
            value: String(c.value || '').slice(0, 100),
          })).filter((c) => c.name)
        : [],
    };
  }).filter(Boolean);
}

function sanitizeEventTrigger(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {};
  if (raw.emoji !== undefined && raw.emoji !== null) {
    result.emoji = String(raw.emoji).slice(0, 100) || null;
  }
  if (raw.messageId !== undefined && raw.messageId !== null) {
    const mid = String(raw.messageId).trim();
    result.messageId = /^\d{10,20}$/.test(mid) ? mid : null;
  }
  if (raw.channelId !== undefined && raw.channelId !== null) {
    const cid = String(raw.channelId).trim();
    result.channelId = /^\d{10,20}$/.test(cid) ? cid : null;
  }
  const VALID_INTERVALS = new Set(['1m','5m','15m','30m','1h','6h','12h','24h']);
  if (raw.interval !== undefined && raw.interval !== null) {
    result.interval = VALID_INTERVALS.has(raw.interval) ? raw.interval : '1h';
  }
  return Object.keys(result).length ? result : null;
}

function normalizeCCBody(body) {
  const trigObj = body.trigger !== null && typeof body.trigger === 'object' ? body.trigger : null;
  const perm    = body.permissions !== null && typeof body.permissions === 'object' ? body.permissions : {};
  return {
    name:              body.name,
    trigger:           trigObj ? (trigObj.value  || '') : (typeof body.trigger === 'string' ? body.trigger : ''),
    triggerType:       trigObj ? (trigObj.type   || '') : body.triggerType,
    description:       body.description,
    enabled:           body.enabled,
    blocks:            body.blocks,
    variables:         Array.isArray(body.variables) ? body.variables : [],
    tags:              body.tags,
    category:          body.category,
    slashOptions:      sanitizeCCSlashOptions(body.slashOptions),
    eventTrigger:      sanitizeEventTrigger(body.eventTrigger),
    allowedRoles:      perm.allowedRoles      !== undefined ? perm.allowedRoles      : body.allowedRoles,
    allowedChannels:   perm.allowedChannels   !== undefined ? perm.allowedChannels   : body.allowedChannels,
    caseSensitive:     perm.caseSensitive      !== undefined ? perm.caseSensitive     : body.caseSensitive,
    deleteUserMessage: perm.deleteUserMessage  !== undefined ? perm.deleteUserMessage : body.deleteUserMessage,
    cooldownSeconds:   perm.cooldownSeconds    !== undefined ? perm.cooldownSeconds   : body.cooldownSeconds,
    cooldownScope:     perm.cooldownScope      !== undefined ? perm.cooldownScope     : body.cooldownScope,
    ephemeralErrors:   perm.ephemeralErrors    !== undefined ? perm.ephemeralErrors   : body.ephemeralErrors,
  };
}

function buildSlashCommandBodyFromCustomCommand(cmd) {
  const name = String(cmd.trigger || '').trim().toLowerCase();
  const description = String(cmd.description || '').trim() || `Custom command: ${cmd.name}`;
  return {
    name,
    description: description.slice(0, 100),
    type: 1,
    options: Array.isArray(cmd.slashOptions) ? cmd.slashOptions.slice(0, 25) : [],
    dm_permission: false,
  };
}

async function syncSlashCommandForCustomCommand(guildId, cmd, previous = null) {
  const currentType = normalizeCCTriggerType(cmd.triggerType);
  const previousType = normalizeCCTriggerType(previous?.triggerType);

  // If command moved away from slash, remove old registered slash command.
  if (currentType !== 'slash' && previousType === 'slash' && previous?.discordCommandId) {
    await discordApi.deleteGuildCommand(guildId, previous.discordCommandId).catch(() => null);
    await CustomCommand.findByIdAndUpdate(cmd._id, { $unset: { discordCommandId: 1 } }).catch(() => null);
    return { deployed: false, deleted: true };
  }

  if (currentType !== 'slash') {
    return { deployed: false };
  }

  const body = buildSlashCommandBodyFromCustomCommand(cmd);
  if (!/^[a-z0-9_-]{1,32}$/.test(body.name)) {
    throw new Error('Slash command trigger must be 1-32 chars: lowercase letters, digits, underscores, or hyphens.');
  }

  // Prefer known ID; fallback to lookup by name.
  let discordCommandId = cmd.discordCommandId || previous?.discordCommandId || null;
  if (!discordCommandId) {
    const guildCommands = await discordApi.getGuildCommands(guildId);
    const existingByName = guildCommands.find((c) => c.type === 1 && c.name === body.name);
    discordCommandId = existingByName?.id || null;
  }

  const synced = discordCommandId
    ? await discordApi.updateGuildCommand(guildId, discordCommandId, body)
    : await discordApi.registerGuildCommand(guildId, body);

  if (synced?.id && synced.id !== cmd.discordCommandId) {
    await CustomCommand.findByIdAndUpdate(cmd._id, { $set: { discordCommandId: synced.id } }).catch(() => null);
  }

  return { deployed: true, commandId: synced?.id || discordCommandId || null };
}

function isSafeRegex(pattern) {
  if (!pattern || typeof pattern !== 'string' || pattern.length > 200) return false;
  try {
    const start = Date.now();
    new RegExp(pattern).test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    return (Date.now() - start) < 50;
  } catch { return false; }
}

function validateCCBody(body) {
  const n = normalizeCCBody(body);
  const { name, trigger, triggerType, blocks } = n;
  if (!name || typeof name !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(name.trim())) {
    return 'name must be 1-32 chars: lowercase letters, digits, hyphens, underscores only';
  }
  const ttype = normalizeCCTriggerType(triggerType);
  // Text-based and component triggers require a non-empty trigger value; pure event-based do not
  const needsTriggerValue = ['slash', 'prefix', 'contains', 'exact', 'regex', 'startsWith', 'button', 'select_menu'].includes(ttype);
  if (needsTriggerValue && (!trigger || typeof trigger !== 'string' || !trigger.trim())) {
    return 'trigger value is required for this trigger type';
  }
  if (trigger && trigger.trim().length > 200) return 'trigger must be 200 chars or less';
  if (!CC_ALLOWED_TRIGGER_TYPES.has(ttype)) return 'invalid triggerType';
  if (ttype === 'regex' && trigger) {
    if (!isSafeRegex(trigger.trim())) return 'invalid or potentially unsafe regex pattern';
  }
  // Optional field validation
  if (n.description !== undefined && n.description !== null) {
    if (typeof n.description !== 'string' || n.description.length > 100)
      return 'description must be a string of max 100 chars';
  }
  if (n.cooldownScope !== undefined && n.cooldownScope !== null) {
    if (!['user', 'guild', 'channel'].includes(n.cooldownScope))
      return 'cooldownScope must be user, guild, or channel';
  }
  if (n.ephemeralErrors !== undefined && n.ephemeralErrors !== null) {
    if (typeof n.ephemeralErrors !== 'boolean')
      return 'ephemeralErrors must be a boolean';
  }
  if (n.tags !== undefined && n.tags !== null) {
    if (!Array.isArray(n.tags) || n.tags.length > 10
      || n.tags.some(t => typeof t !== 'string' || t.length > 32))
      return 'tags must be an array of up to 10 strings (max 32 chars each)';
  }
  if (n.category !== undefined && n.category !== null) {
    if (typeof n.category !== 'string' || n.category.length > 50)
      return 'category must be a string of max 50 chars';
  }
  if (!Array.isArray(blocks) || blocks.length === 0) return 'at least one block is required';
  if (blocks.length > 50) return 'maximum 50 blocks per command';
  for (const b of blocks) {
    if (!b || typeof b.type !== 'string' || !CC_ALLOWED_BLOCK_TYPES.has(b.type)) {
      return 'invalid block type: ' + (b?.type || 'unknown');
    }
    const d = b.data || {};
    if (['reply', 'message', 'dm'].includes(b.type)) {
      if (typeof d.content !== 'string' || !d.content.trim()) return `${b.type} block requires content`;
      if (d.content.length > 2000) return `${b.type} content must be 2000 chars or less`;
    }
    if (b.type === 'embed') {
      if (!d.title?.trim() && !d.description?.trim()) return 'embed block requires title or description';
      if (d.title && d.title.length > 256) return 'embed title must be 256 chars or less';
      if (d.description && d.description.length > 4096) return 'embed description must be 4096 chars or less';
      if (d.footer && d.footer.length > 2048) return 'embed footer must be 2048 chars or less';
      if (d.thumbnail && typeof d.thumbnail === 'string' && d.thumbnail && !/^https?:\/\//i.test(d.thumbnail)) {
        return 'embed thumbnail must be a valid https:// URL';
      }
      if (d.image && typeof d.image === 'string' && d.image && !/^https?:\/\//i.test(d.image)) {
        return 'embed image must be a valid https:// URL';
      }
      if (Array.isArray(d.fields) && d.fields.length > 25) return 'embed can have max 25 fields';
    }
    if ((b.type === 'add_role' || b.type === 'remove_role') && !d.roleId) {
      return `${b.type} block requires roleId`;
    }
    if (b.type === 'react' && !d.emoji?.trim()) return 'react block requires emoji';
  }
  return null;
}

function sanitizeCCBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter(b => b && typeof b.type === 'string' && CC_ALLOWED_BLOCK_TYPES.has(b.type))
    .map(b => {
      const d = b.data || {};
      const clean = { type: b.type, data: {} };
      const ns = s => (typeof s === 'string' ? s.replace(/\0/g, '') : ''); // null-strip

      if (['reply', 'send_message', 'message'].includes(b.type)) {
        clean.data.content   = ns(d.content || '').slice(0, 2000);
        clean.data.channel_id = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
        if (b.type === 'reply') {
          clean.data.ephemeral = !!d.ephemeral;
          clean.data.ping_user = !!d.ping_user;
        }
      } else if (['dm_user', 'dm'].includes(b.type)) {
        clean.data.content     = ns(d.content || '').slice(0, 2000);
        clean.data.fail_silent = !!d.fail_silent;
      } else if (['send_embed', 'embed'].includes(b.type)) {
        clean.data = {
          title:       ns(d.title       || '').slice(0, 256),
          description: ns(d.description || '').slice(0, 4096),
          color:       typeof d.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#5865f2',
          footer:      ns(d.footer      || '').slice(0, 2048),
          thumbnail:   /^https?:\/\//i.test(d.thumbnail || '') ? ns(d.thumbnail).slice(0, 512) : '',
          image:       /^https?:\/\//i.test(d.image      || '') ? ns(d.image).slice(0, 512) : '',
          url:         /^https?:\/\//i.test(d.url        || '') ? ns(d.url).slice(0, 512) : '',
          timestamp:   !!d.timestamp,
          show_author: !!d.show_author,
          channel_id:  String(d.channel_id || '').replace(/\D/g, '').slice(0, 20),
          fields: Array.isArray(d.fields)
            ? d.fields.slice(0, 25).map(f => ({
                name:   ns(f.name  || '').slice(0, 256),
                value:  ns(f.value || '').slice(0, 1024),
                inline: !!f.inline,
              })).filter(f => f.name || f.value)
            : [],
        };
      } else if (['add_role', 'remove_role', 'toggle_role'].includes(b.type)) {
        clean.data.role_id = String(d.role_id || d.roleId || '').replace(/\D/g, '').slice(0, 20);
        clean.data.reason  = ns(d.reason || '').slice(0, 512);
      } else if (['react', 'add_reaction'].includes(b.type)) {
        clean.data.emoji = ns(d.emoji || '').slice(0, 100);
      } else if (b.type === 'send_buttons') {
        clean.data.message    = ns(d.message || '').slice(0, 2000);
        clean.data.channel_id = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
        clean.data.buttons    = Array.isArray(d.buttons) ? d.buttons.slice(0, 5).map(btn => ({
          label:    ns(btn.label    || '').slice(0, 80),
          style:    ['Primary','Secondary','Success','Danger','Link'].includes(btn.style) ? btn.style : 'Primary',
          customId: ns(btn.customId || btn.url || '').slice(0, 512),
        })).filter(b2 => b2.label) : [];
      } else if (b.type === 'send_select_menu') {
        clean.data.placeholder = ns(d.placeholder || '').slice(0, 150);
        clean.data.message     = ns(d.message     || '').slice(0, 2000);
        clean.data.channel_id  = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
        clean.data.min_values  = Math.max(1, Math.min(25, parseInt(d.min_values) || 1));
        clean.data.max_values  = Math.max(1, Math.min(25, parseInt(d.max_values) || 1));
        clean.data.options     = Array.isArray(d.options) ? d.options.slice(0, 25).map(o => ({
          label:       ns(o.label       || '').slice(0, 100),
          value:       ns(o.value       || '').slice(0, 100),
          description: ns(o.description || '').slice(0, 100),
        })).filter(o => o.label || o.value) : [];
      } else if (['give_coins','take_coins','set_coins','set_balance'].includes(b.type)) {
        clean.data.amount   = Math.max(0, Math.min(1000000, parseInt(d.amount) || 0));
        clean.data.to       = ['user','target'].includes(d.to)   ? d.to   : 'user';
        clean.data.from     = ['user','target'].includes(d.from) ? d.from : 'user';
        clean.data.location = ['wallet','bank'].includes(d.location) ? d.location : 'wallet';
        clean.data.fail_if_broke = !!d.fail_if_broke;
      } else if (['give_xp','take_xp'].includes(b.type)) {
        clean.data.amount = Math.max(0, Math.min(100000, parseInt(d.amount) || 0));
      } else if (b.type === 'check_coins') {
        clean.data.store_as = ns(d.store_as || 'coins').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'check_balance') {
        clean.data.var_wallet = ns(d.var_wallet || 'wallet').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.var_bank   = ns(d.var_bank   || 'bank').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (['check_level','check_xp'].includes(b.type)) {
        clean.data.store_as = ns(d.store_as || (b.type === 'check_level' ? 'level' : 'xp')).replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'get_level') {
        clean.data.var_level = ns(d.var_level || 'level').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.var_xp    = ns(d.var_xp    || 'xp').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'give_item') {
        clean.data.item_id   = ns(d.item_id   || '').slice(0, 64);
        clean.data.item_name = ns(d.item_name || '').slice(0, 64);
        clean.data.quantity  = Math.max(1, Math.min(999, parseInt(d.quantity) || 1));
        clean.data.emoji     = ns(d.emoji || '📦').slice(0, 10);
      } else if (b.type === 'math') {
        clean.data.expression = ns(d.expression || '').slice(0, 200);
        clean.data.store_as   = ns(d.store_as || 'result').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'format_text') {
        clean.data.template = ns(d.template || '').slice(0, 2000);
        clean.data.store_as = ns(d.store_as || 'formatted').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'string_operation') {
        const VALID_OPS = ['uppercase','lowercase','trim','reverse','length','replace','contains'];
        clean.data.operation   = VALID_OPS.includes(d.operation) ? d.operation : 'uppercase';
        clean.data.text        = ns(d.text || '').slice(0, 2000);
        clean.data.store_as    = ns(d.store_as || 'result').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.find        = ns(d.find || '').slice(0, 100);
        clean.data.replace_with = ns(d.replace_with || '').slice(0, 100);
        clean.data.search      = ns(d.search || '').slice(0, 200);
      } else if (b.type === 'fetch_user_info') {
        clean.data.target     = ['author','mentioned'].includes(d.target) ? d.target : 'author';
        clean.data.var_prefix = ns(d.var_prefix || 'target').replace(/[^a-z0-9_]/gi, '').slice(0, 20);
      } else if (b.type === 'log_to_channel') {
        clean.data.channel_id  = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
        clean.data.message     = ns(d.message || d.content || '').slice(0, 2000);
        clean.data.as_embed    = !!d.as_embed;
        clean.data.embed_color = typeof d.embed_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.embed_color) ? d.embed_color : '#5865f2';
      } else if (b.type === 'set_variable') {
        const VALID_SCOPES = ['flow','user','guild'];
        clean.data.var_name = ns(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.value    = ns(d.value || '').slice(0, 500);
        clean.data.scope    = VALID_SCOPES.includes(d.scope) ? d.scope : 'flow';
      } else if (b.type === 'get_variable') {
        const VALID_SCOPES2 = ['user','guild'];
        clean.data.var_name      = ns(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.scope         = VALID_SCOPES2.includes(d.scope) ? d.scope : 'user';
        clean.data.default_value = ns(d.default_value ?? '0').slice(0, 500);
        clean.data.store_as      = ns(d.store_as || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'increment_variable') {
        const VALID_SCOPES3 = ['user','guild'];
        clean.data.var_name = ns(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.amount   = Math.max(-99999, Math.min(99999, parseFloat(d.amount) || 1));
        clean.data.scope    = VALID_SCOPES3.includes(d.scope) ? d.scope : 'user';
      } else if (b.type === 'delete_variable') {
        clean.data.var_name = ns(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.scope    = ['user','guild'].includes(d.scope) ? d.scope : 'user';
      } else if (b.type === 'random_number') {
        clean.data.min      = Math.max(0, Math.min(999999, parseInt(d.min) || 1));
        clean.data.max      = Math.max(1, Math.min(999999, parseInt(d.max) || 100));
        clean.data.store_as = ns(d.store_as || 'random').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'random_choice') {
        clean.data.choices  = ns(d.choices || '').slice(0, 1000);
        clean.data.store_as = ns(d.store_as || 'choice').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
      } else if (b.type === 'delay' || b.type === 'wait') {
        clean.data.ms = Math.max(100, Math.min(30000, parseInt(d.ms) || 1000));
      } else if (['timeout_user'].includes(b.type)) {
        clean.data.duration_min = Math.max(1, Math.min(40320, parseInt(d.duration_min) || 10));
        clean.data.reason       = ns(d.reason || '').slice(0, 512);
      } else if (['kick_user','ban_user','warn_user'].includes(b.type)) {
        clean.data.reason   = ns(d.reason || '').slice(0, 512);
        clean.data.dm_user  = !!d.dm_user;
        if (b.type === 'ban_user') clean.data.delete_days = Math.max(0, Math.min(7, parseInt(d.delete_days) || 0));
      } else if (b.type === 'purge_messages') {
        clean.data.count  = Math.max(1, Math.min(100, parseInt(d.count) || 5));
        clean.data.filter = ['all','bots','user'].includes(d.filter) ? d.filter : 'all';
      } else if (b.type === 'set_nickname') {
        clean.data.nickname = ns(d.nickname || '').slice(0, 32);
      } else if (b.type === 'delete_message') {
        clean.data.target         = ['trigger','bot_last','by_id'].includes(d.target) ? d.target : 'trigger';
        clean.data.message_id_var = ns(d.message_id_var || '').slice(0, 100);
        clean.data.delay_ms       = Math.max(0, Math.min(60000, parseInt(d.delay_ms) || 0));
      } else if (b.type === 'create_thread') {
        clean.data.name              = ns(d.name || '').slice(0, 100);
        clean.data.auto_archive_min  = [60,1440,4320,10080].includes(parseInt(d.auto_archive_min)) ? parseInt(d.auto_archive_min) : 1440;
      } else if (b.type === 'lock_channel') {
        clean.data.slowmode_seconds = Math.max(0, Math.min(21600, parseInt(d.slowmode_seconds) || 0));
        clean.data.channel_id       = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
      } else if (b.type === 'condition_if' || b.type === 'stop_if') {
        const VALID_COND_TYPES = ['has_role','not_has_role','in_channel','not_in_channel',
          'var_equals','var_not_equals','var_greater','var_less',
          'is_admin','is_mod','message_contains',
          'user_has_perm','user_not_perm',
          'economy_gte','economy_lt','level_gte',
          'arg_equals','mentioned_user'];
        const VALID_PERMS = ['ManageMessages','ManageRoles','ManageChannels','Administrator','BanMembers','KickMembers','ModerateMembers'];
        clean.data.condition_type  = VALID_COND_TYPES.includes(d.condition_type) ? d.condition_type : 'has_role';
        // Save under both names for forward/backward compat
        clean.data.compare_value   = ns(d.compare_value || d.condition_value || '').slice(0, 500);
        clean.data.condition_value = clean.data.compare_value;
        clean.data.var_name        = ns(d.var_name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 32);
        clean.data.role_id         = String(d.role_id || '').replace(/\D/g, '').slice(0, 20);
        clean.data.channel_id      = String(d.channel_id || '').replace(/\D/g, '').slice(0, 20);
        clean.data.permission      = VALID_PERMS.includes(d.permission) ? d.permission : '';
        clean.data.economy_source  = ['wallet','bank'].includes(d.economy_source) ? d.economy_source : 'wallet';
        if (b.type === 'condition_if') {
          // Recursively sanitize nested branch blocks
          clean.data.if_blocks   = sanitizeCCBlocks(Array.isArray(d.if_blocks)   ? d.if_blocks   : []);
          clean.data.else_blocks = sanitizeCCBlocks(Array.isArray(d.else_blocks) ? d.else_blocks : []);
        } else {
          clean.data.reply_msg = ns(d.reply_msg || '').slice(0, 2000);
        }
      } else if (b.type === 'loop_times') {
        clean.data.times       = Math.max(1, Math.min(10, parseInt(d.times) || 2));
        clean.data.loop_blocks = sanitizeCCBlocks(Array.isArray(d.loop_blocks) ? d.loop_blocks : []);
      } else {
        // Generic pass-through for remaining types — strip nullbytes, cap length
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === 'string')  clean.data[k] = ns(v).slice(0, 2000);
          else if (typeof v === 'number') clean.data[k] = v;
          else if (typeof v === 'boolean') clean.data[k] = v;
        }
      }
      return clean;
    });
}

// ── POST /api/guild/:guildId/custom-commands/validate ─────────
router.post('/guild/:guildId/custom-commands/validate', requireAuth, requireGuildAdmin, (req, res) => {
  const err = validateCCBody(req.body);
  if (err) return res.json({ valid: false, errors: [err] });
  return res.json({ valid: true });
});

// ── POST /api/guild/:guildId/custom-commands ──────────────────
router.post('/guild/:guildId/custom-commands', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const n = normalizeCCBody(req.body);

    const err = validateCCBody(req.body);
    if (err) return res.status(400).json({ error: err });

    const count = await CustomCommand.countDocuments({ guildId });
    if (count >= 50) return res.status(400).json({ error: 'Maximum 50 custom commands per guild' });

    const existing = await CustomCommand.findOne({ guildId, name: n.name.trim() });
    if (existing) return res.status(409).json({ error: 'A command with that name already exists' });

    const cleanBlocks = sanitizeCCBlocks(n.blocks);
    // Derive legacy response for bot backward compat
    const firstTextBlock = cleanBlocks.find(b => ['reply', 'message', 'dm'].includes(b.type));
    const legacyResponse = firstTextBlock ? firstTextBlock.data.content : '';

    const cmd = await CustomCommand.create({
      guildId,
      name:             n.name.trim().slice(0, 32),
      trigger:          (n.trigger || '').trim().slice(0, 200),
      triggerType:      normalizeCCTriggerType(n.triggerType),
      description:      (n.description || '').slice(0, 100),
      response:         legacyResponse.slice(0, 2000),
      blocks:           cleanBlocks,
      variables:        Array.isArray(n.variables) ? n.variables.slice(0, 50) : [],
      slashOptions:     n.slashOptions,
      eventTrigger:     n.eventTrigger,
      allowedRoles:     Array.isArray(n.allowedRoles) ? n.allowedRoles.filter(r => /^\d+$/.test(r)).slice(0, 50) : [],
      allowedChannels:  Array.isArray(n.allowedChannels) ? n.allowedChannels.filter(c => /^\d+$/.test(c)).slice(0, 50) : [],
      cooldownSeconds:  Math.max(0, Math.min(86400, Number(n.cooldownSeconds) || 0)),
      cooldownScope:    ['user','guild','channel'].includes(n.cooldownScope) ? n.cooldownScope : 'user',
      ephemeralErrors:  n.ephemeralErrors === true,
      tags:             Array.isArray(n.tags) ? n.tags.map(t => String(t).slice(0, 32)).slice(0, 10) : [],
      category:         (n.category || '').slice(0, 50),
      deleteUserMessage: !!n.deleteUserMessage,
      caseSensitive:    !!n.caseSensitive,
      enabled:          n.enabled !== false,
    });
    const slashSync = await syncSlashCommandForCustomCommand(guildId, cmd, null);
    res.json({ ...cmd.toObject(), slashSync });
  } catch (err) {
    console.error('[API] POST custom-commands', err);
    res.status(500).json({ error: 'Failed to create custom command' });
  }
});

// ── PATCH /api/guild/:guildId/custom-commands/:id ────────────
router.patch('/guild/:guildId/custom-commands/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const n = normalizeCCBody(req.body);

    const err = validateCCBody(req.body);
    if (err) return res.status(400).json({ error: err });

    // Check name uniqueness against OTHER commands
    if (n.name) {
      const conflict = await CustomCommand.findOne({ guildId, name: n.name.trim(), _id: { $ne: req.params.id } });
      if (conflict) return res.status(409).json({ error: 'Another command already uses that name' });
    }

    const previous = await CustomCommand.findOne({ _id: req.params.id, guildId }).lean();
    if (!previous) return res.status(404).json({ error: 'Command not found' });

    const cleanBlocks = sanitizeCCBlocks(n.blocks);
    const firstTextBlock = cleanBlocks.find(b => ['reply', 'message', 'dm'].includes(b.type));
    const legacyResponse = firstTextBlock ? firstTextBlock.data.content : '';

    const update = {
      name:             n.name.trim().slice(0, 32),
      trigger:          (n.trigger || '').trim().slice(0, 200),
      triggerType:      normalizeCCTriggerType(n.triggerType),
      description:      (n.description || '').slice(0, 100),
      response:         legacyResponse.slice(0, 2000),
      blocks:           cleanBlocks,
      variables:        Array.isArray(n.variables) ? n.variables.slice(0, 50) : [],
      slashOptions:     n.slashOptions,
      eventTrigger:     n.eventTrigger,
      allowedRoles:     Array.isArray(n.allowedRoles) ? n.allowedRoles.filter(r => /^\d+$/.test(r)).slice(0, 50) : [],
      allowedChannels:  Array.isArray(n.allowedChannels) ? n.allowedChannels.filter(c => /^\d+$/.test(c)).slice(0, 50) : [],
      cooldownSeconds:  Math.max(0, Math.min(86400, Number(n.cooldownSeconds) || 0)),
      cooldownScope:    ['user','guild','channel'].includes(n.cooldownScope) ? n.cooldownScope : 'user',
      ephemeralErrors:  n.ephemeralErrors === true,
      tags:             Array.isArray(n.tags) ? n.tags.map(t => String(t).slice(0, 32)).slice(0, 10) : [],
      category:         (n.category || '').slice(0, 50),
      deleteUserMessage: !!n.deleteUserMessage,
      caseSensitive:    !!n.caseSensitive,
      enabled:          n.enabled !== false,
    };

    const cmd = await CustomCommand.findOneAndUpdate(
      { _id: req.params.id, guildId },
      { $set: update },
      { returnDocument: 'after' }
    ).lean();
    const slashSync = await syncSlashCommandForCustomCommand(guildId, cmd, previous);
    res.json({ ...cmd, slashSync });
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
    if (normalizeCCTriggerType(cmd.triggerType) === 'slash' && cmd.discordCommandId) {
      await discordApi.deleteGuildCommand(req.params.guildId, cmd.discordCommandId).catch(() => null);
    }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
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
      { _id: id, guildId }, { $set: update }, { returnDocument: 'after' }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
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
      { returnDocument: 'after' }
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
      { returnDocument: 'after' }
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
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json(tmpl);
  } catch (err) {
    console.error('[API] PATCH bot-messages/:type', err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// ══════════════════════════════════════════════════════════════
// OWNER-ONLY ROUTES
// ══════════════════════════════════════════════════════════════

const OWNER_ID = '1192421681751412746';

function requireOwner(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Owner only' });
  next();
}

// GET /api/owner/guilds — all guilds the bot is in, enriched with DB config status
router.get('/owner/guilds', requireOwner, async (req, res) => {
  try {
    const botGuilds = await discordApi.getBotGuilds();

    // Get which guild IDs have a config document
    const guildIds = botGuilds.map((g) => g.id);
    const configs = await GuildConfig.find(
      { guildId: { $in: guildIds } },
      { guildId: 1 }
    ).lean();
    const configuredSet = new Set(configs.map((c) => c.guildId));

    const guilds = botGuilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
        : null,
      configured: configuredSet.has(g.id),
    }));

    // Sort: configured first, then alphabetically
    guilds.sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ guilds });
  } catch (err) {
    console.error('[Owner API] GET /owner/guilds', err);
    res.status(500).json({ error: err.message || 'Failed to fetch guilds' });
  }
});

// GET /api/owner/user/:userId — user lookup across all DB collections
router.get('/owner/user/:userId', requireOwner, async (req, res) => {
  const { userId } = req.params;
  if (!/^\d{17,20}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid Discord user ID' });
  }

  try {
    // Fetch Discord profile (bot token)
    let discordUser = null;
    try {
      discordUser = await discordApi.getUser(userId);
    } catch {
      // User may not exist or token may lack scope — non-fatal
    }

    // DB lookups in parallel
    const [levelProfiles, economyProfiles, modCases] = await Promise.all([
      LevelProfile.find({ userId }).select('guildId xp level -_id').lean(),
      EconomyProfile.find({ userId }).select('guildId wallet bank netWorth -_id').lean(),
      ModerationCase.find({ targetUserId: userId })
        .select('guildId type reason createdAt active -_id')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    // Aggregate totals
    const totalXp    = levelProfiles.reduce((s, p) => s + (p.xp || 0), 0);
    const totalLevel = levelProfiles.reduce((s, p) => s + (p.level || 0), 0);
    const totalWallet = economyProfiles.reduce((s, p) => s + (p.wallet || 0), 0);
    const totalBank   = economyProfiles.reduce((s, p) => s + (p.bank || 0), 0);

    res.json({
      discordUser,
      stats: {
        levelServers: levelProfiles.length,
        totalXp,
        totalLevel,
        economyServers: economyProfiles.length,
        totalWallet,
        totalBank,
        totalNetWorth: totalWallet + totalBank,
        modCases: modCases.length,
        activeCases: modCases.filter((c) => c.active).length,
      },
      levelProfiles,
      economyProfiles,
      modCases,
    });
  } catch (err) {
    console.error('[Owner API] GET /owner/user/:userId', err);
    res.status(500).json({ error: err.message || 'Failed to look up user' });
  }
});

// GET /api/owner/blacklist — list all blacklisted users
router.get('/owner/blacklist', requireOwner, async (req, res) => {
  try {
    const entries = await Blacklist.find().sort({ addedAt: -1 }).lean();
    res.json({ ok: true, entries });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blacklist' });
  }
});

// POST /api/owner/blacklist — add user to persistent blacklist
router.post('/owner/blacklist', requireOwner, async (req, res) => {
  const { userId, reason } = req.body || {};
  if (!userId || !/^\d{17,20}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  try {
    await Blacklist.updateOne(
      { userId },
      { $set: { userId, addedBy: req.user?.id || null, reason: reason || null, addedAt: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true, blacklisted: userId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save blacklist entry' });
  }
});

// DELETE /api/owner/blacklist/:userId — remove user from blacklist
router.delete('/owner/blacklist/:userId', requireOwner, async (req, res) => {
  const { userId } = req.params;
  if (!userId || !/^\d{17,20}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  try {
    await Blacklist.deleteOne({ userId });
    res.json({ ok: true, unblacklisted: userId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove blacklist entry' });
  }
});

// POST /api/owner/reset-user — delete all DB records for a user
router.post('/owner/reset-user', requireOwner, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || !/^\d{17,20}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  try {
    const [lvl, eco] = await Promise.all([
      LevelProfile.deleteMany({ userId }),
      EconomyProfile.deleteMany({ userId }),
    ]);
    res.json({ ok: true, deleted: { levelProfiles: lvl.deletedCount, economyProfiles: eco.deletedCount } });
  } catch (err) {
    console.error('[Owner API] POST /owner/reset-user', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/owner/reset-module — wipe all data for a named module
const MODULE_COLLECTIONS = {
  economy:      () => EconomyProfile.deleteMany({}),
  levels:       () => LevelProfile.deleteMany({}),
  moderation:   () => ModerationCase.deleteMany({}),
  applications: () => ApplicationSubmission.deleteMany({}),
};
router.post('/owner/reset-module', requireOwner, async (req, res) => {
  const { module: mod } = req.body || {};
  const handler = MODULE_COLLECTIONS[mod];
  if (!handler) {
    return res.status(400).json({ error: `Unknown module: ${mod}. Valid: ${Object.keys(MODULE_COLLECTIONS).join(', ')}` });
  }
  try {
    const result = await handler();
    res.json({ ok: true, module: mod, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('[Owner API] POST /owner/reset-module', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Status daily history (public) ────────────────────────────
// GET /api/status/history — last 30 days of daily snapshots
router.get('/status/history', async (req, res) => {
  try {
    const { StatusLog } = require('../models/StatusLog');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Build list of the last 30 days (oldest first)
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      days.push(d);
    }

    const start = days[0];
    const end = new Date(days[days.length - 1]);
    end.setUTCHours(23, 59, 59, 999);

    const logs = await StatusLog.find({
      service: 'bot',
      timestamp: { $gte: start, $lte: end },
    }).lean();

    const dayState = {};
    
    // Process logs to determine daily status
    logs.forEach(log => {
      const dateStr = log.timestamp.toISOString().split('T')[0];
      if (!dayState[dateStr]) dayState[dateStr] = { status: 'online', note: '' };
      
      // Upgrade severity
      if (log.type === 'offline' || log.type === 'error') {
        dayState[dateStr].status = 'offline';
        dayState[dateStr].note = log.message || 'Service outage';
      } else if (log.type === 'degraded' && dayState[dateStr].status !== 'offline') {
        dayState[dateStr].status = 'degraded';
        dayState[dateStr].note = log.message || 'Degraded performance';
      }
    });

    const history = days.map((d) => {
      const key = d.toISOString().split('T')[0];
      const state = dayState[key];
      return {
        date:   key,
        status: state ? state.status : (d < Date.now() ? 'online' : 'none'), // default old days without logs to online if they are in the past
        note:   state ? (state.note || '') : '',
        manual: false,
      };
    });

    res.json({ history });
  } catch (err) {
    console.error('[Status API] GET /status/history', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── Owner incident management ─────────────────────────────────
// GET /api/owner/incidents — list all logged incidents
router.get('/owner/incidents', requireOwner, async (req, res) => {
  try {
    const { StatusLog } = require('../models/StatusLog');
    const logs = await StatusLog.find({
      service: 'bot', 
      type: { $in: ['degraded', 'offline', 'maintenance', 'error'] }
    }).sort({ timestamp: -1 }).limit(100).lean();
    res.json({
      incidents: logs.map((s) => ({
        date:   s.timestamp.toISOString().split('T')[0],
        status: s.type,
        note:   s.message || '',
        setBy:  s.details?.setBy || 'System',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load incidents' });
  }
});

// POST /api/owner/incident — create or update a daily incident
router.post('/owner/incident', requireOwner, async (req, res) => {
  try {
    const { date, status, note } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }
    const validStatuses = ['online', 'degraded', 'offline', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const d = new Date(date + 'T12:00:00.000Z'); // middle of the day for manual entry
    const { StatusLog } = require('../models/StatusLog');
    
    // Create an incident log entry for the specified date
    await StatusLog.create({
      service: 'bot',
      type: status,
      timestamp: d,
      message: (note || '').slice(0, 200),
      details: { setBy: req.user.id, manual: true }
    });
    res.json({ ok: true, incident: { date, status, note } });
  } catch (err) {
    console.error('[Owner API] POST /owner/incident', err);
    res.status(500).json({ error: 'Failed to save incident' });
  }
});

// DELETE /api/owner/incident/:date — remove a daily incident record (not fully compatible with event logs, removing all manual ones for day)
router.delete('/owner/incident/:date', requireOwner, async (req, res) => {
  try {
    const { date } = req.params;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');
    const { StatusLog } = require('../models/StatusLog');
    await StatusLog.deleteMany({ timestamp: { $gte: start, $lte: end }, 'details.manual': true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete incident' });
  }
});

// POST /api/owner/restart — signal the dashboard process to restart (relies on PM2 / supervisor)
router.post('/owner/restart', requireOwner, (req, res) => {
  res.json({ ok: true, message: 'Restarting…' });
  // Give the response a moment to flush before exiting
  setTimeout(() => process.exit(0), 500);
});

// GET /api/owner/stats — live runtime stats (refresh endpoint)
router.get('/owner/stats', requireOwner, async (req, res) => {
  try {
    const [totalGuilds, totalCases, totalApplications, totalSubmissions, totalLevelProfiles, totalEconomyProfiles] =
      await Promise.all([
        GuildConfig.countDocuments().catch(() => null),
        ModerationCase.countDocuments().catch(() => null),
        ApplicationForm.countDocuments().catch(() => null),
        ApplicationSubmission.countDocuments().catch(() => null),
        LevelProfile.countDocuments().catch(() => null),
        EconomyProfile.countDocuments().catch(() => null),
      ]);

    res.json({
      totalGuilds,
      totalCases,
      totalApplications,
      totalSubmissions,
      totalLevelProfiles,
      totalEconomyProfiles,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    });
  } catch (err) {
    console.error('[Owner API] GET /owner/stats', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-MOD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/automod', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await AutoModConfig.findOne({ guildId }).lean() || {};
    res.json(config);
  } catch (err) {
    console.error('[API] GET /automod', err);
    res.status(500).json({ error: 'Failed to fetch AutoMod config' });
  }
});

router.post('/guild/:guildId/automod', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const allowed = ['enabled', 'alertChannelId', 'exemptRoles', 'exemptChannels', 'discordRules', 'botRules'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // Mark as needing Discord-side sync whenever Discord rules change
    if (update.discordRules !== undefined) update.syncNeeded = true;

    const config = await AutoModConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /automod', err);
    res.status(500).json({ error: 'Failed to save AutoMod config' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME / GOODBYE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/welcome', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await WelcomeConfig.findOne({ guildId }).lean() || {};
    res.json(config);
  } catch (err) {
    console.error('[API] GET /welcome', err);
    res.status(500).json({ error: 'Failed to fetch Welcome config' });
  }
});

router.post('/guild/:guildId/welcome', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const allowed = ['welcome', 'goodbye'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const config = await WelcomeConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /welcome', err);
    res.status(500).json({ error: 'Failed to save Welcome config' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKET ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/tickets/config', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await TicketConfig.findOne({ guildId }).lean() || {};
    res.json(config);
  } catch (err) {
    console.error('[API] GET /tickets/config', err);
    res.status(500).json({ error: 'Failed to fetch Ticket config' });
  }
});

router.post('/guild/:guildId/tickets/config', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const allowed = ['enabled', 'panels', 'logChannelId'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const config = await TicketConfig.findOneAndUpdate(
      { guildId },
      { $set: update },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /tickets/config', err);
    res.status(500).json({ error: 'Failed to save Ticket config' });
  }
});

// List open tickets for a guild (dashboard view)
router.get('/guild/:guildId/tickets', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { status = 'open', page = 1, limit = 25 } = req.query;
  try {
    const filter = { guildId };
    if (['open', 'closed', 'archived'].includes(status)) filter.status = status;

    const total = await Ticket.countDocuments(filter);
    const tickets = await Ticket.find(filter)
      .sort({ openedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.json({ tickets, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[API] GET /tickets', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Close a ticket from dashboard
router.post('/guild/:guildId/tickets/:ticketId/close', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, ticketId } = req.params;
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId, guildId, status: 'open' },
      { status: 'closed', closedBy: req.user.id, closedAt: new Date(), closeReason: req.body.reason || '' },
      { returnDocument: 'after' },
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found or already closed' });
    res.json({ ok: true, ticket });
  } catch (err) {
    console.error('[API] POST /tickets/:id/close', err);
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

// Deploy a ticket panel to Discord (marks panel pendingDeploy; bot scheduler picks it up)
router.post('/guild/:guildId/tickets/panels/:panelId/deploy', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, panelId } = req.params;
  try {
    const config = await TicketConfig.findOne({ guildId });
    if (!config) return res.status(404).json({ error: 'No ticket config found' });
    const panel = config.panels.find((p) => p.panelId === panelId);
    if (!panel) return res.status(404).json({ error: 'Panel not found' });
    if (!panel.channelId) return res.status(400).json({ error: 'Panel has no channel set — save the config first' });
    panel.pendingDeploy = true;
    await config.save();
    res.json({ ok: true, message: 'Panel queued for deployment. It will appear in Discord within 30 seconds.' });
  } catch (err) {
    console.error('[API] POST /tickets/panels/:id/deploy', err);
    res.status(500).json({ error: 'Failed to queue panel deploy' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME TEST SEND
// ═══════════════════════════════════════════════════════════════════════════

// Queue a test send of the welcome or goodbye message to a given channel
router.post('/guild/:guildId/welcome/test', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { type, channelId } = req.body;
  if (!['welcome', 'goodbye'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!channelId) return res.status(400).json({ error: 'channelId required' });
  try {
    await WelcomeConfig.findOneAndUpdate(
      { guildId },
      { $set: { testSend: { pending: true, type, channelId } } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    res.json({ ok: true, message: 'Test message queued. It will appear in Discord within 30 seconds.' });
  } catch (err) {
    console.error('[API] POST /welcome/test', err);
    res.status(500).json({ error: 'Failed to queue test send' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 4: Starboard
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/starboard', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await StarboardConfig.findOne({ guildId }).lean() || {};
    res.json({ config });
  } catch (err) {
    console.error('[API] GET /starboard', err);
    res.status(500).json({ error: 'Failed to load starboard config' });
  }
});

router.post('/guild/:guildId/starboard', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { enabled, channelId, threshold, emoji, ignoreSelfStars, ignoreNsfw, ignoredChannels } = req.body;
  try {
    const config = await StarboardConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          enabled: Boolean(enabled),
          channelId: channelId || null,
          threshold: Math.max(1, Math.min(100, parseInt(threshold) || 3)),
          emoji: String(emoji || '⭐').slice(0, 64),
          ignoreSelfStars: Boolean(ignoreSelfStars),
          ignoreNsfw: Boolean(ignoreNsfw),
          ignoredChannels: Array.isArray(ignoredChannels) ? ignoredChannels.filter((id) => /^\d+$/.test(id)).slice(0, 50) : [],
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /starboard', err);
    res.status(500).json({ error: 'Failed to save starboard config' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 5: Giveaways
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/giveaways', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const page = Math.max(0, parseInt(req.query.page) || 0);
  const limit = 20;
  try {
    const [active, ended] = await Promise.all([
      Giveaway.find({ guildId, status: 'active' }).sort({ endsAt: 1 }).lean(),
      Giveaway.find({ guildId, status: 'ended' }).sort({ endedAt: -1 }).skip(page * limit).limit(limit).lean(),
    ]);
    res.json({ active, ended });
  } catch (err) {
    console.error('[API] GET /giveaways', err);
    res.status(500).json({ error: 'Failed to load giveaways' });
  }
});

router.delete('/guild/:guildId/giveaways/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    await Giveaway.deleteOne({ guildId, _id: id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /giveaways/:id', err);
    res.status(500).json({ error: 'Failed to delete giveaway' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 6: Polls
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/polls', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const [active, ended] = await Promise.all([
      Poll.find({ guildId, status: 'active' }).sort({ createdAt: -1 }).lean(),
      Poll.find({ guildId, status: 'ended' }).sort({ endedAt: -1 }).limit(20).lean(),
    ]);
    res.json({ active, ended });
  } catch (err) {
    console.error('[API] GET /polls', err);
    res.status(500).json({ error: 'Failed to load polls' });
  }
});

router.delete('/guild/:guildId/polls/:id', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    await Poll.deleteOne({ guildId, _id: id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /polls/:id', err);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 7: Stats Channels
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/stats', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await StatsConfig.findOne({ guildId }).lean() || {};
    res.json({ config });
  } catch (err) {
    console.error('[API] GET /stats', err);
    res.status(500).json({ error: 'Failed to load stats config' });
  }
});

router.post('/guild/:guildId/stats', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { enabled, channels, updateInterval } = req.body;
  const VALID_TYPES = new Set(['members', 'online', 'bots', 'boosts', 'channels', 'roles', 'custom']);
  try {
    const sanitizedChannels = Array.isArray(channels)
      ? channels.filter((c) => c.channelId && VALID_TYPES.has(c.type)).map((c) => ({
          channelId: String(c.channelId),
          type: String(c.type),
          template: String(c.template || '').slice(0, 100),
          lastValue: '',
        })).slice(0, 10)
      : [];

    const config = await StatsConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          enabled: Boolean(enabled),
          channels: sanitizedChannels,
          updateInterval: Math.max(5, Math.min(1440, parseInt(updateInterval) || 10)),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /stats', err);
    res.status(500).json({ error: 'Failed to save stats config' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 8: Analytics
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/analytics', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const range = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
  const since = new Date(Date.now() - range * 86_400_000);
  try {
    const [events, commands] = await Promise.all([
      AnalyticsEvent.aggregate([
        { $match: { guildId, timestamp: { $gte: since } } },
        { $group: { _id: { type: '$type', day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } }, count: { $sum: 1 } } },
        { $sort: { '_id.day': 1 } },
      ]),
      CommandAnalytics.aggregate([
        { $match: { guildId, timestamp: { $gte: since } } },
        { $group: { _id: '$command', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    res.json({ events, commands, range });
  } catch (err) {
    console.error('[API] GET /analytics', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 10: User Notes (per-user notes viewer)
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/notes', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { userId } = req.query;
  try {
    const query = { guildId };
    if (userId && /^\d+$/.test(userId)) query.targetUserId = userId;
    const notes = await UserNote.find(query).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ notes });
  } catch (err) {
    console.error('[API] GET /notes', err);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

router.delete('/guild/:guildId/notes/:noteId', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, noteId } = req.params;
  try {
    await UserNote.deleteOne({ guildId, _id: noteId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /notes/:noteId', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 20: Invite Tracker
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/invites', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const [invites, joins] = await Promise.all([
      InviteTracker.find({ guildId }).sort({ uses: -1 }).limit(50).lean(),
      InviteJoin.find({ guildId }).sort({ joinedAt: -1 }).limit(50).lean(),
    ]);
    res.json({ invites, joins });
  } catch (err) {
    console.error('[API] GET /invites', err);
    res.status(500).json({ error: 'Failed to load invite data' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 22: Moderation Escalation
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/escalation', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await EscalationConfig.findOne({ guildId }).lean() || {};
    res.json({ config });
  } catch (err) {
    console.error('[API] GET /escalation', err);
    res.status(500).json({ error: 'Failed to load escalation config' });
  }
});

router.post('/guild/:guildId/escalation', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { enabled, rules } = req.body;
  const VALID_ACTIONS = new Set(['mute', 'kick', 'ban', 'tempmute']);
  try {
    const sanitizedRules = Array.isArray(rules)
      ? rules.filter((r) => r.warnCount > 0 && VALID_ACTIONS.has(r.action)).map((r) => ({
          warnCount: Math.max(1, parseInt(r.warnCount)),
          action: String(r.action),
          duration: Math.max(0, parseInt(r.duration) || 0),
        })).slice(0, 10)
      : [];

    const config = await EscalationConfig.findOneAndUpdate(
      { guildId },
      { $set: { enabled: Boolean(enabled), rules: sanitizedRules } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /escalation', err);
    res.status(500).json({ error: 'Failed to save escalation config' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 23: AFK Management (view who is AFK)
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/afk', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const afkList = await AFKEntry.find({ guildId }).sort({ setAt: -1 }).lean();
    res.json({ afkList });
  } catch (err) {
    console.error('[API] GET /afk', err);
    res.status(500).json({ error: 'Failed to load AFK list' });
  }
});

router.delete('/guild/:guildId/afk/:userId', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, userId } = req.params;
  if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    await AFKEntry.deleteOne({ guildId, userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /afk/:userId', err);
    res.status(500).json({ error: 'Failed to clear AFK' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 27: Slowmode Automation
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/slowmode', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const config = await SlowmodeConfig.findOne({ guildId }).lean() || {};
    res.json({ config });
  } catch (err) {
    console.error('[API] GET /slowmode', err);
    res.status(500).json({ error: 'Failed to load slowmode config' });
  }
});

router.post('/guild/:guildId/slowmode', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { enabled, rules } = req.body;
  try {
    const sanitizedRules = Array.isArray(rules)
      ? rules.filter((r) => r.channelId && /^\d+$/.test(r.channelId)).map((r) => ({
          channelId: String(r.channelId),
          threshold: Math.max(1, Math.min(200, parseInt(r.threshold) || 10)),
          slowmodeSeconds: Math.max(0, Math.min(21600, parseInt(r.slowmodeSeconds) || 5)),
          cooldownMinutes: Math.max(1, Math.min(1440, parseInt(r.cooldownMinutes) || 5)),
        })).slice(0, 20)
      : [];
    const config = await SlowmodeConfig.findOneAndUpdate(
      { guildId },
      { $set: { enabled: Boolean(enabled), rules: sanitizedRules } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[API] POST /slowmode', err);
    res.status(500).json({ error: 'Failed to save slowmode config' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 9: Advanced Role Management
// ══════════════════════════════════════════════════════════════════

// GET /api/guild/:guildId/roles/details  — roles enriched (uses existing roles endpoint)
// POST /api/guild/:guildId/roles/mass-assign — mass add/remove role
router.post('/guild/:guildId/roles/mass-assign', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { roleId, userIds, action } = req.body;
  if (!roleId || !/^\d+$/.test(roleId))           return res.status(400).json({ error: 'Invalid roleId' });
  if (!Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ error: 'userIds required' });
  if (!['add', 'remove'].includes(action))        return res.status(400).json({ error: 'action must be add or remove' });
  // Limit to 50 per request to avoid excessive rate-limits
  const limited = userIds.filter(id => /^\d+$/.test(String(id))).slice(0, 50);
  const results = { ok: [], failed: [] };
  for (const userId of limited) {
    try {
      if (action === 'add') {
        await discordApi.addRoleToMember(guildId, userId, roleId);
      } else {
        await discordApi.removeRoleFromMember(guildId, userId, roleId);
      }
      results.ok.push(userId);
      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      results.failed.push({ userId, reason: err.message });
    }
  }
  res.json({ ok: true, results });
});

// ══════════════════════════════════════════════════════════════════
//  Feature 10: Audit Log Viewer
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/audit-log', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { limit = 50, before, user_id, action_type } = req.query;
  // Validate query params
  if (user_id && !/^\d+$/.test(user_id)) return res.status(400).json({ error: 'Invalid user_id' });
  if (action_type && !/^\d+$/.test(action_type)) return res.status(400).json({ error: 'Invalid action_type' });
  try {
    const auditData = await discordApi.getAuditLog(guildId, {
      limit: Math.min(100, Math.max(1, parseInt(limit) || 50)),
      before: before && /^\d+$/.test(before) ? before : undefined,
      user_id: user_id || undefined,
      action_type: action_type || undefined,
    });
    res.json({ audit_log: auditData });
  } catch (err) {
    console.error('[API] GET /audit-log', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 12: Notes — add note (delete already exists above)
// ══════════════════════════════════════════════════════════════════

router.post('/guild/:guildId/notes', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { targetUserId, content, caseId } = req.body;
  if (!targetUserId || !/^\d+$/.test(String(targetUserId))) return res.status(400).json({ error: 'Invalid targetUserId' });
  if (!content || typeof content !== 'string' || content.trim().length === 0) return res.status(400).json({ error: 'content required' });
  const sanitized = content.trim().slice(0, 2000);
  try {
    let targetTag = `User ${targetUserId}`;
    try {
      const discordUser = await discordApi.getUser(targetUserId);
      if (discordUser) targetTag = `${discordUser.username}#${discordUser.discriminator || '0'}`;
    } catch {}
    const note = await UserNote.create({
      guildId,
      targetUserId: String(targetUserId),
      targetTag,
      content: sanitized,
      addedBy: req.user.id,
      addedByTag: `${req.user.username}`,
      caseId: caseId && /^\d+$/.test(String(caseId)) ? String(caseId) : undefined,
    });
    res.json({ ok: true, note });
  } catch (err) {
    console.error('[API] POST /notes', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 18: Backup & Restore (owner-only)
// ══════════════════════════════════════════════════════════════════

router.get('/owner/backup/:guildId', requireOwner, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.status(400).json({ error: 'Invalid guildId' });
  try {
    const [
      guildConfig, loggingConfig, levelConfig, autoModConfig, welcomeConfig,
      ticketConfig, reactionRoles, embedTemplates, escalationConfig, slowmodeConfig,
    ] = await Promise.all([
      GuildConfig.findOne({ guildId }).lean(),
      LoggingConfig.findOne({ guildId }).lean(),
      LevelConfig.findOne({ guildId }).lean(),
      AutoModConfig.findOne({ guildId }).lean(),
      WelcomeConfig.findOne({ guildId }).lean(),
      TicketConfig.findOne({ guildId }).lean(),
      ReactionRole.find({ guildId }).lean(),
      EmbedTemplate.find({ guildId }).lean(),
      EscalationConfig.findOne({ guildId }).lean(),
      SlowmodeConfig.findOne({ guildId }).lean(),
    ]);
    const backup = {
      version: 1,
      guildId,
      exportedAt: new Date().toISOString(),
      data: {
        guildConfig, loggingConfig, levelConfig, autoModConfig, welcomeConfig,
        ticketConfig, reactionRoles, embedTemplates, escalationConfig, slowmodeConfig,
      },
    };
    res.setHeader('Content-Disposition', `attachment; filename="flynnbot-backup-${guildId}-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (err) {
    console.error('[Owner API] GET /backup/:guildId', err);
    res.status(500).json({ error: 'Failed to generate backup' });
  }
});

router.post('/owner/restore/:guildId', requireOwner, async (req, res) => {
  const { guildId } = req.params;
  if (!/^\d+$/.test(guildId)) return res.status(400).json({ error: 'Invalid guildId' });
  const { backup } = req.body;
  if (!backup || !backup.data || backup.version !== 1) return res.status(400).json({ error: 'Invalid backup format' });
  const d = backup.data;
  try {
    const ops = [];
    if (d.guildConfig)    ops.push(GuildConfig.findOneAndUpdate({ guildId }, d.guildConfig, { upsert: true }));
    if (d.loggingConfig)  ops.push(LoggingConfig.findOneAndUpdate({ guildId }, d.loggingConfig, { upsert: true }));
    if (d.levelConfig)    ops.push(LevelConfig.findOneAndUpdate({ guildId }, d.levelConfig, { upsert: true }));
    if (d.autoModConfig)  ops.push(AutoModConfig.findOneAndUpdate({ guildId }, d.autoModConfig, { upsert: true }));
    if (d.welcomeConfig)  ops.push(WelcomeConfig.findOneAndUpdate({ guildId }, d.welcomeConfig, { upsert: true }));
    if (d.ticketConfig)   ops.push(TicketConfig.findOneAndUpdate({ guildId }, d.ticketConfig, { upsert: true }));
    if (d.escalationConfig) ops.push(EscalationConfig.findOneAndUpdate({ guildId }, d.escalationConfig, { upsert: true }));
    if (d.slowmodeConfig) ops.push(SlowmodeConfig.findOneAndUpdate({ guildId }, d.slowmodeConfig, { upsert: true }));
    // For arrays, replace entirely
    if (Array.isArray(d.reactionRoles)) {
      ops.push(ReactionRole.deleteMany({ guildId }));
      if (d.reactionRoles.length) ops.push(ReactionRole.insertMany(d.reactionRoles.map(r => ({ ...r, guildId }))));
    }
    if (Array.isArray(d.embedTemplates)) {
      ops.push(EmbedTemplate.deleteMany({ guildId }));
      if (d.embedTemplates.length) ops.push(EmbedTemplate.insertMany(d.embedTemplates.map(r => ({ ...r, guildId }))));
    }
    await Promise.all(ops);
    res.json({ ok: true, message: 'Restore complete' });
  } catch (err) {
    console.error('[Owner API] POST /restore/:guildId', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Feature 28: Application CSV export
// ══════════════════════════════════════════════════════════════════

router.get('/guild/:guildId/applications/:appId/export-csv', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, appId } = req.params;
  try {
    const form = await ApplicationForm.findOne({ _id: appId, guildId }).lean();
    if (!form) return res.status(404).json({ error: 'Form not found' });
    const submissions = await ApplicationSubmission.find({ formId: appId }).sort({ createdAt: -1 }).lean();
    // Build CSV
    const questions = (form.questions || []).map(q => q.label || q.id || 'Question');
    const headers = ['Submission ID', 'User ID', 'Status', 'Submitted At', ...questions];
    function escCsv(v) {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[,"\n\r]/.test(s) ? `"${s}"` : s;
    }
    const rows = submissions.map(s => {
      const answers = (form.questions || []).map(q => {
        const ans = (s.answers || []).find(a => a.questionId === String(q._id || q.id));
        return ans ? ans.value : '';
      });
      return [s._id, s.userId, s.status, new Date(s.createdAt).toISOString(), ...answers].map(escCsv).join(',');
    });
    const csv = [headers.map(escCsv).join(','), ...rows].join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${appId}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    console.error('[API] GET /applications/export-csv', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  Data Storage — Stored Variable Definitions & Values
// ══════════════════════════════════════════════════════════════════

const STORED_VAR_REF_RE   = /^[a-z0-9_-]{1,64}$/;
const SNOWFLAKE_RE_STORED = /^\d{17,19}$/;
const VALID_TYPES_STORED  = new Set(['text', 'number', 'user', 'channel', 'collection', 'object']);
const VALID_SCOPES_STORED = new Set(['guild', 'user', 'command']);
const VALID_ITEM_TYPES    = new Set(['text', 'number', 'boolean', 'user', 'channel']);
const MAX_STORED_VARS     = 100;

// ── GET /api/guild/:guildId/stored-variables ─────────────────────
router.get('/guild/:guildId/stored-variables', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    const vars = await StoredVariable.find({ guildId }).sort({ createdAt: 1 }).lean();
    res.json({ variables: vars });
  } catch (err) {
    console.error('[API] GET /stored-variables', err);
    res.status(500).json({ error: 'Failed to fetch stored variables' });
  }
});

// ── POST /api/guild/:guildId/stored-variables ────────────────────
router.post('/guild/:guildId/stored-variables', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;
  const { name, refName, description, type, scope, config = {} } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must be 1-100 characters' });
  }
  if (!refName || !STORED_VAR_REF_RE.test(refName)) {
    return res.status(400).json({ error: 'Reference name must be 1-64 lowercase alphanumeric characters, hyphens, or underscores' });
  }
  if (!VALID_TYPES_STORED.has(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${[...VALID_TYPES_STORED].join(', ')}` });
  }
  if (!VALID_SCOPES_STORED.has(scope)) {
    return res.status(400).json({ error: `Invalid scope. Must be one of: ${[...VALID_SCOPES_STORED].join(', ')}` });
  }

  try {
    const count = await StoredVariable.countDocuments({ guildId });
    if (count >= MAX_STORED_VARS) {
      return res.status(400).json({ error: `Maximum ${MAX_STORED_VARS} stored variables per server` });
    }
    const exists = await StoredVariable.findOne({ guildId, refName });
    if (exists) return res.status(409).json({ error: `A variable with reference name "${refName}" already exists` });

    const sanitizedConfig = sanitizeStoredVarConfig(type, config);

    const variable = await StoredVariable.create({
      guildId,
      name:        name.trim(),
      refName,
      description: typeof description === 'string' ? description.trim().slice(0, 200) : '',
      type,
      scope,
      enabled:     true,
      config:      sanitizedConfig,
    });
    res.status(201).json({ variable });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `Reference name "${refName}" already exists` });
    console.error('[API] POST /stored-variables', err);
    res.status(500).json({ error: 'Failed to create stored variable' });
  }
});

// ── PATCH /api/guild/:guildId/stored-variables/:varId ───────────
router.patch('/guild/:guildId/stored-variables/:varId', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, varId } = req.params;
  const { name, description, config, enabled } = req.body;
  try {
    const variable = await StoredVariable.findOne({ _id: varId, guildId });
    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return res.status(400).json({ error: 'Name must be 1-100 characters' });
      }
      variable.name = name.trim();
    }
    if (description !== undefined) {
      variable.description = typeof description === 'string' ? description.trim().slice(0, 200) : '';
    }
    if (enabled !== undefined) {
      variable.enabled = Boolean(enabled);
    }
    if (config !== undefined) {
      const sanitized = sanitizeStoredVarConfig(variable.type, config);
      variable.config = { ...variable.config.toObject?.() ?? variable.config, ...sanitized };
    }
    await variable.save();
    res.json({ variable });
  } catch (err) {
    console.error('[API] PATCH /stored-variables/:varId', err);
    res.status(500).json({ error: 'Failed to update stored variable' });
  }
});

// ── DELETE /api/guild/:guildId/stored-variables/:varId ──────────
router.delete('/guild/:guildId/stored-variables/:varId', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, varId } = req.params;
  try {
    const variable = await StoredVariable.findOne({ _id: varId, guildId });
    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    // Delete all associated values
    const { deletedCount } = await StoredVariableValue.deleteMany({ definitionId: varId });
    await StoredVariable.deleteOne({ _id: varId });
    res.json({ ok: true, valuesDeleted: deletedCount });
  } catch (err) {
    console.error('[API] DELETE /stored-variables/:varId', err);
    res.status(500).json({ error: 'Failed to delete stored variable' });
  }
});

// ── GET /api/guild/:guildId/stored-variables/:varId/values ───────
router.get('/guild/:guildId/stored-variables/:varId/values', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, varId } = req.params;
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const skip  = (page - 1) * limit;
  const userId = req.query.userId && SNOWFLAKE_RE_STORED.test(req.query.userId) ? req.query.userId : undefined;

  try {
    const variable = await StoredVariable.findOne({ _id: varId, guildId }).lean();
    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    const filter = { definitionId: varId };
    if (userId) filter.userId = userId;

    const [values, total] = await Promise.all([
      StoredVariableValue.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      StoredVariableValue.countDocuments(filter),
    ]);
    res.json({ values, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[API] GET /stored-variables/:varId/values', err);
    res.status(500).json({ error: 'Failed to fetch variable values' });
  }
});

// ── POST /api/guild/:guildId/stored-variables/:varId/set-value ───
router.post('/guild/:guildId/stored-variables/:varId/set-value', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, varId } = req.params;
  const { userId, value } = req.body;
  try {
    const variable = await StoredVariable.findOne({ _id: varId, guildId }).lean();
    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    if (variable.scope === 'user' && (!userId || !SNOWFLAKE_RE_STORED.test(userId))) {
      return res.status(400).json({ error: 'userId (valid Discord snowflake) is required for user-scoped variables' });
    }

    const filter = { definitionId: varId, scope: variable.scope };
    if (variable.scope === 'user') filter.userId = userId;

    const doc = await StoredVariableValue.findOneAndUpdate(
      filter,
      { $set: { guildId, value, updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    res.json({ value: doc });
  } catch (err) {
    console.error('[API] POST /stored-variables/:varId/set-value', err);
    res.status(500).json({ error: 'Failed to set value' });
  }
});

// ── POST /api/guild/:guildId/stored-variables/:varId/reset ───────
router.post('/guild/:guildId/stored-variables/:varId/reset', requireAuth, requireGuildAdmin, async (req, res) => {
  const { guildId, varId } = req.params;
  try {
    const variable = await StoredVariable.findOne({ _id: varId, guildId }).lean();
    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    const { deletedCount } = await StoredVariableValue.deleteMany({ definitionId: varId });
    res.json({ ok: true, deleted: deletedCount });
  } catch (err) {
    console.error('[API] POST /stored-variables/:varId/reset', err);
    res.status(500).json({ error: 'Failed to reset values' });
  }
});

/**
 * Sanitize and build a type-appropriate config object.
 * Strips unknown keys and coerces values to safe types.
 * @param {string} type
 * @param {object} raw
 * @returns {object}
 */
function sanitizeStoredVarConfig(type, raw = {}) {
  const cfg = {};

  // Common
  cfg.defaultValue = raw.defaultValue !== undefined ? raw.defaultValue : null;

  switch (type) {
    case 'text':
      cfg.maxLength = raw.maxLength !== undefined ? Math.min(2000, Math.max(0, parseInt(raw.maxLength) || 0)) : null;
      break;
    case 'number':
      cfg.isFloat = Boolean(raw.isFloat);
      cfg.min = raw.min !== undefined && raw.min !== '' && raw.min !== null ? Number(raw.min) : null;
      cfg.max = raw.max !== undefined && raw.max !== '' && raw.max !== null ? Number(raw.max) : null;
      if (cfg.defaultValue !== null) cfg.defaultValue = cfg.isFloat ? parseFloat(cfg.defaultValue) : parseInt(cfg.defaultValue, 10);
      break;
    case 'user':
      cfg.userDataType = ['id', 'username', 'mention'].includes(raw.userDataType) ? raw.userDataType : 'id';
      break;
    case 'channel':
      cfg.channelDataType = ['id', 'name', 'mention'].includes(raw.channelDataType) ? raw.channelDataType : 'id';
      break;
    case 'collection':
      cfg.itemType = VALID_ITEM_TYPES.has(raw.itemType) ? raw.itemType : 'text';
      cfg.maxSize  = raw.maxSize ? Math.min(1000, Math.max(1, parseInt(raw.maxSize) || 100)) : 100;
      break;
    case 'object':
      cfg.properties = Array.isArray(raw.properties)
        ? raw.properties.slice(0, 50).map(p => ({
            name:         String(p.name || '').trim().slice(0, 64),
            refName:      String(p.refName || '').trim().slice(0, 64).toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
            type:         ['text', 'number', 'boolean'].includes(p.type) ? p.type : 'text',
            required:     Boolean(p.required),
            defaultValue: p.defaultValue !== undefined ? p.defaultValue : null,
          })).filter(p => p.name && p.refName)
        : [];
      break;
  }

  return cfg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GuildCommand CRUD — Advanced Command Builder
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_TRIGGER_TYPES = new Set([
  'slash','prefix','contains','exact','startsWith','regex',
  'button','select_menu','modal_submit',
  'member_join','member_leave',
  'reaction_add','reaction_remove',
  'voice_join','voice_leave',
  'message_delete','message_edit',
  'scheduled',
]);

function sanitizeGuildCommand(body) {
  const trigger = body.trigger || {};
  if (!VALID_TRIGGER_TYPES.has(trigger.type)) throw new Error('Invalid trigger type');

  // Sanitize trigger value
  const value = typeof trigger.value === 'string'
    ? trigger.value.trim().slice(0, 100)
    : '';

  // Validate name (alphanumeric, hyphens, underscores)
  const name = typeof body.name === 'string'
    ? body.name.trim().slice(0, 100).replace(/[^a-z0-9_\-\s]/gi, '').trim()
    : '';
  if (!name) throw new Error('Command name is required');

  // Blocks: strip any executable code fields, only allow data sub-objects
  const blocks = Array.isArray(body.blocks)
    ? body.blocks.slice(0, 100).map(b => ({
        id:   String(b.id || '').slice(0, 64),
        type: String(b.type || '').slice(0, 64),
        data: b.data && typeof b.data === 'object' ? b.data : {},
      }))
    : [];

  const conditions = body.conditions && typeof body.conditions === 'object' ? {
    allowedRoles:        Array.isArray(body.conditions.allowedRoles)    ? body.conditions.allowedRoles.slice(0, 50)    : [],
    ignoredRoles:        Array.isArray(body.conditions.ignoredRoles)    ? body.conditions.ignoredRoles.slice(0, 50)    : [],
    allowedChannels:     Array.isArray(body.conditions.allowedChannels) ? body.conditions.allowedChannels.slice(0, 50) : [],
    ignoredChannels:     Array.isArray(body.conditions.ignoredChannels) ? body.conditions.ignoredChannels.slice(0, 50) : [],
    requiredPermissions: Array.isArray(body.conditions.requiredPermissions) ? body.conditions.requiredPermissions.slice(0, 20) : [],
    cooldown: body.conditions.cooldown ? {
      seconds: Math.min(86400, Math.max(0, parseInt(body.conditions.cooldown.seconds) || 0)),
      scope:   ['user','guild','channel'].includes(body.conditions.cooldown.scope) ? body.conditions.cooldown.scope : 'user',
    } : undefined,
    ephemeralReply: Boolean(body.conditions.ephemeralReply),
  } : {};

  return {
    name,
    description:  typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '',
    enabled:      body.enabled !== false,
    trigger: {
      type:    trigger.type,
      value,
      options: Array.isArray(trigger.options) ? trigger.options.slice(0, 25) : [],
      config:  trigger.config && typeof trigger.config === 'object' ? trigger.config : {},
    },
    blocks,
    conditions,
  };
}

// GET /api/guild/:guildId/guild-commands
router.get('/guild/:guildId/guild-commands', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const commands = await GuildCommand.find({ guildId }).sort({ createdAt: -1 }).lean();
    res.json({ commands });
  } catch (err) {
    console.error('GET guild-commands error:', err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// POST /api/guild/:guildId/guild-commands
router.post('/guild/:guildId/guild-commands', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const data = sanitizeGuildCommand(req.body);
    const cmd = new GuildCommand({ ...data, guildId });
    await cmd.save();
    res.status(201).json({ command: cmd });
  } catch (err) {
    console.error('POST guild-commands error:', err);
    res.status(400).json({ error: err.message || 'Failed to create command' });
  }
});

// GET /api/guild/:guildId/guild-commands/:id
router.get('/guild/:guildId/guild-commands/:id', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const cmd = await GuildCommand.findOne({ _id: id, guildId }).lean();
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    res.json({ command: cmd });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch command' });
  }
});

// PUT /api/guild/:guildId/guild-commands/:id
router.put('/guild/:guildId/guild-commands/:id', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const data = sanitizeGuildCommand(req.body);
    const cmd = await GuildCommand.findOneAndUpdate(
      { _id: id, guildId },
      { $set: data },
      { new: true, runValidators: true },
    );
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    res.json({ command: cmd });
  } catch (err) {
    console.error('PUT guild-commands error:', err);
    res.status(400).json({ error: err.message || 'Failed to update command' });
  }
});

// DELETE /api/guild/:guildId/guild-commands/:id
router.delete('/guild/:guildId/guild-commands/:id', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const cmd = await GuildCommand.findOneAndDelete({ _id: id, guildId });
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    // If it was a slash command, delete from Discord too
    if (cmd.trigger?.type === 'slash' && cmd.discordCommandId) {
      await discordApi.deleteGuildCommand(guildId, cmd.discordCommandId).catch(() => null);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete command' });
  }
});

// POST /api/guild/:guildId/guild-commands/:id/toggle
router.post('/guild/:guildId/guild-commands/:id/toggle', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const cmd = await GuildCommand.findOne({ _id: id, guildId });
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    cmd.enabled = !cmd.enabled;
    await cmd.save();
    res.json({ enabled: cmd.enabled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle command' });
  }
});

// POST /api/guild/:guildId/guild-commands/:id/sync
// Register or update this slash command with Discord
router.post('/guild/:guildId/guild-commands/:id/sync', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const cmd = await GuildCommand.findOne({ _id: id, guildId });
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    if (cmd.trigger?.type !== 'slash') {
      return res.status(400).json({ error: 'Only slash commands can be synced with Discord' });
    }

    const body = {
      name:        cmd.trigger.value || cmd.name.toLowerCase().replace(/\s+/g, '-'),
      description: cmd.description || 'Custom command',
      options:     cmd.trigger.options || [],
    };

    let result;
    if (cmd.discordCommandId) {
      result = await discordApi.updateGuildCommand(guildId, cmd.discordCommandId, body);
    } else {
      result = await discordApi.registerGuildCommand(guildId, body);
    }

    if (result?.id) {
      cmd.discordCommandId = result.id;
      await cmd.save();
    }

    res.json({ ok: true, discordCommandId: cmd.discordCommandId });
  } catch (err) {
    console.error('Sync guild command error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync command' });
  }
});

// POST /api/guild/:guildId/guild-commands/sync-all
router.post('/guild/:guildId/guild-commands/sync-all', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const cmds = await GuildCommand.find({ guildId, 'trigger.type': 'slash', enabled: true });
    const results = [];
    for (const cmd of cmds) {
      const body = {
        name:        cmd.trigger.value || cmd.name.toLowerCase().replace(/\s+/g, '-'),
        description: cmd.description || 'Custom command',
        options:     cmd.trigger.options || [],
      };
      try {
        let result;
        if (cmd.discordCommandId) {
          result = await discordApi.updateGuildCommand(guildId, cmd.discordCommandId, body);
        } else {
          result = await discordApi.registerGuildCommand(guildId, body);
        }
        if (result?.id) { cmd.discordCommandId = result.id; await cmd.save(); }
        results.push({ id: String(cmd._id), name: cmd.name, ok: true });
      } catch (e) {
        results.push({ id: String(cmd._id), name: cmd.name, ok: false, error: e.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync all commands' });
  }
});

// GET /api/guild/:guildId/guild-commands/:id/export
router.get('/guild/:guildId/guild-commands/:id/export', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const cmd = await GuildCommand.findOne({ _id: id, guildId }).lean();
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    const { _id, __v, guildId: _g, discordCommandId, metadata, createdAt, updatedAt, ...exportable } = cmd;
    res.json(exportable);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export command' });
  }
});

// POST /api/guild/:guildId/guild-commands/import
router.post('/guild/:guildId/guild-commands/import', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const data = sanitizeGuildCommand(req.body);
    const cmd = new GuildCommand({ ...data, guildId });
    await cmd.save();
    res.status(201).json({ command: cmd });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to import command' });
  }
});

// POST /api/guild/:guildId/guild-commands/:id/duplicate
router.post('/guild/:guildId/guild-commands/:id/duplicate', requireAuth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const src = await GuildCommand.findOne({ _id: id, guildId }).lean();
    if (!src) return res.status(404).json({ error: 'Command not found' });
    const { _id, __v, discordCommandId, metadata, createdAt, updatedAt, ...rest } = src;
    // Append " (Copy)" to name and strip discord sync info
    let copyName = (rest.name + ' copy').slice(0, 50);
    // Ensure unique name
    const existing = await GuildCommand.findOne({ guildId, name: copyName });
    if (existing) copyName = (rest.name + ' copy ' + Date.now()).slice(0, 50);
    const copy = new GuildCommand({ ...rest, guildId, name: copyName, enabled: false });
    await copy.save();
    res.status(201).json({ command: copy });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to duplicate command' });
  }
});

// POST /api/guild/:guildId/guild-commands/validate
router.post('/guild/:guildId/guild-commands/validate', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const data = sanitizeGuildCommand(req.body);
    // Check name uniqueness
    const id = req.body._id || null;
    const existing = await GuildCommand.findOne({
      guildId,
      name: data.name,
      ...(id ? { _id: { $ne: id } } : {}),
    });
    if (existing) return res.status(409).json({ error: 'A command with this name already exists', field: 'name' });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Validation failed' });
  }
});

module.exports = router;
