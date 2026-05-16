/**
 * Thin wrapper around the Discord REST API using Node's built-in fetch.
 * Uses the BOT_TOKEN from env for privileged guild endpoints.
 *
 * Includes:
 *  - Per-route in-memory cache (TTL varies by endpoint)
 *  - Automatic 429 retry-after handling (single retry, max 10s wait)
 */

const BASE = 'https://discord.com/api/v10';

// ── Cache ─────────────────────────────────────────────────────
// cache: Map<key, { data, expiresAt }>
const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttlMs) {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// TTLs (milliseconds)
const TTL = {
  guild:    5 * 60 * 1000,  // 5 min
  roles:    3 * 60 * 1000,  // 3 min
  channels: 3 * 60 * 1000,  // 3 min
  emojis:   5 * 60 * 1000,  // 5 min
  commands: 2 * 60 * 1000,  // 2 min
};

function authHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set in dashboard .env');
  return {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };
}

async function discordFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers ?? {}) },
  });

  // Handle rate limit with one automatic retry
  if (res.status === 429) {
    let retryAfter = 1;
    try {
      const body = await res.json();
      retryAfter = Math.min(10, body.retry_after ?? 1);
    } catch {}
    await new Promise(r => setTimeout(r, Math.ceil(retryAfter * 1000) + 100));
    // Retry once
    const retry = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers ?? {}) },
    });
    if (!retry.ok) {
      const body = await retry.text();
      throw new Error(`Discord API ${options.method || 'GET'} ${path} → ${retry.status}: ${body}`);
    }
    const text = await retry.text();
    return text ? JSON.parse(text) : null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${options.method || 'GET'} ${path} → ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Guild info ────────────────────────────────────────────────
async function getGuild(guildId) {
  const key = `guild:${guildId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const data = await discordFetch(`/guilds/${guildId}?with_counts=false`);
  cacheSet(key, data, TTL.guild);
  return data;
}

async function getGuildRoles(guildId) {
  const key = `roles:${guildId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const data = await discordFetch(`/guilds/${guildId}/roles`);
  cacheSet(key, data, TTL.roles);
  return data;
}

async function getGuildChannels(guildId, { includeVoice = false } = {}) {
  const key = `channels:${guildId}`;
  let channels = cacheGet(key);
  if (!channels) {
    channels = await discordFetch(`/guilds/${guildId}/channels`);
    cacheSet(key, channels, TTL.channels);
  }
  if (includeVoice) return channels;
  // 0=text, 5=announcement, 10=announcementThread, 11=publicThread, 12=privateThread, 15=forum
  return channels.filter((c) => [0, 5, 10, 11, 12, 15].includes(c.type));
}

async function getGuildMember(guildId, userId) {
  return discordFetch(`/guilds/${guildId}/members/${userId}`);
}

async function getGuildEmojis(guildId) {
  const key = `emojis:${guildId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const data = await discordFetch(`/guilds/${guildId}/emojis`);
  cacheSet(key, data, TTL.emojis);
  return data;
}

// ── Guild commands ────────────────────────────────────────────
async function getGuildCommands(guildId) {
  const key = `commands:${guildId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const appId = process.env.DISCORD_CLIENT_ID;
  const data = await discordFetch(`/applications/${appId}/guilds/${guildId}/commands`);
  cacheSet(key, data, TTL.commands);
  return data;
}

async function registerGuildCommand(guildId, commandBody) {
  const appId = process.env.DISCORD_CLIENT_ID;
  _cache.delete(`commands:${guildId}`);
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands`, {
    method: 'POST',
    body: JSON.stringify(commandBody),
  });
}

async function updateGuildCommand(guildId, commandId, commandBody) {
  const appId = process.env.DISCORD_CLIENT_ID;
  _cache.delete(`commands:${guildId}`);
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands/${commandId}`, {
    method: 'PATCH',
    body: JSON.stringify(commandBody),
  });
}

async function deleteGuildCommand(guildId, commandId) {
  const appId = process.env.DISCORD_CLIENT_ID;
  _cache.delete(`commands:${guildId}`);
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands/${commandId}`, {
    method: 'DELETE',
  });
}

// ── Audit log ─────────────────────────────────────────────────
async function getAuditLog(guildId, params = {}) {
  const qs = new URLSearchParams();
  if (params.limit)       qs.set('limit', Math.min(100, parseInt(params.limit) || 50));
  if (params.before)      qs.set('before', params.before);
  if (params.user_id)     qs.set('user_id', params.user_id);
  if (params.action_type) qs.set('action_type', params.action_type);
  const query = qs.toString() ? `?${qs}` : '';
  return discordFetch(`/guilds/${guildId}/audit-logs${query}`);
}

// ── Role management ───────────────────────────────────────────
async function addRoleToMember(guildId, userId, roleId) {
  return discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'PUT',
    headers: { 'Content-Length': '0' },
  });
}

async function removeRoleFromMember(guildId, userId, roleId) {
  return discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  });
}

// ── User helpers ──────────────────────────────────────────────
async function getUser(userId) {
  return discordFetch(`/users/${userId}`);
}

// Returns the guilds the bot itself is in (max 200 per page).
async function getBotGuilds() {
  return discordFetch('/users/@me/guilds?limit=200');
}

// Invalidate cached data for a guild (call after write operations that may affect roles/channels)
function invalidateGuildCache(guildId) {
  _cache.delete(`guild:${guildId}`);
  _cache.delete(`roles:${guildId}`);
  _cache.delete(`channels:${guildId}`);
  _cache.delete(`emojis:${guildId}`);
  _cache.delete(`commands:${guildId}`);
}

module.exports = {
  getGuild,
  getGuildRoles,
  getGuildChannels,
  getGuildMember,
  getGuildEmojis,
  getGuildCommands,
  registerGuildCommand,
  updateGuildCommand,
  deleteGuildCommand,
  postMessage,
  editMessage,
  deleteMessage,
  addReaction,
  createDmChannel,
  sendWebhook,
  getUser,
  getBotGuilds,
  getAuditLog,
  addRoleToMember,
  removeRoleFromMember,
  invalidateGuildCache,
};

// ── Message helpers ───────────────────────────────────────────
async function postMessage(channelId, body) {
  return discordFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function editMessage(channelId, messageId, body) {
  return discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteMessage(channelId, messageId) {
  return discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

async function addReaction(channelId, messageId, emoji) {
  const encoded = encodeURIComponent(emoji);
  return discordFetch(`/channels/${channelId}/messages/${messageId}/reactions/${encoded}/@me`, {
    method: 'PUT',
    headers: { 'Content-Length': '0' },
  });
}

async function createDmChannel(userId) {
  return discordFetch('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: userId }),
  });
}

// ── Webhook helpers ───────────────────────────────────────────
async function sendWebhook(webhookUrl, body) {
  if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    throw new Error('Invalid Discord webhook URL');
  }
  // Use ?wait=true so Discord returns the sent message object
  const res = await fetch(`${webhookUrl}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook send failed ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
