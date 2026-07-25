@echo off
cd /d "%~dp0"
echo ============================================================
echo  绿趣管理系统 · 外网隧道（Cloudflare Tunnel / 零配置）
echo ============================================================
echo.
echo  前提：本机 greenfun 服务已在 8000 端口运行（先跑 start.bat）。
echo  本脚本把 8000 端口通过 Cloudflare 暴露到公网，自带 HTTPS 加密。
echo.
echo  启动后下方会打印一个 https://xxxx.trycloudflare.com 地址，
echo  把它发给要外网访问的人（老板/自己手机）即可，无需公网IP/路由器。
echo.
echo  注意：临时隧道地址每次重开都会变；关闭本窗口即断开外网。
echo  如需【固定地址】，见 deploy-local/README.md 末尾「固定域名」章节。
echo.
echo  正在连接 Cloudflare 边缘节点...
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:8000
echo.
echo  [已停止] 按任意键退出
pause >nul
