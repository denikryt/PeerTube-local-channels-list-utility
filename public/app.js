const input = document.getElementById('instance-input');
const button = document.getElementById('load-button');
const statusEl = document.getElementById('status');
const grid = document.getElementById('channels-grid');
const tableBody = document.getElementById('channels-table-body');
const cardsView = document.getElementById('cards-view');
const tableView = document.getElementById('table-view');
const cardsButton = document.getElementById('view-cards');
const tableButton = document.getElementById('view-table');
const sortButtons = document.querySelectorAll('.sort-button');

const FIRST_PASS_CONCURRENCY = 4;
const SECOND_PASS_CONCURRENCY = 2;
const FIRST_PASS_SPACING_MS = 150;
const SECOND_PASS_SPACING_MS = 400;

let channelsState = [];
let sortState = { key: null, direction: 'asc' };
let instanceOrigin = '';
let viewToggleBound = false;
let sortBound = false;

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

function clearTable() {
  tableBody.innerHTML = '';
}

function channelKey(channel) {
  return `${channel.name}@${channel.host}`;
}

function getAvatarFallbackText(name) {
  if (!name) {
    return 'NA';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'NA';
  }
  const initials = parts.slice(0, 2).map((part) => part[0].toUpperCase());
  return initials.join('');
}

function buildAbsoluteUrl(path, instanceOrigin) {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return new URL(path, instanceOrigin).toString();
}

function selectAvatarPath(channel, sizeHint) {
  const candidates = [];

  if (channel && channel.avatar && channel.avatar.path) {
    candidates.push(channel.avatar);
  }

  if (Array.isArray(channel?.avatars)) {
    candidates.push(...channel.avatars);
  } else if (channel?.avatars?.path) {
    candidates.push(channel.avatars);
  }

  if (Array.isArray(channel?.avatar)) {
    candidates.push(...channel.avatar);
  }

  const withWidth = candidates.filter((item) => typeof item.width === 'number');
  if (withWidth.length > 0) {
    const largerOrEqual = withWidth
      .filter((item) => item.width >= sizeHint)
      .sort((a, b) => a.width - b.width);
    const pick = largerOrEqual[0] || withWidth.sort((a, b) => b.width - a.width)[0];
    return pick?.path || null;
  }

  return candidates[0]?.path || null;
}

function resolveAvatarUrl(channel, instanceOrigin, sizeHint) {
  const path = selectAvatarPath(channel, sizeHint);
  return buildAbsoluteUrl(path, instanceOrigin);
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
    avatar.textContent = getAvatarFallbackText(fallbackText);
  }

  return avatar;
}

function getVideosText(channel) {
  if (channel.videosStatus === 'loaded' && typeof channel.videosCount === 'number') {
    return String(channel.videosCount);
  }
  if (channel.videosStatus === 'retrying') {
    return 'Retrying...';
  }
  if (channel.videosStatus === 'failed') {
    return '—';
  }
  return 'Loading...';
}

function createCard(channel, instanceOrigin) {
  const card = document.createElement('article');
  card.className = 'card';
  const key = channelKey(channel);

  const header = document.createElement('div');
  header.className = 'card-header';

  const avatarUrl = resolveAvatarUrl(channel, instanceOrigin, 56);

  const avatar = createAvatar(avatarUrl, channel.displayName || channel.name || 'Channel');

  const heading = document.createElement('div');
  const title = document.createElement('h2');
  const titleLink = document.createElement('a');
  titleLink.href = channel.url || '#';
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = channel.displayName || channel.name || 'Untitled channel';
  title.appendChild(titleLink);

  heading.appendChild(title);

  header.appendChild(avatar);
  header.appendChild(heading);

  const meta = document.createElement('div');
  meta.className = 'meta';

  const owner = document.createElement('div');
  owner.innerHTML = `Owner: <span>${channel.ownerAccount?.name || 'Unknown'}</span>`;

  const videos = document.createElement('div');
  const videosValue = document.createElement('span');
  videosValue.dataset.channelKey = key;
  videosValue.textContent = getVideosText(channel);
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

function createTableRow(channel, instanceOrigin) {
  const row = document.createElement('tr');
  const key = channelKey(channel);

  const avatarCell = document.createElement('td');
  const avatarUrl = resolveAvatarUrl(channel, instanceOrigin, 36);

  const avatar = document.createElement('div');
  avatar.className = 'table-avatar';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = channel.displayName || channel.name || 'Channel';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getAvatarFallbackText(channel.displayName || channel.name || '');
  }
  avatarCell.appendChild(avatar);

  const nameCell = document.createElement('td');
  const nameLink = document.createElement('a');
  nameLink.href = channel.url || '#';
  nameLink.target = '_blank';
  nameLink.rel = 'noopener noreferrer';
  nameLink.textContent = channel.displayName || channel.name || 'Untitled channel';
  nameCell.appendChild(nameLink);

  const ownerCell = document.createElement('td');
  ownerCell.textContent = channel.ownerAccount?.name || 'Unknown';

  const videosCell = document.createElement('td');
  videosCell.className = 'numeric';
  const videosValue = document.createElement('span');
  videosValue.dataset.channelKey = key;
  videosValue.textContent = getVideosText(channel);
  videosCell.appendChild(videosValue);

  const followersCell = document.createElement('td');
  followersCell.className = 'numeric';
  followersCell.textContent = Number.isFinite(channel.followersCount)
    ? String(channel.followersCount)
    : '—';

  row.appendChild(avatarCell);
  row.appendChild(nameCell);
  row.appendChild(ownerCell);
  row.appendChild(videosCell);
  row.appendChild(followersCell);

  return row;
}

function setVideosTextByKey(key, text) {
  const values = document.querySelectorAll(
    `[data-channel-key="${escapeSelector(key)}"]`
  );
  values.forEach((value) => {
    value.textContent = text;
  });
}

function updateVideosCount(channelKeyValue, count) {
  if (typeof count === 'number') {
    setVideosTextByKey(channelKeyValue, String(count));
  } else {
    setVideosTextByKey(channelKeyValue, '—');
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

function sortChannels(channels, sortState) {
  if (!sortState.key) {
    return [...channels].sort((a, b) => a.originalIndex - b.originalIndex);
  }

  const direction = sortState.direction === 'desc' ? -1 : 1;
  const getValue = (channel) => {
    switch (sortState.key) {
      case 'name':
        return (channel.displayName || channel.name || '').toLowerCase();
      case 'owner':
        return (channel.ownerAccount?.name || '').toLowerCase();
      case 'videos':
        return typeof channel.videosCount === 'number' ? channel.videosCount : null;
      case 'followers':
        return Number.isFinite(channel.followersCount) ? channel.followersCount : null;
      default:
        return null;
    }
  };

  return [...channels].sort((a, b) => {
    const aValue = getValue(a);
    const bValue = getValue(b);

    if (aValue === null && bValue === null) {
      return a.originalIndex - b.originalIndex;
    }
    if (aValue === null) {
      return 1;
    }
    if (bValue === null) {
      return -1;
    }
    if (aValue < bValue) {
      return -1 * direction;
    }
    if (aValue > bValue) {
      return 1 * direction;
    }
    return a.originalIndex - b.originalIndex;
  });
}

function renderCards(channels, instanceOrigin) {
  clearGrid();
  const fragment = document.createDocumentFragment();
  channels.forEach((channel) => {
    fragment.appendChild(createCard(channel, instanceOrigin));
  });
  grid.appendChild(fragment);
}

function renderTable(channels, instanceOrigin, sortState) {
  clearTable();
  const fragment = document.createDocumentFragment();
  const sorted = sortChannels(channels, sortState);
  sorted.forEach((channel) => {
    fragment.appendChild(createTableRow(channel, instanceOrigin));
  });
  tableBody.appendChild(fragment);
}

function updateSortButtons(sortState) {
  sortButtons.forEach((buttonEl) => {
    const key = buttonEl.dataset.sortKey;
    buttonEl.classList.remove('is-active', 'asc');
    if (key === sortState.key) {
      buttonEl.classList.add('is-active');
      if (sortState.direction === 'asc') {
        buttonEl.classList.add('asc');
      }
    }
  });
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
            const key = channelKey(channel);
            if (result.ok) {
              channel.videosCount = result.count;
              channel.videosStatus = 'loaded';
              updateVideosCount(key, result.count);
            } else if (result.retryable) {
              retryableFailures.push(channel);
              if (pass === 1) {
                channel.videosStatus = 'retrying';
                setVideosTextByKey(key, 'Retrying...');
              }
            } else {
              channel.videosStatus = 'failed';
              updateVideosCount(key, null);
            }
          })
          .catch(() => {
            const key = channelKey(channel);
            retryableFailures.push(channel);
            if (pass === 1) {
              channel.videosStatus = 'retrying';
              setVideosTextByKey(key, 'Retrying...');
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

    channelsState = channels.map((channel, index) => ({
      ...channel,
      originalIndex: index,
      videosCount: null,
      videosStatus: 'loading'
    }));
    sortState = { key: null, direction: 'asc' };
    instanceOrigin = payload.instance;

    setStatus(`Loaded ${channelsState.length} channels from ${payload.instance}. Fetching video counts...`);
    renderCards(channelsState, instanceOrigin);
    renderTable(channelsState, instanceOrigin, sortState);
    setupViewToggle();
    setupSortControls();

    const retryableFailures = await fetchVideoCountsWithLimit(instanceOrigin, channelsState, {
      concurrency: FIRST_PASS_CONCURRENCY,
      spacingMs: FIRST_PASS_SPACING_MS,
      pass: 1
    });

    if (retryableFailures.length > 0) {
      setStatus(
        `Retrying ${retryableFailures.length} channels with rate-limited counts...`
      );
      const secondFailures = await fetchVideoCountsWithLimit(
        instanceOrigin,
        retryableFailures,
        {
          concurrency: SECOND_PASS_CONCURRENCY,
          spacingMs: SECOND_PASS_SPACING_MS,
          pass: 2
        }
      );

      secondFailures.forEach((channel) => {
        channel.videosStatus = 'failed';
        updateVideosCount(channelKey(channel), null);
      });
    }

    setStatus(`Loaded ${channels.length} channels from ${payload.instance}.`);
  } catch (error) {
    setStatus(error.message || 'Something went wrong.');
  } finally {
    button.disabled = false;
  }
}

function setupViewToggle() {
  if (viewToggleBound) {
    return;
  }
  viewToggleBound = true;
  cardsButton.addEventListener('click', () => {
    cardsButton.classList.add('is-active');
    tableButton.classList.remove('is-active');
    cardsView.classList.remove('is-hidden');
    tableView.classList.add('is-hidden');
  });

  tableButton.addEventListener('click', () => {
    tableButton.classList.add('is-active');
    cardsButton.classList.remove('is-active');
    tableView.classList.remove('is-hidden');
    cardsView.classList.add('is-hidden');
  });
}

function setupSortControls() {
  if (sortBound) {
    updateSortButtons(sortState);
    return;
  }
  sortBound = true;
  sortButtons.forEach((buttonEl) => {
    buttonEl.addEventListener('click', () => {
      const key = buttonEl.dataset.sortKey;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.direction = 'asc';
      }
      updateSortButtons(sortState);
      renderTable(channelsState, instanceOrigin, sortState);
    });
  });
  updateSortButtons(sortState);
}

button.addEventListener('click', loadChannels);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loadChannels();
  }
});
