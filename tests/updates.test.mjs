import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { createUpdater, selectRelease, newer } = createRequire(import.meta.url)('../electron/updates.cjs');
const binary = Buffer.from('mock portable release');
const digest = createHash('sha256').update(binary).digest('hex');
const release = { tag_name: 'v0.2.4', draft: false, prerelease: false, assets: [{
  name: 'Windows-Island-0.2.4.exe', state: 'uploaded', size: binary.length, digest: `sha256:${digest}`,
  browser_download_url: 'https://github.com/kotashovv/windows-island/releases/download/v0.2.4/Windows-Island-0.2.4.exe'
}] };
test('version comparison is numeric; update must belong to our repo and have a SHA-256 digest', () => {
  assert.equal(newer('0.2.10', '0.2.3'), true); assert.equal(newer('0.2.3', '0.2.3'), false);
  assert.equal(selectRelease(release, '0.2.3').available, true);
  assert.throws(() => selectRelease({ ...release, assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/file.exe' }] }, '0.2.3'), /Неверный/);
  assert.throws(() => selectRelease({ ...release, assets: [{ ...release.assets[0], digest: null }] }, '0.2.3'), /SHA-256/);
  assert.throws(() => selectRelease({ ...release, prerelease: true }, '0.2.3'), /не опубликован/);
});
test('downloads verified binary and relaunches only after explicit restart; tampering is rejected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'island-update-'));
  let launched, exited = false;
  const app = { getVersion: () => '0.2.3', getPath: () => dir, isPackaged: true,
    getLoginItemSettings: () => ({ openAtLogin: false }), relaunch: value => { launched = value; }, quit: () => { exited = true; } };
  try {
    const updater = createUpdater({ app, fetch: async url => new Response(url.endsWith('/latest') ? JSON.stringify(release) : binary) });
    await updater.check(); await updater.download(); assert.equal(exited, false);
    await updater.restart(); assert.ok(launched.execPath.endsWith('Windows-Island-0.2.4.exe')); assert.equal(exited, true);
    await fs.writeFile(launched.execPath, 'changed'); await assert.rejects(updater.restart(), /изменился/);
    const bad = createUpdater({ app, fetch: async url => new Response(url.endsWith('/latest') ? JSON.stringify(release) : Buffer.alloc(binary.length)) });
    await bad.check(); await assert.rejects(bad.download(), /сумма/);
    assert.equal((await fs.readdir(path.join(dir, 'updates'))).some(name => name.endsWith('.part')), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
