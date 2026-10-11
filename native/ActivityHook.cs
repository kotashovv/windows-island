using System;
using System.IO;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Diagnostics;

// Receives lifecycle metadata only. Never reads transcript_path or forwards prompts/tool output.
class ActivityHook {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessEntry {public uint Size,Usage,Pid;public UIntPtr Heap;public uint Module,Threads,Parent;public int Priority;public uint Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Exe;}
  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32First(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32Next(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static int? Owner(string source){IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))return null;try{var rows=new Dictionary<uint,ProcessEntry>();var entry=new ProcessEntry{Size=(uint)Marshal.SizeOf(typeof(ProcessEntry))};if(Process32First(snapshot,ref entry))do{rows[entry.Pid]=entry;}while(Process32Next(snapshot,ref entry));uint pid;using(var self=Process.GetCurrentProcess())pid=(uint)self.Id;for(int depth=0;depth<12;depth++){ProcessEntry row;if(!rows.TryGetValue(pid,out row)||row.Parent==pid)break;pid=row.Parent;if(!rows.TryGetValue(pid,out row))break;string name=row.Exe.ToLowerInvariant();if(source=="codex"&&(name=="codex.exe"||name=="codex-cli.exe")||source=="claude"&&(name=="claude.exe"||name=="node.exe"))return (int)pid;}return null;}finally{CloseHandle(snapshot);}}
  internal static void Run(string source){try{
    if(source!="codex"&&source!="claude")return;
    var json=new JavaScriptSerializer{MaxJsonLength=4194304};var inputText=new StringBuilder();char[] chunk=new char[4096];int count;
    while((count=Console.In.Read(chunk,0,chunk.Length))>0){if(inputText.Length+count>4194304)return;inputText.Append(chunk,0,count);}
    var input=json.Deserialize<Dictionary<string,object>>(inputText.ToString());object raw;if(!input.TryGetValue("session_id",out raw))return;string session=Convert.ToString(raw);if(session.Length==0||session.Length>200)return;
    string hook=Convert.ToString(input["hook_event_name"]),status=null;
    if(hook=="UserPromptSubmit"||hook=="PreToolUse"||hook=="PostToolUse"||hook=="PostToolUseFailure"||hook=="ElicitationResult")status="working";
    if(hook=="PermissionRequest"||hook=="Elicitation")status="needs_input";
    if(hook=="Stop"||hook=="StopFailure"||hook=="Interrupt"||hook=="SessionEnd"||hook=="SessionStart")status="idle";
    if(hook=="Notification"&&input.TryGetValue("notification_type",out raw)){string type=Convert.ToString(raw);if(type=="permission_prompt"||type=="elicitation_dialog")status="needs_input";if(type=="idle_prompt")status="idle";}
    if(status==null)return;
    string profile=Environment.GetEnvironmentVariable("ISLAND_TEST_DATA");if(String.IsNullOrEmpty(profile))profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"windows-island");
    var connection=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(profile,"mcp-connection.json")));var address=new Uri(Convert.ToString(connection["url"]));if(address.Scheme!="http"||address.Host!="127.0.0.1"||address.AbsolutePath!="/"||!String.IsNullOrEmpty(address.UserInfo))return;
    long observedAt=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
    byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(new {action="agent.activity",input=new {source=source,sessionId=session,status=status,observedAt=observedAt,ownerPid=Owner(source)}}));
    var request=(HttpWebRequest)WebRequest.Create(new Uri(address,"/action"));request.Proxy=null;request.Method="POST";request.ContentType="application/json";request.Headers["Authorization"]="Bearer "+Convert.ToString(connection["token"]);request.Timeout=700;request.ReadWriteTimeout=700;request.ContentLength=bytes.Length;
    using(var stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);using(var response=request.GetResponse()){}
  }catch{}finally{Console.WriteLine("{}");Console.Out.Flush();}}
}
