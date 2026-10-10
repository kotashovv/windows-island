$ErrorActionPreference='Stop'
$taskAssembly=(Resolve-Path 'native/bin/IslandBridge.exe').Path
$taskCode=@'
using System;
using System.IO.MemoryMappedFiles;
using System.Reflection;
using System.Runtime.InteropServices;
public static class ResourceFixture {
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 public static void Run(string assemblyPath){
  Type type=Assembly.LoadFrom(assemblyPath).GetType("ResourceBridge");
  BindingFlags flags=BindingFlags.Static|BindingFlags.NonPublic;
  string name="IslandRTSSFixture-"+Guid.NewGuid().ToString("N");type.GetField("FpsMapping",flags).SetValue(null,name);
  var fps=type.GetMethod("Fps",flags);uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);if(pid==0)pid=12345;type.GetField("TargetPid",flags).SetValue(null,pid);
  using(var map=MemoryMappedFile.CreateNew(name,1024))using(var view=map.CreateViewAccessor()){
   view.Write(0,0x52545353u);view.Write(4,0x00020000u);view.Write(8,284u);view.Write(12,36u);view.Write(16,1u);view.Write(36,pid);
   uint now=unchecked((uint)Environment.TickCount);view.Write(36+268,unchecked(now-1000));view.Write(36+272,now);view.Write(36+276,120u);
   if(Convert.ToDouble(fps.Invoke(null,null))!=120)throw new Exception("RTSS fixture should return measured 120 FPS");
   view.Write(36+268,unchecked(now-7000));view.Write(36+272,unchecked(now-6000));if(fps.Invoke(null,null)!=null)throw new Exception("Stale FPS must be hidden");
   view.Write(16,4097u);if(fps.Invoke(null,null)!=null)throw new Exception("Invalid table must be rejected");
   view.Write(16,1u);view.Write(0,0xDEADu);if(fps.Invoke(null,null)!=null)throw new Exception("Deallocated mapping must be rejected");
  }
  if(fps.Invoke(null,null)!=null)throw new Exception("Absent provider must return no data");
 }
}
'@
Add-Type -TypeDefinition $taskCode
[ResourceFixture]::Run($taskAssembly)
Write-Output 'PASS: RTSS read-only FPS fixture, stale data, malformed/deallocated/absent provider.'
