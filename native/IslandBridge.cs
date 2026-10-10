using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32;

class IslandBridge {
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct MonitorInfo {public int Size;public Rect Monitor,Work;public uint Flags;}
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd,uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr handle,ref MonitorInfo info);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd,int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static readonly object Gate=new object();
  static Dictionary<string,object> Backup=new Dictionary<string,object>();
  static string BackupFile;
  static int ParentPid;
  static volatile bool Running=true;
  static string[] Apps={"codex","claude","slack","vscode","cursor"};
  static bool Supported(string id){return id.IndexOf('\\')<0&&id.IndexOf('/')<0&&((id.IndexOf("codex",StringComparison.OrdinalIgnoreCase)>=0&&id.IndexOf("runner",StringComparison.OrdinalIgnoreCase)<0)||(id.IndexOf("claude",StringComparison.OrdinalIgnoreCase)>=0&&id.IndexOf("ssh",StringComparison.OrdinalIgnoreCase)<0)||id.IndexOf("slack",StringComparison.OrdinalIgnoreCase)>=0);}
  static void Emit(object value){lock(Gate){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}}
  static void SaveBackup(){File.WriteAllText(BackupFile,Json.Serialize(Backup));}
  static void Banners(string[] ids,bool exclusive){
    if(!exclusive){Restore();return;}
    lock(Gate){foreach(string id in ids){if(!Supported(id))continue;string keyName="Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\"+id;
      using(RegistryKey key=Registry.CurrentUser.CreateSubKey(keyName)){
        if(!Backup.ContainsKey(id)){Backup[id]=key.GetValue("ShowBanner",null);SaveBackup();}
        key.SetValue("ShowBanner",0,RegistryValueKind.DWord);
      }
    }}
    Emit(new {type="banners",exclusive=true,count=Backup.Count});
  }
  static void Restore(){lock(Gate){foreach(var entry in Backup){using(RegistryKey key=Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\"+entry.Key)){if(entry.Value==null)key.DeleteValue("ShowBanner",false);else key.SetValue("ShowBanner",Convert.ToInt32(entry.Value),RegistryValueKind.DWord);}}Backup.Clear();SaveBackup();}Emit(new {type="banners",exclusive=false,count=0});}
  static string ProcessName(string app){return app=="vscode"?"Code":app;}
  static Process FindApp(string app){foreach(var process in Process.GetProcessesByName(ProcessName(app))){try{if(process.MainWindowHandle!=IntPtr.Zero)return process;}catch{}}return null;}
  static void Icons(){var paths=new Dictionary<string,string>();foreach(var app in Apps){var process=FindApp(app);if(process!=null){try{paths[app]=process.MainModule.FileName;}catch{}}}Emit(new {type="icons",paths=paths});}
  static bool Fullscreen(){
    int state;bool known=SHQueryUserNotificationState(out state)==0;if(known&&state==1)return true;
    IntPtr hwnd=GetForegroundWindow();if(hwnd==IntPtr.Zero)return false;
    uint pid;GetWindowThreadProcessId(hwnd,out pid);if(pid==ParentPid)return false;
    try{string name=Process.GetProcessById((int)pid).ProcessName;if(name.Equals("explorer",StringComparison.OrdinalIgnoreCase))return false;}catch{}
    Rect rect;if(!GetWindowRect(hwnd,out rect))return false;
    MonitorInfo info=new MonitorInfo();info.Size=Marshal.SizeOf(typeof(MonitorInfo));if(!GetMonitorInfo(MonitorFromWindow(hwnd,2),ref info))return false;
    // Island currently lives on the primary monitor. A fullscreen window elsewhere must not hide it.
    if((info.Flags&1)==0)return false;
    if(known&&(state==3||state==4))return true;
    if(IsZoomed(hwnd))return false;
    bool covers=Math.Abs(rect.Left-info.Monitor.Left)<=2&&Math.Abs(rect.Top-info.Monitor.Top)<=2&&Math.Abs(rect.Right-info.Monitor.Right)<=2&&Math.Abs(rect.Bottom-info.Monitor.Bottom)<=2;
    bool borderless=(GetWindowLong(hwnd,-16)&0x00C00000)==0;
    return covers&&borderless;
  }
  static void ReadCommands(){try{string line;while(Running&&(line=Console.ReadLine())!=null){try{
    var input=Json.Deserialize<Dictionary<string,object>>(line);string type=Convert.ToString(input["type"]);
    if(type=="shutdown"){Running=false;break;}
    if(type=="banners"){var ids=(System.Collections.IEnumerable)input["apps"];var strings=new List<string>();foreach(var id in ids)strings.Add(Convert.ToString(id));Banners(strings.ToArray(),Convert.ToBoolean(input["exclusive"]));}
    if(type=="icons")Icons();
    if(type=="focus"){string app=Convert.ToString(input["app"]);bool supported=Array.IndexOf(Apps,app)>=0;var process=supported?FindApp(app):null;bool ok=false;if(process!=null){ShowWindow(process.MainWindowHandle,9);ok=SetForegroundWindow(process.MainWindowHandle);}Emit(new {type="focus",id=input["id"],ok=ok});}
  }catch(Exception error){Emit(new {type="error",message=error.Message});}}}finally{Running=false;}}
  static void Main(string[] args){
    Console.OutputEncoding=new UTF8Encoding(false);Console.InputEncoding=new UTF8Encoding(false);
    ParentPid=args.Length>0?Int32.Parse(args[0]):0;string dir=args.Length>1?args[1]:Environment.CurrentDirectory;Directory.CreateDirectory(dir);BackupFile=Path.Combine(dir,"banner-backup.json");
    try{if(File.Exists(BackupFile))Backup=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(BackupFile));Restore();
      var reader=new Thread(ReadCommands);reader.IsBackground=true;reader.Start();bool? previous=null;int ticks=0;Icons();
      while(Running){try{bool value=Fullscreen();if(value!=previous){Emit(new {type="fullscreen",active=value});previous=value;}if(++ticks%60==0)Icons();}catch(Exception error){Emit(new {type="error",message=error.Message});}Thread.Sleep(250);}
    }finally{try{Restore();}catch{}}
  }
}
