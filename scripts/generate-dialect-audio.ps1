param(
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$InputFile = (Join-Path $PSScriptRoot '../evals/dialect-holdout-20260904.jsonl')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Use a new output directory; existing audio is never overwritten.' }
New-Item -ItemType Directory -Path $output | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1
if (-not $voice) { throw 'No installed Korean System.Speech voice.' }
$speaker.SelectVoice($voice.VoiceInfo.Name)
$source = $InputFile
$manifest = @()
try {
  foreach ($line in (Get-Content -LiteralPath $source -Encoding UTF8)) {
    $case = $line | ConvertFrom-Json
    if ($case.id -eq 'holdout-08') { continue }
    $file = Join-Path $output ($case.id + '.wav')
    $speaker.Rate = if ($case.id -eq 'holdout-02') { 2 } else { 0 }
    $speaker.SetOutputToWaveFile($file)
    $speaker.Speak($case.transcript)
    $speaker.SetOutputToNull()
    $manifest += [pscustomobject]@{
      id = 'audio-' + $case.id
      dataset_version = 'dialect-synthetic-audio-20260904'
      file = $file
      transcript = $case.transcript
      kind = $case.kind
      expected = $case.expected
      synthetic = $true
      provider = 'Windows System.Speech'
      voice = $speaker.Voice.Name
      rate = $speaker.Rate
      sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
} finally { $speaker.Dispose() }
$jsonl = ($manifest | ForEach-Object { ConvertTo-Json -InputObject $_ -Depth 10 -Compress }) -join "`n"
[IO.File]::WriteAllText((Join-Path $output 'manifest.jsonl'), $jsonl + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Output (Join-Path $output 'manifest.jsonl')
