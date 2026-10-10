import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const connection = process.env.WINDOWS_ISLAND_CONNECTION || path.join(process.env.APPDATA || '', 'windows-island', 'mcp-connection.json');
async function request(action, input) {
  let config;
  try { config = JSON.parse(await readFile(connection, 'utf8')); } catch { throw new Error('Запустите Windows Island. Если приложение уже открыто, скопируйте конфигурацию MCP из его настроек.'); }
  const url = new URL(config.url); if(url.hostname !== '127.0.0.1') throw new Error('Разрешено только локальное подключение');
  const response = await fetch(`${config.url}/${action ? 'action' : 'state'}`,{method:action?'POST':'GET',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},...(action?{body:JSON.stringify({action,input})}:{}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Island недоступен');return action?data.result:data;
}
const server = new McpServer({ name:'windows-island',version:'0.2.3' });
const source=z.enum(['codex','claude','slack','vscode','cursor','island','other']);
const target=z.object({app:z.enum(['codex','claude','slack','vscode','cursor']),url:z.string().max(4000).optional().describe('Optional exact IDE/chat deep link. Allowed: https, http, codex, claude, slack, vscode, cursor, jetbrains. Without URL, focus the running app.')});
const taskInput={title:z.string().min(1).max(5000),notes:z.string().optional(),url:z.string().url().optional(),deadline:z.string().optional().describe('ISO 8601 date or date-time with timezone'),priority:z.enum(['high','normal','low']).optional(),externalId:z.string().max(200).optional()};
const register=(name,description,schema,action)=>server.registerTool(name,{description,inputSchema:schema},async input=>{try{return {content:[{type:'text',text:JSON.stringify(await request(action,input),null,2)}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
register('island_get_day','Read tasks, calendar events and preferences. Inspect these before adding tasks to avoid duplicates.',{},undefined);
register('island_add_task','Add a task to Windows Island. This schedules work; it does not execute arbitrary commands.',{title:z.string().min(1).max(5000),notes:z.string().optional(),url:z.string().url().optional(),deadline:z.string().optional().describe('ISO 8601 date or date-time with timezone'),priority:z.enum(['high','normal','low']).optional(),source:z.string().optional()},'task.add');
register('island_import_tasks','Send a list of tasks silently, without notifications. Stable externalId values prevent duplicates on retry. Does not delete existing tasks or execute code.',{source:z.string().min(1).max(100),tasks:z.array(z.object(taskInput)).min(1).max(100)},'tasks.import');
for(const [verb,description] of [['start','Start the focus timer for a task, pausing other running tasks.'],['pause','Pause a task focus timer.'],['complete','Mark a task completed and save an optional result.'],['reopen','Reopen a completed task.'],['delete','Delete a task when the user asks.']]) register(`island_${verb}_task`,description,{id:z.string(),notes:z.string().optional()},`task.${verb}`);
register('island_add_event','Add a calendar event. Supply ISO date-times with an explicit timezone.',{title:z.string(),start:z.string(),end:z.string().optional(),location:z.string().optional(),url:z.string().url().optional(),source:z.string().optional()},'event.add');
register('island_delete_event','Delete a calendar event when asked.',{id:z.string()},'event.delete');
register('island_notify','Send a notification separately from task lists. Always reuse eventId when retrying. Include source for correct app icon and cross-channel deduplication, target for the Go button. Does not change task status.',{source:source.optional(),eventId:z.string().max(300).optional(),title:z.string().max(300).optional(),body:z.string().max(10000),status:z.enum(['info','completed','needs_input','failed']).optional(),target:target.optional(),taskId:z.string().optional(),appName:z.string().optional()},'notification');
register('island_report_work','Report completed work, required clarification, or failure. Saves the report, updates taskId when provided, and sends ONE notification. Do NOT also call island_notify for the same event. Reuse eventId on retries. Includes Go deep link or application focus.',{source,eventId:z.string().min(1).max(300),taskId:z.string().optional(),status:z.enum(['completed','needs_input','failed']),title:z.string().max(300).optional(),body:z.string().min(1).max(10000),target:target.optional()},'agent.report');
server.registerTool('island_get_notifications',{description:'Read saved notifications, including notifications received while fullscreen or quiet. Reading does not mark them read.',inputSchema:{unreadOnly:z.boolean().optional(),limit:z.number().int().min(1).max(100).optional()}},async input=>{try{const state=await request();return {content:[{type:'text',text:JSON.stringify(state.notifications.filter(item=>!input.unreadOnly||!item.read).slice(0,input.limit||30),null,2)}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}});
register('island_weather','Get the current weather for the configured city.',{},'weather');
register('island_day_report','Write a Markdown daily activity report to the Windows desktop. Returns its path.',{},'report');
server.connect(new StdioServerTransport()).catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
