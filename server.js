const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

function decryptAudioUrl(encryptedString) {
  if (!encryptedString) return null;
  try {
    const decipher = crypto.createDecipheriv(
      "des-ecb",
      Buffer.from("38346591", "utf-8"),
      null
    );
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedString, "base64", "utf8");
    decrypted += decipher.final("utf8");
    // Ensure https link
    let url = decrypted.trim();
    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    }
    return url;
  } catch (err) {
    return null;
  }
}

app.get("/", (req, res) => {
  res.send("Music Search API is running!");
});

app.get("/songs", async (req, res) => {
  const search = req.query.search;

  if (!search || !search.trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter a song name",
    });
  }

  const query = search.trim();

  // 1. First try JioSaavn for FULL SONGS
  try {
    const saavnRes = await axios.get("https://www.jiosaavn.com/api.php", {
      params: {
        __call: "search.getResults",
        q: query,
        p: 1,
        n: 30,
        _format: "json",
        _marker: 0,
        api_version: 4,
        ctx: "web6dot0",
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 10000,
    });

    let results = [];
    if (saavnRes.data && saavnRes.data.results) {
      results = saavnRes.data.results;
    }

    let songs = results
      .map((song) => {
        const fullAudio = decryptAudioUrl(song.encrypted_media_url) || song.media_preview_url;
        let image = song.image || "";
        if (image) {
          image = image.replace("150x150", "500x500");
        }

        return {
          id: song.id,
          title: song.title
            ? song.title
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, "&")
            : "Unknown",
          artist: song.subtitle || song.primary_artists || "Various Artists",
          album: song.album || "",
          imageUrl: image,
          audioUrl: fullAudio,
        };
      })
      .filter((s) => s.audioUrl);

    if (songs.length > 0) {
      return res.json({
        success: true,
        total: songs.length,
        data: songs,
      });
    }
  } catch (e) {
    console.log("JioSaavn search error, falling back to iTunes:", e.message);
  }

  // 2. Fallback to iTunes if JioSaavn gives empty results
  try {
    const itunesRes = await axios.get("https://itunes.apple.com/search", {
      params: {
        term: query,
        entity: "song",
        limit: 30,
      },
      timeout: 10000,
    });

    const fallbackSongs = (itunesRes.data.results || []).map((song) => ({
      id: song.trackId,
      title: song.trackName,
      artist: song.artistName,
      album: song.collectionName || "",
      imageUrl: song.artworkUrl100 || "",
      audioUrl: song.previewUrl || null,
    })).filter((s) => s.audioUrl);

    return res.json({
      success: true,
      total: fallbackSongs.length,
      data: fallbackSongs,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Unable to search songs.",
    });
  }
});

app.listen(3000, () => {
  console.log("Music API running at http://localhost:3000");
});