const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
if(process.platform!=='win32')throw new Error('Сборка Windows-моста требует Windows');
fs.mkdirSync('native/bin',{recursive:true});
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
execFileSync(compiler,['/nologo','/target:winexe','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Management.dll',`/reference:${path.join(path.dirname(compiler),'System.Runtime.WindowsRuntime.dll')}`,`/out:${path.resolve('native/bin/IslandBridge.exe')}`,path.resolve('native/IslandBridge.cs'),path.resolve('native/MediaBridge.cs'),path.resolve('native/ResourceBridge.cs'),path.resolve('native/ClipboardBridge.cs')],{stdio:'inherit'});
