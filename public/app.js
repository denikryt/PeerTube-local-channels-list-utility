const input = document.getElementById('instance-input');
const button = document.getElementById('load-button');
const statusEl = document.getElementById('status');
const grid = document.getElementById('channels-grid');

function setStatus(message) {
  statusEl.textContent = message;
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
  videos.innerHTML = `Videos: <span>${Number.isFinite(channel.videosCount) ? channel.videosCount : '—'}</span>`;

  const followers = document.createElement('div');
  followers.innerHTML = `Followers: <span>${Number.isFinite(channel.followersCount) ? channel.followersCount : '—'}</span>`;

  meta.appendChild(owner);
  meta.appendChild(videos);
  meta.appendChild(followers);

  card.appendChild(header);
  card.appendChild(meta);

  return card;
}

async function loadChannels() {
  const instance = input.value.trim();
  if (!instance) {
    setStatus('Please enter a PeerTube instance URL.');
    return;
  }

  button.disabled = true;
  setStatus('Loading channels and channel details...');
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

    setStatus(`Loaded ${channels.length} channels from ${payload.instance}.`);
    const fragment = document.createDocumentFragment();

    channels.forEach((channel) => {
      fragment.appendChild(createCard(channel, payload.instance));
    });

    grid.appendChild(fragment);
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
