using System;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;
using System.Collections.Generic;

// WinRT projection through reflection keeps the bridge compatible with the Windows .NET Framework compiler.
static class MediaBridge {
  internal static volatile bool Enabled=false;
  static readonly ConcurrentQueue<Dictionary<string,object>> Commands=new ConcurrentQueue<Dictionary<string,object>>();
  static Type ManagerType,PropertiesType;
  static MethodInfo AsTask;
  static object Manager;
  static string Last="";
  static object Await(object operation,Type resultType){
    var task=(Task)AsTask.MakeGenericMethod(resultType).Invoke(null,new object[]{operation});
    if(!task.Wait(4000))throw new Exception("The media player did not respond");
    return task.GetType().GetProperty("Result").GetValue(task,null);
  }
  static object Call(object value,string name){return value.GetType().GetMethod(name).Invoke(value,null);}
  static object Get(object value,string name){return value.GetType().GetProperty(name).GetValue(value,null);}
  static string Text(object value,string name){return Convert.ToString(Get(value,name));}
  static void Init(){
    ManagerType=Type.GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime",true);
    PropertiesType=Type.GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime",true);
    foreach(var method in typeof(System.WindowsRuntimeSystemExtensions).GetMethods())if(method.Name=="AsTask"&&method.IsGenericMethod&&method.GetParameters().Length==1&&method.GetParameters()[0].ParameterType.Name=="IAsyncOperation`1"){AsTask=method;break;}
    Manager=Await(ManagerType.GetMethod("RequestAsync").Invoke(null,null),ManagerType);
  }
  internal static void Queue(Dictionary<string,object> command){Commands.Enqueue(command);}
  static void Snapshot(){
    object media=null;var session=Call(Manager,"GetCurrentSession");
    if(session!=null){var playback=Call(session,"GetPlaybackInfo");string status=Text(playback,"PlaybackStatus");
      if(status!="Closed"&&status!="Stopped"){
        var properties=Await(Call(session,"TryGetMediaPropertiesAsync"),PropertiesType);var controls=Get(playback,"Controls");string source=Text(session,"SourceAppUserModelId");
        string sourceName=source.Split('!')[0].Split('_')[0];if(sourceName.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))sourceName=sourceName.Substring(0,sourceName.Length-4);if(sourceName=="MSEdge")sourceName="Microsoft Edge";
        media=new {sourceId=source,sourceName=sourceName,title=Text(properties,"Title"),artist=Text(properties,"Artist"),playing=status=="Playing",canToggle=Get(controls,"IsPlayPauseToggleEnabled"),canNext=Get(controls,"IsNextEnabled"),canPrevious=Get(controls,"IsPreviousEnabled")};
      }
    }
    Publish(new {type="media",available=true,session=media});
  }
  static void Publish(object value){string json=IslandBridge.Serialize(value);if(json!=Last){Last=json;IslandBridge.Emit(value);}}
  internal static void Run(){
    var next=DateTime.MinValue;bool previouslyEnabled=false;
    while(IslandBridge.IsRunning){
      if(!Enabled){Dictionary<string,object> disabledCommand;while(Commands.TryDequeue(out disabledCommand))IslandBridge.Emit(new {type="media-result",id=disabledCommand["id"],ok=false,error="Music controls are disabled"});if(previouslyEnabled){Manager=null;Publish(new {type="media",available=false,session=(object)null});previouslyEnabled=false;}Thread.Sleep(500);continue;}
      previouslyEnabled=true;
      try{
        if(Manager==null)Init();Dictionary<string,object> command;
        while(Commands.TryDequeue(out command)){
          try{var session=Call(Manager,"GetCurrentSession");if(session==null||Text(session,"SourceAppUserModelId")!=Convert.ToString(command["sourceId"]))throw new Exception("The audio source changed");
            string action=Convert.ToString(command["action"]),method=action=="toggle"?"TryTogglePlayPauseAsync":action=="next"?"TrySkipNextAsync":action=="previous"?"TrySkipPreviousAsync":null;if(method==null)throw new Exception("Unsupported media command");
            bool ok=Convert.ToBoolean(Await(Call(session,method),typeof(bool)));IslandBridge.Emit(new {type="media-result",id=command["id"],ok=ok,error=ok?"":"The player does not support this action"});
          }catch(Exception error){IslandBridge.Emit(new {type="media-result",id=command["id"],ok=false,error=error.GetBaseException().Message});}
          next=DateTime.MinValue;
        }
        if(DateTime.UtcNow>=next){Snapshot();next=DateTime.UtcNow.AddSeconds(2);}
      }catch{Manager=null;Publish(new {type="media",available=false,session=(object)null});Thread.Sleep(2000);}
      Thread.Sleep(100);
    }
  }
}
