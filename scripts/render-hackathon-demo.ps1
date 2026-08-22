[CmdletBinding()]
param(
  [string]$Voice = "Microsoft Zira",
  [ValidateRange(-10, 10)]
  [int]$SpeechRate = 1,
  [switch]$KeepIntermediateAudio
)

$ErrorActionPreference = "Stop"
$invariantCulture = [System.Globalization.CultureInfo]::InvariantCulture
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$artifactDirectory = Join-Path $repositoryRoot "artifacts/demo"
$sourceVideo = Join-Path $artifactDirectory "kevlar-full-platform-v1.0.1.webm"
$submissionDocument = Join-Path $repositoryRoot "docs/HACKATHON_SUBMISSION.md"
$captionPath = Join-Path $artifactDirectory "kevlar-hackathon-submission-v1.0.1.en.srt"
$outputVideo = Join-Path $artifactDirectory "kevlar-hackathon-submission-v1.0.1.mp4"

foreach ($requiredPath in @($sourceVideo, $submissionDocument)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required input is missing: $requiredPath"
  }
}

$ffmpeg = Get-Command ffmpeg -ErrorAction Stop
$ffprobe = Get-Command ffprobe -ErrorAction Stop

function ConvertFrom-DemoClock {
  param([Parameter(Mandatory)][string]$Value)

  $parts = $Value.Trim().Split(":")
  if ($parts.Count -ne 2) {
    throw "Unsupported demo time '$Value'. Expected MM:SS or MM:SS.ff."
  }

  $minutes = [int]::Parse($parts[0], $invariantCulture)
  $seconds = [double]::Parse($parts[1], $invariantCulture)
  return $minutes * 60 + $seconds
}

function ConvertTo-SrtClock {
  param([Parameter(Mandatory)][double]$Seconds)

  $span = [TimeSpan]::FromSeconds($Seconds)
  $hours = [math]::Floor($span.TotalHours)
  return "{0:00}:{1:00}:{2:00},{3:000}" -f $hours, $span.Minutes, $span.Seconds, $span.Milliseconds
}

function Get-MediaDuration {
  param([Parameter(Mandatory)][string]$Path)

  $value = & $ffprobe.Source -v error -show_entries format=duration -of "default=noprint_wrappers=1:nokey=1" $Path
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
    throw "Unable to read media duration: $Path"
  }

  return [double]::Parse(($value | Select-Object -First 1).Trim(), $invariantCulture)
}

$segments = @()
foreach ($line in Get-Content -LiteralPath $submissionDocument -Encoding UTF8) {
  if ($line -notmatch '^\|\s*00:\d{2}') {
    continue
  }

  $body = ($line.Trim() -replace '^\|', '' -replace '\|$', '')
  $columns = @($body -split '\|' | ForEach-Object { $_.Trim() })
  if ($columns.Count -ne 3) {
    continue
  }

  $bounds = @($columns[0] -split '\s*(?:\u2013|-)\s*')
  if ($bounds.Count -ne 2) {
    throw "Unable to parse narration range '$($columns[0])'."
  }

  $text = $columns[2].Trim([char[]]@([char]0x201c, [char]0x201d, [char]0x22))
  $segments += [pscustomobject]@{
    Start = ConvertFrom-DemoClock $bounds[0]
    End = ConvertFrom-DemoClock $bounds[1]
    Screen = $columns[1]
    Text = $text
  }
}

if ($segments.Count -ne 10) {
  throw "Expected 10 narration rows in docs/HACKATHON_SUBMISSION.md; found $($segments.Count)."
}

$sourceDuration = Get-MediaDuration $sourceVideo
$previousEnd = 0.0
foreach ($segment in $segments) {
  if ($segment.Start -lt $previousEnd -or $segment.End -le $segment.Start) {
    throw "Narration ranges overlap or are invalid around '$($segment.Screen)'."
  }
  if ($segment.End -gt $sourceDuration + 0.1) {
    throw "Narration for '$($segment.Screen)' extends beyond the source video."
  }
  $previousEnd = $segment.End
}

$srtLines = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt $segments.Count; $index += 1) {
  $segment = $segments[$index]
  $srtLines.Add([string]($index + 1))
  $srtLines.Add("$(ConvertTo-SrtClock $segment.Start) --> $(ConvertTo-SrtClock $segment.End)")
  $srtLines.Add($segment.Text)
  $srtLines.Add("")
}
$srtLines.RemoveAt($srtLines.Count - 1)
[System.IO.File]::WriteAllLines($captionPath, $srtLines, [System.Text.UTF8Encoding]::new($false))

Add-Type -AssemblyName System.Speech
$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$intermediateFiles = [System.Collections.Generic.List[string]]::new()
$selectedVoice = $null
try {
  $installedVoices = @($synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
  if ($installedVoices -contains $Voice) {
    $synthesizer.SelectVoice($Voice)
  }
  else {
    $fallbackVoice = $synthesizer.GetInstalledVoices() |
      Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq "en-US" } |
      Select-Object -First 1
    if (-not $fallbackVoice) {
      throw "No enabled en-US System.Speech voice is installed."
    }
    $synthesizer.SelectVoice($fallbackVoice.VoiceInfo.Name)
  }

  $synthesizer.Rate = $SpeechRate
  $synthesizer.Volume = 100
  $selectedVoice = $synthesizer.Voice.Name
  Write-Host "Narrator: $selectedVoice, rate $SpeechRate"

  for ($index = 0; $index -lt $segments.Count; $index += 1) {
    $segmentPath = Join-Path $artifactDirectory (".kevlar-hackathon-segment-{0:D2}.wav" -f ($index + 1))
    if (Test-Path -LiteralPath $segmentPath) {
      Remove-Item -LiteralPath $segmentPath -Force
    }
    $synthesizer.SetOutputToWaveFile($segmentPath)
    $synthesizer.Speak($segments[$index].Text)
    $synthesizer.SetOutputToNull()
    $intermediateFiles.Add($segmentPath)
  }
}
finally {
  $synthesizer.Dispose()
}

$audioFilters = [System.Collections.Generic.List[string]]::new()
$mixedLabels = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt $segments.Count; $index += 1) {
  $inputIndex = $index + 1
  $segment = $segments[$index]
  $segmentDuration = Get-MediaDuration $intermediateFiles[$index]
  $availableDuration = [math]::Max(0.25, ($segment.End - $segment.Start) - 0.12)
  $speed = [math]::Max(1.0, $segmentDuration / $availableDuration)
  $speedText = $speed.ToString("0.######", $invariantCulture)
  $availableText = $availableDuration.ToString("0.###", $invariantCulture)
  $delayMilliseconds = [int][math]::Round(($segment.Start + 0.05) * 1000)
  $label = "n$index"
  $speedFilter = if ($speed -gt 1.001) { ",atempo=$speedText" } else { "" }
  $audioFilters.Add("[$inputIndex`:a]atrim=duration=$availableText,asetpts=PTS-STARTPTS$speedFilter,atrim=duration=$availableText,aresample=48000,adelay=$delayMilliseconds`:all=1[$label]")
  $mixedLabels.Add("[$label]")
}
$audioFilters.Add("$($mixedLabels -join '')amix=inputs=$($segments.Count):duration=longest:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,apad=pad_dur=180[aout]")
$audioFilterGraph = $audioFilters -join ";"

$relativeCaptionPath = "artifacts/demo/kevlar-hackathon-submission-v1.0.1.en.srt"
$subtitleFilter = "subtitles=filename='$relativeCaptionPath':force_style='FontName=Arial,FontSize=19,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,BackColour=&H80000000,Outline=1,Shadow=0,MarginV=26,Alignment=2'"
$durationText = $sourceDuration.ToString("0.###", $invariantCulture)

$ffmpegArguments = [System.Collections.Generic.List[string]]::new()
foreach ($argument in @("-y", "-hide_banner", "-loglevel", "warning", "-i", $sourceVideo)) {
  $ffmpegArguments.Add($argument)
}
foreach ($intermediateFile in $intermediateFiles) {
  $ffmpegArguments.Add("-i")
  $ffmpegArguments.Add($intermediateFile)
}
foreach ($argument in @(
    "-filter_complex", $audioFilterGraph,
    "-vf", $subtitleFilter,
    "-map", "0:v:0",
    "-map", "[aout]",
    "-t", $durationText,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-r", "25",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    "-metadata", "title=Kevlar - verified live-web intelligence",
    "-metadata", "comment=Into the Scrape-Verse submission demo; controlled benchmark claims only",
    $outputVideo
  )) {
  $ffmpegArguments.Add($argument)
}

Push-Location $repositoryRoot
try {
  & $ffmpeg.Source @ffmpegArguments
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

$probeJson = & $ffprobe.Source -v error -show_entries "format=duration,size:stream=index,codec_name,codec_type,width,height,sample_rate,channels" -of json $outputVideo
if ($LASTEXITCODE -ne 0) {
  throw "ffprobe could not validate the rendered MP4."
}
$probe = $probeJson | ConvertFrom-Json
$videoStream = $probe.streams | Where-Object { $_.codec_type -eq "video" } | Select-Object -First 1
$audioStream = $probe.streams | Where-Object { $_.codec_type -eq "audio" } | Select-Object -First 1
$outputDuration = [double]::Parse($probe.format.duration, $invariantCulture)

if (-not $videoStream -or $videoStream.codec_name -ne "h264") {
  throw "Expected an H.264 video stream."
}
if ($videoStream.width -ne 1440 -or $videoStream.height -ne 900) {
  throw "Expected 1440x900 output; received $($videoStream.width)x$($videoStream.height)."
}
if (-not $audioStream -or $audioStream.codec_name -ne "aac") {
  throw "Expected an AAC narration stream."
}
if ($outputDuration -gt 180.0 -or $outputDuration -lt 1.0) {
  throw "Rendered duration $outputDuration seconds violates the demo limit."
}

if (-not $KeepIntermediateAudio) {
  foreach ($intermediateFile in $intermediateFiles) {
    if (Test-Path -LiteralPath $intermediateFile) {
      Remove-Item -LiteralPath $intermediateFile -Force
    }
  }
}

$result = [ordered]@{
  output = "artifacts/demo/kevlar-hackathon-submission-v1.0.1.mp4"
  captions = "artifacts/demo/kevlar-hackathon-submission-v1.0.1.en.srt"
  duration_seconds = [math]::Round($outputDuration, 3)
  video_codec = $videoStream.codec_name
  audio_codec = $audioStream.codec_name
  resolution = "$($videoStream.width)x$($videoStream.height)"
  audio_sample_rate = [int]$audioStream.sample_rate
  audio_channels = [int]$audioStream.channels
  size_bytes = [int64]$probe.format.size
  sha256 = (Get-FileHash -LiteralPath $outputVideo -Algorithm SHA256).Hash.ToLowerInvariant()
  narrator = $selectedVoice
  speech_rate = $SpeechRate
}

$result | ConvertTo-Json
