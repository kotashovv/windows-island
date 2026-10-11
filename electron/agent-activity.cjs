const {createHash}=require('node:crypto');
class AgentActivity {
  constructor(onChange,clock=Date.now,isAlive=()=>true){this.onChange=onChange;this.clock=clock;this.isAlive=isAlive;this.sessions=new Map();this.enabled=true;this.signature='';}
  configure(enabled){this.enabled=enabled!==false;if(!this.enabled)this.sessions.clear();this.publish();}
  update(input={}){
    const now=this.clock(),{source,status}=input,sessionId=input.sessionId||'mcp';
    if(!['claude','codex'].includes(source)||!['working','idle','needs_input'].includes(status)||typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>200)throw new Error('Некорректный статус агента');
    const observedAt=input.observedAt??now,leaseSeconds=input.leaseSeconds??900;
    if(!Number.isFinite(observedAt)||observedAt>now+5000||observedAt<now-300000||!Number.isInteger(leaseSeconds)||leaseSeconds<10||leaseSeconds>1800||(input.ownerPid!=null&&(!Number.isInteger(input.ownerPid)||input.ownerPid<=0||input.ownerPid>2147483647)))throw new Error('Некорректное время статуса агента');
    if(!this.enabled)return {accepted:false,disabled:true};
    this.sweep();const key=source+':'+createHash('sha256').update(sessionId).digest('hex'),previous=this.sessions.get(key);
    if(previous&&observedAt<previous.observedAt)return {accepted:false,stale:true};
    if(this.sessions.size>=256&&!previous)throw new Error('Слишком много сессий агента');
    this.sessions.set(key,{source,status,observedAt,ownerPid:status==='idle'?null:input.ownerPid,expiresAt:now+(status==='idle'?1800000:leaseSeconds*1000)});this.publish();return {accepted:true};
  }
  sweep(){const now=this.clock();for(const [key,value]of this.sessions)if(value.expiresAt<=now)this.sessions.delete(key);else if(value.ownerPid&&!this.isAlive(value.ownerPid)){value.status='idle';value.ownerPid=null;}this.publish();}
  publish(){const summary=[];for(const source of ['claude','codex']){const active=[...this.sessions.values()].filter(value=>value.source===source&&value.status!=='idle');if(active.length)summary.push({source,status:active.some(value=>value.status==='working')?'working':'needs_input',sessions:active.length});}const signature=JSON.stringify(summary);if(signature!==this.signature){this.signature=signature;this.onChange(summary);}}
}
module.exports={AgentActivity};
