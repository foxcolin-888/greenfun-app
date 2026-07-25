# 绿趣管理系统 · 本地常开电脑部署指南

把你的电脑当成一台 24 小时运行的服务器。零成本、数据天然持久、局域网最快。
适合：老板 / 员工都在同一办公室或同一 WiFi 下使用。

---

## 一、环境要求

- Windows 10/11，能正常开机且**不关机**（合盖/睡眠会断网，建议「电源模式」设为「高性能」、关闭「睡眠」）
- 已安装 Python 3.8+（双击 `start.bat` 会自动找 python / py / 内置 python，三选一）
- 项目代码已在本机（即本文件夹 `greenfun-app`）

## 二、启动服务（手动）

双击 **`start.bat`** 即可。看到如下输出说明成功：

```
绿趣全流程管理系统已启动： http://localhost:8000
默认账号：lvquguanliyuan/123456（管理员）...
```

- 本机浏览器访问：http://localhost:8000
- 后台管理：http://localhost:8000/admin/
- 关闭窗口即停止；若异常退出会**自动重启**

## 三、设置开机自启（无需登录也能跑）

让电脑一开机就自动跑服务，不依赖你手动双击：

1. 按 `Win + R`，输入 `taskschd.msc` 回车，打开「任务计划程序」
2. 右侧「创建基本任务」→ 名称填 `绿趣管理系统`
3. 触发器选「计算机启动时」
4. 操作选「启动程序」→ 程序或脚本浏览到本文件夹的 `start.bat`
5. 完成前勾选「打开此任务属性的对话框」→ 确定
6. 在属性「常规」页：
   - 勾选「不管用户是否登录都要运行」
   - 勾选「使用最高权限运行」
   - 取消「电源」里的「只有在计算机使用交流电源时才启动此任务」（避免断电不启）
7. 确定后输入你的 Windows 密码

之后电脑重启也会自动拉起服务，且崩溃会自动重启。

## 四、让同局域网其他设备也能访问（防火墙）

默认 Windows 防火墙会拦外部访问 8000 端口，需放行一次（**管理员** CMD 执行）：

```
netsh advfirewall firewall add rule name="GreenFun 8000" dir=in action=allow protocol=TCP localport=8000
```

## 五、其他人怎么访问

1. 在你这台电脑上查内网 IP：
   - `Win + R` → `cmd` → 输入 `ipconfig`
   - 找「IPv4 地址」，一般是 `192.168.x.x` 或 `10.x.x.x`
2. 同事 / 老板手机或电脑，连**同一个 WiFi 或同一网络**，浏览器打开：
   ```
   http://192.168.x.x:8000
   http://192.168.x.x:8000/admin/   （后台）
   ```
   把 `192.168.x.x` 换成你查到的真实 IP 即可。

> 注：路由器重启后内网 IP 可能变化。若需固定，可在路由器后台把此电脑设为「DHCP 保留 / 静态 IP」。

## 六、首次配置（一次性）

1. 打开后台 http://localhost:8000/admin/ ，用 `lvquguanliyuan / 123456` 登录
2. 左侧「系统设置」→ 填 **APIYI Key**（生图用）：
   - 生图服务商：`openai`
   - API 地址：`https://api.apiyi.com/v1`
   - 模型：`doubao-seedream-5-0-260128`
   - AI 分析模型：`gpt-4o-mini`
3. 管理员起始积分默认 1000（已在建库时种子）。如需更多，在「客户/积分」里充值
4. **配置只做一次**，数据写进本地 `greenfun.db`，永久保留，不再清零

## 七、远程访问（接出外网，不在办公室也能用）

用 **Cloudflare Tunnel（cloudflared）**：免费、不用公网 IP、不用改路由器、自带 HTTPS 加密。
本项目已内置 `deploy-local/cloudflared.exe`（Windows 64 位），无需另外安装。

### 临时地址（零配置，推荐先用这个）
1. 先确保本机 greenfun 服务已在 8000 端口运行（双击 `start.bat`）
2. 双击 **`deploy-local/start_tunnel.bat`**
3. 窗口会打印一个 `https://xxxx.trycloudflare.com` 地址 → 发给要访问的人（老板/自己手机），外网直接打开即可
4. 关闭该窗口 = 立刻断开外网访问

> 已真机验证：公网回打 `https://xxxx.trycloudflare.com/api/health` 返回 `{"ok":true,"stages":8}`，首页 200。

### 固定地址（长期在外用，需 Cloudflare 账号）
临时地址每次重开都变。若要固定不变，按下面做（一次性，约 10 分钟）：

1. 注册 Cloudflare 账号（免费）：https://dash.cloudflare.com/sign-up
2. 准备一个域名（你已有的，或在 Cloudflare 用免费二级域 `*.cfargotunnel.com` 也可）
3. 在 `deploy-local/` 里新建 `config.yml`：
   ```yaml
   tunnel: greenfun
   credentials-file: C:\Users\你的用户名\ .cloudflared\greenfun.json
   ingress:
     - hostname: greenfun.你的域名.com
       service: http://localhost:8000
     - service: http_status:404
   ```
4. 登录并建隧道（CMD 执行，按提示浏览器授权）：
   ```
   cloudflared.exe login
   cloudflared.exe tunnel create greenfun
   cloudflared.exe tunnel route dns greenfun greenfun.你的域名.com
   ```
5. 以后启动固定隧道：
   ```
   cloudflared.exe tunnel run greenfun
   ```
   之后 `https://greenfun.你的域名.com` 就是**固定不变**的外网地址。

### ⚠️ 安全提醒
- 外网地址任何人知道就能打开登录页，**务必把后台密码改强**（默认 `lvquguanliyuan/123456` 仅内网用，外网暴露必须改）。
- 临时隧道地址是随机长串、难猜，相对安全；不用时关掉窗口即可。
- 不要在公网地址上明文传极度敏感数据；登录走 HTTPS，凭证已加密。

## 八、数据备份（重要）

数据都在本机磁盘，电脑硬盘坏 = 数据丢。建议定期备份这两个东西：

- `greenfun-app/greenfun.db`（数据库：积分、客户、方案、报价、设置）
- `greenfun-app/web/uploads/`（现场照片、AI 效果图）

简单做法：每周把这两个拷到 U 盘 / 移动硬盘 / 网盘一次。或写个定时脚本压缩备份。

## 九、常见问题

| 现象 | 排查 |
|------|------|
| 别人打不开 `http://IP:8000` | ① 你电脑是否开机/未睡眠 ② 防火墙是否放行（第四步） ③ 是否同一网络 |
| 本机能开、别人不能开 | 多半是防火墙或不在同一网段（连的不同 WiFi/用流量） |
| 提示端口被占用 | 另一程序占了 8000。改 `app.py` 第 39 行 `PORT = 8000` 为其他值（如 8080），或结束占用程序 |
| 启动一闪而过 | 用 CMD 手动 `python app.py` 看报错；多半是 Python 未安装或路径问题 |
| 数据没了 | 检查 `greenfun.db` 是否被误删；本地不会自动清零，除非文件丢失 |

---

部署完成。日常使用：电脑开着就行，什么都不用管。
