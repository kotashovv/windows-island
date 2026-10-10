import {t} from './i18n';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { bridge, type MediaSession } from './bridge';
export function MediaControls({ media, onExpand, onError, compact = false }: {
    media: MediaSession;
    onExpand?: () => void;
    onError: (message: string) => void;
    compact?: boolean;
}) {
    const [pending, setPending] = useState(false), [notice, setNotice] = useState('');
    async function openSource() { try {
        const result = await bridge.mediaSource(media.sourceId) as {
            notice?: string;
        } | undefined;
        if (result?.notice)
            setNotice(result.notice);
    }
    catch {
        setNotice(t("Не удалось перейти к источнику звука. Откройте окно плеера."));
    } }
    useEffect(() => { if (!notice)
        return; const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer); }, [notice, media.sourceId]);
    async function control(action: 'toggle' | 'next' | 'previous') { setPending(true); try {
        await bridge.mediaControl(action, media.sourceId);
    }
    catch (e) {
        onError((e as Error).message);
    }
    finally {
        setPending(false);
    } }
    return <div className={`media-controls ${compact ? 'compact-media' : ''}`}>
    <span className={`media-art ${media.playing ? 'playing' : ''}`}><Music2 size={19}/><i /><i /><i /></span>
    <div className="media-description"><button onClick={onExpand} disabled={!onExpand}><strong>{media.title || t("Музыка")}</strong></button><small>{notice ? <span className="media-notice" role="status">{t(notice)}</span> : media.artist || media.sourceName}</small><button className="media-source" aria-label={t("Открыть источник музыки")} onClick={() => void openSource()}>{media.sourceName}<ArrowUpRight size={10}/></button></div>
    <div className="media-buttons"><button aria-label={t("Предыдущий трек")} disabled={pending || !media.canPrevious} onClick={() => void control('previous')}><SkipBack size={15}/></button><button className="media-toggle" aria-label={media.playing ? t("Приостановить музыку") : t("Включить музыку")} disabled={pending || !media.canToggle} onClick={() => void control('toggle')}>{media.playing ? <Pause size={17}/> : <Play size={17}/>}</button><button aria-label={t("Следующий трек")} disabled={pending || !media.canNext} onClick={() => void control('next')}><SkipForward size={15}/></button></div>
  </div>;
}
