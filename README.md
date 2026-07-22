# 绿趣 · 家装阳台植物花园 全流程管理系统（内部版）

面向绿趣内部员工的全流程执行登记系统，覆盖 **获客引流 → 咨询接待 → 需求深度沟通 → 现场勘测 → 方案设计与报价 → 签约收款 → 采购施工交付 → 售后养护** 八大阶段（V5 管理手册口径，55 份表单）。

## 功能
- **客户档案 + 八阶段登记**：每个客户按阶段填写，字段与 V5 表单逐字对齐；可随时推进/回退阶段。
- **进度看板**：八阶段分列，一眼看所有客户卡在哪个阶段、谁负责、可一键推进。
- **表单模板库**：内置 V5 全部 55 份表单，可查看 / 打印 / 导出 Markdown。
- **数据统计与导出**：客户数、转化率、累计报价/收款/结算，按阶段/渠道/负责人/状态分布；支持导出 Excel(CSV) 与 JSON 备份。

## 技术
纯 Python 标准库（`http.server` + `sqlite3`），**零第三方依赖**，前端为原生 HTML/CSS/JS。无需联网、无需装包。

## 一、本地运行（先验证 / 单人试用）
1. 安装任意 Python 3.8+（已装可跳过）。
2. 双击 `start.bat`（Windows），或终端执行：
   ```bash
   python app.py
   ```
3. 浏览器打开 `http://localhost:8000`。
4. 数据存本地 `greenfun.db`（SQLite）。首次使用点右上角「+ 新增客户」。
5. 导出备份：数据统计页 → 导出 JSON，可随时再导入（导入功能可后续补充）。

> 局域网内其他电脑访问：确认本机防火墙放行端口 8000，同事用 `http://你的内网IP:8000` 打开即可共用同一份数据。**但本机需保持开机**——若不想养一台服务器，请走下方云端部署。

## 二、云端部署（推荐，无需内部服务器）
部署到 **Render**（免费额度即可，获得公网网址，团队浏览器直接访问，数据持久保存）。

1. 把 `greenfun-app` 整个目录推送到你的 GitHub 仓库。
2. 打开 https://render.com → 登录 → New → **Blueprint** → 关联该仓库。
3. Render 会自动读取 `render.yaml` 创建 Web 服务（免费 plan）。
4. **重要**：在 Render 控制台为该服务挂载一个 Disk（挂载路径 `/data`，已配置），否则重启会清空数据库。
5. 部署完成后，Render 给你一个 `https://xxxx.onrender.com` 网址，发给团队即可使用。

> 也兼容 Railway / Fly.io / 任意支持 Python 的平台：用 `Procfile` 或 `Dockerfile`，启动命令 `python app.py`，端口读环境变量 `PORT`，数据库路径读 `DB_PATH`（务必挂持久盘）。

## 目录结构
```
greenfun-app/
├── app.py              # 后端（标准库 HTTP + SQLite）
├── requirements.txt    # 空依赖声明（供平台识别）
├── render.yaml         # Render 部署配置
├── Procfile            # Railway/Heroku 启动命令
├── Dockerfile          # 容器部署
├── start.bat / start.sh# 本地一键启动
├── web/                # 前端
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── forms/              # V5 八章 55 份表单（模板库数据源）
└── greenfun.db         # 运行后自动生成（SQLite 数据库）
```

## 数据说明
- 客户档案、各阶段登记、操作日志均存于 `greenfun.db`。
- 定期用「数据统计 → 导出 JSON」做离线备份。
- 员工在右上角填写「当前操作员」名字，所有保存/推进操作都会记入日志（谁、何时、做了什么）。
