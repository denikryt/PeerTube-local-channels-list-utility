const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_COUNT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BACKOFF_DELAYS = [500, 1500];
const SECOND_PASS_BACKOFF_DELAYS = [3000, 5000];
const SECOND_PASS_TIMEOUT_MS = 7000;

function normalizeInstanceUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Instance URL is required.');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Instance URL is required.');
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return new URL(`https://${trimmed}`);
  }

  return new URL(trimmed);
}

async function fetchLocalChannels(instanceUrl, pageSize = DEFAULT_PAGE_SIZE) {
  const instance = normalizeInstanceUrl(instanceUrl);
  const host = instance.hostname;
  const base = `${instance.origin}/api/v1/search/video-channels`;

  let start = 0;
  let total = null;
  const results = [];

  while (total === null || start < total) {
    const url = new URL(base);
    url.searchParams.set('host', host);
    url.searchParams.set('start', String(start));
    url.searchParams.set('count', String(pageSize));

    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PeerTube request failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload.data)) {
      throw new Error('Unexpected PeerTube response format.');
    }

    results.push(...payload.data);
    total = typeof payload.total === 'number' ? payload.total : results.length;
    start += pageSize;

    if (payload.data.length === 0) {
      break;
    }
  }

  return {
    instance: instance.origin,
    host,
    channels: results
  };
}

module.exports = {
  fetchLocalChannels,
  normalizeInstanceUrl,
  fetchChannelVideosCount,
  DEFAULT_BACKOFF_DELAYS,
  SECOND_PASS_BACKOFF_DELAYS,
  SECOND_PASS_TIMEOUT_MS
};

async function fetchChannelVideosCount(instanceOrigin, channelName, options = {}) {
  const identifier = encodeURIComponent(channelName);
  const url = `${instanceOrigin}/api/v1/video-channels/${identifier}/videos`;
  const retries =
    typeof options.retries === 'number' ? options.retries : DEFAULT_COUNT_RETRIES;
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const backoffDelays = Array.isArray(options.backoffDelays)
    ? options.backoffDelays
    : DEFAULT_BACKOFF_DELAYS;
  const label = options.label || 'pass-1';

  let attempt = 0;

  while (attempt <= retries) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      console.log(
        `[videos] ${label} attempt ${attempt + 1} channel=${channelName} status=${response.status}`
      );

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        if (retryable && attempt < retries) {
          await sleep(getBackoffDelay(backoffDelays, attempt));
          attempt += 1;
          continue;
        }

        const text = await response.text();
        throw createRequestError(
          `Channel videos request failed (${response.status}): ${text}`,
          {
            status: response.status,
            retryable
          }
        );
      }

      const payload = await response.json();
      if (typeof payload.total !== 'number') {
        throw createRequestError('Unexpected channel videos response format.', {
          retryable: false
        });
      }

      return payload.total;
    } catch (error) {
      const retryable =
        error.name === 'AbortError' || error.name === 'TypeError' || error.retryable === true;
      const errorType = error.name === 'AbortError' ? 'timeout' : error.name || 'error';
      console.log(
        `[videos] ${label} attempt ${attempt + 1} channel=${channelName} error=${errorType}`
      );

      if (retryable && attempt < retries) {
        await sleep(getBackoffDelay(backoffDelays, attempt));
        attempt += 1;
        continue;
      }

      if (error.retryable === undefined) {
        error.retryable = retryable;
      }

      throw error;
    }
  }

  throw createRequestError('Channel videos request failed.', { retryable: false });
}

function getBackoffDelay(delays, attempt) {
  if (attempt < delays.length) {
    return delays[attempt];
  }

  return delays[delays.length - 1];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function createRequestError(message, details) {
  const error = new Error(message);
  error.status = details.status;
  error.retryable = details.retryable;
  return error;
}
