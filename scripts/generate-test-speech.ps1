# Windows PowerShell 5.1 + an installed Japanese voice. No microphone or cloud TTS.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object Language -eq 'ja-JP' | Select-Object -First 1
if (-not $voice) { throw 'Install a Japanese Windows speech voice before running this optional test.' }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $voice
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$speechTask = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$destination = Join-Path (Split-Path $PSScriptRoot -Parent) 'output/fixtures'
$null = New-Item -ItemType Directory -Path $destination -Force
# Unicode is stored as JSON so Windows PowerShell can read UTF-8 without a BOM.
$phrases = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'test-speech.json') -Raw -Encoding UTF8 | ConvertFrom-Json
try {
  foreach ($phrase in $phrases) {
    $operation = $synth.SynthesizeTextToStreamAsync($phrase.text)
    $task = $speechTask.Invoke($null, @($operation))
    $stream = $task.GetAwaiter().GetResult()
    $inputStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $outputStream = [System.IO.File]::Create((Join-Path $destination ($phrase.id + '.wav')))
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose(); $stream.Dispose() }
    Write-Output ('Generated ' + $phrase.id + '.wav')
  }
} finally { $synth.Dispose() }
