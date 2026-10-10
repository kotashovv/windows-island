$ErrorActionPreference='Stop'
$taskAssembly=(Resolve-Path 'native/bin/IslandBridge.exe').Path
$taskCode=@'
using System;
using System.Reflection;
public static class ClipboardFixture {
 public static void Run(string path){
  Type type=Assembly.LoadFrom(path).GetType("ClipboardBridge");BindingFlags flags=BindingFlags.Static|BindingFlags.NonPublic;
  var classify=type.GetMethod("Classify",flags);var changed=type.GetMethod("Changed",flags);var baseline=type.GetMethod("Baseline",flags);
  if((string)classify.Invoke(null,new object[]{true,true,true,"SnippingTool"})!="")throw new Exception("File copies must be ignored");
  if((string)classify.Invoke(null,new object[]{false,true,true,"SnippingTool"})!="clipboard-screenshot")throw new Exception("Screenshot format must win over text");
  if((string)classify.Invoke(null,new object[]{false,true,false,"Chrome"})!="clipboard-image")throw new Exception("Do not mislabel arbitrary images");
  if((string)classify.Invoke(null,new object[]{false,false,true,"Chrome"})!="clipboard-text")throw new Exception("Text format detection");
  if((string)classify.Invoke(null,new object[]{false,false,false,"Chrome"})!="")throw new Exception("Ignore unsupported formats");
  baseline.Invoke(null,null);uint[] sequence={10,10,11,12,12,12,12};bool[] expected={false,false,false,false,false,true,false};
  for(int i=0;i<sequence.Length;i++)if((bool)changed.Invoke(null,new object[]{sequence[i]})!=expected[i])throw new Exception("Debounced delivery once per clipboard sequence");
  baseline.Invoke(null,null);if((bool)changed.Invoke(null,new object[]{20u}))throw new Exception("Re-enable must establish a silent baseline");
 }
}
'@
Add-Type -TypeDefinition $taskCode
[ClipboardFixture]::Run($taskAssembly)
Write-Output 'PASS: clipboard format classification, file exclusion, silent baseline, debounce and no duplicate delivery; clipboard contents untouched.'
