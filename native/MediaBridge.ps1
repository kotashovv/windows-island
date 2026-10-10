param([int]$ParentPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading;
public static class IslandMediaInput {
    static readonly ConcurrentQueue<string> Lines = new ConcurrentQueue<string>();
    public static void Start() { var thread = new Thread(() => { string line; while ((line = Console.ReadLine()) != null) Lines.Enqueue(line); Lines.Enqueue("{\"type\":\"shutdown\"}"); }); thread.IsBackground = true; thread.Start(); }
    public static string Read() { string line; return Lines.TryDequeue(out line) ? line : null; }
}
'@
function Emit($Value) { [Console]::WriteLine(($Value | ConvertTo-Json -Depth 6 -Compress)); [Console]::Out.Flush() }
try {
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
    $propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    function Await($Operation, [Type]$ResultType) {
        $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        if (-not $task.Wait(4000)) { throw 'Медиаплеер не ответил вовремя' }
        return $task.Result
    }
    $manager = Await ($managerType::RequestAsync()) $managerType
    [IslandMediaInput]::Start()
    $lastSnapshot = ''; $nextPoll = [DateTime]::MinValue; $running = $true
    while ($running) {
        try { $null = [Diagnostics.Process]::GetProcessById($ParentPid) } catch { break }
        while ($null -ne ($line = [IslandMediaInput]::Read())) {
            $command = $line | ConvertFrom-Json
            if ($command.type -eq 'shutdown') { $running = $false; break }
            if ($command.type -eq 'media-control') {
                try {
                    $session = $manager.GetCurrentSession()
                    if ($null -eq $session -or $session.SourceAppUserModelId -ne $command.sourceId) { throw 'Источник музыки изменился' }
                    switch ($command.action) {
                        'toggle' { $ok = Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
                        'next' { $ok = Await ($session.TrySkipNextAsync()) ([bool]) }
                        'previous' { $ok = Await ($session.TrySkipPreviousAsync()) ([bool]) }
                        default { throw 'Неизвестная команда плеера' }
                    }
                    Emit @{type='media-result';id=$command.id;ok=$ok;error=$(if ($ok) { '' } else { 'Плеер не поддерживает эту команду' })}
                } catch { Emit @{type='media-result';id=$command.id;ok=$false;error=$_.Exception.Message} }
                $nextPoll = [DateTime]::MinValue
            }
        }
        if (-not $running) { break }
        if ([DateTime]::UtcNow -ge $nextPoll) {
            try {
                $session = $manager.GetCurrentSession()
                $media = $null
                if ($null -ne $session) {
                    $playback = $session.GetPlaybackInfo()
                    if ([string]$playback.PlaybackStatus -notin @('Closed','Stopped')) {
                        $properties = Await ($session.TryGetMediaPropertiesAsync()) $propertiesType
                        $sourceId = $session.SourceAppUserModelId
                        $sourceName = ($sourceId -split '!')[0] -replace '_.*$','' -replace '\.exe$',''
                        if ($sourceId -eq 'Chrome') { $sourceName = 'Chrome' }
                        if ($sourceId -eq 'MSEdge') { $sourceName = 'Microsoft Edge' }
                        if ($sourceId -match 'spotify') { $sourceName = 'Spotify' }
                        $media = @{sourceId=$sourceId;sourceName=$sourceName;title=$properties.Title;artist=$properties.Artist;playing=([string]$playback.PlaybackStatus -eq 'Playing');canToggle=$playback.Controls.IsPlayPauseToggleEnabled;canNext=$playback.Controls.IsNextEnabled;canPrevious=$playback.Controls.IsPreviousEnabled}
                    }
                }
                $snapshot = @{type='media';available=$true;session=$media} | ConvertTo-Json -Depth 6 -Compress
            } catch { $snapshot = @{type='media';available=$false;session=$null;error='Системная медиасессия недоступна'} | ConvertTo-Json -Compress }
            if ($snapshot -ne $lastSnapshot) { [Console]::WriteLine($snapshot); [Console]::Out.Flush(); $lastSnapshot = $snapshot }
            $nextPoll = [DateTime]::UtcNow.AddSeconds(2)
        }
        Start-Sleep -Milliseconds 100
    }
} catch { Emit @{type='media';available=$false;session=$null;error='Системное управление музыкой недоступно'} }
