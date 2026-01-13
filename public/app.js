const input = document.getElementById('instance-input');
const button = document.getElementById('load-button');
const statusEl = document.getElementById('status');
const grid = document.getElementById('channels-grid');

const FIRST_PASS_CONCURRENCY = 4;
const SECOND_PASS_CONCURRENCY = 2;
const FIRST_PASS_SPACING_MS = 150;
const SECOND_PASS_SPACING_MS = 400;

function setStatus(message) {
  statusEl.textContent = message;
}

function escapeSelector(value) {
  if (window.CSS && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/\"/g, '\\\"');
}

function clearGrid() {
  grid.innerHTML = '';
}

function createAvatar(avatarUrl, fallbackText) {
  const avatar = document.createElement('div');
  avatar.className = 'avatar';

  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = fallbackText;
    avatar.appendChild(img);
  } else {
    avatar.textContent = 'No avatar';
  }

  return avatar;
}

function createCard(channel, instanceOrigin) {
  const card = document.createElement('article');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const avatarPath = channel.avatar && channel.avatar.path;
  const avatarUrl = avatarPath
    ? new URL(avatarPath, instanceOrigin).toString()
    : null;

  const avatar = createAvatar(avatarUrl, channel.displayName || channel.name || 'Channel');

  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = channel.displayName || channel.name || 'Untitled channel';

  const link = document.createElement('a');
  link.href = channel.url || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = channel.url || 'No channel URL';

  heading.appendChild(title);
  heading.appendChild(link);

  header.appendChild(avatar);
  header.appendChild(heading);

  const meta = document.createElement('div');
  meta.className = 'meta';

  const owner = document.createElement('div');
  owner.innerHTML = `Owner: <span>${channel.ownerAccount?.name || 'Unknown'}</span>`;

  const videos = document.createElement('div');
  const videosValue = document.createElement('span');
  videosValue.dataset.channelName = channel.name;
  videosValue.textContent = 'Loading...';
  videos.innerHTML = 'Videos: ';
  videos.appendChild(videosValue);

  const followers = document.createElement('div');
  followers.innerHTML = `Followers: <span>${Number.isFinite(channel.followersCount) ? channel.followersCount : '—'}</span>`;

  meta.appendChild(owner);
  meta.appendChild(videos);
  meta.appendChild(followers);

  card.appendChild(header);
  card.appendChild(meta);

  return card;
}

function setVideosText(channelName, text) {
  const value = grid.querySelector(
    `[data-channel-name="${escapeSelector(channelName)}"]`
  );
  if (!value) {
    return;
  }

  value.textContent = text;
}

function updateVideosCount(channelName, count) {
  if (typeof count === 'number') {
    setVideosText(channelName, String(count));
  } else {
    setVideosText(channelName, '—');
  }
}

async function fetchVideoCount(instance, channelName, pass) {
  const response = await fetch(
    `/api/channel-videos?instance=${encodeURIComponent(instance)}&channel=${encodeURIComponent(channelName)}&pass=${pass}`
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      retryable: payload.retryable === true,
      status: payload.status || response.status
    };
  }

  if (!Number.isFinite(payload.videosCount)) {
    return { ok: false, retryable: false, status: response.status };
  }

  return { ok: true, count: payload.videosCount };
}

async function fetchVideoCountsWithLimit(instance, channels, options) {
  const concurrency = options.concurrency;
  const spacingMs = options.spacingMs;
  const pass = options.pass;
  let index = 0;
  let active = 0;
  const retryableFailures = [];
  let startGate = Promise.resolve();

  return new Promise((resolve) => {
    const next = () => {
      while (active < concurrency && index < channels.length) {
        const channel = channels[index++];
        active += 1;

        fetchVideoCount(instance, channel.name, pass)
          .then((result) => {
            if (result.ok) {
              updateVideosCount(channel.name, result.count);
            } else if (result.retryable) {
              retryableFailures.push(channel);
              if (pass === 1) {
                setVideosText(channel.name, 'Retrying...');
              }
            } else {
              updateVideosCount(channel.name, null);
            }
          })
          .catch(() => {
            retryableFailures.push(channel);
            if (pass === 1) {
              setVideosText(channel.name, 'Retrying...');
            }
          })
          .finally(() => {
            active -= 1;
            startGate = startGate.then(
              () =>
                new Promise((gateResolve) => {
                  setTimeout(gateResolve, spacingMs);
                })
            );
            startGate.then(() => {
              if (index >= channels.length && active === 0) {
                resolve(retryableFailures);
              } else {
                next();
              }
            });
          });
      }
    };

    next();
  });
}

async function loadChannels() {
  const instance = input.value.trim();
  if (!instance) {
    setStatus('Please enter a PeerTube instance URL.');
    return;
  }

  button.disabled = true;
  setStatus('Loading channels...');
  clearGrid();

  try {
    const response = await fetch(`/api/channels?instance=${encodeURIComponent(instance)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load channels.');
    }

    const channels = payload.channels || [];
    if (channels.length === 0) {
      setStatus('No channels found for this instance.');
      return;
    }

    setStatus(`Loaded ${channels.length} channels from ${payload.instance}. Fetching video counts...`);
    const fragment = document.createDocumentFragment();

    channels.forEach((channel) => {
      fragment.appendChild(createCard(channel, payload.instance));
    });

    grid.appendChild(fragment);
    const retryableFailures = await fetchVideoCountsWithLimit(payload.instance, channels, {
      concurrency: FIRST_PASS_CONCURRENCY,
      spacingMs: FIRST_PASS_SPACING_MS,
      pass: 1
    });

    if (retryableFailures.length > 0) {
      setStatus(
        `Retrying ${retryableFailures.length} channels with rate-limited counts...`
      );
      const secondFailures = await fetchVideoCountsWithLimit(
        payload.instance,
        retryableFailures,
        {
          concurrency: SECOND_PASS_CONCURRENCY,
          spacingMs: SECOND_PASS_SPACING_MS,
          pass: 2
        }
      );

      secondFailures.forEach((channel) => updateVideosCount(channel.name, null));
    }

    setStatus(`Loaded ${channels.length} channels from ${payload.instance}.`);
  } catch (error) {
    setStatus(error.message || 'Something went wrong.');
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', loadChannels);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loadChannels();
  }
});
