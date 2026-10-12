using System;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Collections.Generic;

// Desktop Composition clips the sampled backdrop itself, unlike a window HRGN.
class ClippedBackdrop : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct QueueOptions {public int Size,Thread,Apartment;}
  [DllImport("coremessaging.dll")] static extern int CreateDispatcherQueueController(QueueOptions options,[MarshalAs(UnmanagedType.IUnknown)]out object controller);
  [ComImport,Guid("29E691FA-4567-4DCA-B319-D0F207EB6807"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface DesktopInterop {void CreateDesktopWindowTarget(IntPtr hwnd,bool topmost,out IntPtr target);}
  object queue,compositor,root,brush,targetObject;
  class Shape {public object Visual,Geometry,Clip;}
  readonly List<Shape> shapes=new List<Shape>();
  static object Call(object value,string name,params object[] args){foreach(var method in value.GetType().GetMethods())if(method.Name==name&&method.GetParameters().Length==args.Length)return method.Invoke(value,args);throw new MissingMethodException(name);}
  static object Get(object value,string name){return value.GetType().GetProperty(name).GetValue(value,null);}
  static void Set(object value,string name,object data){value.GetType().GetProperty(name).SetValue(value,data,null);}
  static void Vector(object value,string name,params float[] components){var type=value.GetType().GetProperty(name).PropertyType;object[] args=new object[components.Length];for(int i=0;i<args.Length;i++)args[i]=components[i];Set(value,name,Activator.CreateInstance(type,args));}
  public ClippedBackdrop(IntPtr hwnd){
    int hr=CreateDispatcherQueueController(new QueueOptions{Size=12,Thread=2,Apartment=2},out queue);Marshal.ThrowExceptionForHR(hr);
    var type=Type.GetType("Windows.UI.Composition.Compositor, Windows.UI.Composition, ContentType=WindowsRuntime",true);compositor=Activator.CreateInstance(type);
    IntPtr raw;((DesktopInterop)compositor).CreateDesktopWindowTarget(hwnd,true,out raw);try{targetObject=Marshal.GetObjectForIUnknown(raw);}finally{Marshal.Release(raw);}
    root=Call(compositor,"CreateContainerVisual");brush=Call(compositor,"CreateHostBackdropBrush");Set(targetObject,"Root",root);
  }
  public void Update(List<Dictionary<string,object>> regions,double scale,double intensity,int width,int height){
    Vector(root,"Size",(float)width,(float)height);var children=Get(root,"Children");
    while(shapes.Count<regions.Count){var shape=new Shape{Visual=Call(compositor,"CreateSpriteVisual"),Geometry=Call(compositor,"CreateRoundedRectangleGeometry")};shape.Clip=Call(compositor,"CreateGeometricClip",shape.Geometry);Vector(shape.Clip,"Scale",1,1);Set(shape.Visual,"Clip",shape.Clip);Set(shape.Visual,"Brush",brush);Call(children,"InsertAtTop",shape.Visual);shapes.Add(shape);}
    for(int i=0;i<shapes.Count;i++){var shape=shapes[i];Set(shape.Visual,"Opacity",i<regions.Count?(float)Math.Min(1,intensity):0f);if(i>=regions.Count)continue;var r=regions[i];float x=(float)(Convert.ToDouble(r["x"])*scale),y=(float)(Convert.ToDouble(r["y"])*scale),w=(float)(Convert.ToDouble(r["width"])*scale),h=(float)(Convert.ToDouble(r["height"])*scale),radius=(float)Math.Min(Convert.ToDouble(r["radius"])*scale,Math.Min(w,h)/2);Vector(shape.Visual,"Offset",x,y,0);Vector(shape.Visual,"Size",w,h);Vector(shape.Geometry,"Size",w,h);Vector(shape.Geometry,"CornerRadius",radius,radius);}
  }
  static void Close(object value){var disposable=value as IDisposable;if(disposable!=null)disposable.Dispose();}
  internal Task Shutdown;
  public void Dispose(){if(targetObject!=null){Set(targetObject,"Root",null);Close(targetObject);targetObject=null;}foreach(var shape in shapes){Close(shape.Visual);Close(shape.Clip);Close(shape.Geometry);}shapes.Clear();Close(brush);Close(root);Close(compositor);brush=root=compositor=null;
    if(queue!=null){try{var action=Call(queue,"ShutdownQueueAsync");foreach(var method in typeof(System.WindowsRuntimeSystemExtensions).GetMethods())if(method.Name=="AsTask"&&!method.IsGenericMethod&&method.GetParameters().Length==1&&method.GetParameters()[0].ParameterType.Name=="IAsyncAction"){Shutdown=(Task)method.Invoke(null,new object[]{action});break;}}catch{}queue=null;}
  }
}
