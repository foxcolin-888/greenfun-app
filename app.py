#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
绿趣 · 家装阳台植物花园 全流程管理系统（内部版）
后端：Python 标准库 http.server + sqlite3（零第三方依赖）
启动：python app.py
云端：监听 0.0.0.0，端口取环境变量 PORT（默认 8000），数据库路径取 DB_PATH（默认 ./greenfun.db）
"""

import os
import io
import csv
import json
import sqlite3
import datetime
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
FORMS_DIR = os.path.join(BASE_DIR, "forms")
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "greenfun.db"))
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8000))

# ---------------------------------------------------------------------------
# 八大阶段配置（字段与 V5 管理手册 55 份表单逐字对齐）
# type: text / number / date / textarea / select / radio / checkbox
# ---------------------------------------------------------------------------
STAGES = [
    {
        "id": 1, "key": "lead", "name": "获客引流",
        "form_file": "01_获客引流.md",
        "forms": ["客户线索登记表", "渠道来源汇总表", "异业合作登记表", "沙龙活动签到表", "老客户转介绍记录表"],
        "fields": [
            {"key": "name", "label": "客户姓名", "type": "text", "required": True},
            {"key": "phone", "label": "联系电话", "type": "text"},
            {"key": "wechat", "label": "微信", "type": "text"},
            {"key": "source_channel", "label": "来源渠道", "type": "select",
             "options": ["小红书", "抖音", "美团", "微信", "门店", "社区活动", "异业合作", "B端沙龙", "老客户转介绍"]},
            {"key": "lead_status", "label": "线索状态", "type": "select",
             "options": ["新", "跟进中", "已转化", "无效"]},
            {"key": "follow_up", "label": "跟进人", "type": "text"},
            {"key": "referrer", "label": "转介绍推荐人", "type": "text"},
            {"key": "channel_note", "label": "渠道/合作方备注", "type": "textarea"},
            {"key": "demand_summary", "label": "客户需求概述", "type": "textarea"},
        ],
    },
    {
        "id": 2, "key": "consult", "name": "咨询接待",
        "form_file": "02_咨询接待.md",
        "forms": ["客户咨询登记表", "客户需求初步调查表", "客户意向分级表", "到店客户接待记录表", "预约上门勘测登记表"],
        "fields": [
            {"key": "consult_method", "label": "咨询方式", "type": "select",
             "options": ["微信", "电话", "到店", "线上"]},
            {"key": "residence_type", "label": "住宅类型", "type": "select",
             "options": ["公寓", "别墅", "排屋", "平层", "LOFT", "其他"]},
            {"key": "balcony_area", "label": "阳台面积(㎡)", "type": "number", "unit": "㎡"},
            {"key": "initial_demand", "label": "初步需求(面积/装修进度/预算)", "type": "textarea"},
            {"key": "intent_level", "label": "意向分级", "type": "select",
             "options": ["A高意向", "B中意向", "C培育中", "暂养"]},
            {"key": "recept_note", "label": "到店/接待记录", "type": "textarea"},
            {"key": "appoint_survey", "label": "预约上门勘测日期", "type": "date"},
            {"key": "recept_person", "label": "接待人", "type": "text"},
        ],
    },
    {
        "id": 3, "key": "demand", "name": "需求深度沟通",
        "form_file": "03_需求深度沟通.md",
        "forms": ["客户深度需求访谈表", "阳台现场拍照记录表", "客户风格偏好确认表",
                  "客户植物偏好确认表", "项目预算确认表", "上门拜访记录表"],
        "fields": [
            {"key": "size_len", "label": "阳台长(m)", "type": "number"},
            {"key": "size_wid", "label": "阳台宽(m)", "type": "number"},
            {"key": "size_hgt", "label": "阳台高(m)", "type": "number"},
            {"key": "shape", "label": "阳台形状", "type": "radio",
             "options": ["矩形", "L型", "弧形", "不规则"]},
            {"key": "orientation", "label": "阳台朝向", "type": "select",
             "options": ["东", "南", "西", "北", "东南", "西南", "东北", "西北"]},
            {"key": "sunlight", "label": "日照时长", "type": "radio",
             "options": ["<2h", "2-4h", "4-6h", ">6h"]},
            {"key": "ventilation", "label": "通风条件", "type": "radio",
             "options": ["良好", "一般", "较差"]},
            {"key": "waterproof", "label": "防水现状", "type": "radio",
             "options": ["已做", "未做", "不确定"]},
            {"key": "drains", "label": "排水口数量", "type": "number"},
            {"key": "water_power", "label": "水源/电源", "type": "checkbox",
             "options": ["有水龙头", "有插座"]},
            {"key": "func_need", "label": "主要功能", "type": "checkbox",
             "options": ["休闲", "观赏", "种菜", "亲子", "会客", "综合"]},
            {"key": "style", "label": "风格偏好", "type": "radio",
             "options": ["日式", "中式", "现代简约", "热带风", "杂木风"]},
            {"key": "color_tone", "label": "色调偏好", "type": "radio",
             "options": ["绿色为主", "多彩花卉", "暖色调", "冷色调"]},
            {"key": "plant_pref", "label": "植物偏好类型", "type": "checkbox",
             "options": ["开花", "观叶", "果树", "多肉", "蕨类", "攀爬"]},
            {"key": "avoid_allergy", "label": "忌避/过敏植物", "type": "textarea"},
            {"key": "budget", "label": "总预算", "type": "radio",
             "options": ["1万以下", "1-3万", "3-5万", "5-10万", "10万以上"]},
            {"key": "expect_finish", "label": "期望完工时间", "type": "text"},
            {"key": "auto_water", "label": "自动浇灌", "type": "radio",
             "options": ["需要", "不需要", "可选"]},
            {"key": "light_need", "label": "灯光需求", "type": "radio",
             "options": ["需要", "不需要", "可选"]},
        ],
    },
    {
        "id": 4, "key": "survey", "name": "现场勘测",
        "form_file": "04_现场勘测.md",
        "forms": ["阳台现场勘测记录表", "阳台平面手绘草图", "现场照片档案",
                  "光照条件分析表", "防水_水电_承重评估表", "勘测确认签字单"],
        "fields": [
            {"key": "survey_date", "label": "勘测日期", "type": "date"},
            {"key": "surveyor", "label": "勘测人", "type": "text"},
            {"key": "light_analysis", "label": "光照条件分析", "type": "textarea"},
            {"key": "infra_eval", "label": "防水/水电/承重评估", "type": "textarea"},
            {"key": "sketch_note", "label": "平面草图说明", "type": "textarea"},
            {"key": "photo_archive", "label": "现场照片档案(路径/数量)", "type": "textarea"},
            {"key": "risk_points", "label": "主要风险点", "type": "textarea"},
            {"key": "survey_sign", "label": "客户签字确认", "type": "text"},
        ],
    },
    {
        "id": 5, "key": "design", "name": "方案设计与报价",
        "form_file": "05_方案设计与报价.md",
        "forms": ["设计方案审批单", "植物配置清单", "材料配置清单", "项目报价单",
                  "设计方案确认书", "方案修改记录表", "效果图_施工图档案"],
        "fields": [
            {"key": "design_status", "label": "设计方案审批状态", "type": "select",
             "options": ["草稿", "待审", "已批", "已确认"]},
            {"key": "design_fee", "label": "设计费(元)", "type": "number", "placeholder": "600"},
            {"key": "plant_list", "label": "植物配置清单", "type": "textarea"},
            {"key": "material_list", "label": "材料配置清单", "type": "textarea"},
            {"key": "quote_total", "label": "项目报价总额(元)", "type": "number"},
            {"key": "quote_detail", "label": "报价明细(设计费/植物/硬景/运输等8项)", "type": "textarea"},
            {"key": "design_sign", "label": "方案确认书签字", "type": "text"},
            {"key": "drawing_archive", "label": "效果图/施工图档案", "type": "textarea"},
        ],
    },
    {
        "id": 6, "key": "sign", "name": "签约收款",
        "form_file": "06_签约收款.md",
        "forms": ["项目施工合同(摘要)", "收款收据", "项目立项审批表",
                  "项目进度计划表", "项目交底记录表", "收款台账"],
        "fields": [
            {"key": "contract_status", "label": "合同状态", "type": "select",
             "options": ["未签", "待付款", "已签"]},
            {"key": "contract_summary", "label": "合同摘要", "type": "textarea"},
            {"key": "pay_30", "label": "首付款30%(元)", "type": "number"},
            {"key": "pay_40", "label": "中期款40%(元)", "type": "number"},
            {"key": "pay_tail", "label": "尾款30%(元)", "type": "number"},
            {"key": "received_total", "label": "已收款合计(元)", "type": "number"},
            {"key": "pay_ledger", "label": "收款台账", "type": "textarea"},
            {"key": "approve_note", "label": "立项审批", "type": "text"},
        ],
    },
    {
        "id": 7, "key": "build", "name": "采购施工交付",
        "form_file": "07_采购施工交付.md",
        "forms": ["采购清单及到货验收表", "植物进场质检表", "施工日志", "隐蔽工程验收记录",
                  "工程变更确认单", "完工自检表", "竣工验收单", "完工照片档案", "项目结算单", "尾款收据"],
        "fields": [
            {"key": "build_status", "label": "施工状态", "type": "select",
             "options": ["未开始", "采购中", "施工中", "完工待验", "已验收"]},
            {"key": "purchase_list", "label": "采购清单及到货验收", "type": "textarea"},
            {"key": "plant_qc", "label": "植物进场质检", "type": "textarea"},
            {"key": "build_log", "label": "施工日志", "type": "textarea"},
            {"key": "hidden_work", "label": "隐蔽工程验收", "type": "textarea"},
            {"key": "change_order", "label": "工程变更", "type": "textarea"},
            {"key": "accept_date", "label": "竣工验收日期", "type": "date"},
            {"key": "finish_photo", "label": "完工照片档案", "type": "textarea"},
            {"key": "settle_total", "label": "项目结算(元)", "type": "number"},
            {"key": "tail_receipt", "label": "尾款收据", "type": "text"},
        ],
    },
    {
        "id": 8, "key": "aftersale", "name": "售后养护",
        "form_file": "08_售后养护.md",
        "forms": ["植物养护卡", "阳台花园养护手册", "售后回访记录表", "植物状态评估表",
                  "养护服务工单", "植物换新申请单", "养护套餐合同", "客户满意度调查表", "转介绍登记表", "案例授权使用协议"],
        "fields": [
            {"key": "care_card", "label": "养护卡发放记录", "type": "textarea"},
            {"key": "care_plan", "label": "养护套餐", "type": "select",
             "options": ["无", "基础", "标准", "尊享"]},
            {"key": "revisit_record", "label": "回访记录", "type": "textarea"},
            {"key": "plant_eval", "label": "植物状态评估", "type": "textarea"},
            {"key": "care_order", "label": "养护服务工单", "type": "textarea"},
            {"key": "renew_apply", "label": "换新申请", "type": "textarea"},
            {"key": "satisfaction", "label": "满意度", "type": "select",
             "options": ["非常满意", "满意", "一般", "不满意"]},
            {"key": "refer_record", "label": "转介绍登记", "type": "textarea"},
            {"key": "case_auth", "label": "案例授权", "type": "select",
             "options": ["已授权", "未授权", "洽谈中"]},
        ],
    },
]

STAGE_NAMES = {s["id"]: s["name"] for s in STAGES}
STAGE_KEYS = {s["id"]: s["key"] for s in STAGES}


# ---------------------------------------------------------------------------
# 数据库
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, phone TEXT, wechat TEXT,
        source_channel TEXT, residence_type TEXT, balcony_area TEXT,
        budget_range TEXT, current_stage INTEGER DEFAULT 1,
        owner TEXT, status TEXT DEFAULT '线索',
        address TEXT, notes TEXT,
        created_at TEXT, updated_at TEXT
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS stage_data (
        customer_id INTEGER, stage INTEGER,
        data TEXT, operator TEXT, updated_at TEXT,
        PRIMARY KEY (customer_id, stage)
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER, stage INTEGER,
        action TEXT, operator TEXT, detail TEXT, created_at TEXT
    )""")
    conn.commit()
    conn.close()


def now_str():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# 轻量 Markdown -> HTML（适配 V5 表单格式：标题/表格/列表/引用/勾选/分隔线）
# ---------------------------------------------------------------------------
_FORM_CACHE = {}


def md_to_html(md):
    if md in _FORM_CACHE:
        return _FORM_CACHE[md]
    lines = md.split("\n")
    html = []
    i = 0
    in_table = False
    table_buf = []

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        html.append('<table class="md-table">')
        for idx, row in enumerate(table_buf):
            cells = [c.strip() for c in row.strip("|").split("|")]
            if idx == 0:
                html.append("<thead><tr>" + "".join(f"<th>{esc(c)}</th>" for c in cells) + "</tr></thead><tbody>")
            else:
                html.append("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in cells) + "</tr>")
        html.append("</tbody></table>")
        table_buf = []

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("|") and s.endswith("|") and "---" not in s:
            # a table row
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if nxt.startswith("|") and set(nxt.replace("|", "").replace(" ", "")) <= set("-:"):
                i += 1  # skip separator
                table_buf = []
                table_buf.append(line)
            elif table_buf:
                table_buf.append(line)
            else:
                table_buf = [line]
            in_table = True
            i += 1
            continue
        else:
            if in_table:
                flush_table()
                in_table = False
        if s == "---":
            html.append("<hr>")
        elif s.startswith("### "):
            html.append(f"<h3>{esc(s[4:])}</h3>")
        elif s.startswith("## "):
            html.append(f"<h2>{esc(s[3:])}</h2>")
        elif s.startswith("# "):
            html.append(f"<h1>{esc(s[2:])}</h1>")
        elif s.startswith("> "):
            html.append(f"<blockquote>{inline(s[2:])}</blockquote>")
        elif s.startswith("- "):
            html.append(f"<li>{inline(s[2:])}</li>")
        elif s == "":
            pass
        else:
            html.append(f"<p>{inline(s)}</p>")
        i += 1
    if in_table:
        flush_table()
    out = "\n".join(html)
    _FORM_CACHE[md] = out
    return out


def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def inline(t):
    t = esc(t)
    t = t.replace("**", "<strong>", 1) if t.count("**") >= 2 else t
    # handle remaining ** pairs
    while "**" in t:
        t = t.replace("**", "<strong>", 1).replace("**", "</strong>", 1)
    t = t.replace("□", '<span class="chk">☐</span>').replace("☑", '<span class="chk on">☑</span>')
    return t


def parse_forms_from_md(md):
    """从表单 markdown 中提取 '## 表单XX：名称' 列表"""
    forms = []
    for line in md.split("\n"):
        s = line.strip()
        if s.startswith("## 表单"):
            title = s[2:].strip()
            forms.append(title)
    return forms


# ---------------------------------------------------------------------------
# HTTP 处理
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8")

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/" or path == "/index.html":
            return self._static("index.html", "text/html; charset=utf-8")
        if path == "/app.js":
            return self._static("app.js", "text/javascript; charset=utf-8")
        if path == "/styles.css":
            return self._static("styles.css", "text/css; charset=utf-8")
        if path.startswith("/api/"):
            return self._api_get(path)
        return self._send(404, "Not found")

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "POST")

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "PUT")

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "DELETE")

    def _static(self, name, ctype):
        fp = os.path.join(WEB_DIR, name)
        if not os.path.exists(fp):
            return self._send(404, "missing")
        with open(fp, "rb") as f:
            self._send(200, f.read(), ctype)

    # ---- API GET ----
    def _api_get(self, path):
        if path == "/api/health":
            return self._json({"ok": True, "stages": len(STAGES)})
        if path == "/api/stages":
            return self._json(STAGES)
        if path == "/api/customers":
            return self._json(self._list_customers())
        if path == "/api/stats":
            return self._json(self._stats())
        if path == "/api/forms":
            return self._json(self._forms_index())
        if path.startswith("/api/forms/"):
            fname = urllib.parse.unquote(path[len("/api/forms/"):])
            return self._form_detail(fname)
        if path.startswith("/api/customers/"):
            parts = path.split("/")
            cid = parts[3] if len(parts) > 3 else None
            if cid and cid.isdigit():
                if len(parts) == 5 and parts[4] == "stages":
                    return self._json(self._customer_stages(int(cid)))
                return self._json(self._customer_detail(int(cid)))
        if path == "/api/export/csv":
            return self._export_csv()
        if path == "/api/export/json":
            return self._export_json()
        return self._json({"error": "unknown"}, 404)

    # ---- API write ----
    def _api_write(self, path, body, method):
        if path == "/api/customers" and method == "POST":
            return self._json(self._create_customer(body), 201)
        if path.startswith("/api/customers/"):
            parts = path.split("/")
            if len(parts) >= 4 and parts[3].isdigit():
                cid = int(parts[3])
                if len(parts) == 4:
                    if method == "PUT":
                        return self._json(self._update_customer(cid, body))
                    if method == "DELETE":
                        return self._json(self._delete_customer(cid))
                if len(parts) == 6 and parts[4] == "stage" and parts[5].isdigit():
                    if method == "PUT":
                        return self._json(self._save_stage(cid, int(parts[5]), body))
        return self._json({"error": "unknown"}, 404)

    # ---- business ----
    def _list_customers(self):
        conn = get_db()
        rows = conn.execute("SELECT * FROM customers ORDER BY id DESC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _customer_detail(self, cid):
        conn = get_db()
        c = conn.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if not c:
            conn.close()
            return {"error": "not found"}
        stages = {}
        for r in conn.execute("SELECT stage, data, operator, updated_at FROM stage_data WHERE customer_id=?", (cid,)):
            stages[r["stage"]] = {"data": json.loads(r["data"]), "operator": r["operator"], "updated_at": r["updated_at"]}
        log = [dict(r) for r in conn.execute(
            "SELECT * FROM activity_log WHERE customer_id=? ORDER BY id DESC", (cid,))]
        conn.close()
        return {"customer": dict(c), "stages": stages, "log": log}

    def _customer_stages(self, cid):
        conn = get_db()
        out = {}
        for r in conn.execute("SELECT stage, data, operator, updated_at FROM stage_data WHERE customer_id=?", (cid,)):
            out[r["stage"]] = {"data": json.loads(r["data"]), "operator": r["operator"], "updated_at": r["updated_at"]}
        conn.close()
        return out

    def _create_customer(self, body):
        t = now_str()
        name = (body.get("name") or "").strip()
        conn = get_db()
        cur = conn.execute(
            """INSERT INTO customers (name, phone, wechat, source_channel, residence_type,
               balcony_area, budget_range, current_stage, owner, status, address, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (name, body.get("phone"), body.get("wechat"), body.get("source_channel"),
             body.get("residence_type"), body.get("balcony_area"), body.get("budget_range"),
             1, body.get("owner"), body.get("status", "线索"), body.get("address"),
             body.get("notes"), t, t))
        cid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": cid, "name": name}

    def _update_customer(self, cid, body):
        t = now_str()
        conn = get_db()
        c = conn.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if not c:
            conn.close()
            return {"error": "not found"}
        fields = ["name", "phone", "wechat", "source_channel", "residence_type",
                  "balcony_area", "budget_range", "current_stage", "owner", "status",
                  "address", "notes"]
        sets = []
        vals = []
        for f in fields:
            if f in body:
                sets.append(f"{f}=?")
                vals.append(body[f])
        if sets:
            sets.append("updated_at=?")
            vals.append(t)
            vals.append(cid)
            conn.execute(f"UPDATE customers SET {','.join(sets)} WHERE id=?", vals)
            # 阶段推进记录
            if "current_stage" in body and int(body["current_stage"]) != c["current_stage"]:
                conn.execute(
                    "INSERT INTO activity_log (customer_id, stage, action, operator, detail, created_at) VALUES (?,?,?,?,?,?)",
                    (cid, int(body["current_stage"]), "推进阶段", body.get("operator", ""),
                     f"阶段由 {STAGE_NAMES.get(c['current_stage'],'?')} → {STAGE_NAMES.get(int(body['current_stage']),'?')}", t))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _delete_customer(self, cid):
        conn = get_db()
        conn.execute("DELETE FROM customers WHERE id=?", (cid,))
        conn.execute("DELETE FROM stage_data WHERE customer_id=?", (cid,))
        conn.execute("DELETE FROM activity_log WHERE customer_id=?", (cid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _save_stage(self, cid, stage, body):
        t = now_str()
        data = body.get("data", {})
        operator = body.get("operator", "")
        conn = get_db()
        conn.execute(
            """INSERT INTO stage_data (customer_id, stage, data, operator, updated_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(customer_id, stage)
               DO UPDATE SET data=excluded.data, operator=excluded.operator, updated_at=excluded.updated_at""",
            (cid, stage, json.dumps(data, ensure_ascii=False), operator, t))
        conn.execute(
            "INSERT INTO activity_log (customer_id, stage, action, operator, detail, created_at) VALUES (?,?,?,?,?,?)",
            (cid, stage, "保存阶段登记", operator, f"更新了【{STAGE_NAMES.get(stage,'?')}】", t))
        conn.commit()
        conn.close()
        return {"ok": True, "updated_at": t}

    def _stats(self):
        conn = get_db()
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers").fetchall()]
        stage_rows = conn.execute("SELECT customer_id, stage, data FROM stage_data").fetchall()
        conn.close()
        by_stage = {s["id"]: 0 for s in STAGES}
        by_source = {}
        by_owner = {}
        by_status = {}
        total_quote = 0.0
        total_received = 0.0
        total_settle = 0.0
        deal_count = 0
        stage_data_map = {}
        for r in stage_rows:
            stage_data_map.setdefault(r["customer_id"], {})[r["stage"]] = json.loads(r["data"])
        for c in customers:
            by_stage[c["current_stage"]] = by_stage.get(c["current_stage"], 0) + 1
            by_source[c["source_channel"] or "未填"] = by_source.get(c["source_channel"] or "未填", 0) + 1
            by_owner[c["owner"] or "未分配"] = by_owner.get(c["owner"] or "未分配", 0) + 1
            by_status[c["status"] or "线索"] = by_status.get(c["status"] or "线索", 0) + 1
            if c["status"] == "已成交":
                deal_count += 1
            sd = stage_data_map.get(c["id"], {})
            for k in ("quote_total", "received_total", "settle_total"):
                v = sd.get(5 if k == "quote_total" else (6 if k == "received_total" else 7), {}).get(k)
                if v not in (None, ""):
                    try:
                        if k == "quote_total":
                            total_quote += float(v)
                        elif k == "received_total":
                            total_received += float(v)
                        else:
                            total_settle += float(v)
                    except Exception:
                        pass
        total = len(customers)
        return {
            "total": total,
            "by_stage": by_stage,
            "by_source": by_source,
            "by_owner": by_owner,
            "by_status": by_status,
            "deal_count": deal_count,
            "conversion": round(deal_count / total, 3) if total else 0,
            "total_quote": total_quote,
            "total_received": total_received,
            "total_settle": total_settle,
        }

    def _forms_index(self):
        out = []
        for s in STAGES:
            fp = os.path.join(FORMS_DIR, s["form_file"])
            names = []
            if os.path.exists(fp):
                with open(fp, encoding="utf-8") as f:
                    names = parse_forms_from_md(f.read())
            out.append({
                "stage_id": s["id"], "stage_name": s["name"],
                "file": s["form_file"], "forms": names,
            })
        return out

    def _form_detail(self, fname):
        fp = os.path.join(FORMS_DIR, fname)
        if not os.path.exists(fp):
            return self._json({"error": "not found"}, 404)
        with open(fp, encoding="utf-8") as f:
            md = f.read()
        return self._send(200, json.dumps({"file": fname, "html": md_to_html(md), "raw": md},
                                          ensure_ascii=False), "application/json; charset=utf-8")

    def _export_csv(self):
        conn = get_db()
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY id").fetchall()]
        stage_rows = conn.execute("SELECT customer_id, stage, data FROM stage_data").fetchall()
        conn.close()
        sdm = {}
        for r in stage_rows:
            sdm.setdefault(r["customer_id"], {})[r["stage"]] = json.loads(r["data"])
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["ID", "客户姓名", "电话", "微信", "来源渠道", "住宅类型", "阳台面积",
                    "预算", "当前阶段", "负责人", "状态", "地址",
                    "设计费", "报价总额", "已收款", "结算额", "满意度", "创建时间", "更新时间"])
        for c in customers:
            sd = sdm.get(c["id"], {})
            s5 = sd.get(5, {})
            s6 = sd.get(6, {})
            s7 = sd.get(7, {})
            s8 = sd.get(8, {})
            w.writerow([c["id"], c["name"], c["phone"], c["wechat"], c["source_channel"],
                        c["residence_type"], c["balcony_area"], c["budget_range"],
                        STAGE_NAMES.get(c["current_stage"], ""), c["owner"], c["status"],
                        c["address"], s5.get("design_fee", ""), s5.get("quote_total", ""),
                        s6.get("received_total", ""), s7.get("settle_total", ""),
                        s8.get("satisfaction", ""), c["created_at"], c["updated_at"]])
        body = "\ufeff" + buf.getvalue()  # BOM for Excel
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", "attachment; filename=greenfun_customers.csv")
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _export_json(self):
        conn = get_db()
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY id").fetchall()]
        stage_rows = conn.execute("SELECT customer_id, stage, data, operator, updated_at FROM stage_data").fetchall()
        logs = [dict(r) for r in conn.execute("SELECT * FROM activity_log ORDER BY id").fetchall()]
        conn.close()
        sdm = {}
        for r in stage_rows:
            sdm.setdefault(r["customer_id"], {})[r["stage"]] = {
                "data": json.loads(r["data"]), "operator": r["operator"], "updated_at": r["updated_at"]}
        for c in customers:
            c["stages"] = sdm.get(c["id"], {})
        payload = {"exported_at": now_str(), "customers": customers, "activity_log": logs, "stages": STAGES}
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", "attachment; filename=greenfun_backup.json")
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # 静默日志


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"绿趣全流程管理系统已启动： http://localhost:{PORT}")
    print(f"数据库：{DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
