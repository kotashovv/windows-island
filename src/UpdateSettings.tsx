import { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { bridge, native, type ReleaseInfo } from './bridge';

export function UpdateSettings() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'downloading' | 'ready'>('idle');
  const [progress, setProgress] = useState(0), [error, setError] = useState('');
  useEffect(() => bridge.on('update-progress', setProgress), []);
  async function check() {
    setError(''); setPhase('checking');
    try { setRelease(await bridge.checkUpdates()); } catch (e) { setError((e as Error).message); }
    finally { setPhase('idle'); }
  }
  async function download() {
    setError(''); setPhase('downloading'); setProgress(0);
    try { const result=await bridge.downloadUpdate();setRelease(value=>value?{...value,version:result.version}:value);setPhase('ready'); }
    catch (e) { setError((e as Error).message); setPhase('idle'); }
  }
  return <div className="update-settings">
    <button className="text-action" onClick={check} disabled={phase === 'checking' || phase === 'downloading' || !native}>
      {phase === 'checking' ? <LoaderCircle className="spinning" size={13} /> : <RefreshCw size={13} />}
      {phase === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
    </button>
    {!native && <small>Обновления доступны в приложении Windows.</small>}
    {release && <small role="status">{release.available ? `Доступна версия ${release.version}` : release.empty ? 'Пока нет опубликованных релизов.' : `Установлена актуальная версия ${release.current}`}</small>}
    {release?.available && phase === 'idle' && <button className="text-action" onClick={download}><Download size={13} /> Скачать обновление · {Math.round(release.size! / 1024 / 1024)} МБ</button>}
    {phase === 'downloading' && <div className="update-progress" role="status"><small>Скачиваем · {progress}%</small><progress max={100} value={progress} /></div>}
    {phase === 'ready' && <button className="primary-button" onClick={() => bridge.restartUpdate().catch(e => setError(e.message))}>Перезапустить и обновить</button>}
    {error && <p className="weather-error" role="alert">{error}</p>}
  </div>;
}
