param([string]$Distro = 'Ubuntu', [int]$TimeoutSeconds = 60)

# Keeps the WSL2 distro (and the dockerd inside it) alive by holding a hidden
# wsl.exe process, then waits for the engine to answer on the wsl-engine context.

$existing = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" |
    Where-Object { $_.CommandLine -like '*sleep infinity*' -and $_.CommandLine -like "*-d $Distro*" } |
    Select-Object -First 1

if ($existing) {
    Write-Host "docker-up: keepalive ja ativo (PID $($existing.ProcessId))"
} else {
    $proc = Start-Process -FilePath 'wsl.exe' -ArgumentList '-d', $Distro, '--exec', 'sleep', 'infinity' -WindowStyle Hidden -PassThru
    Write-Host "docker-up: keepalive iniciado (PID $($proc.Id))"
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    docker --context wsl-engine info *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if ($ready) {
    # Compose on Windows (with COMPOSE_CONVERT_WINDOWS_PATHS=1) sends bind sources as /c/Users/...,
    # but the distro mounts Windows drives at /mnt/c. The symlink makes both resolve.
    wsl.exe -d $Distro -u root --exec ln -sfn /mnt/c /c
    if ([Environment]::GetEnvironmentVariable('COMPOSE_CONVERT_WINDOWS_PATHS', 'User') -ne '1') {
        Write-Host 'docker-up: WARNING - variavel de usuario COMPOSE_CONVERT_WINDOWS_PATHS nao esta em 1; bind mounts do compose vao falhar'
    }
    Write-Host 'docker-up: OK - engine respondendo no contexto wsl-engine'
    exit 0
}

Write-Host "docker-up: FALHA - engine nao respondeu em $TimeoutSeconds s (contexto wsl-engine, distro $Distro)"
exit 1
