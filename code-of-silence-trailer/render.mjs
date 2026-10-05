// Renders index.html to an MP4, frame by frame, with the offline-rendered soundtrack.
// usage: node render.mjs [out.mp4] [--size 1920x1080] [--fps 30] [--workers 2] [--from 0] [--to 94]
// needs: npm i playwright && npx playwright install chromium; ffmpeg on PATH
import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const [W, H] = opt('--size', '1920x1080').split('x').map(Number);
const FPS = Number(opt('--fps', 30)), WORKERS = Number(opt('--workers', 2));
const FROM = Number(opt('--from', 0)), TO = opt('--to', null);
const out = path.resolve(args[0] || 'code-of-silence-2.0.mp4');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-'));
const page = pathToFileURL(path.join(here, 'index.html')).href + '?render';

// Behind an intercepting HTTPS proxy Chromium may not trust the proxy CA; curl does, so fetch CDN files with it.
const cacheDir = path.join(os.tmpdir(), 'cos-netcache');
async function viaCurl(p) {
  if (!process.env.HTTPS_PROXY) return;
  fs.mkdirSync(cacheDir, { recursive: true });
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const types = { js: 'application/javascript', css: 'text/css', woff2: 'font/woff2' };
  await p.route(/^https:/, async route => {
    const url = route.request().url(), f = path.join(cacheDir, crypto.createHash('sha1').update(url).digest('hex'));
    if (!fs.existsSync(f)) execFileSync('curl', ['-sSfL', '--retry', '4', '-A', ua, '-o', f, url]);
    const ext = url.includes('fonts.googleapis.com/css') ? 'css' : url.split('?')[0].split('.').pop();
    await route.fulfill({ body: fs.readFileSync(f), headers: { 'content-type': types[ext] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
}
async function open() {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', e => console.error('[page]', e.message));
  await viaCurl(p);
  await p.goto(page);
  await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  return { b, p };
}

const first = await open();
const duration = TO ? Number(TO) : await first.p.evaluate(() => window.TRAILER.duration);
const f0 = Math.round(FROM * FPS), f1 = Math.round(duration * FPS), total = f1 - f0;
console.log(`rendering ${total} frames at ${W}x${H}, ${FPS} fps, ${WORKERS} workers -> ${out}`);

const wav = path.join(tmp, 'audio.wav');
fs.writeFileSync(wav, Buffer.from(await first.p.evaluate(() => window.TRAILER.audio()), 'base64'));

let done = 0; const t0 = Date.now();
async function work(k, ctx) {
  const { b, p } = ctx || await open();
  for (let f = f0 + k; f < f1; f += WORKERS) {
    const d = await p.evaluate(t => window.TRAILER.frame(t), f / FPS);
    fs.writeFileSync(path.join(tmp, `${String(f - f0).padStart(5, '0')}.jpg`), Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
    if (++done % 60 === 0) { const r = (Date.now() - t0) / done; console.log(`${done}/${total}  eta ${Math.round(r * (total - done) / 60000)} min`); }
  }
  await b.close();
}
await Promise.all([...Array(WORKERS)].map((_, k) => work(k, k === 0 ? first : null)));

const ff = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, '%05d.jpg'),
  '-ss', String(FROM), '-t', String(duration - FROM), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p',
  '-af', 'alimiter=limit=0.9:level=disabled', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' });
if (ff.status !== 0) process.exit(ff.status || 1);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`done in ${Math.round((Date.now() - t0) / 60000)} min: ${out}`);
