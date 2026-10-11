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
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h,uint key,byte alpha,uint flags);
  [DllImport("user32.dll")] static extern bool SetWindowCompositionAttribute(IntPtr h,ref Composition data);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr h,IntPtr r,bool redraw);
  [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr h,uint affinity);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int l,int t,int r,int b,int w,int h);
  [DllImport("gdi32.dll")] static extern int CombineRgn(IntPtr dest,IntPtr a,IntPtr b,int mode);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  static readonly object Gate=new object();
  static Dictionary<string,object> Pending;
  static readonly AutoResetEvent Wake=new AutoResetEvent(false);
  static readonly Procedure Proc=WindowProc;
  static Thread Worker;
  static IntPtr Window;
  static IntPtr Target;
  static double LastIntensity=-1;
  static bool Visible;
  static string Status="";
  static IntPtr WindowProc(IntPtr h,uint m,UIntPtr w,IntPtr l){if(m==0x14)return new IntPtr(1);if(m==0x84)return new IntPtr(-1);if(m==0x21)return new IntPtr(3);return DefWindowProc(h,m,w,l);}
  internal static void Queue(Dictionary<string,object> value){lock(Gate){if(Worker==null&&Convert.ToDouble(value["intensity"])<=0)return;Pending=value;if(Worker==null){Worker=new Thread(Run);Worker.IsBackground=true;Worker.Start();}}Wake.Set();}
  static void Report(string status){if(status==Status)return;Status=status;IslandBridge.Emit(new {type="backdrop",status=status});}
  static double Number(Dictionary<string,object> v,string key){double n=Convert.ToDouble(v[key]);if(Double.IsNaN(n)||Double.IsInfinity(n))throw new ArgumentException();return n;}
  static IntPtr Region(Dictionary<string,object> v,double scale){double x=Number(v,"x")*scale,y=Number(v,"y")*scale,w=Number(v,"width")*scale,h=Number(v,"height")*scale,r=Math.Min(Number(v,"radius")*scale,Math.Min(w,h)/2);if(w<0||h<0||w>10000||h>10000||r<0)throw new ArgumentException();return CreateRoundRectRgn((int)Math.Round(x),(int)Math.Round(y),(int)Math.Round(x+w)+1,(int)Math.Round(y+h)+1,(int)Math.Round(r*2),(int)Math.Round(r*2));}
  static void Apply(Dictionary<string,object> value){
    double intensity=Number(value,"intensity");if(intensity<=0){if(Window!=IntPtr.Zero)ShowWindow(Window,0);Visible=false;return;}
    IntPtr target=new IntPtr(Int64.Parse(Convert.ToString(value["hwnd"])));uint pid;GetWindowThreadProcessId(target,out pid);
    if(!IslandBridge.IsIslandProcess(pid)||!IsWindowVisible(target)){if(Window!=IntPtr.Zero)ShowWindow(Window,0);Visible=false;return;}Target=target;
    Rect bounds;if(!GetWindowRect(target,out bounds))return;
    if(Window==IntPtr.Zero){var c=new WindowClass{Name="WindowsIslandBackdrop",Proc=Proc};RegisterClass(ref c);Window=CreateWindowEx(0x080800A8,c.Name,"Windows Island Backdrop",0x80000000,bounds.Left,bounds.Top,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(Window==IntPtr.Zero)throw new InvalidOperationException();
      var accent=new Accent{State=4,Flags=2,Color=0x01000000};IntPtr memory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Accent)));try{Marshal.StructureToPtr(accent,memory,false);var data=new Composition{Attribute=19,Data=memory,Size=new IntPtr(Marshal.SizeOf(typeof(Accent)))};if(!SetWindowCompositionAttribute(Window,ref data))throw new InvalidOperationException();}finally{Marshal.FreeHGlobal(memory);}
    }
    // Changing layered alpha resets the accent surface: restore the policy afterwards.
    if(LastIntensity!=intensity){if(!SetLayeredWindowAttributes(Window,0,(byte)Math.Round(Math.Min(1,intensity)*255),2))throw new InvalidOperationException();
      var policy=new Accent{State=4,Flags=2,Color=0x01000000};IntPtr ptr=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Accent)));try{Marshal.StructureToPtr(policy,ptr,false);var attrib=new Composition{Attribute=19,Data=ptr,Size=new IntPtr(Marshal.SizeOf(typeof(Accent)))};if(!SetWindowCompositionAttribute(Window,ref attrib))throw new InvalidOperationException();}finally{Marshal.FreeHGlobal(ptr);}LastIntensity=intensity;
    }
    double scale=Number(value,"scale");if(scale<=0||scale>8)throw new ArgumentException();
    var main=(Dictionary<string,object>)value["region"];IntPtr region=Region(main,scale);
    try{foreach(var item in (IEnumerable)value["satellites"]){IntPtr circle=Region((Dictionary<string,object>)item,scale);try{CombineRgn(region,region,circle,2);}finally{DeleteObject(circle);}}
      if(SetWindowRgn(Window,region,false)==0)throw new InvalidOperationException();region=IntPtr.Zero;
    }finally{if(region!=IntPtr.Zero)DeleteObject(region);}
    // No input, no taskbar, excluded from recordings just like the Island surface.
    SetWindowDisplayAffinity(Window,Convert.ToBoolean(value["protected"])?0x11u:0u);
    
    SetWindowPos(Window,target,bounds.Left,bounds.Top,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top,0x0010|0x0040);
    Visible=true;
    Report("ready");
  }
  static void Run(){IntPtr awareness=IntPtr.Zero;try{awareness=SetThreadDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){}try{while(IslandBridge.IsRunning){Dictionary<string,object> value;lock(Gate){value=Pending;Pending=null;}if(value!=null){try{Apply(value);}catch{if(Window!=IntPtr.Zero){DestroyWindow(Window);Window=IntPtr.Zero;}LastIntensity=-1;Visible=false;Report("unavailable");}}if(Visible&&!IsWindowVisible(Target)){ShowWindow(Window,0);Visible=false;}Message msg;while(PeekMessage(out msg,IntPtr.Zero,0,0,1)){TranslateMessage(ref msg);DispatchMessage(ref msg);}Wake.WaitOne(Visible?16:250);}}finally{if(Window!=IntPtr.Zero){DestroyWindow(Window);Window=IntPtr.Zero;}if(awareness!=IntPtr.Zero)SetThreadDpiAwarenessContext(awareness);}}
  internal static void Stop(){Wake.Set();if(Worker!=null)Worker.Join(300);}
}
