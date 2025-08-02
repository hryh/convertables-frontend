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
// ========== END APPLE MUSICKIT INTEGRATION ==========

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

// Spotify API credentials (only client ID and redirect URI, NO SECRET)
const CLIENT_ID = "ed6e006e361743a38c5b94660298ce7a";
const REDIRECT_URI = "https://convertables.xyz";
const SCOPES = "playlist-read-private playlist-read-collaborative";

let embedController = null; // Global variable to store the Spotify Embed Controller
let embedReady = false; // Track if controller is ready
let selectedPlaylist = null; // Store selected playlist globally

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
  const element = document.getElementById("embed-iframe"); // Ensure this element exists in your HTML
  const options = {
    width: "100%",
    height: "80", // Height of the Spotify player
    uri: "" // Initially empty; will load songs dynamically
  };

  const callback = (controller) => {
    embedController = controller; // Store the controller for later use
    embedReady = true;
    setSpotifyPlayerLoading(false);
    console.log("Spotify Embed Controller initialized.");
    // Enable any track buttons waiting for the player
    enableTrackClicks();
  };

  setSpotifyPlayerLoading(true);
  IFrameAPI.createController(element, options, callback);
};

// Function to enable track clicks if player is ready
function enableTrackClicks() {
  document.querySelectorAll(".track-playable").forEach(li => {
    li.classList.remove("player-disabled");
    li.title = "";
  });
}

// Function to generate the Spotify authentication URL
function getSpotifyAuthURL() {
  const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    SCOPES
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  console.log("Generated Spotify Auth URL:", authURL);
  return authURL;
}

// Handle the "Log in with Spotify" button
document.getElementById("spotify-login-btn").addEventListener("click", () => {
  const button = document.getElementById("spotify-login-btn");
  button.classList.add("loading"); // Add loading state
  window.location.href = getSpotifyAuthURL();
});

// ========== APPLE MUSIC LOGIN BUTTON HANDLER ==========
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
// ========== END APPLE MUSIC LOGIN BUTTON HANDLER ==========

// Enable Transfer button if both accounts are connected
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

// Function to extract the authorization code from the URL
function getAuthorizationCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  console.log("Authorization Code:", code);
  return code;
}

// Check if the token is expired
function isTokenExpired() {
  const expiryTime = localStorage.getItem("spotifyTokenExpiry");
  return !expiryTime || Date.now() > parseInt(expiryTime, 10);
}

// Refresh access token using the refresh token (should use backend endpoint, not direct to Spotify!)
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotifyRefreshToken");

  try {
    const response = await fetch("/api/spotify/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await response.json();
    console.log("Refresh Token Response from backend:", data);

    if (data.access_token) {
      localStorage.setItem("spotifyAccessToken", data.access_token);
      localStorage.setItem(
        "spotifyTokenExpiry",
        Date.now() + data.expires_in * 1000
      );
      return data.access_token;
    } else {
      console.error("Failed to refresh access token:", data);
      return null;
    }
  } catch (error) {
    console.error("Error refreshing access token from backend:", error);
    return null;
  }
}

// Fetch access token using the authorization code (calls backend, not Spotify directly)
async function fetchAccessToken(authCode) {
  try {
    const response = await fetch("/api/spotify/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: authCode }),
    });

    const data = await response.json();
    console.log("Token Response from backend:", data);

    if (data.access_token) {
      localStorage.setItem("spotifyAccessToken", data.access_token);
      localStorage.setItem(
        "spotifyTokenExpiry",
        Date.now() + data.expires_in * 1000
      );
      localStorage.setItem("spotifyRefreshToken", data.refresh_token);
      return data.access_token;
    } else {
      console.error("Failed to fetch access token:", data);
      return null;
    }
  } catch (error) {
    console.error("Error fetching access token from backend:", error);
    return null;
  }
}

// Fetch user's playlists using the access token
async function fetchPlaylists(accessToken) {
  setLoading(true); // Show loading indicator

  try {
    const response = await fetch("https://api.spotify.com/v1/me/playlists", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        console.error("Spotify API Error (JSON):", errorData);
        showError("Error fetching playlists. Please check your permissions.");
      } else {
        const errorText = await response.text();
        console.error("Spotify API Error (Text):", errorText);
        showError("Error: " + errorText);
      }
      throw new Error(`Spotify API returned a ${response.status} status.`);
    }

    const data = await response.json();
    console.log("Playlists Response:", data);

    return data.items || [];
  } catch (error) {
    console.error("Error fetching playlists:", error);
    showError("An error occurred while fetching playlists.");
    return [];
  } finally {
    setLoading(false); // Hide loading indicator
  }
}

// Render playlists on the page
async function renderPlaylists(playlists) {
  console.log("Rendering playlists:", playlists);

  const container = document.getElementById("playlist-container");
  if (!container) {
    console.error("Playlist container not found!");
    return;
  }

  container.innerHTML = ""; // Clear the existing content

  if (playlists.length === 0) {
    console.log("No playlists found.");
    container.innerHTML = "<p>No playlists found.</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.padding = "0";

  playlists.forEach((playlist) => {
    console.log("Rendering playlist:", playlist.name);

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

    const trackContainer = document.createElement("div");
    trackContainer.classList.add("track-container");
    trackContainer.style.display = "none";
    li.appendChild(trackContainer);

    name.addEventListener("click", () => {
      const isVisible = trackContainer.style.display === "block";

      if (isVisible) {
        trackContainer.style.display = "none";
        console.log(`Hiding tracks for playlist: ${playlist.name}`);
      } else {
        trackContainer.style.display = "block";
        if (!trackContainer.dataset.loaded) {
          console.log(`Fetching tracks for playlist: ${playlist.name}`);
          fetchAndRenderTracks(playlist.id, trackContainer);
        }
      }
      // Mark this as selected playlist
      selectedPlaylist = playlist;
      document.getElementById("status-message").textContent =
        `Selected "${playlist.name}". Ready to transfer! Click Transfer Playlist.`;
      enableTransferButtonIfReady();

      // NEW: Show playlist in Spotify widget
      if (embedReady && embedController && playlist.uri) {
        embedController.loadUri(playlist.uri);
      }
    });

    ul.appendChild(li);
  });

  container.appendChild(ul);
  console.log("Playlists rendered successfully.");
}

// Fetch and render tracks for a playlist
async function fetchAndRenderTracks(playlistId, trackContainer) {
  const loadingMessage = document.createElement("p");
  loadingMessage.textContent = "Loading tracks...";
  trackContainer.appendChild(loadingMessage);

  try {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("spotifyAccessToken")}` },
    });

    const data = await response.json();
    console.log("Tracks:", data);

    if (trackContainer.contains(loadingMessage)) {
      trackContainer.removeChild(loadingMessage);
    }

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";

    data.items.forEach((trackItem) => {
      const track = trackItem.track;

      const li = document.createElement("li");
      li.classList.add("track-playable");
      li.style.marginBottom = "10px";

      // Song title and artist in single line, never wrap, scrollable if too long
      const trackName = document.createElement("p");
      trackName.textContent = `${track.name} by ${track.artists.map((artist) => artist.name).join(", ")}`;
      trackName.style.whiteSpace = "nowrap";
      trackName.style.overflowX = "auto";
      trackName.style.margin = "0";
      li.appendChild(trackName);

      // If player is not ready, disable click and show cursor not-allowed
      if (!embedReady) {
        li.classList.add("player-disabled");
        li.title = "Spotify player is still loading. Please wait.";
      }

      li.addEventListener("click", () => {
        if (!embedReady || !embedController) {
          alert("Spotify player is still loading. Please wait a second and try again.");
          return;
        }
        console.log(`Playing track: ${track.uri}`);
        embedController.loadUri(track.uri);
      });

      ul.appendChild(li);
    });

    trackContainer.appendChild(ul);
    trackContainer.dataset.loaded = "true";
    // Enable clickable tracks if player is now ready
    if (embedReady) enableTrackClicks();
  } catch (error) {
    console.error("Error fetching tracks:", error);

    if (trackContainer.contains(loadingMessage)) {
      trackContainer.removeChild(loadingMessage);
    }

    trackContainer.innerHTML = `<p>Failed to fetch tracks. Please try again.</p>`;
  }
}

// Show an error message
function showError(message) {
  const errorSection = document.getElementById("error-section");
  const errorMessage = document.getElementById("error-message");

  if (errorSection && errorMessage) {
    errorMessage.textContent = message;
    errorSection.style.display = "block";
  } else {
    console.error("Error section or message element not found.");
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
    console.log("Authorization code found:", authCode);
    const accessToken = await fetchAccessToken(authCode);

    if (accessToken) {
      const playlists = await fetchPlaylists(accessToken);
      console.log("Retrieved playlists:", playlists);
      renderPlaylists(playlists);
      alert(`Successfully retrieved ${playlists.length} playlists!`);
      enableTransferButtonIfReady(); // Enable transfer after Spotify login

      // Remove code from URL for security and cleanliness
      const url = new URL(window.location);
      url.searchParams.delete("code");
      window.history.replaceState({}, document.title, url.pathname);
    } else {
      showError("Failed to retrieve access token. Please log in again.");
    }
  } else if (isTokenExpired()) {
    console.log("Token expired. Attempting to refresh...");
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      const playlists = await fetchPlaylists(refreshedToken);
      renderPlaylists(playlists);
      enableTransferButtonIfReady(); // Enable transfer after Spotify refresh
    } else {
      showError("Failed to refresh access token. Please log in again.");
      window.location.href = getSpotifyAuthURL();
    }
  } else {
    // If token is still valid, load playlists
    const validToken = localStorage.getItem("spotifyAccessToken");
    if (validToken) {
      const playlists = await fetchPlaylists(validToken);
      renderPlaylists(playlists);
      enableTransferButtonIfReady();
    } else {
      console.log("No authorization code found.");
    }
  }
}

// Call this function on page load to handle redirection
handleSpotifyAuth();

// ========== TRANSFER PLAYLIST TO APPLE MUSIC ==========

document.getElementById("transfer-btn").addEventListener("click", async () => {
  if (!selectedPlaylist) {
    showError("Please select a Spotify playlist first.");
    return;
  }
  setLoading(true);
  disableActions(true);
  showProgress(0, "Fetching playlist tracks from Spotify...");

  try {
    // 1. Fetch all tracks from the selected Spotify playlist
    const tracks = await getAllSpotifyTracks(selectedPlaylist.id);

    showProgress(10, `Found ${tracks.length} tracks. Searching on Apple Music...`);

    // 2. Search Apple Music for each track and collect their IDs
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

    // 3. Create a new playlist on Apple Music
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

    // 4. Add all found tracks to the new Apple Music playlist
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
  } catch (err) {
    showError("Transfer failed: " + err.message);
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