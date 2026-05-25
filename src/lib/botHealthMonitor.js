const { BotStatus } = require('../models/BotStatus');
const { StatusLog } = require('../models/StatusLog');

const OFFLINE_TIMEOUT_MS = 90_000; // 90 seconds
const CHECK_INTERVAL_MS = 60_000; // 1 minute

let lastOfflineLogged = false;

function startBotHealthMonitor() {
  setInterval(async () => {
    try {
      const doc = await BotStatus.findById('bot').lean();
      
      if (!doc) return;

      const sinceHeartbeat = doc.lastHeartbeat
        ? Date.now() - new Date(doc.lastHeartbeat).getTime()
        : Infinity;

      const isActuallyOffline = sinceHeartbeat > OFFLINE_TIMEOUT_MS;

      if (isActuallyOffline && !lastOfflineLogged) {
        // Log that the bot is offline because it stopped reporting
        await StatusLog.create({
          service: 'bot',
          type: 'offline',
          message: 'Bot stopped sending heartbeat (process likely crashed or stopped).',
          details: { sinceHeartbeatMs: sinceHeartbeat }
        });
        lastOfflineLogged = true;
      } else if (!isActuallyOffline && lastOfflineLogged) {
        // Bot came back online (though health.js already logs online, this handles state clearing)
        lastOfflineLogged = false;
      }
    } catch (err) {
      console.error('[BotHealthMonitor] error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = { startBotHealthMonitor };
