/**
 * Lazy-loaded FFmpeg.wasm transcoder for unsupported video formats (.avi, .mkv).
 * Converts to MP4 (H.264) data URIs that the WebView can play natively.
 * Results are cached so the same file is never transcoded twice.
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const NEEDS_TRANSCODE = new Set(["avi", "mkv", "webm", "mov"]);

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const cache = new Map<string, string>();

/** Returns true if the filename extension requires transcoding. */
export function needsTranscode(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return NEEDS_TRANSCODE.has(ext);
}

async function ensureLoaded(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    ffmpeg = new FFmpeg();
    loadPromise = (async () => {
      // Try local bundled files first — always works in production (no network needed)
      try {
        console.log("[FFmpeg] Loading WASM core from local bundle…");
        await ffmpeg!.load({
          coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
        });
        console.log("[FFmpeg] WASM core loaded from local bundle");
      } catch (localErr) {
        // Local files not available (e.g. unit-test environment) — fall back to CDN
        console.warn("[FFmpeg] Local bundle failed, trying CDN fallback…", localErr);
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
        await ffmpeg!.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        console.log("[FFmpeg] WASM core loaded from CDN fallback");
      }
    })();
  }

  await loadPromise;
  return ffmpeg!;
}

/** Decode a data URI into raw bytes. */
function dataUriToUint8Array(dataUri: string): Uint8Array {
  const base64 = dataUri.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Transcode a data-URI video to MP4 (H.264 + AAC).
 * Returns a new data URI with `video/mp4` MIME type.
 * Results are cached by `cacheKey` (typically the attachment URL or filename).
 */
export async function transcodeToMp4(
  dataUri: string,
  cacheKey: string,
): Promise<string> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const ff = await ensureLoaded();

  const ext = cacheKey.split(".").pop()?.toLowerCase() ?? "avi";
  const inName = `input.${ext}`;
  const outName = "output.mp4";

  const inputBytes = dataUriToUint8Array(dataUri);
  await ff.writeFile(inName, inputBytes);

  await ff.exec([
    "-i", inName,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "28",
    "-c:a", "aac",
    "-movflags", "+faststart",
    outName,
  ]);

  const output = await ff.readFile(outName) as Uint8Array;

  // Build data URI
  let binary = "";
  for (let i = 0; i < output.length; i++) binary += String.fromCharCode(output[i]!);
  const result = `data:video/mp4;base64,${btoa(binary)}`;

  // Cleanup temp files
  await ff.deleteFile(inName).catch(() => {});
  await ff.deleteFile(outName).catch(() => {});

  cache.set(cacheKey, result);
  return result;
}
