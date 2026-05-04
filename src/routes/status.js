const express = require('express');
const router = express.Router();
const { BotStatus } = require('../models/BotStatus');

const OFFLINE_TIMEOUT_MS = 90_000; // 90 s — matches bot's health reporter

// ── Public status page ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const doc = await BotStatus.findById('bot').lean();
    const status = resolveStatus(doc);
    res.render('status', { title: 'Status', status });
  } catch (err) {
    console.error('[Status] Route error:', err);
    res.status(500).render('error', { code: 500, message: 'Failed to load status page.' });
  }
});

// ── JSON API — polled by the status page client-side ──────────
router.get('/api', async (req, res) => {
  try {
    const doc = await BotStatus.findById('bot').lean();
    res.json(resolveStatus(doc));
  } catch (err) {
    console.error('[Status] API error:', err);
    res.status(500).json({ status: 'offline', statusMessage: 'Failed to read status.' });
  }
});

// ── Helpers ───────────────────────────────────────────────────
function resolveStatus(doc) {
  if (!doc) {
    return {
      status: 'offline',
      statusMessage: 'No data yet — bot has not reported in.',
      latencyMs: null,
      memoryMB: null,
      uptimeSeconds: null,
      guildCount: null,
      highLatency: false,
      lastHeartbeat: null,
      updatedAt: null,
    };
  }

  // If the last heartbeat is too old, override status to offline
  const sinceHeartbeat = doc.lastHeartbeat
    ? Date.now() - new Date(doc.lastHeartbeat).getTime()
    : Infinity;

  const status = sinceHeartbeat > OFFLINE_TIMEOUT_MS ? 'offline' : doc.status;

  return {
    status,
    statusMessage: sinceHeartbeat > OFFLINE_TIMEOUT_MS
      ? 'FlynnBot has not reported in recently.'
      : doc.statusMessage,
    latencyMs: doc.latencyMs,
    memoryMB: doc.memoryMB,
    uptimeSeconds: doc.uptimeSeconds,
    guildCount: doc.guildCount,
    highLatency: doc.highLatency,
    lastHeartbeat: doc.lastHeartbeat,
    updatedAt: doc.updatedAt,
  };
}

module.exports = router;
