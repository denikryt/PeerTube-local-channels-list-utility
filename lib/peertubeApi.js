const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DETAIL_CONCURRENCY = 5;

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

  const detailedChannels = await mapWithConcurrency(
    results,
    DEFAULT_DETAIL_CONCURRENCY,
    async (channel) => enrichChannelWithVideoCount(instance.origin, channel)
  );

  return {
    instance: instance.origin,
    host,
    channels: detailedChannels
  };
}

module.exports = {
  fetchLocalChannels,
  normalizeInstanceUrl
};

async function enrichChannelWithVideoCount(instanceOrigin, channel) {
  try {
    const videosCount = await fetchChannelVideosCount(instanceOrigin, channel.name);
    return {
      ...channel,
      videosCount
    };
  } catch (error) {
    return {
      ...channel,
      videosCount: null
    };
  }
}

async function fetchChannelVideosCount(instanceOrigin, channelName) {
  const identifier = encodeURIComponent(channelName);
  const url = `${instanceOrigin}/api/v1/video-channels/${identifier}/videos`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Channel videos request failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (typeof payload.total !== 'number') {
    throw new Error('Unexpected channel videos response format.');
  }

  return payload.total;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
