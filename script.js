// ========== APPLE MUSICKIT JS INTEGRATION ==========
document.addEventListener("DOMContentLoaded", function () {
  if (typeof MusicKit !== "undefined") {
    MusicKit.configure({
      developerToken: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjM5RDY5S0NMNjYifQ.eyJpYXQiOjE3NTM4MTE3OTgsImV4cCI6MTc2OTM2Mzc5OCwiaXNzIjoiRzRTM1dWMzhUOCJ9.BABfEbHEcTGr_odCIhduIeiO3RBSGP1Wkqgp52PTEziNMQ4deTi_p-Rm_m5oj3e7vYx5PdqonFUg8urUIGFVUQ",
      app: {
        name: "Convertables",
        build: "1.0.0"
      }
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
    pb.style.width = percent + '%';
    pl.textContent = label || '';
  }
}
function hideProgress() {
  const pc = document.getElementById('progress-container');
  if (pc) pc.style.display = 'none';
}
// ========== END PROGRESS BAR UTILS ==========

// ========== BUTTON DISABLE UTILS ==========
function disableActions(disabled) {
  const ids = ["spotify-login-btn", "apple-music-login-btn", "transfer-btn"];
  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}
// ========== END BUTTON DISABLE UTILS ==========

const CLIENT_ID = "ed6e006e361743a38c5b94660298ce7a";
const REDIRECT_URI = "https://convertables.xyz";
const SCOPES = "playlist-read-private playlist-read-collaborative";

let embedController = null;
let embedReady = false;
let selectedPlaylist = null;
let selectedTracksForTransfer = []; // NEW: Store selected tracks for partial transfer

// Show/hide the Spotify player loading indicator
function setSpotifyPlayerLoading(isLoading) {
  let loadingDiv = document.getElementById("spotify-player-loading");
  if (!loadingDiv) {
    loadingDiv = document.createElement("div");
    loadingDiv.id = "spotify-player-loading";
    loadingDiv.style.textAlign = "center";
    loadingDiv.style.color = "#1db954";
    loadingDiv.style.margin = "12px";
    loadingDiv.textContent = "Spotify player loading...";
    const embedIframe = document.getElementById("embed-iframe");
    if (embedIframe) {
      embedIframe.parentNode.insertBefore(loadingDiv, embedIframe);
    }
  }
  loadingDiv.style.display = isLoading ? "block" : "none";
}

// Initialize Spotify iFrame API
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById("embed-iframe");
  const options = {
    width: "100%",
    height: "80",
    uri: ""
  };
  const callback = (controller) => {
    embedController = controller;
    embedReady = true;
    setSpotifyPlayerLoading(false);
    enableTrackClicks();
  };
  setSpotifyPlayerLoading(true);
  IFrameAPI.createController(element, options, callback);
};
function enableTrackClicks() {
  document.querySelectorAll(".track-playable").forEach(li => {
    li.classList.remove("player-disabled");
    li.title = "";
  });
}
function getSpotifyAuthURL() {
  const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    SCOPES
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  return authURL;
}
document.getElementById("spotify-login-btn").addEventListener("click", () => {
  const button = document.getElementById("spotify-login-btn");
  button.classList.add("loading");
  window.location.href = getSpotifyAuthURL();
});
document.getElementById("apple-music-login-btn").addEventListener("click", async () => {
  if (!window.music) {
    showError("Apple MusicKit is not initialized. Please refresh and try again.");
    return;
  }
  try {
    const musicUserToken = await window.music.authorize();
    enableTransferButtonIfReady();
    document.getElementById("status-message").textContent =
      "Apple Music account connected! Select your Spotify playlist and click Transfer.";
    alert("Apple Music login successful!");
  } catch (error) {
    showError("Apple Music login failed. Please try again.");
  }
});
function enableTransferButtonIfReady() {
  const spotifyToken = localStorage.getItem("spotifyAccessToken");
  const appleMusicUserToken =
    window.music && window.music.isAuthorized ? window.music.musicUserToken : null;
  const transferBtn = document.getElementById("transfer-btn");
  if (spotifyToken && appleMusicUserToken) {
    transferBtn.disabled = false;
    document.getElementById("status-message").textContent =
      selectedPlaylist
        ? `Ready to transfer! Selected "${selectedPlaylist.name}". Click Transfer.`
        : "Ready to transfer! Select your playlist and click Transfer.";
  }
}
function getAuthorizationCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  return code;
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
      localStorage.setItem(
        "spotifyTokenExpiry",
        Date.now() + data.expires_in * 1000
      );
      return data.access_token;
    } else {
      return null;
    }
  } catch (error) {
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
      localStorage.setItem(
        "spotifyTokenExpiry",
        Date.now() + data.expires_in * 1000
      );
      localStorage.setItem("spotifyRefreshToken", data.refresh_token);
      return data.access_token;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}
async function fetchPlaylists(accessToken) {
  setLoading(true);
  try {
    const response = await fetch("https://api.spotify.com/v1/me/playlists", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        showError("Error fetching playlists. Please check your permissions.");
      } else {
        const errorText = await response.text();
        showError("Error: " + errorText);
      }
      throw new Error(`Spotify API returned a ${response.status} status.`);
    }
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    showError("An error occurred while fetching playlists.");
    return [];
  } finally {
    setLoading(false);
  }
}

// ========== RENDERING PLAYLISTS AND PARTIAL TRANSFER ==========

async function renderPlaylists(playlists) {
  const container = document.getElementById("playlist-container");
  if (!container) return;
  container.innerHTML = "";

  if (playlists.length === 0) {
    container.innerHTML = "<p>No playlists found.</p>";
    return;
  }
  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.padding = "0";
  playlists.forEach((playlist) => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "flex-start";
    li.style.marginBottom = "15px";

    if (playlist.images && playlist.images.length > 0) {
      const img = document.createElement("img");
      img.src = playlist.images[0].url;
      img.alt = `${playlist.name} cover`;
      img.style.width = "100px";
      img.style.height = "100px";
      img.style.borderRadius = "8px";
      img.style.marginRight = "15px";
      li.appendChild(img);
    }

    const name = document.createElement("h3");
    name.textContent = playlist.name;
    name.style.margin = "0 15px 0 0";
    name.style.cursor = "pointer";
    li.appendChild(name);

    name.addEventListener("click", () => {
      selectedPlaylist = playlist;
      document.getElementById("status-message").textContent =
        `Selected "${playlist.name}". Ready to transfer! Click Transfer Playlist.`;

      enableTransferButtonIfReady();

      // Fetch and show tracks for partial transfer
      fetchAndShowTracksForPartialTransfer(playlist.id, playlist.name);

      // Hide all other track selectors
      document.getElementById('track-selector-section').style.display = 'block';
    });

    ul.appendChild(li);
  });
  container.appendChild(ul);
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
        ${t.name} – ${t.artist}
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

  // Store tracks for transfer
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

// Show an error message
function showError(message) {
  const errorSection = document.getElementById("error-section");
  const errorMessage = document.getElementById("error-message");

  if (errorSection && errorMessage) {
    errorMessage.textContent = message;
    errorSection.style.display = "block";
  }
}

// Show or hide a loading indicator
function setLoading(isLoading) {
  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? "block" : "none";
  }
}

// Handle Spotify OAuth flow
async function handleSpotifyAuth() {
  const authCode = getAuthorizationCode();
  if (authCode) {
    const accessToken = await fetchAccessToken(authCode);
    if (accessToken) {
      const playlists = await fetchPlaylists(accessToken);
      renderPlaylists(playlists);
      enableTransferButtonIfReady();
      // Remove code from URL for security and cleanliness
      const url = new URL(window.location);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.pathname);
    } else {
      showError("Failed to retrieve access token. Please log in again.");
    }
  } else if (isTokenExpired()) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      const playlists = await fetchPlaylists(refreshedToken);
      renderPlaylists(playlists);
      enableTransferButtonIfReady();
    } else {
      showError("Failed to refresh access token. Please log in again.");
      window.location.href = getSpotifyAuthURL();
    }
  } else {
    const validToken = localStorage.getItem("spotifyAccessToken");
    if (validToken) {
      const playlists = await fetchPlaylists(validToken);
      renderPlaylists(playlists);
      enableTransferButtonIfReady();
    }
  }
}
handleSpotifyAuth();

// ========== TRANSFER PLAYLIST TO APPLE MUSIC ==========

document.getElementById("transfer-btn").addEventListener("click", async () => {
  if (!selectedPlaylist) {
    showError("Please select a Spotify playlist first.");
    return;
  }
  setLoading(true);
  disableActions(true);
  showProgress(0, "Fetching selected tracks from Spotify...");

  // Get only checked tracks for transfer
  const checkedBoxes = document.querySelectorAll('.track-box');
  let tracks = [];
  if (checkedBoxes.length) {
    checkedBoxes.forEach((box, i) => {
      if (box.checked) tracks.push(selectedTracksForTransfer[i]);
    });
  } else {
    tracks = selectedTracksForTransfer;
  }

  try {
    showProgress(10, `Found ${tracks.length} tracks. Searching on Apple Music...`);
    const appleMusicTrackIds = [];
    let foundCount = 0;
    for (let i = 0; i < tracks.length; i++) {
      const id = await searchAppleMusicTrack(tracks[i]);
      if (id) foundCount++;
      appleMusicTrackIds.push(id);
      if (i % 5 === 0) {
        showProgress(10 + Math.floor(70 * (i / tracks.length)), `Matching tracks... (${i + 1}/${tracks.length})`);
      }
    }
    if (appleMusicTrackIds.filter(Boolean).length === 0) {
      showError("No matching tracks found on Apple Music.");
      setLoading(false);
      hideProgress();
      disableActions(false);
      return;
    }
    showProgress(85, "Creating playlist on Apple Music...");
    const applePlaylistId = await createAppleMusicPlaylist(
      selectedPlaylist.name,
      selectedPlaylist.description || "",
    );
    if (!applePlaylistId) {
      showError("Failed to create Apple Music playlist.");
      setLoading(false);
      hideProgress();
      disableActions(false);
      return;
    }
    showProgress(90, "Adding tracks to Apple Music playlist...");
    await addTracksToApplePlaylist(applePlaylistId, appleMusicTrackIds.filter(Boolean));
    showProgress(100, "Done!");

    document.getElementById("status-message").textContent =
      `Transfer complete! Playlist "${selectedPlaylist.name}" created on Apple Music. Found ${foundCount} out of ${tracks.length} tracks.`;

    // Show not found tracks to user
    const notFound = tracks.filter((t, idx) => !appleMusicTrackIds[idx]);
    if (notFound.length > 0) {
      let msg = "Some tracks couldn't be matched and were skipped:\n\n";
      msg += notFound.map(t => `${t.name} by ${t.artist}`).join("\n");
      alert(msg);
    } else {
      alert("Playlist transferred successfully!");
    }

    // Save to history
    saveTransferHistory({
      playlist: selectedPlaylist.name,
      date: new Date().toISOString(),
      count: tracks.length,
      found: foundCount,
      status: "success"
    });

    renderTransferHistory();
  } catch (err) {
    showError("Transfer failed: " + err.message);
    // Save to history as failed
    saveTransferHistory({
      playlist: selectedPlaylist.name,
      date: new Date().toISOString(),
      count: tracks.length,
      found: 0,
      status: "fail"
    });
    renderTransferHistory();
  }
  setLoading(false);
  setTimeout(hideProgress, 2000);
  disableActions(false);
});

// ========== END TRANSFER PLAYLIST ==========

// ========== TRANSFER HELPERS ==========

// Get all tracks from a Spotify playlist (handles >100 tracks)
async function getAllSpotifyTracks(playlistId) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let accessToken = localStorage.getItem("spotifyAccessToken");
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
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

// Search for a track on Apple Music
async function searchAppleMusicTrack({ name, artist }) {
  const query = encodeURIComponent(`${name} ${artist}`);
  try {
    const res = await fetch(
      `https://api.music.apple.com/v1/catalog/us/search?types=songs&limit=1&term=${query}`,
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
  } catch (e) {
    return null;
  }
}
// Create a new playlist on Apple Music
async function createAppleMusicPlaylist(name, description) {
  try {
    const res = await fetch(
      "https://api.music.apple.com/v1/me/library/playlists",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${window.music.developerToken}`,
          'Music-User-Token': window.music.musicUserToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attributes: { name, description }
        })
      }
    );
    const data = await res.json();
    return data.data?.[0]?.id || null;
  } catch (e) {
    return null;
  }
}
// Add tracks to Apple Music playlist (in batches of 100)
async function addTracksToApplePlaylist(playlistId, trackIds) {
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100).map(id => ({ id, type: "songs" }));
    await fetch(
      `https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${window.music.developerToken}`,
          'Music-User-Token': window.music.musicUserToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: chunk })
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