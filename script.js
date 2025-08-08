// ========== APPLE MUSICKIT JS INTEGRATION ==========
// Safer token resolution: meta tag -> global -> fallback (your current token)
function getAppleDeveloperToken() {
  const meta = document.querySelector('meta[name="apple-developer-token"]');
  if (meta && meta.content) return meta.content.trim();
  if (window.APPLE_DEVELOPER_TOKEN) return String(window.APPLE_DEVELOPER_TOKEN);
  // Fallback to the token you provided. Consider rotating and minting server-side.
  return "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjM5RDY5S0NMNjYifQ.eyJpYXQiOjE3NTM4MTE3OTgsImV4cCI6MTc2OTM2Mzc5OCwiaXNzIjoiRzRTM1dWMzhUOCJ9.BABfEbHEcTGr_odCIhduIeiO3RBSGP1Wkqgp52PTEziNMQ4deTi_p-Rm_m5oj3e7vYx5PdqonFUg8urUIGFVUQ";
}

document.addEventListener("DOMContentLoaded", function () {
  if (typeof MusicKit !== "undefined") {
    MusicKit.configure({
      developerToken: getAppleDeveloperToken(),
      app: { name: "Convertables", build: "1.1.0" }
    });
    window.music = MusicKit.getInstance();
  }
});
// ========== END APPLE MUSICKIT JS INTEGRATION ==========

// ========== PROGRESS BAR UTILS ==========
function showProgress(percent, label) {
  const pc = document.getElementById('progress-container');
  const pb = document.getElementById('progress-bar');
  const pl = document.getElementById('progress-label');
  if (pc && pb && pl) {
    pc.style.display = 'block';
    pb.style.width = Math.min(100, Math.max(0, percent)) + '%';
    pl.textContent = label || '';
  }
}
function hideProgress() {
  const pc = document.getElementById('progress-container');
  if (pc) pc.style.display = 'none';
}
// ========== END PROGRESS BAR UTILS ==========

// ========== BUTTON/STATE UTILS ==========
function disableActions(disabled) {
  ["spotify-login-btn", "apple-music-login-btn", "transfer-btn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}
function setStatus(msg) {
  const el = document.getElementById("status-message");
  if (el) el.textContent = msg;
}
// ========== END BUTTON/STATE UTILS ==========

// ========== GLOBALS ==========
const CLIENT_ID = "ed6e006e361743a38c5b94660298ce7a";
const REDIRECT_URI = "https://convertables.xyz";
const SCOPES = "playlist-read-private playlist-read-collaborative";

let selectedPlaylist = null;
let selectedTracksForTransfer = [];
let currentPlaylists = [];
let applePlaylistLastId = null;

// Stepper handling
function updateStepper() {
  const spotifyToken = localStorage.getItem("spotifyAccessToken");
  const spotifyConnected = Boolean(spotifyToken) && !isTokenExpired();
  const appleConnected = window.music && window.music.isAuthorized;
  const hasSelection = Boolean(selectedPlaylist);

  const steps = [
    { id: "step-1", done: spotifyConnected, active: !spotifyConnected },
    { id: "step-2", done: hasSelection, active: spotifyConnected && !hasSelection },
    { id: "step-3", done: appleConnected, active: hasSelection && !appleConnected },
    { id: "step-4", done: false, active: spotifyConnected && hasSelection && appleConnected }
  ];
  steps.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;
    el.classList.toggle("done", s.done);
    el.classList.toggle("active", s.active);
  });

  const transferBtn = document.getElementById("transfer-btn");
  if (transferBtn) {
    transferBtn.disabled = !(spotifyConnected && hasSelection && appleConnected);
  }
}

// ========== SPOTIFY AUTH ==========
function getSpotifyAuthURL() {
  return `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    SCOPES
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}
document.getElementById("spotify-login-btn").addEventListener("click", () => {
  window.location.href = getSpotifyAuthURL();
});

function getAuthorizationCode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("code");
}
function isTokenExpired() {
  const expiryTime = localStorage.getItem("spotifyTokenExpiry");
  return !expiryTime || Date.now() > parseInt(expiryTime, 10);
}
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotifyRefreshToken");
  try {
    const response = await fetch("/api/spotify/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem("spotifyAccessToken", data.access_token);
      localStorage.setItem("spotifyTokenExpiry", Date.now() + data.expires_in * 1000);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}
async function fetchAccessToken(authCode) {
  try {
    const response = await fetch("/api/spotify/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: authCode }),
    });
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem("spotifyAccessToken", data.access_token);
      localStorage.setItem("spotifyTokenExpiry", Date.now() + data.expires_in * 1000);
      localStorage.setItem("spotifyRefreshToken", data.refresh_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}
async function fetchPlaylists(accessToken) {
  setLoading(true);
  try {
    const items = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const text = await response.text();
        showError("Error fetching playlists. Check permissions and try again.");
        throw new Error(`Spotify API: ${response.status} ${text}`);
      }
      const data = await response.json();
      items.push(...(data.items || []));
      url = data.next;
    }
    return items;
  } catch (error) {
    showError("An error occurred while fetching playlists.");
    return [];
  } finally {
    setLoading(false);
  }
}

// ========== APPLE AUTH ==========
document.getElementById("apple-music-login-btn").addEventListener("click", async () => {
  if (!window.music) {
    showError("Apple MusicKit is not initialized. Please refresh and try again.");
    return;
  }
  try {
    await window.music.authorize();
    const btn = document.getElementById("apple-music-login-btn");
    btn.classList.add("connected");
    btn.textContent = "Apple Music Connected ✓";
    setStatus("Apple Music connected! Select your Spotify playlist and click Transfer.");
    updateStepper();
  } catch {
    showError("Apple Music login failed. Please try again.");
  }
});

// ========== RENDERING PLAYLISTS & SEARCH ==========
const playlistContainer = document.getElementById("playlist-container");
const playlistSearch = document.getElementById("playlist-search");

function renderPlaylists(playlists) {
  currentPlaylists = playlists.slice().sort((a, b) => {
    // Sort by most recent update (if available), else by name
    const at = a.snapshot_id || "";
    const bt = b.snapshot_id || "";
    if (at && bt) return bt.localeCompare(at);
    return a.name.localeCompare(b.name);
  });
  renderFilteredPlaylists("");
}

function renderFilteredPlaylists(query) {
  if (!playlistContainer) return;
  playlistContainer.innerHTML = "";

  const q = (query || "").toLowerCase().trim();
  const list = q
    ? currentPlaylists.filter(p => (p.name || "").toLowerCase().includes(q))
    : currentPlaylists;

  if (!list.length) {
    playlistContainer.innerHTML = "<p>No playlists found.</p>";
    return;
  }

  const ul = document.createElement("ul");
  list.forEach((p) => {
    const li = document.createElement("li");
    li.className = "playlist-card";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Select playlist ${p.name}`);
    li.dataset.pid = p.id;

    const img = document.createElement("img");
    img.src = p.images?.[0]?.url || "";
    img.alt = `${p.name} cover`;

    const info = document.createElement("div");
    const title = document.createElement("p");
    title.className = "playlist-title";
    title.textContent = p.name;
    const count = document.createElement("p");
    count.className = "playlist-count";
    count.textContent = `${p.tracks?.total ?? "?"} tracks`;

    info.appendChild(title);
    info.appendChild(count);

    const sel = document.createElement("div");
    sel.innerHTML = "Choose";
    sel.style.color = "#16763b";
    sel.style.fontWeight = "600";

    li.appendChild(img);
    li.appendChild(info);
    li.appendChild(sel);

    function select() {
      document.querySelectorAll(".playlist-card.selected").forEach(el => el.classList.remove("selected"));
      li.classList.add("selected");
      selectedPlaylist = p;
      setStatus(`Selected "${p.name}". Choose tracks below, then click Transfer.`);
      updateStepper();
      // Fetch and show tracks
      document.getElementById('track-selector-section').style.display = 'block';
      fetchAndShowTracksForPartialTransfer(p.id, p.name).then(() => {
        // Scroll into view on mobile
        document.getElementById('track-selector-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    li.addEventListener("click", select);
    li.addEventListener("keypress", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });

    ul.appendChild(li);
  });

  playlistContainer.appendChild(ul);
}

if (playlistSearch) {
  const debounced = debounce((e) => renderFilteredPlaylists(e.target.value), 160);
  playlistSearch.addEventListener("input", debounced);
}

// Fetch tracks and show track selector UI with checkboxes
async function fetchAndShowTracksForPartialTransfer(playlistId, playlistName) {
  const section = document.getElementById('track-selector-section');
  const list = document.getElementById('track-list');
  section.querySelector('h2').textContent = `Select Tracks to Transfer for "${playlistName}"`;
  list.innerHTML = '<li>Loading tracks...</li>';
  const tracks = await getAllSpotifyTracksDetailed(playlistId);

  if (!tracks.length) {
    list.innerHTML = '<li>No tracks found in this playlist.</li>';
    selectedTracksForTransfer = [];
    return;
  }

  // Render checkboxes
  list.innerHTML = tracks.map((t, i) =>
    `<li>
      <label>
        <input type="checkbox" class="track-box" checked data-index="${i}" />
        ${escapeHtml(t.name)} — ${escapeHtml(t.artist)}
      </label>
    </li>`
  ).join('');

  // Select All checkbox logic
  const selectAll = document.getElementById('select-all');
  selectAll.checked = true;
  selectAll.onchange = function () {
    document.querySelectorAll('.track-box').forEach(box => box.checked = this.checked);
  };
  list.onchange = function () {
    const boxes = document.querySelectorAll('.track-box');
    selectAll.checked = Array.from(boxes).every(box => box.checked);
  };

  selectedTracksForTransfer = tracks;
}

// Fetch all tracks (with name/artist) for partial transfer
async function getAllSpotifyTracksDetailed(playlistId) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let accessToken = localStorage.getItem("spotifyAccessToken");
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) break;
    const data = await res.json();
    tracks = tracks.concat(
      data.items
        .filter(item => item && item.track && !item.is_local)
        .map(item => ({
          name: item.track.name,
          artist: item.track.artists?.[0]?.name || ""
        }))
    );
    url = data.next;
  }
  return tracks;
}

// ========== ERROR/LOADING UI ==========
function showError(message) {
  const errorSection = document.getElementById("error-section");
  const errorMessage = document.getElementById("error-message");
  if (errorSection && errorMessage) {
    errorMessage.textContent = message;
    errorSection.style.display = "block";
    setTimeout(() => (errorSection.style.display = "none"), 6000);
  }
}
function setLoading(isLoading) {
  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? "block" : "none";
  }
}

// ========== INITIAL AUTH HANDLING ==========
async function handleSpotifyAuth() {
  const authCode = getAuthorizationCode();
  if (authCode) {
    const accessToken = await fetchAccessToken(authCode);
    if (accessToken) {
      const playlists = await fetchPlaylists(accessToken);
      renderPlaylists(playlists);
      // Clean URL
      const url = new URL(window.location);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.pathname);
      setStatus("Spotify connected! Select a playlist.");
    } else {
      showError("Failed to retrieve access token. Please log in again.");
    }
  } else if (isTokenExpired()) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      const playlists = await fetchPlaylists(refreshedToken);
      renderPlaylists(playlists);
      setStatus("Spotify connected! Select a playlist.");
    } else {
      // Soft prompt to log in
      setStatus("Please log in to Spotify to load your playlists.");
    }
  } else {
    const validToken = localStorage.getItem("spotifyAccessToken");
    if (validToken) {
      const playlists = await fetchPlaylists(validToken);
      renderPlaylists(playlists);
      setStatus("Spotify connected! Select a playlist.");
    }
  }
  updateStepper();
}
handleSpotifyAuth();

// ========== TRANSFER PLAYLIST TO APPLE MUSIC ==========
document.getElementById("transfer-btn").addEventListener("click", async () => {
  if (!selectedPlaylist) {
    showError("Please select a Spotify playlist first.");
    return;
  }
  if (!(window.music && window.music.isAuthorized)) {
    showError("Please connect your Apple Music account first.");
    updateStepper();
    return;
  }

  setLoading(true);
  disableActions(true);

  // Gather checked tracks
  const checkboxes = Array.from(document.querySelectorAll('.track-box'));
  let tracks = [];
  if (checkboxes.length) {
    checkboxes.forEach((box) => {
      const idx = Number(box.getAttribute("data-index"));
      if (box.checked) tracks.push(selectedTracksForTransfer[idx]);
    });
  } else {
    tracks = selectedTracksForTransfer;
  }
  if (!tracks.length) {
    showError("No tracks selected. Please select at least one track.");
    setLoading(false);
    disableActions(false);
    return;
  }

  showProgress(8, `Found ${tracks.length} selected tracks. Searching on Apple Music...`);

  try {
    const storefront = window.music?.storefrontId || "us";

    // Match tracks
    const appleMusicTrackIds = [];
    let foundCount = 0;
    for (let i = 0; i < tracks.length; i++) {
      const id = await searchAppleMusicTrack(tracks[i], storefront);
      if (id) foundCount++;
      appleMusicTrackIds.push(id);
      if ((i + 1) % 5 === 0 || i === tracks.length - 1) {
        const pct = 8 + Math.floor(70 * ((i + 1) / tracks.length));
        showProgress(pct, `Matching tracks... (${i + 1}/${tracks.length})`);
      }
    }
    const matchedIds = appleMusicTrackIds.filter(Boolean);
    if (!matchedIds.length) {
      showError("No matching tracks found on Apple Music.");
      setLoading(false);
      hideProgress();
      disableActions(false);
      return;
    }

    showProgress(85, "Creating playlist on Apple Music...");
    const applePlaylistId = await createAppleMusicPlaylist(
      selectedPlaylist.name,
      selectedPlaylist.description || ""
    );
    if (!applePlaylistId) {
      showError("Failed to create Apple Music playlist.");
      setLoading(false);
      hideProgress();
      disableActions(false);
      return;
    }
    applePlaylistLastId = applePlaylistId;

    showProgress(92, "Adding tracks to Apple Music playlist...");
    await addTracksToApplePlaylist(applePlaylistId, matchedIds);

    showProgress(100, "Done!");
    const msg = `Transfer complete! Playlist "${selectedPlaylist.name}" created on Apple Music. Found ${foundCount}/${tracks.length} tracks.`;
    setStatus(msg);

    // Show not found
    const notFound = tracks.filter((t, idx) => !appleMusicTrackIds[idx]);
    if (notFound.length > 0) {
      let detail = "Some tracks couldn't be matched and were skipped:\n\n";
      detail += notFound.map(t => `${t.name} — ${t.artist}`).join("\n");
      alert(detail);
    } else {
      alert("Playlist transferred successfully!");
    }

    saveTransferHistory({
      playlist: selectedPlaylist.name,
      date: new Date().toISOString(),
      count: tracks.length,
      found: foundCount,
      status: "success"
    });
    renderTransferHistory();
  } catch (err) {
    showError("Transfer failed: " + (err?.message || String(err)));
    saveTransferHistory({
      playlist: selectedPlaylist?.name || "(unknown)",
      date: new Date().toISOString(),
      count: 0,
      found: 0,
      status: "fail"
    });
    renderTransferHistory();
  } finally {
    setLoading(false);
    setTimeout(hideProgress, 1500);
    disableActions(false);
    updateStepper();
  }
});

// ========== TRANSFER HELPERS ==========
async function getAllSpotifyTracks(playlistId) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let accessToken = localStorage.getItem("spotifyAccessToken");
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    tracks = tracks.concat(
      data.items.map(item => ({
        name: item.track.name,
        artist: item.track.artists[0]?.name
      }))
    );
    url = data.next;
  }
  return tracks;
}
async function searchAppleMusicTrack({ name, artist }, storefront) {
  const query = encodeURIComponent(`${name} ${artist}`.trim());
  try {
    const res = await fetch(
      `https://api.music.apple.com/v1/catalog/${storefront}/search?types=songs&limit=1&term=${query}`,
      {
        headers: {
          Authorization: `Bearer ${window.music.developerToken}`,
          'Music-User-Token': window.music.musicUserToken
        }
      }
    );
    const data = await res.json();
    const song = data.results?.songs?.data?.[0];
    return song ? song.id : null;
  } catch {
    return null;
  }
}
async function createAppleMusicPlaylist(name, description) {
  try {
    const res = await fetch("https://api.music.apple.com/v1/me/library/playlists", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${window.music.developerToken}`,
        'Music-User-Token': window.music.musicUserToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ attributes: { name, description } })
    });
    const data = await res.json();
    return data.data?.[0]?.id || null;
  } catch {
    return null;
  }
}
async function addTracksToApplePlaylist(playlistId, trackIds) {
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100).map(id => ({ id, type: "songs" }));
    await fetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${window.music.developerToken}`,
        'Music-User-Token': window.music.musicUserToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: chunk })
    });
  }
}

// ========== TRANSFER HISTORY ==========
function saveTransferHistory(entry) {
  const history = JSON.parse(localStorage.getItem('transferHistory') || '[]');
  history.unshift(entry);
  localStorage.setItem('transferHistory', JSON.stringify(history.slice(0, 20)));
}
function renderTransferHistory() {
  const container = document.getElementById('history-container');
  const history = JSON.parse(localStorage.getItem('transferHistory') || '[]');
  if (!container) return;
  if (!history.length) {
    container.innerHTML = "<p>No transfer history yet.</p>";
    return;
  }
  container.innerHTML = history.map(entry => `
    <div class="history-entry">
      <span class="history-playlist" title="${escapeHtml(entry.playlist)}">${escapeHtml(entry.playlist)}</span>
      <span class="history-date">${entry.date.replace('T',' ').slice(0,16)}</span>
      <span class="history-status ${entry.status}">
        ${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
      </span>
      <span>${entry.found}/${entry.count} tracks</span>
    </div>
  `).join('');
}
renderTransferHistory();

// ========== SMALL UTILS ==========
function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
    );
  }
}

// ========== END TRANSFER HELPERS ==========

// ========== TRANSFER HISTORY ==========

function saveTransferHistory(entry) {
  const history = JSON.parse(localStorage.getItem('transferHistory') || '[]');
  history.unshift(entry); // Most recent first
  localStorage.setItem('transferHistory', JSON.stringify(history.slice(0, 20))); // Max 20
}
function renderTransferHistory() {
  const container = document.getElementById('history-container');
  const history = JSON.parse(localStorage.getItem('transferHistory') || '[]');
  if (!container) return;
  if (!history.length) {
    container.innerHTML = "<p>No transfer history yet.</p>";
    return;
  }
  container.innerHTML = history.map(entry => `
    <div class="history-entry">
      <span class="history-playlist">${entry.playlist}</span>
      <span class="history-date">${entry.date.replace('T',' ').slice(0,16)}</span>
      <span class="history-status ${entry.status}">
        ${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
      </span>
      <span>
        ${entry.found}/${entry.count} tracks
      </span>
    </div>
  `).join('');
}
renderTransferHistory();

// ========== END TRANSFER HISTORY ==========