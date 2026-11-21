# Fetches Garmin Personal API data and writes data.json for the dashboard.
#
# Runs on GitHub Actions (PowerShell 7 on Linux) as well as locally on Windows.
# The API key is read from the GARMIN_PERSONAL_API_KEY environment variable, or
# from .env.local when running locally. Neither the key nor the 24h access token
# is ever printed or written to disk.
#
# Output is the slim shape the dashboard actually uses (see build-phone-data.ps1):
# no names, no profile, no GPS, no raw time series.

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 serializes arrays as {"value":[...],"Count":n} unless this type data is removed.
try { Remove-TypeData System.Array -ErrorAction Stop } catch {}
$root = Split-Path -Parent $PSScriptRoot
$base = 'https://personal.connectapi.garmin.com'

# --- Read the key -----------------------------------------------------------
$key = $env:GARMIN_PERSONAL_API_KEY
if (-not $key) {
  $envFile = Join-Path $root '.env.local'
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*GARMIN_PERSONAL_API_KEY\s*=' } | Select-Object -First 1
    if ($line) { $key = ($line -replace '^\s*GARMIN_PERSONAL_API_KEY\s*=', '').Trim().Trim('"').Trim("'") }
  }
}
if (-not $key) {
  Write-Host 'ERROR: GARMIN_PERSONAL_API_KEY is not set (environment variable or .env.local).'
  exit 1
}

# --- Exchange the key for a 24h access token --------------------------------
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post `
    -Uri "$base/personalapitoken-service/personal-api/personal-api-key/token" `
    -Headers @{ Authorization = "ApiKey $key" }
  $token = ([string]$resp.Content).Trim().Trim('"')
} catch {
  $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  Write-Host "ERROR: token request failed (HTTP $code). Check the GARMIN_PERSONAL_API_KEY secret."
  exit 1
}
if ($token.Split('.').Count -ne 3) { Write-Host 'ERROR: unexpected token format.'; exit 1 }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }
Write-Host 'Token OK.'

$errors = New-Object System.Collections.ArrayList

# Returns the parsed JSON for a path, or $null on failure (recorded in $errors).
# A network or server error is retried twice; a client error (4xx) will not go away, so it is not.
function Get-Json([string]$path) {
  $endpoint = ($path -split '\?')[0]
  for ($try = 1; $try -le 3; $try++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri ($base + $path) -Headers $headers -TimeoutSec 60
      $txt = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()).Trim()
      if (-not $txt) { return $null }
      return $txt | ConvertFrom-Json
    } catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($try -eq 3 -or ($code -ge 400 -and $code -lt 500 -and $code -ne 429)) {
        [void]$errors.Add("$endpoint (HTTP $code)")
        Write-Host "  warning: $endpoint failed (HTTP $code)"
        return $null
      }
      Start-Sleep -Seconds (5 * $try)
    }
  }
}

$today = Get-Date
$fmt = 'yyyy-MM-dd'
$inv = [Globalization.CultureInfo]::InvariantCulture

# PowerShell 7 turns some date-looking JSON strings into DateTime objects: these two helpers
# accept both and always give back the text form the dashboard expects.
function DateText($v, [string]$f) { if ($v -is [datetime]) { return $v.ToString($f, $inv) }; return $v }
function ToDate($v) { if ($v -is [datetime]) { return $v }; return [datetime]::Parse(([string]$v).Replace(' ', 'T'), $inv) }

# Previous data.json: its laps are reused, and its wellness days fill the gaps when a request fails.
$old = $null
$dataFile = Join-Path $root 'data.json'
if (Test-Path $dataFile) {
  try { $old = Get-Content $dataFile -Raw | ConvertFrom-Json } catch { Write-Host '(previous data.json unreadable, ignored)' }
}

# --- Activities: last 365 days, paged ---------------------------------------
Write-Host 'Activities...'
$actStart = $today.AddDays(-365).ToString($fmt)
$actEnd = $today.AddDays(1).ToString($fmt) # the runner is in UTC: one day of margin for local evening runs
$acts = New-Object System.Collections.ArrayList
$start = 0; $limit = 100
while ($true) {
  $page = Get-Json "/activitylist-service/activities/search/activities?start=$start&limit=$limit&startDate=$actStart&endDate=$actEnd"
  if ($null -eq $page) { break }
  $page = @($page)
  foreach ($a in $page) {
    if (-not $a) { continue }
    $row = [ordered]@{
      activityId           = $a.activityId
      activityName         = $a.activityName
      activityType         = @{ typeKey = $a.activityType.typeKey }
      startTimeLocal       = (DateText $a.startTimeLocal 'yyyy-MM-dd HH:mm:ss')
      distance             = $a.distance
      duration             = $a.duration
      averageHR            = $a.averageHR
      elevationGain        = $a.elevationGain
      activityTrainingLoad = $a.activityTrainingLoad
      trainingEffectLabel  = $a.trainingEffectLabel
      hrTimeInZone_1       = $a.hrTimeInZone_1
      hrTimeInZone_2       = $a.hrTimeInZone_2
      hrTimeInZone_3       = $a.hrTimeInZone_3
      hrTimeInZone_4       = $a.hrTimeInZone_4
      hrTimeInZone_5       = $a.hrTimeInZone_5
    }
    # Fastest splits (seconds) for the records card, only when Garmin gives them.
    foreach ($k in 'fastestSplit_1000', 'fastestSplit_5000', 'fastestSplit_10000', 'fastestSplit_21097', 'fastestSplit_21098', 'fastestSplit_42195') {
      if ($a.$k) { $row[$k] = $a.$k }
    }
    [void]$acts.Add($row)
  }
  if ($page.Count -lt $limit -or $start -ge 2000) { break }
  $start += $limit
}
# Never replace good data with an empty or partial list: if the activity list failed, stop here
# and keep the previous data.json. The next run will try again.
if ($errors.Count -gt 0 -or $acts.Count -eq 0) {
  Write-Host "ERROR: activity list unavailable ($($acts.Count) activities, $($errors.Count) error(s)). data.json left untouched."
  exit 1
}

# --- Laps: rebuilt from the per-second detail of each run -------------------
# The API has no lap endpoint, so laps are cut from the time series: a lap ends when the
# pace changes by more than 15 % for 30 s (start or end of a repetition) or after 1 km.
# Same shape as data/laps.js: [seconds, metres, avg HR, max HR, ascent in metres].
# Laps already present in the previous data.json are reused, so only new runs are fetched.
$LAPS_VERSION = 1
$LAPS_DAYS = 180
$BIN = 5          # seconds per bin
$AHEAD = 6        # bins looked ahead (30 s)

function Get-Laps([string]$id) {
  $d = Get-Json "/activity-service/activity/$id/details?maxChartSize=2000"
  if (-not $d -or -not $d.activityDetailMetrics) { return $null }
  $ix = @{}
  foreach ($m in $d.metricDescriptors) { $ix[[string]$m.key] = [int]$m.metricsIndex }
  if (-not ($ix.ContainsKey('sumDuration') -and $ix.ContainsKey('sumDistance'))) { return $null }
  $iT = $ix['sumDuration']; $iD = $ix['sumDistance']
  $iH = -1; if ($ix.ContainsKey('directHeartRate')) { $iH = $ix['directHeartRate'] }
  $iE = -1; if ($ix.ContainsKey('directElevation')) { $iE = $ix['directElevation'] }

  # Clean samples, strictly increasing in time
  $ts = New-Object 'System.Collections.Generic.List[double]'
  $ds = New-Object 'System.Collections.Generic.List[double]'
  $hs = New-Object 'System.Collections.Generic.List[double]'
  $es = New-Object 'System.Collections.Generic.List[double]'
  $lastH = 0.0; $lastE = 0.0; $lastT = -1.0; $lastD = 0.0
  foreach ($row in $d.activityDetailMetrics) {
    $m = $row.metrics
    if ($null -eq $m[$iT] -or $null -eq $m[$iD]) { continue }
    $t = [double]$m[$iT]; $dist = [double]$m[$iD]
    if ($t -le $lastT) { continue }
    if ($dist -lt $lastD) { $dist = $lastD }
    if ($iH -ge 0 -and $null -ne $m[$iH]) { $lastH = [double]$m[$iH] }
    if ($iE -ge 0 -and $null -ne $m[$iE]) { $lastE = [double]$m[$iE] }
    $ts.Add($t); $ds.Add($dist); $hs.Add($lastH); $es.Add($lastE)
    $lastT = $t; $lastD = $dist
  }
  if ($ts.Count -lt 10) { return $null }

  # Resample on a regular grid: cumulative distance (interpolated), HR and elevation (latest sample)
  $nb = [int][Math]::Floor($ts[$ts.Count - 1] / $BIN)
  if ($nb -lt 6) { return $null }
  $D = New-Object 'double[]' ($nb + 1); $H = New-Object 'double[]' ($nb + 1); $E = New-Object 'double[]' ($nb + 1)
  $j = 0
  for ($k = 0; $k -le $nb; $k++) {
    $t = $k * $BIN
    while ($j -lt $ts.Count - 2 -and $ts[$j + 1] -lt $t) { $j++ }
    $t0 = $ts[$j]; $t1 = $ts[$j + 1]
    if ($t -le $t0) { $D[$k] = $ds[$j] }
    elseif ($t -ge $t1) { $D[$k] = $ds[$j + 1] }
    else { $D[$k] = $ds[$j] + ($ds[$j + 1] - $ds[$j]) * ($t - $t0) / ($t1 - $t0) }
    $n = $j; if ($t -ge $t1) { $n = $j + 1 }
    $H[$k] = $hs[$n]; $E[$k] = $es[$n]
  }

  # Greedy segmentation
  $laps = New-Object System.Collections.ArrayList
  $start = 0
  $close = {
    param($a, $b)
    $lapT = ($b - $a) * $BIN; $lapD = $D[$b] - $D[$a]
    $sumH = 0.0; $maxH = 0.0; $asc = 0.0; $prevE = $E[$a]
    for ($q = $a + 1; $q -le $b; $q++) {
      $sumH += $H[$q]; if ($H[$q] -gt $maxH) { $maxH = $H[$q] }
      if ((($q - $a) % 6) -eq 0 -or $q -eq $b) { if ($E[$q] -gt $prevE) { $asc += $E[$q] - $prevE }; $prevE = $E[$q] }
    }
    [void]$laps.Add([object[]]@([Math]::Round($lapT, 1), [int][Math]::Round($lapD), [int][Math]::Round($sumH / ($b - $a)), [int][Math]::Round($maxH), [int][Math]::Round($asc)))
  }
  $k = 1
  while ($k -lt $nb) {
    $lapT = ($k - $start) * $BIN; $lapD = $D[$k] - $D[$start]
    $cut = -1
    if ($lapD -ge 1000) { $cut = $k }
    elseif ($lapT -ge 30) {
      $lapV = $lapD / $lapT
      $end = [Math]::Min($nb, $k + $AHEAD)
      $aheadV = ($D[$end] - $D[$k]) / (($end - $k) * $BIN)
      # Standing or walking on both sides (under 1.2 m/s): one single recovery lap, no cut
      $bothSlow = ($lapV -lt 1.2 -and $aheadV -lt 1.2)
      if (-not $bothSlow -and ($end - $k) -ge 3 -and [Math]::Abs($aheadV - $lapV) -gt 0.15 * [Math]::Max($lapV, 0.8)) {
        # Put the cut on the sharpest speed jump inside the look-ahead window
        $bestJ = $k; $bestJump = -1.0
        for ($q = $k; $q -lt $end; $q++) {
          $before = ($D[$q] - $D[[Math]::Max($start, $q - 2)]) / (($q - [Math]::Max($start, $q - 2)) * $BIN)
          $after = ($D[[Math]::Min($nb, $q + 2)] - $D[$q]) / (([Math]::Min($nb, $q + 2) - $q) * $BIN)
          $jump = [Math]::Abs($after - $before)
          if ($jump -gt $bestJump) { $bestJump = $jump; $bestJ = $q }
        }
        $cut = $bestJ
      }
    }
    if ($cut -gt $start) { & $close $start $cut; $start = $cut; $k = $cut + 1 } else { $k++ }
  }
  if ($nb -gt $start) { & $close $start $nb }
  return , $laps.ToArray()
}

Write-Host 'Laps...'
$oldLaps = @{}
if ($old -and $old.lapsVersion -eq $LAPS_VERSION -and $old.laps) {
  foreach ($p in $old.laps.PSObject.Properties) { $oldLaps[$p.Name] = $p.Value }
}
$lapsOut = [ordered]@{}
$lapCutoff = $today.AddDays(-$LAPS_DAYS)
$fetched = 0
foreach ($a in $acts) {
  if ($a.activityType.typeKey -notmatch 'run' -or -not $a.distance -or $a.distance -le 500) { continue }
  if ((ToDate $a.startTimeLocal) -lt $lapCutoff) { continue }
  $id = [string]$a.activityId
  if ($oldLaps.ContainsKey($id)) { $lapsOut[$id] = $oldLaps[$id]; continue }
  $l = Get-Laps $id
  if ($l) { $lapsOut[$id] = $l; $fetched++ }
}
Write-Host "  $($lapsOut.Count) run(s) with laps, $fetched newly fetched."

# --- Wellness: last 182 days, in 28-day chunks -------------------------------
function Get-Chunks([string]$label, [scriptblock]$pathFor) {
  Write-Host "$label..."
  $out = New-Object System.Collections.ArrayList
  $from = $today.AddDays(-181)
  while ($from -le $today) {
    $to = $from.AddDays(27); if ($to -gt $today) { $to = $today }
    [void]$out.Add((Get-Json (& $pathFor $from.ToString($fmt) $to.ToString($fmt))))
    $from = $to.AddDays(1)
  }
  return , $out
}

$daily = New-Object System.Collections.ArrayList
foreach ($c in (Get-Chunks 'Daily summaries' { param($a, $b) "/usersummary-service/v2/dailysummaries?startDate=$a&endDate=$b" })) {
  if (-not $c -or -not $c.data) { continue }
  foreach ($x in @($c.data)) {
    [void]$daily.Add([ordered]@{
      calendarDate = (DateText $x.calendarDate $fmt)
      heartRate    = @{ restingValue = $x.heartRate.restingValue }
      bodyBattery  = @{ maxValue = $x.bodyBattery.maxValue }
    })
  }
}

$sleep = New-Object System.Collections.ArrayList
foreach ($c in (Get-Chunks 'Sleep' { param($a, $b) "/sleep-service/sleep/dailySleepSummariesByDate?startDate=$a&endDate=$b" })) {
  foreach ($x in @($c)) {
    if (-not $x) { continue }
    $sc = $x.sleepScores.overall.value
    if ($null -eq $sc) { $sc = $x.overallSleepScore.value }
    if ($null -eq $sc -and $x.sleepScore -is [ValueType]) { $sc = $x.sleepScore }
    if ($null -eq $sc) { $sc = $x.sleepScore.value }
    [void]$sleep.Add([ordered]@{
      calendarDate     = (DateText $x.calendarDate $fmt)
      sleepTimeSeconds = $x.sleepTimeSeconds
      deepSeconds      = $x.deepSleepSeconds
      lightSeconds     = $x.lightSleepSeconds
      remSeconds       = $x.remSleepSeconds
      awakeSeconds     = $x.awakeSleepSeconds
      score            = $sc
    })
  }
}

# Sleep score and phases come with the daily summaries above (sleepScores.overall.value).

$hrv = New-Object System.Collections.ArrayList
foreach ($c in (Get-Chunks 'HRV' { param($a, $b) "/hrv-service/hrv/daily/$a/$b" })) {
  if (-not $c -or -not $c.hrvSummaries) { continue }
  foreach ($x in @($c.hrvSummaries)) {
    [void]$hrv.Add([ordered]@{
      calendarDate = (DateText $x.calendarDate $fmt)
      lastNightAvg = $x.lastNightAvg
      status       = $x.status
      baseline     = [ordered]@{ balancedLow = $x.baseline.balancedLow; balancedUpper = $x.baseline.balancedUpper }
    })
  }
}

# A failed request leaves a hole of up to 28 days: the days missing from this run are taken from
# the previous data.json, so one bad run never erases the recovery history.
function Merge-Days($new, $oldList) {
  $cut = $today.AddDays(-182).ToString($fmt)
  $map = @{}
  foreach ($x in @($oldList)) {
    if (-not $x -or -not $x.calendarDate) { continue }
    $k = [string](DateText $x.calendarDate $fmt)
    if ($k -ge $cut) { $x.calendarDate = $k; $map[$k] = $x }
  }
  foreach ($x in @($new)) { if ($x -and $x.calendarDate) { $map[[string]$x.calendarDate] = $x } }
  return , @($map.Keys | Sort-Object | ForEach-Object { $map[$_] })
}
if ($old) {
  if ($old.dailyChunks) { $daily = Merge-Days $daily $old.dailyChunks[0].data }
  if ($old.sleepChunks) {
    $oldScore = @{}; foreach ($x in @($old.sleepChunks[0])) { if ($x -and $null -ne $x.score) { $oldScore[[string](DateText $x.calendarDate $fmt)] = $x.score } }
    foreach ($x in $sleep) { if ($null -eq $x.score -and $oldScore.ContainsKey([string]$x.calendarDate)) { $x.score = $oldScore[[string]$x.calendarDate] } }
    $sleep = Merge-Days $sleep $old.sleepChunks[0]
  }
  if ($old.hrvChunks) { $hrv = Merge-Days $hrv $old.hrvChunks[0].hrvSummaries }
}

# --- Heart-rate zones -------------------------------------------------------
Write-Host 'HR zones...'
$zones = New-Object System.Collections.ArrayList
foreach ($z in @((Get-Json '/biometric-service/heartRateZones/v2'))) {
  if (-not $z) { continue }
  [void]$zones.Add([ordered]@{ sport = $z.sport; zone2Floor = $z.zone2Floor; zone3Floor = $z.zone3Floor; zone4Floor = $z.zone4Floor })
}
if ($zones.Count -eq 0 -and $old -and $old.hrZones) { $zones = @($old.hrZones) }

# --- Write data.json --------------------------------------------------------
# Shapes kept identical to window.GARMIN_DATA so the dashboard needs no change:
# the paged/chunked arrays are rebuilt as a single page / single chunk.
$out = [ordered]@{
  fetchedAt     = (Get-Date).ToUniversalTime().ToString('o')
  errors        = @($errors)
  hrZones       = @($zones)
  activityPages = @(, @($acts))
  dailyChunks   = @(, @{ data = @($daily) })
  sleepChunks   = @(, @($sleep))
  hrvChunks     = @(, @{ hrvSummaries = @($hrv) })
  lapsVersion   = $LAPS_VERSION
  laps          = $lapsOut
}

$dst = Join-Path $root 'data.json'
[IO.File]::WriteAllText($dst, (ConvertTo-Json -InputObject $out -Depth 10 -Compress), (New-Object Text.UTF8Encoding $false))

$token = $null; $key = $null
Write-Host "Done: data.json written ($([math]::Round((Get-Item $dst).Length / 1KB)) KB, $($acts.Count) activities, $($errors.Count) error(s))."
