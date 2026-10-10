using System;
using System.Collections.Generic;
using System.IO.MemoryMappedFiles;
using System.Management;
using System.Runtime.InteropServices;
using System.Threading;

// Read-only providers. No game injection, drivers or additional monitoring process.
static class ResourceBridge {
  internal static volatile bool Enabled,Visible;
  [StructLayout(LayoutKind.Sequential)] struct MemoryStatus {public uint Length,Load;public ulong Total,Available,TotalPage,AvailablePage,TotalVirtual,AvailableVirtual,Extended;}
  [StructLayout(LayoutKind.Sequential)] struct CounterValue {public uint Status;public double Value;}
  [StructLayout(LayoutKind.Sequential)] struct CounterItem {public IntPtr Name;public CounterValue Data;}
  [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out long idle,out long kernel,out long user);
  [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MemoryStatus memory);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhOpenQuery(string source,IntPtr data,out IntPtr query);
  [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhAddEnglishCounterW(IntPtr query,string path,IntPtr data,out IntPtr counter);
  [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
  [DllImport("pdh.dll")] static extern uint PdhCloseQuery(IntPtr query);
  [DllImport("pdh.dll",CharSet=CharSet.Unicode)] static extern uint PdhGetFormattedCounterArrayW(IntPtr counter,uint flags,ref uint size,out uint count,IntPtr buffer);
  static IntPtr Query,Counter;
  static long LastIdle,LastTotal;
  static uint TargetPid;
  internal static string FpsMapping="RTSSSharedMemoryV2";
  static DateTime NextSensors=DateTime.MinValue;
  static double? CpuTemp,GpuTemp;
  static double? Round(double value,double max){return !Double.IsNaN(value)&&!Double.IsInfinity(value)&&value>=0&&value<=max?(double?)Math.Round(value,1):null;}
  static double? Cpu(){long idle,kernel,user;if(!GetSystemTimes(out idle,out kernel,out user))return null;long total=kernel+user,delta=total-LastTotal;double? result=LastTotal>0&&delta>0?Round(100.0*(delta-(idle-LastIdle))/delta,100):null;LastIdle=idle;LastTotal=total;return result;}
  static double? Gpu(){
    if(Query==IntPtr.Zero){if(PdhOpenQuery(null,IntPtr.Zero,out Query)!=0)return null;if(PdhAddEnglishCounterW(Query,@"\GPU Engine(*)\Utilization Percentage",IntPtr.Zero,out Counter)!=0){Close();return null;}}
    if(PdhCollectQueryData(Query)!=0)return null;
    uint size=0,count;PdhGetFormattedCounterArrayW(Counter,0x200,ref size,out count,IntPtr.Zero);
    if(size==0||size>8*1024*1024)return null;
    IntPtr buffer=Marshal.AllocHGlobal((int)size);
    try{
      if(PdhGetFormattedCounterArrayW(Counter,0x200,ref size,out count,buffer)!=0)return null;
      int stride=Marshal.SizeOf(typeof(CounterItem));if((ulong)count*(ulong)stride>size)return null;
      var engines=new Dictionary<string,double>();
      for(int i=0;i<count;i++){
        var item=(CounterItem)Marshal.PtrToStructure(IntPtr.Add(buffer,i*stride),typeof(CounterItem));
        if(item.Data.Status>1||Round(item.Data.Value,100)==null)continue;
        string name=Marshal.PtrToStringUni(item.Name);int start=name.IndexOf("luid_",StringComparison.Ordinal),end=name.IndexOf("_engtype_",StringComparison.Ordinal);
        if(start<0||end<start)continue;string engine=name.Substring(start,end-start);double sum;engines.TryGetValue(engine,out sum);engines[engine]=sum+item.Data.Value;
      }
      double peak=0;foreach(double usage in engines.Values)peak=Math.Max(peak,usage);
      return engines.Count>0?Round(Math.Min(100,peak),100):null;
    }finally{Marshal.FreeHGlobal(buffer);}
  }
  static void Sensors(){
    if(DateTime.UtcNow<NextSensors)return;
    CpuTemp=null;GpuTemp=null;bool found=false;
    foreach(string ns in new[]{@"root\LibreHardwareMonitor",@"root\OpenHardwareMonitor"}){
      try{
        var options=new EnumerationOptions {Timeout=TimeSpan.FromSeconds(2),ReturnImmediately=false};
        using(var query=new ManagementObjectSearcher(new ManagementScope(ns),new ObjectQuery("SELECT Identifier,Name,Value FROM Sensor WHERE SensorType='Temperature'"),options))
        using(var rows=query.Get())foreach(ManagementObject row in rows){using(row){if(row["Value"]==null)continue;string id=Convert.ToString(row["Identifier"]).ToLowerInvariant();double? value=Round(Convert.ToDouble(row["Value"]),150);if(value==null)continue;if(id.Contains("/cpu/")||id.Contains("/intelcpu/")||id.Contains("/amdcpu/")){if(CpuTemp==null||value>CpuTemp)CpuTemp=value;}else if(id.Contains("/gpu")){if(GpuTemp==null||value>GpuTemp)GpuTemp=value;}}}
        found=CpuTemp!=null||GpuTemp!=null;if(found)break;
      }catch{}
    }
    NextSensors=DateTime.UtcNow.AddSeconds(found?5:30);
  }
  // RTSS SDK v2 APP_ENTRY: process ID, MAX_PATH name, flags, time0/time1/frames.
  // Read only the foreground application's entry; never report the desktop refresh rate as FPS.
  static double? Fps(){
    uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);if(pid!=0&&!IslandBridge.IsIslandProcess(pid))TargetPid=pid;
    if(TargetPid==0)return null;
    try{using(var memory=MemoryMappedFile.OpenExisting(FpsMapping,MemoryMappedFileRights.Read))using(var view=memory.CreateViewAccessor(0,0,MemoryMappedFileAccess.Read)){
      if(view.Capacity<36||view.ReadUInt32(0)!=0x52545353||(view.ReadUInt32(4)>>16)!=2)return null;
      uint stride=view.ReadUInt32(8),offset=view.ReadUInt32(12),count=view.ReadUInt32(16);
      if(stride<284||count>4096||(ulong)offset+(ulong)count*stride>(ulong)view.Capacity)return null;
      for(uint i=0;i<count;i++){long entry=offset+(long)i*stride;if(view.ReadUInt32(entry)!=TargetPid)continue;uint time0=view.ReadUInt32(entry+268),time1=view.ReadUInt32(entry+272),frames=view.ReadUInt32(entry+276);uint elapsed=unchecked(time1-time0),age=unchecked((uint)Environment.TickCount-time1);if(time0==0||elapsed==0||elapsed>10000||age>5000)return null;return Round(1000.0*frames/elapsed,10000);}
    }}catch{}return null;
  }
  static void Close(){if(Query!=IntPtr.Zero)PdhCloseQuery(Query);Query=Counter=IntPtr.Zero;LastIdle=LastTotal=0;CpuTemp=GpuTemp=null;NextSensors=DateTime.MinValue;}
  internal static void Run(){try{while(IslandBridge.IsRunning){if(!Enabled||!Visible){Close();Thread.Sleep(250);continue;}try{
    double? cpu=Cpu(),gpu=Gpu(),fps=Fps();var memory=new MemoryStatus {Length=(uint)Marshal.SizeOf(typeof(MemoryStatus))};bool ram=GlobalMemoryStatusEx(ref memory);Sensors();
    if(Enabled&&Visible)IslandBridge.Emit(new {type="resources",updatedAt=DateTime.UtcNow.ToString("o"),cpu=cpu,gpu=gpu,cpuTemp=CpuTemp,gpuTemp=GpuTemp,fps=fps,ramUsed=ram?(double?)Math.Round((memory.Total-memory.Available)/1073741824.0,1):null,ramTotal=ram?(double?)Math.Round(memory.Total/1073741824.0,1):null,ramPercent=ram?(double?)memory.Load:null});
  }catch{}for(int i=0;i<8&&Enabled&&Visible&&IslandBridge.IsRunning;i++)Thread.Sleep(250);}}finally{Close();}}
}
