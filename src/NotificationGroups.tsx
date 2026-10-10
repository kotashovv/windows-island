import {t,locale} from './i18n';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { bridge, type IslandNotification } from './bridge';
import { AppIcon } from './AppIcon';
import { AnimatedDisclosure } from './AnimatedDisclosure';
const time = (value: string) => new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export function NotificationGroups({ items, onRead, onDismiss, onJump }: {
    items: IslandNotification[];
    onRead: (id: string) => void;
    onDismiss: (ids: string[]) => Promise<boolean>;
    onJump: (item: IslandNotification) => void;
}) {
    const groups = new Map<string, IslandNotification[]>();
    for (const item of items) {
        const key = `${item.source}:${item.appName}`;
        groups.set(key, [...(groups.get(key) || []), item]);
    }
    return <div className="notification-groups">{[...groups.entries()].map(([key, notifications]) => <NotificationGroup key={key} items={notifications} onRead={onRead} onDismiss={onDismiss} onJump={onJump}/>)}{!items.length && <p className="empty">{t("Уведомлений пока нет.")}</p>}</div>;
}
function NotificationGroup({ items, onRead, onDismiss, onJump }: {
    items: IslandNotification[];
    onRead: (id: string) => void;
    onDismiss: (ids: string[]) => Promise<boolean>;
    onJump: (item: IslandNotification) => void;
}) {
    const [open, setOpen] = useState(false), [dismissing, setDismissing] = useState(false);
    const gesture = useRef<{
        id: number;
        y: number;
        origin: boolean;
        changed: boolean;
        button: HTMLElement | null;
    } | null>(null), suppress = useRef(false);
    useEffect(() => () => { if (gesture.current)
        bridge.capture(false); }, []);
    const latest = items[0];
    async function dismiss() { setDismissing(true); await new Promise(resolve => setTimeout(resolve, 340)); if (!await onDismiss(items.map(item => item.id)))
        setDismissing(false); }
    const row = (item: IslandNotification, first = false) => <div className={`activity ${item.read ? 'read' : ''}`} key={item.id}>{!first && <AppIcon item={item}/>}<button className="activity-text" onClick={() => { if (suppress.current) {
        suppress.current = false;
        return;
    } if (first)
        setOpen(!open); onRead(item.id); }}><small>{time(item.createdAt)}{item.status === 'needs_input' ? t(" · Нужно уточнение") : ''}</small><strong>{item.title || item.body}</strong>{item.title && <p className="notification-body">{item.body}</p>}</button>{item.target && <button className="go-button" onClick={() => onJump(item)}>{t("Перейти")}</button>}</div>;
    return <article className={`notification-group ${open ? 'group-open' : 'group-closed'} ${items.length > 1 ? 'has-stack' : ''} ${dismissing ? 'group-dismiss' : ''}`} data-app={latest.appName}>
    <div className="group-peek" onPointerDown={e => { e.stopPropagation(); suppress.current = false; if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest('.group-close,.go-button'))
        return; gesture.current = { id: e.pointerId, y: e.clientY, origin: open, changed: false, button: (e.target as HTMLElement).closest('button') }; bridge.capture(true); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { const value = gesture.current; if (!value || value.id !== e.pointerId)
        return; const delta = e.clientY - value.y; if (Math.abs(delta) > 12) {
        e.preventDefault();
        value.changed = true;
        setOpen(delta > 12 ? true : delta < -12 ? false : value.origin);
    } }} onPointerUp={e => { const value = gesture.current; gesture.current = null; if (value) {
        bridge.capture(false);
        if (!value.changed) {
            if (value.button)
                value.button.click();
            else
                setOpen(!value.origin);
        }
        suppress.current = true;
    } if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { if (gesture.current) {
        setOpen(gesture.current.origin);
        bridge.capture(false);
    } gesture.current = null; suppress.current = true; }} onLostPointerCapture={() => { if (gesture.current) {
        setOpen(gesture.current.origin);
        gesture.current = null;
        bridge.capture(false);
        suppress.current = true;
    } }} onClickCapture={e => { if (suppress.current) {
        suppress.current = false;
        e.preventDefault();
        e.stopPropagation();
    } }}>
      <div className="group-heading"><button className="group-toggle" aria-label={"" + (open ? t("Свернуть") : t("Раскрыть")) + t(" уведомления ") + latest.appName + ""} aria-expanded={open} onClick={() => { if (suppress.current) {
        suppress.current = false;
        return;
    } setOpen(!open); }}><AppIcon item={latest}/><strong>{latest.appName}</strong><small>{items.length}</small><ChevronDown size={14}/></button><button className="group-close" aria-label={t("Закрыть все уведомления ") + latest.appName + ""} disabled={dismissing} onClick={() => void dismiss()}><X size={14}/></button></div>
      {row(latest, true)}
    </div>
    <AnimatedDisclosure open={open} className="group-history">{items.slice(1).map(item => row(item))}{items.length === 1 && <small className="single-notification">{t("Это единственное уведомление приложения.")}</small>}</AnimatedDisclosure>
  </article>;
}
