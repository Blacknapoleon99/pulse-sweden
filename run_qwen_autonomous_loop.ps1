# TryggPuls — Qwen 3.8 27B Självständig Utvecklingsloop
# Körs lokalt via FreeToken och Codex CLI

param(
    [string]$Workspace = "D:\AZCoreHasse\Projects\Trygghets!",
    [int]$MaxHours = 4,
    [int]$IntervalMinutes = 15
)

$ErrorActionPreference = 'Continue'
$env:FREETOKEN_API_KEY = 'freetoken'
$codex = 'C:\Users\Kevin\.codex\packages\standalone\releases\0.153.2-x86_64-pc-windows-msvc\bin\codex.exe'
$logFile = Join-Path $Workspace "qwen_autonomous_loop.log"
$workLogFile = Join-Path $Workspace "qwen_work_log.md"

function Log-Message([string]$msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Host $line -ForegroundColor Cyan
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

Log-Message "=== Startar Qwen 3.8 27B Autonom Utvecklingsloop ==="
Log-Message "Workspace: $Workspace"
Log-Message "Mål: Granska och förfina TryggPuls under $MaxHours timmar"

$startTime = Get-Date
$endTime = $startTime.AddHours($MaxHours)
$iteration = 1

$prompts = @(
    "Du är Qwen 3.8 27B som arbetar lokalt på projektet TryggPuls i D:\AZCoreHasse\Projects\Trygghets!. Uppgift pass 1: Granska index.html och style.css. Säkerställ att designen är 100% vass och icke-rundad (border-radius: 0px överallt), att fonten är Space Grotesk och JetBrains Mono, samt att kartan inte har några förvrängande CSS-filter. Dokumentera vad du kontrollerade i qwen_work_log.md.",
    "Uppgift pass 2: Granska server.mjs och säkerställ att alla API-endpoints (/api/events, /api/route, /api/geocode, /api/bra-stats, /api/legal-updates) fungerar perfekt, att felhanteringen är robust och att absolut ingen mock-data används. Dokumentera dina förbättringar i qwen_work_log.md.",
    "Uppgift pass 3: Granska app.js och säkerställ att kartan använder CartoDB Dark Matter utan filter, att kartan alltid anropar map.invalidateSize() så att inga grå eller tomma rutor uppstår, och att ruttanalysen med säkerhetskorridor (300-1000m) fungerar klanderfritt. Skriv rapport i qwen_work_log.md.",
    "Uppgift pass 4: Granska Familj & Geozoner samt Företag B2B och SOS-panelerna i app.js och index.html. Se till att alla knappar och statusindikatorer har skarp taktisk design och att lokal lagring fungerar. Uppdatera qwen_work_log.md.",
    "Uppgift pass 5: Kör tester och verifiera prestanda, kodkvalitet och responsivitet. Åtgärda eventuella buggar eller skönhetsfel du hittar i gränssnittet eller backend. Uppdatera qwen_work_log.md."
)

while ((Get-Date) -lt $endTime) {
    $promptIdx = ($iteration - 1) % $prompts.Length
    $currentPrompt = $prompts[$promptIdx]

    Log-Message "--- Iteration $iteration startar ---"
    Log-Message "Prompt: $currentPrompt"

    try {
        # Kör Codex non-interaktivt med Qwen 3.8 27B
        $null | & $codex exec -p freetoken-launch -m Qwen3.8-27B-NVFP4 -C $Workspace --dangerously-bypass-approvals-and-sandbox $currentPrompt 2>&1 | Out-File -FilePath (Join-Path $Workspace "qwen_iteration_$iteration.log") -Encoding utf8
        Log-Message "Iteration $iteration klar. Resultat sparat i qwen_iteration_$iteration.log"
    } catch {
        Log-Message "Fel under iteration $($iteration): $_"
    }

    $iteration++
    $remaining = [math]::Round(($endTime - (Get-Date)).TotalMinutes)
    Log-Message "Vilar 10 sekunder innan nästa steg. Återstående tid av sessionen: $remaining minuter."
    Start-Sleep -Seconds 10
}

Log-Message "=== Qwen 3.8 utvecklingsloop avslutad efter $MaxHours timmar ==="
