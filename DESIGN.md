# DESIGN.md — 绿趣植物空间艺术官网设计系统

> AI 可读的设计规范。供 Cursor / Claude Code / Google Stitch 等编程代理直接消费，
> 用于维护与扩展 `web/` 下的官网（首页 `index.html` + `app.js` + `styles.css`）。
> 所有数值提取自线上真实 CSS，新增章节（语义色 / 阴影梯度 / 模态）以既有调性延展，非凭空创造。

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- **设计哲学**：高级编辑式杂志（editorial magazine）。以「克制」为最高原则——米白底、墨绿字、发丝级分隔线，靠**超大衬线标题**与**图形比例的剧烈反差**制造高级感，而非靠颜色堆砌。
- **视觉基调**：自然、安静、植物美学、植物界的轻奢感。像一本关于植物的精装画册。
- **核心视觉特征关键词**：编辑式杂志感 · 克制高级 · 植物美学 · 超大衬线 · 发丝线分隔
- **光影与质感倾向**：整体偏扁平 + 柔和绿色调多层阴影；导航栏轻微毛玻璃（blur 14px）；除 Hero / CTA 的深绿渐变与「无图时的渐变占位」外，几乎不用重渐变。漂浮叶片（`#leafLayer`）为点缀动效，不承载信息。

---

## 2. Color Palette & Roles（调色板与角色）

### Primary Colors（品牌主色）
| 角色 | HEX | CSS 变量 | 使用场景 |
|------|-----|----------|----------|
| 主绿（深） | `#2D5A27` | `--primary-green` / `--green-700` | Logo、深绿文字、主按钮文字、正文标题 |
| 次绿（亮） | `#4CAF50` | `--secondary-green` / `--green-500` | 主按钮背景、CTA、强调、激活态、链接 hover |
| 点缀绿 | `#8BC34A` | `--accent-green` / `--green-300` | kicker、数据数字、高亮字、点缀 |
| 大地棕 | `#5D4037` | `--earth-brown` / `--brown` | 创始人区块、温暖质感、类比自然 |

### Brand & Dark（品牌深色变体）
| HEX | CSS 变量 | 使用场景 |
|-----|----------|----------|
| `#16331a` | `--green-900` | Hero / CTA / stats / partner 深色底、最暗绿 |
| `#1f4423` | `--green-800` | manifesto 底、标题字色（`.display` color） |
| `#3a7239` | `--green-600` | 主按钮 hover 背景 |

### Neutral / Gray Scale（中性色）
| HEX | CSS 变量 | 使用场景 |
|-----|----------|----------|
| `#f4f1e8` | `--cream` | 浅色区块底（services / timeline / portfolio / contact 表单底） |
| `#fbfaf5` | `--paper` | 页面主背景、卡片浮层底 |
| `#ffffff` | `--white` | 卡片、表单、亮按钮背景 |
| `#b08968` | `--brown-light` | 棕系浅变体、图标底 |
| `#18241a` | `--ink` | 最深墨色（极少量，用于页脚底 `#142418` 近似） |
| `#2c352a` | `--text` | 正文主文字 |
| `#5d6b5b` | `--text-light` | 次级文字、lead、说明 |
| `#97a191` | `--text-muted` | 最小字、caption、元信息 |

### Green Scale（完整绿阶，渐变占位与层级用）
`--green-900 #16331a` · `--green-800 #1f4423` · `--green-700 #2D5A27` · `--green-600 #3a7239` · `--green-500 #4CAF50` · `--green-400 #6cbf63` · `--green-300 #8BC34A` · `--green-200 #b6d99a` · `--green-100 #dceccd` · `--green-50 #eef6e8`

### Surface & Borders（表面与边框）
| HEX / rgba | CSS 变量 | 使用场景 |
|------------|----------|----------|
| `rgba(22,51,26,.12)` | `--hair` | 发丝分隔线、卡片边框、输入边框底 |
| `rgba(22,51,26,.22)` | `--hair-strong` | 时间线中轴线等较强分隔 |

### Semantic Colors（语义色，基于调性延展）
| 语义 | HEX | CSS 变量（建议新增） | 使用场景 |
|------|-----|----------------------|----------|
| 成功 | `#4CAF50` | `--success` | 表单成功、状态徽标 |
| 警告 | `#b08968` | `--warning` | 温和提醒（用棕系避免刺眼红） |
| 错误 | `#c0392b` | `--danger` | 校验失败、删除确认（唯一允许的暖红） |
| 信息 | `#3a7239` | `--info` | 提示性文字 |

### Shadow Colors（阴影色，均带绿调，禁用纯黑阴影）
| rgba | CSS 变量 | 使用场景 |
|------|----------|----------|
| `rgba(22,51,26,.08)` | `--shadow` | 卡片默认阴影 |
| `rgba(22,51,26,.16)` | `--shadow-lg` | hover / 浮层阴影 |
| `rgba(76,175,80,.3)` | （按钮专属） | 主按钮投影 `.btn-primary` |
| `rgba(76,175,80,.4)` | （按钮专属） | 主按钮 hover 投影 |

---

## 3. Typography Rules（排版规则）

### Font Family（字体族）
```css
--font-serif: "Noto Serif SC", "Songti SC", "SimSun", serif;   /* 标题/数字/品牌字 */
--font-sans:  "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; /* 正文/UI */
```
- 通过 Google Fonts 加载：`Noto Serif SC` (400;500;600;700;900) + `Noto Sans SC` (300;400;500;600)。
- 中文优先；西文与数字同样走对应族（衬线数字用于数据条与价格，极具杂志感）。

### Type Scale（字阶表）
| 层级 | 字号 | 字重 | 行高 | 字距 | 字体 | 颜色 | 典型类 |
|------|------|------|------|------|------|------|--------|
| Hero Title | `clamp(46px,7vw,86px)` | 900 | 1.04 | 1px | serif | `#fff` | `.hero-title` |
| Display | `clamp(32px,4.6vw,58px)` | 700 | 1.16 | .5px | serif | `--green-800` | `.display` |
| Display-sm | `clamp(28px,3.6vw,44px)` | 700 | 1.2 | — | serif | `--green-800` | `.display-sm` |
| Manifesto | `clamp(26px,4vw,46px)` | 500 | 1.5 | — | serif | `rgba(255,255,255,.95)` | `.manifesto-text` |
| Stat Number | `clamp(46px,5.5vw,74px)` | 700 | 1 | — | serif | `--accent-green` | `.stat-item strong` |
| CTA Title | `clamp(30px,4.5vw,50px)` | 700 | — | — | serif | `#fff` | `.cta-title` |
| H3 (卡片标题) | 26–28px | 700 | — | — | serif | `#fff` / `--green-800` | `.case-info h3` / `.svc-feature-body h3` |
| Lead | 17px | 400 | 1.9 | — | sans | `--text-light` | `.lead` |
| Body | 15–16px | 400 | 1.78 | — | sans | `--text` | `body` |
| Kicker | 12px | 600 | — | 4px | sans | `--secondary-green` | `.kicker`（大写 + 前置短线） |
| Caption / Small | 12–13px | 400 | 1.7 | — | sans | `--text-muted` | `.case-tag` / meta |
| Nano | 11px | 400 | — | 1px | sans | `rgba(255,255,255,.5)` | `.scroll-hint` |

### 设计哲学
- **衬线 = 权威与温度**，仅用于标题、数据、品牌字；**无衬线 = 功能与阅读**，用于正文与 UI。
- **字距克制**：仅 kicker（4px 大写字距）与 hero-title（1px）做明显字距，其余贴近默认，避免「设计感过载」。
- **行高宽松**：正文 1.78、lead 1.9，配合大留白营造从容感。
- **超大字号对比**：section 标题可达 58px，而 caption 仅 11–12px，反差是高级感来源。

---

## 4. Component Stylings（组件样式）

### Buttons（按钮）
```css
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px;
       padding:15px 34px; border-radius:999px; font-size:15px; font-weight:500;
       letter-spacing:.5px; transition:all .28s ease; }

.btn-primary { background:var(--secondary-green); color:#fff;
               box-shadow:0 12px 30px rgba(76,175,80,.3); }
.btn-primary:hover { background:var(--green-600); transform:translateY(-2px);
                     box-shadow:0 16px 38px rgba(76,175,80,.4); }

.btn-light { background:#fff; color:var(--primary-green); }
.btn-light:hover { background:var(--green-50); }

.btn-ghost-light { border:1.5px solid rgba(255,255,255,.45); color:#fff; }
.btn-ghost-light:hover { background:rgba(255,255,255,.12); }

.btn-block { width:100%; }
```
变体：Primary（实心亮绿）/ Light（白底深绿字）/ Ghost-light（透明描边，用于深绿底上的次按钮）。圆角统一 999px（胶囊）。

### Cards（卡片）
```css
/* 案例大卡——代表所有「图片浮层 + 底部渐变信息」卡 */
.case-feature { position:relative; border-radius:var(--radius); overflow:hidden;
               min-height:620px; box-shadow:var(--shadow);
               cursor:pointer; transition:transform .3s, box-shadow .3s; }
.case-feature:hover { transform:translateY(-6px); box-shadow:var(--shadow-lg); }
.case-media { position:absolute; inset:0; background-size:cover; background-position:center; }
.case-info { position:absolute; bottom:0; left:0; right:0; padding:38px; color:#fff;
             background:linear-gradient(transparent, rgba(15,41,24,.88)); }
```
通用卡规律：圆角 `--radius`(22px)、默认 `--shadow`、hover `translateY(-5~6px)` + `--shadow-lg`、白底用 `#fff`、浅底用 `--cream`。

### Inputs（输入框）
```css
.form-group input, .form-group select, .form-group textarea {
  width:100%; padding:12px 14px; border:1px solid var(--green-100);
  border-radius:10px; font-size:14px; background:var(--cream);
  font-family:inherit; transition:border-color .2s, box-shadow .2s; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  outline:none; border-color:var(--green-400);
  box-shadow:0 0 0 3px var(--green-50); }
```
标签 `.form-group label`：12–13px、`--text-light`、下距 6px。

### Navigation（导航）
```css
.navbar { position:fixed; top:0; left:0; right:0; z-index:1000; padding:20px 0;
          transition:background .35s, box-shadow .35s, padding .35s; }
.navbar.scrolled { background:rgba(251,250,245,.94); backdrop-filter:blur(14px);
                   box-shadow:0 2px 26px rgba(22,51,26,.07); padding:13px 0; }
.nav-links a { color:rgba(255,255,255,.92); font-size:14px; font-weight:500; position:relative; }
.navbar.scrolled .nav-links a { color:var(--text); }
.nav-links a:not(.nav-cta)::after { content:""; position:absolute; left:0; bottom:-6px;
           width:0; height:2px; background:currentColor; transition:width .25s; }
.nav-links a:not(.nav-cta):hover::after { width:100%; }
.nav-cta { background:var(--secondary-green); color:#fff !important;
           padding:10px 22px; border-radius:999px; }
```
透明态盖在 Hero 上（白字）；下滚后转米白毛玻璃（深绿字）。移动端（≤768px）变右侧抽屉。

### Badges / Tags（标签 / 徽标）
```css
.case-tag { display:inline-block; font-size:11px; letter-spacing:1px;
            background:rgba(255,255,255,.22); padding:4px 12px; border-radius:999px; }
.kicker { display:inline-flex; align-items:center; gap:10px; font-size:12px; font-weight:600;
          letter-spacing:4px; text-transform:uppercase; color:var(--secondary-green); }
.kicker::before { content:""; width:30px; height:1.5px; background:var(--secondary-green); }
```

### Modals / Dialogs（模态，基于既有调性延展）
- 遮罩：`rgba(15,41,24,.5)`（深绿调，非纯黑）。
- 内容区：白底 `#fff`、圆角 `--radius`(22px)、阴影 `--shadow-lg`、内边距 40px+。
- 动画：`.reveal` 同款 `opacity/translateY` 缓动（`.85s cubic-bezier(.2,.7,.2,1)`）。
- 后台 `web/admin/` 实际用「右侧抽屉」（`openDrawer`），同此遮罩与缓动语言。

---

## 5. Layout Principles（布局原则）

### Spacing System（间距，基于既有节奏）
| 变量 | 值 | 用途 |
|------|----|------|
| `--gap` | `30px` | 网格默认列间距 |
| 区块内距 | `14 / 18 / 22 / 24 / 40 / 56 / 64 / 70px` | 卡片内距、栅格 gap、图文间距 |
| `.section` 上下 | `130px`（桌面）/ `100px`（≤1024）/ `76px`（≤768） | 大区块垂直节奏 |
| `.sec-head` 下距 | `64px`（桌面）/ `44px`（≤768） | 标题与内容间距 |

> 间距非严格 4px 倍数，但呈「小密大疏」节奏：组件内紧（14–22px）、区块间极松（130px）。保持此反差。

### Grid System（栅格）
- 概念上 **12 列不对称编辑式网格**；实现用 `fr` 比例制造张力，例如：
  - Hero：`5fr 7fr`（文 5 / 图 7）
  - About / Founder / Classroom：`5fr 6fr`
  - Services：`1.15fr .85fr`（一大带五小）
  - Cases：`1.5fr 1fr`（一大带两小）
- 列间距统一 `--gap`(30px)。

### Container（容器）
```css
.container { width:90%; max-width:var(--max-width); margin:0 auto; }  /* --max-width:1180px */
```
所有内容区 90% 宽、封顶 1180px 居中。

### 留白哲学
大留白即奢侈。Hero 占满 `100vh`；section 间 130px 呼吸；图片（hero-photo 600px、about-photo 520px）刻意做大，与 220–296px 小卡形成**悬殊比例**——这是高级感的发动机，不要「平均分配」。

---

## 6. Depth & Elevation（深度与层级）

### Shadow System（阴影系统，绿调）
```css
--shadow:    0 18px 50px rgba(22,51,26,.08);   /* 默认卡片 */
--shadow-lg: 0 30px 80px rgba(22,51,26,.16);   /* hover / 浮层 */
/* 以下为按同调性延展的梯度（可选） */
--shadow-xs: 0 2px 8px  rgba(22,51,26,.06);
--shadow-sm: 0 6px 18px rgba(22,51,26,.07);
--shadow-2xl:0 44px 110px rgba(22,51,26,.22);
```
**铁律**：阴影一律带绿调（rgba(22,51,26,*)），**禁用纯黑阴影**。

### Surface Layers（表面层级）
| 层级 | 取值 | 说明 |
|------|------|------|
| background（页面底） | `--paper #fbfaf5` | 官网主背景 |
| surface（浅区块） | `--cream #f4f1e8` | services / timeline / portfolio 等交替区块 |
| elevated（卡片） | `#fff` + `--shadow` | 白卡浮于浅底之上 |
| overlay（浮层） | `rgba(251,250,245,.94)` 毛玻璃 / `rgba(15,41,24,.5)` 模态遮罩 | 导航 scrolled、模态 |

### Z-index Scale（层级）
| 值 | 元素 |
|----|------|
| 1 | `.leaf-float-layer`（叶片动效，pointer-events:none） |
| 2 | 卡片信息渐变层 `.case-info` 等 |
| 1000 | `.navbar`、移动端 `.nav-links` 抽屉 |
| 2000+ | `.img-lightbox`（案例详情放大层，需在导航之上） |

### Backdrop Effects（毛玻璃）
- 导航 scrolled：`backdrop-filter: blur(14px)` + `background: rgba(251,250,245,.94)`。
- 避免在深绿 Hero 上做毛玻璃（信息已为白字，无需）。

---

## 7. Do's and Don'ts（设计规范与禁忌）

### Do's（推荐）
1. 标题一律用衬线（Noto Serif SC），正文用无衬线；不要混用第三方字体破坏统一。
2. 用**超大字号 + 悬殊比例**制造编辑式张力（大图 600px vs 小卡 220px）。
3. 分隔与装饰用**发丝线**（`--hair` rgba(22,51,26,.12)），而非粗边框或色块。
4. 阴影统一**绿调柔和**，层级靠 `--shadow` → `--shadow-lg` 两级跳。
5. 缺图时用**渐变占位**（`g-forest / g-sage / g-moss …`）兜底，保持版式完整。
6. 区块交替底色（paper / cream / green-900）制造节奏，而非全部白底。
7. 入场用 `.reveal` 滚动渐现；尊重 `prefers-reduced-motion: reduce`（关动效）。
8. 圆角统一大圆角（`--radius` 22px / `--radius-sm` 14px / 按钮 999px）。

### Don'ts（禁忌）
1. ❌ 不用纯黑（`#000`）作文字或阴影——用 `--ink #18241a` 与绿调阴影。
2. ❌ 不在绿系外引入高饱和色（如亮蓝/亮橙）破坏植物静谧感。
3. ❌ 不要 cram 内容——保持 130px 区块留白与宽松行高（≥1.78）。
4. ❌ 不用小圆角（≤8px）方盒卡片；坚持 22px 大圆角语言。
5. ❌ 不破坏「衬线标题 / 无衬线正文」层级；标题别用无衬线。
6. ❌ 不用中性灰黑重投影；阴影必带 `rgba(22,51,26,*)`。
7. ❌ 不在移动端保留多列拥挤网格——≤768px 一律单列、导航转抽屉。
8. ❌ 不硬编码字号 px 取消响应式——标题继续用 `clamp()` 流式缩放。

---

## 8. Responsive Behavior（响应式行为）

### Breakpoints（断点）
| 断点 | 范围 | 关键重排 |
|------|------|----------|
| Desktop | `> 1024px` | 默认多列编辑式网格 |
| Tablet | `≤ 1024px` | 双列网格（voices/portfolio/team/partner/badges → 2 列）；hero/about/founder 单列；cases 单列；section 间距 100px |
| Mobile | `≤ 768px` | 全部单列；导航变右侧抽屉（`74%` 宽）；stats 单列带顶分隔线；timeline 改左侧单列；section 间距 76px；display 字号降到 30px |

- 无独立「wide」断点——内容封顶 `--max-width:1180px` 居中，超宽屏不拉伸。
- `.container` 始终 `width:90%`，保证小屏边距舒适。

### Touch Targets（触摸目标）
- 按钮 `.btn` 内距 `15px 34px`（高 ≥44px）；导航链接点击区 `padding:14px 0` 满宽。
- 移动端 `.nav-cta` 显式 `margin-top:14px`、宽度自适应，避免误触。

### 折叠策略（内容重排）
- 非对称网格（5fr 7fr 等）在 ≤1024px 退化为单列，媒体区 `order:-1` 置顶。
- 卡片网格：4 列 → 2 列(≤1024) → 1 列(≤768)。
- 案例区 `.case-stack`：竖向(桌面) → 横排(≤1024) → 竖向(≤768)。

### Font Scaling（字体缩放）
- 标题全用 `clamp()`，随视口流式缩放；移动端 `.display` 锁 30px、`.hero-title` `clamp(38px,11vw,54px)`。
- 正文固定 15–16px 不缩，保证可读性。

---

## 9. Agent Prompt Guide（AI 代理提示指南）

### Quick Reference（速查）
- 品牌：绿趣植物空间艺术（植物美学 / 编辑式杂志 / 绿调克制）。
- 主色：`--primary-green #2D5A27`、`--secondary-green #4CAF50`、`--accent-green #8BC34A`。
- 字体：标题 `Noto Serif SC`，正文 `Noto Sans SC`。
- 圆角：大卡 22px / 小卡 14px / 按钮 999px。
- 阴影：只用 `rgba(22,51,26,*)` 绿调；卡片 `--shadow`、hover `--shadow-lg`。
- 间距：区块 130px，网格 gap 30px，Container 90%/1180px。
- 缺图：用 `.g-forest` 等渐变类兜底。

### Component Prompts（可直接复制的组件生成 Prompt）
1. 「生成一个绿趣风格的服务卡片：白底、圆角 22px、柔和绿调阴影、顶部 84×64 缩略图、衬线标题(Noto Serif SC)、下方 13px 说明，hover 上浮 3px。」
2. 「写一个绿趣 Hero 区块：深绿渐变底(#16331a→#3a7239)、衬线超大标题(clamp 46–86px, weight 900)、右侧 600px 圆角图片、漂浮叶片层 #leafLayer 保留。」
3. 「实现案例详情页 case.html：读 URL ?id=，fetch /api/cases/<id>，渲染面包屑 + 封面 hero + 正文(原样 HTML) + 图集画廊，画廊点击打开 .img-lightbox 放大层(z-index 2000+)。」
4. 「做一个绿趣数据条 stats：深绿底 #16331a、5 列、衬线巨型数字(clamp 46–74px, 绿点缀色)、细发丝竖分隔线，移动端单列。」
5. 「生成联系表单：label 12px 浅绿灰、input 圆角 10px 奶油底 + 绿调细边，focus 时边框变 #6cbf63 并加 3px #eef6e8 光环。」
6. 「输出移动端导航抽屉：≤768px 时右侧滑入 74% 宽白面板、链接深绿字、CTA 亮绿胶囊，复用 .nav-links.open 类与 right 过渡。」

### Iteration Guide（迭代建议）
1. 先锁定调色板与字体，再动版式——颜色/字体乱了全局就乱。
2. 任何新卡片先套 `.case-feature` 的「圆角 22 + shadow + hover 上浮」三件套，保持一致。
3. 标题永远衬线；若看起来「不够高级」，多半是字号不够大或留白不够——加大而不是加色。
4. 阴影发绿调是灵魂；一旦发现灰黑投影，立即改 `rgba(22,51,26,*)`。
5. 缺图别留空白块，用 `g-*` 渐变类占位，保持版式完整可演示。
6. 响应式先验证 ≤768px 单列与导航抽屉，再调中间断点。
7. 动画统一走 `.reveal`（opacity+translateY, .85s 缓动），并包 `prefers-reduced-motion` 关闭。
8. 新增区块用 `.section`(130px 间距) + `.container`(90%/1180px) + `.sec-head`，不要自造间距。
9. 文案用真实绿趣资料（知识库 PDF），杜绝占位 lorem；品牌 Slogan「让植物成为空间的加分项」。
10. 后台(`web/admin/`)与官网(`web/`)是两套视觉语言——本规范仅约束**官网前台**，后台保持功能优先、简洁可用即可。
