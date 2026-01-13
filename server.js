const path = require('path');
const express = require('express');
const channelsRouter = require('./routes/channels');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/api', channelsRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PeerTube local channels UI running at http://localhost:${PORT}`);
});
