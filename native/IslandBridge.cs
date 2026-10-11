using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Net.NetworkInformation;
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
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from,uint to,bool attach);
  [StructLayout(LayoutKind.Sequential)] struct PowerStatus {public byte ACLineStatus,BatteryFlag,BatteryLifePercent,SystemStatus;public uint BatteryLifeTime,BatteryFullLifeTime;}
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out PowerStatus status);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder appId);
  [DllImport("wlanapi.dll")] static extern uint WlanOpenHandle(uint version,IntPtr reserved,out uint negotiated,out IntPtr handle);
  [DllImport("wlanapi.dll")] static extern uint WlanEnumInterfaces(IntPtr handle,IntPtr reserved,out IntPtr list);
  [DllImport("wlanapi.dll")] static extern uint WlanQueryInterface(IntPtr handle,ref Guid id,int opcode,IntPtr reserved,out uint size,out IntPtr data,out int valueType);
  [DllImport("wlanapi.dll")] static extern uint WlanCloseHandle(IntPtr handle,IntPtr reserved);
  [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr data);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static readonly object Gate=new object();
  static Dictionary<string,object> Backup=new Dictionary<string,object>();
  static string BackupFile;
  static int ParentPid;
  static volatile bool Running=true;
  static string[] Apps={"codex","claude","slack","telegram","vscode","cursor"};
  static string LastSystem="";
  static bool Supported(string id){return id.IndexOf('\\')<0&&id.IndexOf('/')<0&&((id.IndexOf("codex",StringComparison.OrdinalIgnoreCase)>=0&&id.IndexOf("runner",StringComparison.OrdinalIgnoreCase)<0)||(id.IndexOf("claude",StringComparison.OrdinalIgnoreCase)>=0&&id.IndexOf("ssh",StringComparison.OrdinalIgnoreCase)<0)||id.IndexOf("slack",StringComparison.OrdinalIgnoreCase)>=0||id.IndexOf("telegram",StringComparison.OrdinalIgnoreCase)>=0);}
  static readonly uint OwnPid=ReadOwnPid();
  static uint ReadOwnPid(){using(var process=Process.GetCurrentProcess())return (uint)process.Id;}
  internal static bool IsIslandProcess(uint pid){return pid==(uint)ParentPid||pid==OwnPid;}
  internal static bool IsRunning {get{return Running;}}
  internal static string Serialize(object value){lock(Gate){return Json.Serialize(value);}}
  internal static void Emit(object value){lock(Gate){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}}
  static volatile bool SystemEnabled=true,VpnEnabled=true,PowerEnabled=true,WifiEnabled=true,FullscreenEnabled=true;
  static object Vpn(){
    try{var names=new List<string>();foreach(var adapter in NetworkInterface.GetAllNetworkInterfaces()){
      if(adapter.OperationalStatus!=OperationalStatus.Up)continue;
      string description=adapter.Description.ToLowerInvariant();bool vpn=adapter.NetworkInterfaceType==NetworkInterfaceType.Ppp||description.Contains("wireguard")||description.Contains("wintun")||description.Contains("openvpn")||description.Contains("tap-windows")||description.Contains("tailscale")||description.Contains("zerotier")||description.Contains("fortinet")||description.Contains("anyconnect")||description.Contains("nordlynx");
      if(vpn&&adapter.GetIPProperties().UnicastAddresses.Count>0)names.Add(adapter.Name);
    }names.Sort();return new {available=true,connected=names.Count>0,name=String.Join(", ",names.ToArray())};}catch{return new {available=false,connected=false,name=""};}
  }
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
  // Codex Desktop uses ChatGPT.exe in the OpenAI.Codex package; codex.exe can be a windowless CLI.
  static bool IsCodexDesktopPath(string file){
    if(String.IsNullOrEmpty(file))return false;
    string[] parts=file.Replace('/','\\').Split('\\');
    foreach(string part in parts)if(part.StartsWith("OpenAI.Codex_",StringComparison.OrdinalIgnoreCase))return true;
    return false;
  }
  static Process FindApp(string app){
    string[] names=app=="codex"?new string[]{"ChatGPT","codex"}:new string[]{ProcessName(app)};
    foreach(string name in names)foreach(var process in Process.GetProcessesByName(name)){
      try{
        if(process.MainWindowHandle==IntPtr.Zero){process.Dispose();continue;}
        if(app=="codex"&&name=="ChatGPT"&&!IsCodexDesktopPath(process.MainModule.FileName)){process.Dispose();continue;}
        return process;
      }catch{process.Dispose();}
    }
    return null;
  }
  static bool FocusApp(string app){return FocusProcess(FindApp(app));}
  static bool FocusProcess(Process selected){
    using(var process=selected){
      if(process==null)return false;
      IntPtr hwnd=process.MainWindowHandle;
      if(IsIconic(hwnd))ShowWindow(hwnd,9);
      SetForegroundWindow(hwnd);
      if(GetForegroundWindow()==hwnd)return true;
      // The native bridge is a separate process from the window receiving the user's click.
      uint pid;uint foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out pid);
      uint currentThread=GetCurrentThreadId();bool attached=false;
      try{
        if(foregroundThread!=0&&foregroundThread!=currentThread)attached=AttachThreadInput(currentThread,foregroundThread,true);
        SetForegroundWindow(hwnd);
        return GetForegroundWindow()==hwnd;
      }finally{if(attached)AttachThreadInput(currentThread,foregroundThread,false);}
    }
  }
  static Process FindMediaApp(string appId){
    foreach(var process in Process.GetProcesses()){
      try{
        if(process.MainWindowHandle==IntPtr.Zero){process.Dispose();continue;}
        uint length=0;GetApplicationUserModelId(process.Handle,ref length,null);
        if(length>0&&length<1024){var id=new StringBuilder((int)length);if(GetApplicationUserModelId(process.Handle,ref length,id)==0&&id.ToString().Equals(appId,StringComparison.OrdinalIgnoreCase))return process;}
        string name=process.ProcessName;
        if(name.Equals(appId,StringComparison.OrdinalIgnoreCase)||(name+".exe").Equals(appId,StringComparison.OrdinalIgnoreCase))return process;
      }catch{}
      process.Dispose();
    }
    return null;
  }
  static object Wifi(){
    IntPtr handle;uint version;
    if(WlanOpenHandle(2,IntPtr.Zero,out version,out handle)!=0)return new {available=false,connected=false,name=""};
    IntPtr list=IntPtr.Zero;
    try{
      if(WlanEnumInterfaces(handle,IntPtr.Zero,out list)!=0)return new {available=false,connected=false,name=""};
      int count=Math.Min(32,Marshal.ReadInt32(list));
      for(int i=0;i<count;i++){
        IntPtr entry=IntPtr.Add(list,8+i*532);
        if(Marshal.ReadInt32(entry,528)!=1)continue;
        Guid id=(Guid)Marshal.PtrToStructure(entry,typeof(Guid));IntPtr data;uint size;int valueType;
        if(WlanQueryInterface(handle,ref id,7,IntPtr.Zero,out size,out data,out valueType)!=0)return new {available=true,connected=true,name=""};
        try{int length=Marshal.ReadInt32(data,520);if(size>=556&&length>=0&&length<=32){var bytes=new byte[length];Marshal.Copy(IntPtr.Add(data,524),bytes,0,length);return new {available=true,connected=true,name=Encoding.UTF8.GetString(bytes)};}}
        finally{WlanFreeMemory(data);}
        return new {available=true,connected=true,name=""};
      }
      return new {available=true,connected=false,name=""};
    }finally{if(list!=IntPtr.Zero)WlanFreeMemory(list);WlanCloseHandle(handle,IntPtr.Zero);}
  }
  static void SystemSnapshot(){
    PowerStatus power;object value=null;
    if(PowerEnabled&&GetSystemPowerStatus(out power))value=new {present=power.BatteryFlag!=255&&(power.BatteryFlag&128)==0,percent=power.BatteryLifePercent==255?(int?)null:power.BatteryLifePercent,plugged=power.ACLineStatus==255?(bool?)null:power.ACLineStatus==1,charging=(power.BatteryFlag&8)!=0};
    var snapshot=new {type="system",power=value,wifi=SystemEnabled&&WifiEnabled?Wifi():null,vpn=VpnEnabled?Vpn():null};string signature=Serialize(snapshot);
    if(signature!=LastSystem){LastSystem=signature;Emit(snapshot);}
  }
  static void Icons(){var paths=new Dictionary<string,string>();foreach(var app in Apps){using(var process=FindApp(app)){if(process!=null){try{paths[app]=process.MainModule.FileName;}catch{}}}}Emit(new {type="icons",paths=paths});}
  static bool Fullscreen(){
    int state;bool known=SHQueryUserNotificationState(out state)==0;if(known&&state==1)return true;
    IntPtr hwnd=GetForegroundWindow();if(hwnd==IntPtr.Zero)return false;
    uint pid;GetWindowThreadProcessId(hwnd,out pid);if(pid==ParentPid)return false;
    try{using(var process=Process.GetProcessById((int)pid)){if(process.ProcessName.Equals("explorer",StringComparison.OrdinalIgnoreCase))return false;}}catch{}
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
    if(type=="backdrop")BackdropBridge.Queue(input);
    if(type=="clipboard-baseline")ClipboardBridge.Baseline();
    if(type=="resources-visible")ResourceBridge.Visible=Convert.ToBoolean(input["visible"]);
    if(type=="configure"){ClipboardBridge.Configure(input.ContainsKey("clipboard")&&Convert.ToBoolean(input["clipboard"]));ResourceBridge.Enabled=input.ContainsKey("resources")&&Convert.ToBoolean(input["resources"]);PowerEnabled=!input.ContainsKey("power")||Convert.ToBoolean(input["power"]);WifiEnabled=!input.ContainsKey("wifi")||Convert.ToBoolean(input["wifi"]);FullscreenEnabled=!input.ContainsKey("fullscreen")||Convert.ToBoolean(input["fullscreen"]);SystemEnabled=Convert.ToBoolean(input["system"]);VpnEnabled=Convert.ToBoolean(input["vpn"]);MediaBridge.Enabled=Convert.ToBoolean(input["media"]);LastSystem="";}
    if(type=="media-control")MediaBridge.Queue(input);
    if(type=="banners"){var ids=(System.Collections.IEnumerable)input["apps"];var strings=new List<string>();foreach(var id in ids)strings.Add(Convert.ToString(id));Banners(strings.ToArray(),Convert.ToBoolean(input["exclusive"]));}
    if(type=="icons")Icons();
    if(type=="focus"){string app=Convert.ToString(input["app"]);bool ok=Array.IndexOf(Apps,app)>=0&&FocusApp(app);Emit(new {type="focus",id=input["id"],ok=ok});}
    if(type=="focus-media"){bool ok=FocusProcess(FindMediaApp(Convert.ToString(input["appId"])));Emit(new {type="focus",id=input["id"],ok=ok});}
  }catch(Exception error){Emit(new {type="error",message=error.Message});}}}finally{Running=false;}}
  static void Main(string[] args){
    // Explicit redirected streams work without allocating a Windows console host.
    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
    Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false)));
    ParentPid=args.Length>0?Int32.Parse(args[0]):0;string dir=args.Length>1?args[1]:Environment.CurrentDirectory;Directory.CreateDirectory(dir);BackupFile=Path.Combine(dir,"banner-backup.json");
    try{if(File.Exists(BackupFile))Backup=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(BackupFile));Restore();
      var reader=new Thread(ReadCommands);reader.IsBackground=true;reader.Start();var media=new Thread(MediaBridge.Run);media.IsBackground=true;media.Start();var resources=new Thread(ResourceBridge.Run);resources.IsBackground=true;resources.Start();bool? previous=null;int ticks=0;Icons();
      while(Running){try{ClipboardBridge.Poll();bool value=FullscreenEnabled&&Fullscreen();if(value!=previous){Emit(new {type="fullscreen",active=value});previous=value;}if(ticks++%8==0&&(SystemEnabled||VpnEnabled))SystemSnapshot();if(ticks%60==0){if(ParentPid>0){try{using(var parent=Process.GetProcessById(ParentPid)){if(parent.HasExited){Running=false;break;}}}catch(ArgumentException){Running=false;break;}}Icons();}}catch(Exception error){Emit(new {type="error",message=error.Message});}Thread.Sleep(250);}
    }finally{Running=false;BackdropBridge.Stop();try{Restore();}catch{}}
  }
}
