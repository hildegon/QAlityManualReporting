/**
 * Lazy-loaded FFmpeg.wasm transcoder for unsupported video formats (.avi, .mkv).
 * Converts to MP4 (H.264) data URIs that the WebView can play natively.
 * Results are cached so the same file is never transcoded twice.
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Only formats that WKWebView genuinely cannot play natively.
// macOS WKWebView natively supports .mov and .webm — do not add them here.
const NEEDS_TRANSCODE = new Set(["avi", "mkv"]);
const LOAD_TIMEOUT_MS = 30_000;
const EXEC_TIMEOUT_MS = 120_000;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const cache = new Map<string, string>();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const coreURL = `${base}/ffmpeg/ffmpeg-core.js`;
        const wasmURL = `${base}/ffmpeg/ffmpeg-core.wasm`;
        console.log("[FFmpeg] Loading WASM core from local bundle…");
        await withTimeout(
          ffmpeg!.load({ coreURL, wasmURL }),
          LOAD_TIMEOUT_MS,
          "FFmpeg load",
        );
        console.log("[FFmpeg] WASM core loaded from local bundle");
      } catch (localErr) {
        // Local files not available (e.g. unit-test environment) — fall back to CDN
        console.warn("[FFmpeg] Local bundle failed, trying CDN fallback…", localErr);
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
        await withTimeout(
          ffmpeg!.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
          }),
          LOAD_TIMEOUT_MS,
          "FFmpeg CDN load",
        );
        console.log("[FFmpeg] WASM core loaded from CDN fallback");
      }
    })().catch((error) => {
      loadPromise = null;
      ffmpeg = null;
      throw error;
    });
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
  try {
    await withTimeout(
      ff.exec([
        "-i", inName,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-movflags", "+faststart",
        outName,
      ]),
      EXEC_TIMEOUT_MS,
      `Video transcode for ${cacheKey}`,
    );

    const output = await ff.readFile(outName) as Uint8Array;

    let binary = "";
    for (let i = 0; i < output.length; i++) binary += String.fromCharCode(output[i]!);
    const result = `data:video/mp4;base64,${btoa(binary)}`;

    cache.set(cacheKey, result);
    return result;
  } finally {
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}
