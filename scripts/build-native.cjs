const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
if(process.platform!=='win32')throw new Error('Сборка Windows-моста требует Windows');
fs.mkdirSync('native/bin',{recursive:true});
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
execFileSync(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll',`/out:${path.resolve('native/bin/IslandBridge.exe')}`,path.resolve('native/IslandBridge.cs')],{stdio:'inherit'});
