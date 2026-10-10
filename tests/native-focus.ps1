$ErrorActionPreference = 'Stop'
$assembly = [Reflection.Assembly]::LoadFile((Join-Path $PSScriptRoot '../native/bin/IslandBridge.exe'))
$bridgeType = $assembly.GetType('IslandBridge')
$flags = [Reflection.BindingFlags]'NonPublic,Static'
$match = $bridgeType.GetMethod('IsCodexDesktopPath', $flags)
$cases = @(
    @{ Path = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.930.7945.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe'; Expected = $true },
    @{ Path = 'c:/program files/windowsapps/openai.codex_1.0.0_x64__test/app/ChatGPT.exe'; Expected = $true },
    @{ Path = 'C:\Program Files\WindowsApps\OpenAI.ChatGPT_1.0.0_x64__test\app\ChatGPT.exe'; Expected = $false },
    @{ Path = 'C:\Users\user\AppData\Local\OpenAI\Codex\bin\codex.exe'; Expected = $false },
    @{ Path = 'C:\OtherOpenAI.Codex_1.0\ChatGPT.exe'; Expected = $false },
    @{ Path = ''; Expected = $false }
)
foreach ($case in $cases) {
    if ($match.Invoke($null, @($case.Path)) -ne $case.Expected) { throw 'Codex package identity matching failed' }
}
Write-Output 'PASS: Codex package matching excludes regular ChatGPT and CLI paths.'
$process = $bridgeType.GetMethod('FindApp', $flags).Invoke($null, @('codex'))
if ($null -eq $process) {
    Write-Output 'SKIP: live focus check requires a running Codex Desktop window.'
} else {
    try {
        if (-not $bridgeType.GetMethod('FocusApp', $flags).Invoke($null, @('codex'))) { throw 'Codex Desktop focus failed' }
        if ($bridgeType.GetMethod('GetForegroundWindow', $flags).Invoke($null, @()) -ne $process.MainWindowHandle) { throw 'Wrong foreground window' }
        Write-Output 'PASS: the real Codex Desktop window is foreground after focus.'
    } finally { $process.Dispose() }
}
