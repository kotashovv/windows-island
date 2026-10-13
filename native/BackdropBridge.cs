using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

// A small native compositor surface behind Electron, never an extra renderer.
// Windows owns the blur kernel; intensity blends its contribution (not a radius).
class BackdropBridge {
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;}
  [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr Hwnd;public uint Id;public UIntPtr WParam;public IntPtr LParam;public uint Time;public Point Point;public uint Private;}
  delegate IntPtr Procedure(IntPtr h,uint m,UIntPtr w,IntPtr l);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct WindowClass {public uint Style;public Procedure Proc;public int ClassExtra,WindowExtra;public IntPtr Instance,Icon,Cursor,Background;public string Menu,Name;}
  [StructLayout(LayoutKind.Sequential)] struct Accent {public int State,Flags;public uint Color;public int Animation;}
  [StructLayout(LayoutKind.Sequential)] struct Composition {public int Attribute;public IntPtr Data;public IntPtr Size;}
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClass(ref WindowClass c);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string c,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
  [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr h,uint m,UIntPtr w,IntPtr l);
  [DllImport("user32.dll")] static extern bool PeekMessage(out Message msg,IntPtr h,uint min,uint max,uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message msg);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
  [DllImport("user32.dll")] static extern bool SetWindowCompositionAttribute(IntPtr h,ref Composition data);
  [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr h,uint affinity);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr h,IntPtr region,bool redraw);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int left,int top,int right,int bottom,int width,int height);
  [DllImport("gdi32.dll")] static extern int CombineRgn(IntPtr result,IntPtr a,IntPtr b,int mode);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static readonly object Gate=new object();
  static Dictionary<string,object> Pending;
  static readonly AutoResetEvent Wake=new AutoResetEvent(false);
  static readonly Procedure Proc=WindowProc;
  static Thread Worker;
  static IntPtr Window;
  static IntPtr Target;
  static ClippedBackdrop Clipped;
  static bool Visible;
  static string Status="";
  static IntPtr WindowProc(IntPtr h,uint m,UIntPtr w,IntPtr l){if(m==0x14)return new IntPtr(1);if(m==0x84)return new IntPtr(-1);if(m==0x21)return new IntPtr(3);return DefWindowProc(h,m,w,l);}
  internal static void Queue(Dictionary<string,object> value){lock(Gate){if(Worker==null&&Convert.ToDouble(value["intensity"])<=0)return;Pending=value;if(Worker==null){Worker=new Thread(Run);Worker.IsBackground=true;Worker.SetApartmentState(ApartmentState.STA);Worker.Start();}}Wake.Set();}
  static void Report(string status){if(status==Status)return;Status=status;IslandBridge.Emit(new {type="backdrop",status=status});}
  static double Number(Dictionary<string,object> v,string key){double n=Convert.ToDouble(v[key]);if(Double.IsNaN(n)||Double.IsInfinity(n))throw new ArgumentException();return n;}
  static IntPtr InputRegion(Dictionary<string,object> value,double scale){double x=Number(value,"x")*scale,y=Number(value,"y")*scale,w=Number(value,"width")*scale,h=Number(value,"height")*scale,r=Math.Min(Number(value,"radius")*scale,Math.Min(w,h)/2);if(w<0||h<0||w>10000||h>10000||r<0)throw new ArgumentException();var region=CreateRoundRectRgn((int)Math.Floor(x),(int)Math.Floor(y),(int)Math.Ceiling(x+w),(int)Math.Ceiling(y+h),(int)Math.Round(r*2),(int)Math.Round(r*2));if(region==IntPtr.Zero)throw new InvalidOperationException();return region;}
  static void ClipInput(List<Dictionary<string,object>> regions,double scale){IntPtr mask=InputRegion(regions[0],scale);try{for(int i=1;i<regions.Count;i++){var circle=InputRegion(regions[i],scale);try{if(CombineRgn(mask,mask,circle,2)==0)throw new InvalidOperationException();}finally{DeleteObject(circle);}}if(SetWindowRgn(Window,mask,true)==0)throw new InvalidOperationException();mask=IntPtr.Zero;}finally{if(mask!=IntPtr.Zero)DeleteObject(mask);}}
  static void Apply(Dictionary<string,object> value){
    double intensity=Number(value,"intensity");if(intensity<=0){if(Window!=IntPtr.Zero)ShowWindow(Window,0);Visible=false;return;}
    IntPtr target=new IntPtr(Int64.Parse(Convert.ToString(value["hwnd"])));uint pid;GetWindowThreadProcessId(target,out pid);
    if(!IslandBridge.IsIslandProcess(pid)||!IsWindowVisible(target)){if(Window!=IntPtr.Zero)ShowWindow(Window,0);Visible=false;return;}Target=target;
    Rect bounds;if(!GetWindowRect(target,out bounds))return;
    if(Window==IntPtr.Zero){var c=new WindowClass{Name="WindowsIslandBackdrop",Proc=Proc};RegisterClass(ref c);Window=CreateWindowEx(0x082000A8,c.Name,"Windows Island Backdrop",0x80000000,bounds.Left,bounds.Top,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(Window==IntPtr.Zero)throw new InvalidOperationException();
      var accent=new Accent{State=5};IntPtr memory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Accent)));try{Marshal.StructureToPtr(accent,memory,false);var data=new Composition{Attribute=19,Data=memory,Size=new IntPtr(Marshal.SizeOf(typeof(Accent)))};if(!SetWindowCompositionAttribute(Window,ref data))throw new InvalidOperationException();}finally{Marshal.FreeHGlobal(memory);}
      Clipped=new ClippedBackdrop(Window);
    }
    double scale=Number(value,"scale");if(scale<=0||scale>8)throw new ArgumentException();
    var regions=new List<Dictionary<string,object>>{(Dictionary<string,object>)value["region"]};foreach(var item in (IEnumerable)value["satellites"])regions.Add((Dictionary<string,object>)item);
    Clipped.Update(regions,scale,intensity,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top);
    // No input, no taskbar, excluded from recordings just like the Island surface.
    SetWindowDisplayAffinity(Window,Convert.ToBoolean(value["protected"])?0x11u:0u);
    
    SetWindowPos(Window,target,bounds.Left,bounds.Top,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top,0x0010|0x0040);
    // HTTRANSPARENT only forwards within one thread. Exclude empty space from
    // the actual HWND region so Windows routes clicks to other processes.
    ClipInput(regions,scale);
    Visible=true;
    Report("ready");
  }
  static void DisposeClipped(){if(Clipped==null)return;var old=Clipped;Clipped=null;old.Dispose();var deadline=DateTime.UtcNow.AddMilliseconds(250);while(old.Shutdown!=null&&!old.Shutdown.IsCompleted&&DateTime.UtcNow<deadline){Message message;while(PeekMessage(out message,IntPtr.Zero,0,0,1)){TranslateMessage(ref message);DispatchMessage(ref message);}Thread.Sleep(1);}}
  static void Run(){IntPtr awareness=IntPtr.Zero;try{awareness=SetThreadDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){}try{while(IslandBridge.IsRunning){Dictionary<string,object> value;lock(Gate){value=Pending;Pending=null;}if(value!=null){try{Apply(value);}catch{if(Window!=IntPtr.Zero){DisposeClipped();DestroyWindow(Window);Window=IntPtr.Zero;}Visible=false;Report("unavailable");}}if(Visible&&!IsWindowVisible(Target)){ShowWindow(Window,0);Visible=false;}Message msg;while(PeekMessage(out msg,IntPtr.Zero,0,0,1)){TranslateMessage(ref msg);DispatchMessage(ref msg);}Wake.WaitOne(Visible?16:250);}}finally{if(Window!=IntPtr.Zero){DisposeClipped();DestroyWindow(Window);Window=IntPtr.Zero;}if(awareness!=IntPtr.Zero)SetThreadDpiAwarenessContext(awareness);}}
  internal static void Stop(){Wake.Set();if(Worker!=null)Worker.Join(300);}
}
