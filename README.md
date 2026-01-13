# PeerTube Local Channels List Utility

A minimal Node.js + Express project that fetches and displays all local PeerTube channels for a given instance. The server acts as a small proxy to avoid CORS issues, while the frontend is plain HTML, CSS, and vanilla JavaScript.

## Requirements

- Node.js 18+ (for built-in `fetch`)

## Install dependencies

```bash
npm install
```

## Start the server

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

## Example instance URL

```
https://videovortex.tv
```

## How the API interaction works

1. The frontend sends the instance URL to the Express backend.
2. The backend extracts the hostname and calls:

```
<instance>/api/v1/search/video-channels?host=<domain>
```

3. Pagination is handled automatically with `start` and `count` until all results are fetched.
4. For each channel, the backend fetches the channel videos endpoint:

```
<instance>/api/v1/video-channels/<channelName>/videos
```

5. The video count is read from the `total` field in that response.
6. The backend returns the enriched list to the UI for rendering.

No data is stored or cached; each request is fetched fresh from the PeerTube API.
