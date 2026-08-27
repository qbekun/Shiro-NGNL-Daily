import "dotenv/config";
import https from "node:https";
import { readFileSync, writeFileSync } from "node:fs";

const REQUIRED_ENV = ["API_KEY", "USER_ID", "WEBHOOK"];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const TAGS = "shiro_(no_game_no_life)";
const API_URL =
  `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100` +
  `&tags=${encodeURIComponent(TAGS)}` +
  `&api_key=${encodeURIComponent(process.env.API_KEY)}` +
  `&user_id=${encodeURIComponent(process.env.USER_ID)}`;

const MAX_SIZE = 10 * 1024 * 1024;
let seen = [];

function loadSeen() {
  try {
    const raw = readFileSync("seen.json", "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    console.log("seen.json does not exist or is invalid, starting with an empty list.");
    return [];
  }
}

function saveSeen(list) {
  writeFileSync("seen.json", JSON.stringify(list, null, 2));
}

async function fetchPosts() {
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": "Shiro-NGNL-Daily/1.0",
      "Accept": "application/json",
      "Referer": "https://gelbooru.com/",
    },
  });

  if (!res.ok) {
    throw new Error(`Gelbooru API returned ${res.status}`);
  }

  const data = await res.json();
  const posts = Array.isArray(data?.post) ? data.post : [];

  if (posts.length === 0) {
    throw new Error("No posts were returned from Gelbooru.");
  }

  return posts;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://gelbooru.com/",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Image download failed with status ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Downloaded file is not an image. content-type=${contentType}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  return { buf, contentType };
}

function sendFile(buf, filename, contentType, imageNumber) {
  return new Promise((resolve, reject) => {
    const webhookUrl = new URL(process.env.WEBHOOK);
    const boundary = "----ShiroBotBoundary" + Date.now();

    const payload = JSON.stringify({
      embeds: [
        {
          title: `shiro :3 #${imageNumber}`,
          color: 0x33739d,
          image: { url: `attachment://${filename}` },
        },
      ],
    });

    const jsonPart =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${payload}\r\n`;

    const filePartHeader =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files[0]"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`;

    const endPart = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(jsonPart, "utf-8"),
      Buffer.from(filePartHeader, "utf-8"),
      buf,
      Buffer.from(endPart, "utf-8"),
    ]);

    const req = https.request(
      {
        protocol: webhookUrl.protocol,
        hostname: webhookUrl.hostname,
        path: webhookUrl.pathname + webhookUrl.search,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let responseText = "";

        res.on("data", (chunk) => {
          responseText += chunk.toString();
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: responseText,
          });
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function pickCandidatePosts(posts, seenList) {
  return posts.filter((post) => {
    const url = post.file_url || post.sample_url;
    return (
      url &&
      !seenList.includes(url) &&
      ["general", "sensitive", "explicit"].includes(post.rating)
    );
  });
}

function getFilenameFromUrl(url, fallbackId = "image") {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() || `${fallbackId}.jpg`;
    return last.includes(".") ? last : `${last}.jpg`;
  } catch {
    return `${fallbackId}.jpg`;
  }
}

async function main() {
  seen = loadSeen();

  const posts = await fetchPosts();
  const availablePosts = pickCandidatePosts(posts, seen);

  if (availablePosts.length === 0) {
    console.log("No new images found in this batch.");
    return;
  }

  let sent = false;

  while (!sent && availablePosts.length > 0) {
    const randomIndex = Math.floor(Math.random() * availablePosts.length);
    const post = availablePosts.splice(randomIndex, 1)[0];
    const url = post.file_url || post.sample_url;
    const filename = getFilenameFromUrl(url, post.id || "image");

    try {
      const { buf, contentType } = await downloadImage(url);

      if (buf.length > MAX_SIZE) {
        console.log(
          `Skipping ${filename}, file is too large: ${(buf.length / 1024 / 1024).toFixed(2)} MB`
        );
        continue;
      }

      const imageNumber = seen.length + 1;
      const result = await sendFile(buf, filename, contentType, imageNumber);

      console.log(`Discord status: ${result.status}`);

      if (result.status === 200 || result.status === 204) {
        seen.push(url);
        saveSeen(seen);
        console.log(`Saved ${seen.length} seen URLs to seen.json`);
        sent = true;
      } else {
        console.log(`Discord rejected the file: ${result.body || "no response body"}`);
      }
    } catch (err) {
      console.log(`Error for ${filename}: ${err.message}`);
    }
  }

  if (!sent) {
    throw new Error("Could not send any image.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
