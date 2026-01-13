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
4. The backend returns the channel list without video counts.
5. For each channel, the frontend calls the proxy endpoint `/api/channel-videos` which fetches the channel videos endpoint:

```
<instance>/api/v1/video-channels/<channelName>/videos
```

6. The video count is read from the `total` field in that response.
7. Requests are concurrency-limited on the client with paced dispatching, while the backend applies timeouts and retries for 429/5xx responses.
8. A second retry pass runs for transient failures using a lower concurrency and longer backoff delays.
9. The UI updates each channel card as soon as its count is available.

No data is stored or cached; each request is fetched fresh from the PeerTube API.
