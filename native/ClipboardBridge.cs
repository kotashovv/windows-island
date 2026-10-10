using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

// Observe only sequence numbers and format flags. Never open or read clipboard data.
class ClipboardBridge {
  [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint format);
  [DllImport("user32.dll")] static extern IntPtr GetClipboardOwner();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  internal static volatile bool Enabled;
  static volatile bool Observing; static uint Sequence; static int Stable;
  internal static void Baseline(){Observing=false;}
  internal static void Configure(bool enabled){if(enabled!=Enabled)Baseline();Enabled=enabled;}
  internal static bool Changed(uint next){
    if(!Observing){Sequence=next;Stable=0;Observing=true;return false;}
    if(next!=Sequence){Sequence=next;Stable=2;return false;}
    return Stable!=0&&--Stable==0;
  }
  internal static string Classify(bool files,bool image,bool text,string owner){
    if(files)return "";
    if(image)return owner.Equals("SnippingTool",StringComparison.OrdinalIgnoreCase)||owner.Equals("ScreenClippingHost",StringComparison.OrdinalIgnoreCase)||owner.Equals("ScreenSketch",StringComparison.OrdinalIgnoreCase)?"clipboard-screenshot":"clipboard-image";
    return text?"clipboard-text":"";
  }
  internal static void Poll(){
    if(!Enabled){Observing=false;return;}
    if(!Changed(GetClipboardSequenceNumber()))return;
    uint pid;GetWindowThreadProcessId(GetClipboardOwner(),out pid);string owner="";
    if(IslandBridge.IsIslandProcess(pid))return;
    try{using(var process=Process.GetProcessById((int)pid))owner=process.ProcessName;}catch{}
    string kind=Classify(IsClipboardFormatAvailable(15),IsClipboardFormatAvailable(2)||IsClipboardFormatAvailable(8)||IsClipboardFormatAvailable(17),IsClipboardFormatAvailable(13)||IsClipboardFormatAvailable(1),owner);
    if(kind!="")IslandBridge.Emit(new {type="clipboard",kind=kind});
  }
}
