const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const REPOSITORY = 'kotashovv/windows-island';
const MAX_SIZE = 1024 * 1024 * 1024;
function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) throw new Error('Неверная версия релиза');
  return match.slice(1).map(Number);
}
function newer(candidate, current) {
  const next = versionParts(candidate), installed = versionParts(current);
  for (let i = 0; i < 3; i++) if (next[i] !== installed[i]) return next[i] > installed[i];
  return false;
}
function selectRelease(release, current) {
  if (release.draft || release.prerelease) throw new Error('Этот релиз ещё не опубликован');
  const version = versionParts(release.tag_name).join('.');
  const name = `Windows-Island-${version}.exe`;
  const asset = release.assets?.find(item => item.name === name && item.state === 'uploaded');
  const url = `https://github.com/${REPOSITORY}/releases/tag/v${version}`;
  if (!asset) throw new Error('У релиза пока нет сборки Windows');
  const downloadUrl = `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`;
  if (asset.browser_download_url !== downloadUrl || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_SIZE)
    throw new Error('Неверный файл обновления');
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) throw new Error('У релиза отсутствует контрольная сумма SHA-256');
  return { available: newer(version, current), current, version, url, name, downloadUrl,
    size: asset.size, sha256: asset.digest.slice(7).toLowerCase() };
}
function latestStable(releases){
  if(!Array.isArray(releases))throw new Error('Неверный ответ GitHub');
  return releases.filter(r=>!r.draft&&!r.prerelease&&/^v?\d+\.\d+\.\d+$/.test(r.tag_name||''))
    .reduce((latest,r)=>!latest||newer(r.tag_name,latest.tag_name)?r:latest,null);
}
function createUpdater({ app, fetch, onProgress = () => {} }) {
  let checked, downloaded, active;
  async function check() {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Windows-Island', 'Cache-Control':'no-cache' }, cache:'no-store', signal: AbortSignal.timeout(15000)
    });
    if (response.status === 404) { checked = null; return { available: false, current: app.getVersion(), version: app.getVersion(), empty: true }; }
    if (response.status === 403 || response.status === 429) throw new Error('Лимит запросов GitHub. Попробуйте позже.');
    if (!response.ok) throw new Error('GitHub временно недоступен');
    let latest=latestStable(await response.json());
    let link=response.headers.get('link');
    while(link){const next=/<(https:\/\/api\.github\.com\/repos\/kotashovv\/windows-island\/releases\?[^>]+)>; rel="next"/.exec(link)?.[1];if(!next)break;const page=await fetch(next,{headers:{Accept:'application/vnd.github+json','User-Agent':'Windows-Island','Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!page.ok)throw new Error('GitHub временно недоступен');const candidate=latestStable(await page.json());if(candidate&&(!latest||newer(candidate.tag_name,latest.tag_name)))latest=candidate;link=page.headers.get('link');}
    if(!latest){checked=null;downloaded=null;return {available:false,current:app.getVersion(),version:app.getVersion(),empty:true};}
    checked = selectRelease(latest, app.getVersion());
    downloaded = null;
    return checked;
  }
  async function download() {
    if (active) return active;
    if (!checked?.available) throw new Error('Сначала проверьте обновления');
    active = (async () => {
      // Recheck at download time: a newer release may have appeared since opening Settings.
      await check();if(!checked?.available)throw new Error('Установлена актуальная версия');
      const release = { ...checked };
      const folder = path.join(app.getPath('userData'), 'updates');
      fs.mkdirSync(folder, { recursive: true });
      const destination = path.join(folder, release.name), partial = destination + '.part';
      let handle;
      try {
        const response = await fetch(release.downloadUrl, { signal: AbortSignal.timeout(15 * 60000) });
        if (!response.ok || !response.body) throw new Error('Не удалось скачать обновление');
        handle = await fs.promises.open(partial, 'w');
        const hash = createHash('sha256'); let bytes = 0, last = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > release.size || bytes > MAX_SIZE) throw new Error('Неверный размер обновления');
          hash.update(chunk); await handle.writeFile(chunk);
          if (Date.now() - last > 150) { onProgress(Math.floor(bytes / release.size * 100)); last = Date.now(); }
        }
        await handle.close(); handle = null;
        if (bytes !== release.size || hash.digest('hex') !== release.sha256) throw new Error('Контрольная сумма обновления не совпала');
        await fs.promises.rename(partial, destination);
        downloaded = { file: destination, sha256: release.sha256, version: release.version };
        onProgress(100); return { ready: true, version: release.version };
      } catch (error) {
        await handle?.close(); await fs.promises.unlink(partial).catch(() => {}); throw error;
      }
    })();
    try { return await active; } finally { active = null; }
  }
  async function restart() {
    if (!app.isPackaged) throw new Error('Обновление с перезапуском доступно в переносимой сборке');
    if (!downloaded || !fs.existsSync(downloaded.file)) throw new Error('Сначала скачайте обновление');
    const saved = { ...downloaded }, hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(saved.file)) hash.update(chunk);
    if (hash.digest('hex') !== saved.sha256) throw new Error('Файл обновления изменился. Скачайте его заново.');
    if (app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: true, path: saved.file, args: [] });
    app.relaunch({ execPath: saved.file, args: [] }); app.quit();
    return true;
  }
  return { check, download, restart };
}
module.exports = { createUpdater, selectRelease, newer, latestStable };
