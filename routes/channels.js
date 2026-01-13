const express = require('express');
const { fetchLocalChannels } = require('../lib/peertubeApi');

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

module.exports = router;
