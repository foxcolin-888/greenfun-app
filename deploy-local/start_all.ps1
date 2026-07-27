# 一键启动：本地服务(8000) + 外网隧道(Cloudflare)
# 退出时同时关闭两者，不留孤儿进程。
$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$rootDir   = Split-Path -Parent $deployDir
Set-Location $rootDir

# 解析 Python（三级兜底）
$py = $null
$cands = @("python", "py", "C:\Users\12961\.workbuddy\binaries\python\versions\3.13.12\python.exe")
foreach ($c in $cands) {
    if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break }
}
if (-not $py) {
    Write-Host "[错误] 未找到 Python，请先安装 Python 3.8+ 或确认路径。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 启动前先清理旧的后台 app.py 进程，避免端口 8000 被占用/竞争导致服务不可用
Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*app.py*' } |
    ForEach-Object {
        Write-Host "==> 结束旧服务进程 PID $($_.ProcessId) ..." -ForegroundColor DarkGray
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 1

Write-Host "==> 启动本地服务 (http://localhost:8000) ..." -ForegroundColor Cyan
$appLog = "$deployDir\app.log"
$appErr = "$deployDir\app.err"
$app = Start-Process -FilePath $py -ArgumentList "app.py" -PassThru -WindowStyle Hidden -RedirectStandardOutput $appLog -RedirectStandardError $appErr

# 等待服务就绪（最多 10 秒）
$ready = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if (-not $ready) {
    Write-Host "[错误] 本地服务 8000 端口未在 10 秒内就绪，请检查 deploy-local\app.err 日志。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Write-Host "==> 启动外网隧道 (Cloudflare Tunnel) ..." -ForegroundColor Cyan
$tunnelLog = "$deployDir\tunnel.log"
$tunnelErr = "$deployDir\tunnel.err"
$tunnel = Start-Process -FilePath "$deployDir\cloudflared.exe" -ArgumentList @("tunnel","--url","http://localhost:8000") -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr

Start-Sleep -Seconds 6

$url = ""
if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com" | Select-Object -Last 1
    if ($m) { $url = $m.Matches[0].Value }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " 绿趣管理系统已启动" -ForegroundColor Green
Write-Host "   本机访问 : http://localhost:8000" -ForegroundColor White
Write-Host "   后台管理 : http://localhost:8000/admin/" -ForegroundColor White
if ($url) {
    Write-Host "   外网地址 : $url" -ForegroundColor Yellow
    Write-Host "   （把它发给要外网访问的人；按任意键即断开）" -ForegroundColor Gray
} else {
    Write-Host "   外网地址 : 生成中或失败，详见 deploy-local\tunnel.log" -ForegroundColor Red
}
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
# 交互模式（双击）下等待按键后关闭两者；计划任务 / 登录自启（非交互或设了 GF_NO_WAIT）下直接退出，
# 此时 app.py / cloudflared 已由 Start-Process 独立拉起，会持续常驻。
if ([Environment]::UserInteractive -and $env:GF_NO_WAIT -ne '1') {
    Write-Host "按任意键停止服务并断开外网..." -ForegroundColor Cyan
    [Console]::ReadKey($true) | Out-Null
    Write-Host "正在停止..." -ForegroundColor Yellow
    try { if (-not $app.HasExited) { $app.Kill() } } catch {}
    try { if (-not $tunnel.HasExited) { $tunnel.Kill() } } catch {}
    Start-Sleep -Seconds 1
    Write-Host "已停止。运行日志: deploy-local\app.log / tunnel.log" -ForegroundColor Green
}
