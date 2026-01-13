const express = require('express');
const {
  fetchLocalChannels,
  fetchChannelVideosCount,
  normalizeInstanceUrl,
  DEFAULT_BACKOFF_DELAYS,
  SECOND_PASS_BACKOFF_DELAYS,
  SECOND_PASS_TIMEOUT_MS
} = require('../lib/peertubeApi');

const router = express.Router();

router.get('/channels', async (req, res) => {
  const { instance } = req.query;

  if (!instance) {
    return res.status(400).json({ error: 'Missing instance query parameter.' });
  }

  try {
    const data = await fetchLocalChannels(instance);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Failed to load channels.'
    });
  }
});

router.get('/channel-videos', async (req, res) => {
  const { instance, channel, pass } = req.query;

  if (!instance || !channel) {
    return res.status(400).json({ error: 'Missing instance or channel query parameter.' });
  }

  try {
    const instanceUrl = normalizeInstanceUrl(instance);
    const options =
      pass === '2'
        ? {
            backoffDelays: SECOND_PASS_BACKOFF_DELAYS,
            timeoutMs: SECOND_PASS_TIMEOUT_MS,
            label: 'pass-2'
          }
        : {
            backoffDelays: DEFAULT_BACKOFF_DELAYS,
            label: 'pass-1'
          };
    const videosCount = await fetchChannelVideosCount(instanceUrl.origin, channel, options);
    return res.json({ videosCount });
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({
      error: error.message || 'Failed to load channel videos.',
      retryable: error.retryable === true,
      status: error.status
    });
  }
});

module.exports = router;
