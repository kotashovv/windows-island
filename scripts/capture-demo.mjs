import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('docs'), media = path.join(root, 'media');
await fs.mkdir(media, { recursive: true });
await fs.mkdir('artifacts/demo-recording', { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1200, height: 760 }, recordVideo: { dir: 'artifacts/demo-recording', size: { width: 1200, height: 760 } } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const video = page.video();
try {
  await page.goto(`${origin}/demo/?demo=1`); await page.waitForTimeout(900);
  const capsule = page.locator('.island-capsule');
  const box = await capsule.boundingBox(); assert.equal(box.width, 132); assert.equal(box.height, 26);
  await page.screenshot({ path: path.join(media, 'focus-strip.png') });
  const x = box.x + box.width / 2, y = box.y + box.height - 8;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 90, { steps: 35 }); await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(media, 'capsule.png') });
  await page.mouse.move(x, y + 300, { steps: 45 }); await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(media, 'tasks.png') });
  await page.mouse.move(x, y + 90, { steps: 35 }); await page.mouse.move(x, y, { steps: 25 }); await page.mouse.up();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Раскрыть', exact: true }).click(); await page.waitForTimeout(850);
  await page.locator('.task-text').first().click(); await page.waitForTimeout(800);
  await page.locator('.task-text').first().click(); await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.locator('.task-row.completing').waitFor(); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Погода', exact: true }).click(); await page.waitForTimeout(850);
  assert.equal(await page.locator('.weather-day').count(), 7);
  await page.screenshot({ path: path.join(media, 'weather.png') }); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Полоска', exact: true }).click(); await page.waitForTimeout(850);
  await page.getByRole('button', { name: 'Пример уведомления', exact: true }).click(); await page.waitForTimeout(850);
  await page.screenshot({ path: path.join(media, 'notification.png') }); await page.waitForTimeout(1400);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Раскрыть', exact: true }).click(); await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Мой день', exact: true }).click();
  await page.locator('.task-text').first().click(); await page.waitForTimeout(100);
  const disclosure = await page.locator('.task-row .task-disclosure').first().boundingBox(); assert.ok(disclosure.height > 0);
  await page.locator('.task-text').first().click(); await page.waitForTimeout(100); assert.equal((await page.locator('.task-row .task-disclosure').first().boundingBox()).height, 0);
  await page.setViewportSize({ width: 375, height: 760 }); await page.getByRole('button', { name: 'Погода', exact: true }).click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('.weather-day').count(), 7); assert.ok((await capsule.boundingBox()).width <= 351);
  await page.screenshot({ path: 'artifacts/demo-mobile.png' });
  const landing = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await landing.goto(origin); await landing.locator('.showcase img').waitFor();
  assert.equal(await landing.locator('h1').count(), 1);
  assert.equal(await landing.locator('a', { hasText: 'Попробовать демо' }).getAttribute('href'), 'demo/?demo=1');
  assert.equal(await landing.locator('link[rel=canonical]').getAttribute('href'), 'https://kotashovv.github.io/windows-island/');
  assert.equal(JSON.parse(await landing.locator('script[type="application/ld+json"]').textContent()).softwareVersion, '0.2.3');
  await landing.screenshot({ path: 'artifacts/landing-desktop.png' });
  await landing.setViewportSize({ width: 375, height: 800 });
  assert.ok(await landing.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'landing must fit mobile screens');
  await landing.close();
  assert.deepEqual(errors, []);
} finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
const input = await video.path();
const result = spawnSync('ffmpeg', ['-y', '-ss', '0.8', '-i', input, '-vf', 'fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer', '-loop', '0', path.join(media, 'demo.gif')], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error('ffmpeg failed: ' + result.stderr?.slice(-1000));
await fs.copyFile(input, path.join(media, 'demo.webm'));
console.log('PASS: demo drag/click, task completion, forecast, reduced motion and mobile; screenshots and animated demo exported.');
