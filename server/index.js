require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Helper: extract playlist ID
function extractPlaylistId(url) {
  try {
    const parsed = new URL(url.split("&")[0]);
    const listParam = parsed.searchParams.get("list");
    if (listParam) return listParam;
    const match = url.match(/(PL[\w-]+)/);
    if (match) return match[1];
    return null;
  } catch {
    return null;
  }
}

// Convert ISO 8601 duration to seconds
function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// Playlist route
app.post("/playlist", async (req, res) => {
  const { url } = req.body;
  console.log("Received URL:", url);

  const playlistId = extractPlaylistId(url);
  if (!playlistId) return res.status(400).json({ error: "Invalid playlist URL" });

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;

    // Step 1: Get playlist items
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlistItems",
      {
        params: {
          part: "snippet,contentDetails",
          playlistId: playlistId,
          maxResults: 50,
          key: apiKey,
        },
      }
    );

    const videos = response.data.items;
    const videoIds = videos.map(v => v.contentDetails.videoId).join(",");

    // Step 2: Get video details
    const videoResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/videos",
      {
        params: {
          part: "contentDetails,statistics,snippet",
          id: videoIds,
          key: apiKey,
        },
      }
    );

    const videoDetails = videoResponse.data.items;

    // Step 3: Compute stats
    const durations = videoDetails.map(v => parseDuration(v.contentDetails.duration));
    const totalSeconds = durations.reduce((a, b) => a + b, 0);
    const averageSeconds = Math.floor(totalSeconds / videoDetails.length);

    const longestVideo = videoDetails.reduce((prev, curr) =>
      parseDuration(curr.contentDetails.duration) > parseDuration(prev.contentDetails.duration) ? curr : prev
    );

    const shortestVideo = videoDetails.reduce((prev, curr) =>
      parseDuration(curr.contentDetails.duration) < parseDuration(prev.contentDetails.duration) ? curr : prev
    );

    const mostViewed = videoDetails.reduce((prev, curr) =>
      parseInt(curr.statistics.viewCount) > parseInt(prev.statistics.viewCount) ? curr : prev
    );

    // Send to frontend
    res.json({
      videos,
      stats: {
        numberOfVideos: videos.length,
        totalSeconds,
        averageSeconds,
        longestVideoTitle: longestVideo.snippet.title,
        shortestVideoTitle: shortestVideo.snippet.title,
        mostViewedTitle: mostViewed.snippet.title,
      },
    });

  } catch (err) {
    console.error("YouTube API error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch playlist" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
