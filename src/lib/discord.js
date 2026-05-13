/**
 * Thin wrapper around the Discord REST API using Node's built-in fetch.
 * Uses the BOT_TOKEN from env for privileged guild endpoints.
 */

const BASE = 'https://discord.com/api/v10';

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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${options.method || 'GET'} ${path} → ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Guild info ────────────────────────────────────────────────
async function getGuild(guildId) {
  return discordFetch(`/guilds/${guildId}?with_counts=false`);
}

async function getGuildRoles(guildId) {
  return discordFetch(`/guilds/${guildId}/roles`);
}

async function getGuildChannels(guildId) {
  const channels = await discordFetch(`/guilds/${guildId}/channels`);
  // Only return text/forum channels useful for channel restrictions
  // 0=text, 5=announcement, 10=announcementThread, 11=publicThread, 12=privateThread, 15=forum
  return channels.filter((c) => [0, 5, 10, 11, 12, 15].includes(c.type));
}

async function getGuildMember(guildId, userId) {
  return discordFetch(`/guilds/${guildId}/members/${userId}`);
}

async function getGuildEmojis(guildId) {
  return discordFetch(`/guilds/${guildId}/emojis`);
}

// ── Guild commands ────────────────────────────────────────────
async function getGuildCommands(guildId) {
  const appId = process.env.DISCORD_CLIENT_ID;
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands`);
}

async function registerGuildCommand(guildId, commandBody) {
  const appId = process.env.DISCORD_CLIENT_ID;
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands`, {
    method: 'POST',
    body: JSON.stringify(commandBody),
  });
}

async function updateGuildCommand(guildId, commandId, commandBody) {
  const appId = process.env.DISCORD_CLIENT_ID;
  return discordFetch(`/applications/${appId}/guilds/${guildId}/commands/${commandId}`, {
    method: 'PATCH',
    body: JSON.stringify(commandBody),
  });
}

async function deleteGuildCommand(guildId, commandId) {
  const appId = process.env.DISCORD_CLIENT_ID;
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
