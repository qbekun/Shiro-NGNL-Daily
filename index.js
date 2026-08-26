import "dotenv/config";
import https from "node:https";
import { readFileSync, writeFileSync } from "node:fs";

const api = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=shiro_(no_game_no_life)&api_key=${process.env.API_KEY}&user_id=${process.env.USER_ID}`;

let seen = [];

try {
	const data = JSON.parse(readFileSync("seen.json", "utf-8"));
	if (Array.isArray(data)) seen = data;
} catch {
	console.log("Plik seen.json nie istnieje, tworzę nową listę.");
}

const apiRes = await fetch(api);
const data = await apiRes.json();
const posts = data.post;

if (!posts || posts.length === 0) {
	console.error("Brak postów z Gelbooru lub błąd API.");
	process.exit(1);
}

async function download(url) {
	const res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
			"Referer": "https://gelbooru.com/",
		},
	});
	const arrayBuffer = await res.arrayBuffer();
	return {
		buf: Buffer.from(arrayBuffer),
		type: res.headers.get("content-type"),
	};
}

function sendFile(buf, filename, contentType, num) {
	return new Promise((resolve, reject) => {
		const boundary = "----ShiroBotBoundary";
		const webhookUrl = new URL(process.env.WEBHOOK);

		const payload = JSON.stringify({
			embeds: [{
				title: `shiro :3 #${num}`,
				color: 0x33739D,
				image: { url: `attachment://${filename}` },
			}],
		});

		const jsonPart = `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${payload}\r\n`;
		const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
		const end = `\r\n--${boundary}--\r\n`;

		const body = Buffer.concat([
			Buffer.from(jsonPart, "utf-8"),
			Buffer.from(fileHeader, "utf-8"),
			buf,
			Buffer.from(end, "utf-8"),
		]);

		const req = https.request(
			{
				hostname: webhookUrl.hostname,
				path: webhookUrl.pathname,
				method: "POST",
				headers: {
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
					"Content-Length": body.length,
				},
			},
			(res) => {
				res.resume();
				console.log(`status: ${res.statusCode}`);
				resolve(res.statusCode);
			}
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

const MAX_SIZE = 8 * 1024 * 1024;

const availablePosts = posts.filter(
	(post) =>
		(post.file_url || post.sample_url) &&
		!seen.includes(post.file_url || post.sample_url) &&
		["general", "sensitive", "explicit"].includes(post.rating)
);

if (availablePosts.length === 0) {
	console.log("Brak nowych obrazków w tej paczce (wszystkie były już widziane).");
	process.exit(0);
}

let sent = false;
while (!sent && availablePosts.length > 0) {
	const randomIndex = Math.floor(Math.random() * availablePosts.length);
	const post = availablePosts.splice(randomIndex, 1)[0];
	const url = post.file_url || post.sample_url;

	const filename = url.split("/").pop().split("?")[0];
	const { buf, type } = await download(url);
	const contentType = type || (filename.endsWith(".png") ? "image/png" : "image/jpeg");

	if (buf.length > MAX_SIZE) {
		console.log(`skipped ${filename} (too large: ${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
		continue;
	}

	const imageNumber = seen.length + 1;
	const status = await sendFile(buf, filename, contentType, imageNumber);

	if (status === 200 || status === 204) {
		seen.push(url);
		sent = true;
	} else {
		console.log(`failed (${status}), trying another image...`);
	}
}

if (sent) {
	writeFileSync("seen.json", JSON.stringify(seen, null, 2));
	console.log(`saved ${seen.length} seen URLs to seen.json`);
}