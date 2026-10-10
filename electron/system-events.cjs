// Emit on transitions, never flood the Island with repeated battery/network snapshots.
class SystemEvents {
  constructor(notify){this.notify=notify;this.previous=null;this.lowLevel=0;}
  update(value){
    const previous=this.previous;this.previous=value;
    const power=value.power;
    if(power?.present){
      if(power.plugged||power.percent>25)this.lowLevel=0;
      if(previous?.power?.present&&power.plugged!==previous.power.plugged&&power.plugged!==null&&previous.power.plugged!==null){this.emit(power.plugged?'charging':'unplugged',power.plugged?'Зарядка подключена':'Зарядка отключена',`${power.percent===null?'':power.percent+'%'} ${power.charging?'· Батарея заряжается':''}`.trim()||'Статус питания изменился',power.percent);}
      const level=power.percent===null?0:power.percent<=10?2:power.percent<=20?1:0;
      if(!power.plugged&&level>this.lowLevel){this.lowLevel=level;this.emit('battery-low','Низкий заряд батареи',`${power.percent}% · Подключите зарядку`);}
    }
    if(previous?.wifi?.available&&value.wifi?.available){
      const wifi=value.wifi,old=previous.wifi;
      if(wifi.connected&&(!old.connected||wifi.name!==old.name))this.emit('wifi-connected','Wi-Fi подключён',wifi.name||'Беспроводное соединение установлено');
      if(!wifi.connected&&old.connected)this.emit('wifi-disconnected','Wi-Fi отключён','Беспроводное соединение потеряно');
    }
    if(previous?.vpn?.available&&value.vpn?.available){const vpn=value.vpn,old=previous.vpn;if(vpn.connected&&(!old.connected||vpn.name!==old.name))this.emit('vpn-connected','VPN включён',vpn.name||'Защищённое соединение установлено');if(!vpn.connected&&old.connected)this.emit('vpn-disconnected','VPN выключен','Защищённое соединение отключено');}
  }
  emit(kind,title,body,chargePercent=null){this.notify({source:'island',appName:kind.startsWith('vpn')?'VPN':kind.startsWith('wifi')?'Wi-Fi':'Батарея',kind,title,body,chargePercent,transport:'system'});}
}
module.exports={SystemEvents};
