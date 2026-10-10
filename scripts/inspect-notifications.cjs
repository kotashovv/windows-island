const fs=require('node:fs'),path=require('node:path');
const file=path.join(process.env.LOCALAPPDATA,'Microsoft','Windows','Notifications','wpndatabase.db');
console.log('Notification database exists:',fs.existsSync(file));
if(fs.existsSync(file)){
  const {DatabaseSync}=require('node:sqlite');
  try{const db=new DatabaseSync(file,{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('Notification','NotificationHandler')").all()));console.log('Supported application handlers:',db.prepare("SELECT PrimaryId FROM NotificationHandler WHERE lower(PrimaryId) LIKE '%slack%' OR lower(PrimaryId) LIKE '%codex%' OR lower(PrimaryId) LIKE '%claude%'").all().map(row=>row.PrimaryId));db.close();}catch(error){console.log(error.message);}
}
