import { ClipboardCheck, Image, Video, ShieldCheck, ShieldOff, BatteryLow, BatteryCharging, Battery, Bell, Code2, Hash, Send, Wifi, WifiOff } from 'lucide-react';
import type { IslandNotification } from './bridge';
export function AppIcon({item}:{item:IslandNotification}){
  const Icon=item.kind==='clipboard-text'?ClipboardCheck:item.kind==='clipboard-image'||item.kind==='clipboard-screenshot'?Image:item.kind==='recording-saved'?Video:item.kind==='vpn-connected'?ShieldCheck:item.kind==='vpn-disconnected'?ShieldOff:item.kind==='charging'?BatteryCharging:item.kind==='unplugged'?Battery:item.kind==='battery-low'?BatteryLow:item.kind==='wifi-connected'?Wifi:item.kind==='wifi-disconnected'?WifiOff:item.source==='telegram'?Send:item.source==='slack'?Hash:item.source==='codex'||item.source==='claude'?Code2:Bell;
  return <span className={`app-icon ${item.kind?`system-icon ${item.kind}`:''}`}>{item.icon?<img src={item.icon} alt=""/>:<Icon size={20}/>}</span>;
}
