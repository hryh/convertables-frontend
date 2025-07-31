const axios = require("axios");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", resolve);
  });

  let refresh_token;
  try {
    const parsed = JSON.parse(body);
    refresh_token = parsed.refresh_token;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  if (!refresh_token) {
    return res.status(400).json({ error: "Missing refresh token" });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refresh_token);
    params.append('client_id', process.env.SPOTIFY_CLIENT_ID);
    params.append('client_secret', process.env.SPOTIFY_CLIENT_SECRET);

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to refresh token',
      details: err.response?.data || err.message
    });
  }
};