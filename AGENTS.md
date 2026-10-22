# AGENTS.md — greenfun-app 开发交接手册（给 Codex / 任何接手开发者）

本文件是 **greenfun-app（绿趣 · 家装阳台植物花园全流程管理系统）** 的权威开发约束。
任何自动化代理（Codex / Copilot / 子代理）或新人在改动本仓库前，必须先读完本文件并严格遵守。
违反以下铁律会**直接导致后台白屏、部署不生效、或数据丢失**。

---

## 1. 项目身份与技术栈

- **纯 Python 标准库后端**：`app.py` 用 `http.server` + `sqlite3`，**零第三方依赖**（无 Flask/Django/FastAPI，无 `requests`/`openai` 等）。
- **原生前端**：`web/` 下为原生 HTML/CSS/JS，无构建步骤、无 npm 依赖。
- **零依赖是核心卖点**：整个项目刻意保持"拷走就能跑、装包都不用"。**任何引入新依赖的改动都是破坏性改动。**

> 如果某个任务让你觉得"必须用某个库"，**立刻停下来问人**，不要自己加 `pip install`。

环境需求：Python 3.8+（生产用 3.13）。无 `pip install` 步骤；`requirements.txt` 故意为空。

---

## 2. 🔴 不可违反的铁律（CRITICAL RULES）

### 2.1 零依赖
- 只允许使用 Python 标准库：`json, os, sys, sqlite3, http.server, urllib, datetime, base64, hashlib, re, secrets, mimetypes` 等。
- 禁止新增 import 任何第三方包。禁止把前端改成需要 `npm install` / 打包工具。

### 2.2 前端 `api()` 前缀规则（最高频白屏元凶）
- `web/admin/app.js` 顶部：`const API = '/api';`
- 调用写法：`await api('GET', '/sales')` → 实际请求 `/api/sales`。
- **绝不能**写成 `api('GET', '/api/sales')`（会变成 `/api/api/sales` → 404 → 整页白屏）。
- `api()` 在 404 时**不抛错、返回 `{}`**，于是后续 `.map()` 抛 TypeError、整个 render 函数崩掉、页面全白且无报错。所以**路由名写错是静默灾难**，加接口后务必核对路径。
- **例外（不走 `api()`，必须写完整 `/api` 前缀）**：
  - `window.open('/api/quotes/<id>/print?token=...')`（新窗口带不了 Authorization header）
  - `fetch(API + '/login', ...)`（登录本身未带 token）

### 2.3 后端路由顺序（具体路径必须在通用前缀之前）
`app.py` 的 `_api_get` / `_api_write` 是**按路径字符串顺序匹配的 if/elif 链**。
具体路径必须排在通用前缀匹配之前，否则被提前拦截：

- `/api/sales/weekly`、`/api/sales/monthly` 必须在 `/api/sales`、`/api/sales/<id>` **之前**
- `/api/quotes/<id>/material-prep` 必须在 `/api/quotes/<id>` **之前**
- 打印页路由（`/api/.../<id>/print`）在 `_api_get` **最顶部**用 `startswith(...)/<id>/print` + `endswith('/print')` 匹配，**位于登录闸门之前**

### 2.4 登录闸门 `_need()` 与公开/打印路由的位置
- `_api_get` 中有一行 `u = self._need()`（当前约 line 1449）。**放在它之前的路由是公开的（无需登录）；放在它之后的路由必须有有效 Bearer token。**
- 公开接口（如官网用的 `/api/site`、案例列表）必须放在闸门**之前**，否则 401。
- 打印页（报价/方案/销售单）也是公开但**自校验 `?token=` 查询参数**（在方法内部查 `SESSIONS` 校验），必须放在闸门之前，且自己实现 token 校验。参照 `_quote_print` / `_scheme_print` / `_sales_print`。

```python
def _need(self, roles=None):
    u = self._auth()
    if not u:
        self._json({"error": "未登录或会话已过期", "code": 401}, 401)
        return None
    if roles and u["role"] not in roles:
        self._json({"error": "无权限", "code": 403}, 403)
        return None
    return u
```

### 2.5 f-string 渲染陷阱
打印页用 Python f-string 拼 HTML。**不能在一个 f-string 里嵌套另一个含 `\"` 转义的子 f-string**（SyntaxError）。
复杂片段先算成普通变量，再插值：`html = f"<div>{fragment}</div>"`。

### 2.6 文件上传白名单
上传走 base64 dataURL：前端 → `POST /api/scheme/upload` 等 → 服务端落 `UPLOAD_DIR`。
上传目录白名单目前含：`scheme`、`site`、`sales`。**新增上传目录必须同步更新白名单**，否则 403。

### 2.7 数据库持久化
- 生产：`DB_PATH=/data/greenfun.db`（Docker 持久卷）；本地默认 `./greenfun.db`。
- **绝对禁止提交 `*.db`**（已在 `.gitignore`）。
- 表结构变更只通过 `_init_db` 里的 `CREATE TABLE IF NOT EXISTS` + 增量迁移逻辑；**不要 DROP 任何表**。新增表/字段必须 `IF NOT EXISTS` 兼容旧库。

### 2.8 密钥与机密
- API Key 通过环境变量 `GREENFUN_IMG_GEN_*` 注入，或存 `settings` 表，**绝不硬编码、绝不进仓库**。
- `.env`、`*.secret`、`push_to_github.bat` 已 gitignore。任何凭据提交都是安全事故。

### 2.9 静态资源路径
- 后台 SPA 在 `web/admin/`，引用资源用绝对路径：`/admin/styles.css`、`/admin/app.js`。
- 新增后台资源请同样用 `/admin/...` 绝对路径，相对路径曾导致样式全丢。

---

## 3. 如何新增一个后端接口（标准模板）

1. 在 `_api_get`（GET）或 `_api_write`（POST/PUT/DELETE）里加路由判断：
   - 具体路径排在通用前缀**之前**（见 2.3）。
   - 需登录：先 `u = self._need(); if not u: return`。
   - 公开/打印：放在闸门之前并自校验 token（见 2.4）。
2. 业务逻辑抽到 `_xxx(conn)` 风格函数：
   ```python
   def _list_foo(self):
       conn = get_db()
       rows = conn.execute("SELECT * FROM foo ORDER BY id").fetchall()
       conn.close()
       return [dict(r) for r in rows]
   ```
3. 返回用 `self._json(result)`（自动 JSON + UTF-8）。
4. 写操作后务必 `conn.commit(); conn.close()`。

---

## 4. 如何新增前端调用

```javascript
const data = await api('GET', '/foo');   // 注意：路径不带 /api 前缀
```
渲染前防御：`data` 在 404 时可能是 `{}`，遍历前先判空。

---

## 5. 🚀 部署（--build 铁律）

### 生产（腾讯云轻量 + Docker Compose + Caddy 自动 HTTPS）
```bash
cd ~/greenfun-app
git pull
sudo docker compose down
sudo docker compose up -d --build     # ← --build 必带！漏了镜像不重建，改了不生效
```
- `DB_PATH=/data/greenfun.db`、`UPLOAD_DIR=/data/uploads` 由 docker-compose 注入，数据挂 `greenfun_data` 卷，重启不丢。
- 域名写死在 `Caddyfile`，证书自动申请续期。

### 备用（Render，免费/Starter）
- 仓库推到 GitHub 后，Render 新建 Blueprint 关联本仓库，`render.yaml` 自动建服务。
- Starter 计划需挂 `/data` Disk，否则重启清库。

---

## 6. 本地验证 / 冒烟测试

```bash
# 启动（默认 PORT=8000，DB_PATH=./greenfun.db）
python app.py
# 浏览器打开 http://localhost:8000

# 提交前必做语法检查
python -c "import ast; ast.parse(open('app.py',encoding='utf-8').read())"
node --check web/admin/app.js

# 隔离测试（用临时库，避免污染真实数据）
DB_PATH=/tmp/_test_greenfun.db UPLOAD_DIR=/tmp/_test_uploads python app.py
```
- 任何改动后必须跑上述两条语法检查，并人工确认关键页面（后台能登录、目标功能可用）。

---

## 7. 提交与推送规则

- 绝不提交：`*.db`、`web/uploads/`、`.env`、`*.secret`、`push_to_github.bat`、本地日志。
- 推送用**临时 GitHub PAT**；推完立即剥离 token：
  ```bash
  git remote set-url origin https://github.com/foxcolin-888/greenfun-app.git
  ```
- **采用 PR 工作流**：Codex 应开 PR，人工 review diff 后再合并；禁止 force-push 到 `main`。
- commit message 用中文或英文祈使句，说明"改了什么、为什么"。

---

## 8. ⚠️ 本地未提交改动（接手前须知）

当前工作区有**未提交**改动：`app.py`、`web/admin/app.js`、`web/admin/styles.css`，实现了
"报价台 → 物料准备清单"功能（按报价单生成物料表、可上传解析、含基础工具选配）。
**这部分尚未推送到 GitHub**，Codex 从 GitHub `main` 克隆时看不到它。
建议：先把这批改动提交并推送，使基线一致，再让 Codex 在此基础上工作；否则易出现基线偏差 / 合并冲突。

---

## 9. Code Review Rules（供 Codex GitHub 集成自动审查）

- 🔴 任何新增第三方 import（违反零依赖）。
- 🔴 前端在 `api()` 内写成 `/api/...`（双重前缀 → 404 白屏）。
- 🔴 路由顺序错误（具体路径排在通用前缀之后）。
- 🔴 公开路由忘做 token 校验，或需登录路由被错误放到闸门之前。
- 🔴 f-string 嵌套含转义引号（SyntaxError）。
- 🔴 硬编码密钥或提交了 `*.db` / `.env` / 凭据文件。
- 🟠 新增上传目录未同步白名单。
- 🟠 新增表/字段未用 `IF NOT EXISTS`，可能破坏旧库升级。
- 🟠 改动未跑语法检查、未人工确认关键页面。

---

## 10. Codex 默认行为约束

- 这是承载真实客户数据的生产系统，**优先做最小、精准的改动**，不要顺手重构。
- 完成前必须运行第 6 节的语法检查；不要声称"完成"却没验证。
- 不擅自改部署流程、不改 Caddyfile 域名、不引入新依赖或新架构。
- UI 文案保持中文一致，符合绿趣品牌语气。
- 任务需要新依赖或架构变更时，**停下来向人类确认**，不要自作主张。
