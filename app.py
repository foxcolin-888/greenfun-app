#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
绿趣 · 家装阳台植物花园 全流程管理系统（内部版）
后端：Python 标准库 http.server + sqlite3（零第三方依赖）
启动：python app.py
云端：监听 0.0.0.0，端口取环境变量 PORT（默认 8000），数据库路径取 DB_PATH（默认 ./greenfun.db）

v2 新增：
  1) 员工账号 + 登录鉴权 + 四级角色权限（管理员/店长/销售/设计师）
  2) 报价价格库 + 公式参数设置（价格支撑）
  3) 上传/粘贴清单 -> 匹配价格库 -> 自动公式化计算报价单
"""

import os
import io
import re
import csv
import json
import hmac
import hashlib
import secrets
import sqlite3
import datetime
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
FORMS_DIR = os.path.join(BASE_DIR, "forms")
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "greenfun.db"))
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8000))

# 会话有效期（秒）
SESSION_TTL = 12 * 3600
# token -> {"username","name","role","exp"}
SESSIONS = {}

ROLE_NAMES = {"admin": "管理员", "manager": "店长", "sales": "销售顾问", "designer": "设计师"}

# ---------------------------------------------------------------------------
# 八大阶段配置（字段与 V5 管理手册 55 份表单逐字对齐）
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
# 报价费用分类 -> 报价单 8 项归集
#   植物-*  -> 植物费用       硬景-*  -> 硬景施工费
#   辅材-*  -> 土壤及辅材     水电-*  -> 水电工程
# ---------------------------------------------------------------------------
CAT_GROUP = {
    "植物": "plant_fee",
    "硬景": "hardscape_fee",
    "辅材": "soil_fee",
    "水电": "mep_fee",
}


def cat_group(category):
    prefix = (category or "").split("-")[0]
    return CAT_GROUP.get(prefix, "plant_fee")


# ---------------------------------------------------------------------------
# 默认账号（首次启动内置；免费版重启会重建，请上线后尽快改密码）
# ---------------------------------------------------------------------------
DEFAULT_USERS = [
    ("lvquguanliyuan", "123456", "系统管理员", "admin"),
    ("dianzhang", "green123", "店长", "manager"),
    ("xiaoshou", "green123", "销售顾问", "sales"),
    ("sheji", "green123", "设计师", "designer"),
]

# ---------------------------------------------------------------------------
# 默认公式参数（费率）
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    "design_fee_per_sqm": "80",    # 设计费 元/㎡
    "design_fee_min": "600",       # 设计费保底
    "transport_rate": "0.08",      # 运输安装费 = 费率 × (硬景+植物+辅材+水电)
    "mgmt_rate": "0.06",           # 项目管理费 = 费率 × 小计(设计+硬景+植物+辅材+水电+运输)
    "tax_rate": "0.03",            # 税金 = 费率 × (小计+管理费)
}

# ---------------------------------------------------------------------------
# 默认价格库（温州阳台花园行情参考价，可在系统内增删改）
# (category, name, spec, unit, unit_price)
# ---------------------------------------------------------------------------
DEFAULT_PRICE_ITEMS = [
    # 植物-乔木/大型
    ("植物-乔木", "造型黑松", "H1.5m", "株", 1800),
    ("植物-乔木", "日本红枫", "H1.8m", "株", 1200),
    ("植物-乔木", "罗汉松", "造型", "株", 2600),
    ("植物-乔木", "鸡爪槭", "H1.5m", "株", 680),
    ("植物-乔木", "橄榄树", "H2m", "株", 1500),
    ("植物-乔木", "柠檬树", "结果苗", "株", 380),
    ("植物-乔木", "桂花", "H1.5m", "株", 450),
    ("植物-乔木", "蓝莓", "盆栽", "株", 120),
    # 植物-灌木/中型
    ("植物-灌木", "绣球", "2加仑", "株", 85),
    ("植物-灌木", "杜鹃球", "Φ40", "株", 120),
    ("植物-灌木", "栀子花", "1加仑", "株", 45),
    ("植物-灌木", "茶花", "H0.8m", "株", 180),
    ("植物-灌木", "南天竹", "H0.6m", "株", 60),
    ("植物-灌木", "金边瑞香", "1加仑", "株", 90),
    # 植物-草本/小型
    ("植物-草本", "玛格丽特", "盆", "盆", 25),
    ("植物-草本", "薰衣草", "盆", "盆", 28),
    ("植物-草本", "天竺葵", "盆", "盆", 22),
    ("植物-草本", "矾根", "盆", "盆", 18),
    ("植物-草本", "铁线莲", "2年苗", "盆", 55),
    ("植物-草本", "灌木月季", "盆", "盆", 45),
    # 植物-多肉/观叶
    ("植物-观叶", "橡皮树", "盆", "盆", 120),
    ("植物-观叶", "龟背竹", "盆", "盆", 90),
    ("植物-观叶", "天堂鸟", "H1m", "盆", 260),
    ("植物-观叶", "琴叶榕", "H1.2m", "盆", 220),
    ("植物-观叶", "散尾葵", "H1m", "盆", 110),
    ("植物-观叶", "多肉组合盆", "组合", "盆", 68),
    # 植物-攀爬/垂吊
    ("植物-攀爬", "炮仗花", "盆", "盆", 55),
    ("植物-攀爬", "蔓性月季", "盆", "盆", 60),
    ("植物-攀爬", "常春藤", "盆", "盆", 18),
    ("植物-攀爬", "风车茉莉(络石)", "盆", "盆", 35),
    # 硬景-花箱/花器
    ("硬景-花器", "防腐木花箱", "1m", "个", 280),
    ("硬景-花器", "铝合金种植箱", "1m", "个", 420),
    ("硬景-花器", "陶土大花盆", "Φ40", "个", 150),
    ("硬景-花器", "自动吸水花盆", "Φ30", "个", 90),
    ("硬景-花器", "玻璃钢组合花器", "套", "套", 680),
    # 硬景-铺装/地面
    ("硬景-铺装", "防腐木地板", "含铺装", "㎡", 220),
    ("硬景-铺装", "塑木地板", "含铺装", "㎡", 180),
    ("硬景-铺装", "火山岩铺装", "含铺装", "㎡", 260),
    ("硬景-铺装", "人造草坪", "含铺装", "㎡", 65),
    ("硬景-铺装", "装饰鹅卵石", "袋", "袋", 35),
    # 硬景-围栏/格栅
    ("硬景-围栏", "碳化木格栅", "含安装", "㎡", 240),
    ("硬景-围栏", "铝艺围栏", "含安装", "米", 180),
    ("硬景-围栏", "防腐木花架", "个", "个", 650),
    ("硬景-围栏", "月洞门/造景框", "个", "个", 1200),
    # 辅材-土壤/基质
    ("辅材-土壤", "营养种植土", "50L", "包", 45),
    ("辅材-土壤", "泥炭土", "50L", "包", 60),
    ("辅材-土壤", "陶粒(排水层)", "袋", "袋", 25),
    ("辅材-土壤", "珍珠岩", "袋", "袋", 20),
    ("辅材-土壤", "有机基肥", "包", "包", 35),
    # 辅材-肥料/装饰
    ("辅材-装饰", "缓释肥", "包", "包", 40),
    ("辅材-装饰", "花园装饰摆件", "个", "个", 120),
    ("辅材-装饰", "防草布", "㎡", "㎡", 8),
    # 水电-浇灌系统
    ("水电-浇灌", "自动滴灌系统", "标准阳台", "套", 1200),
    ("水电-浇灌", "智能浇灌控制器", "台", "台", 480),
    ("水电-浇灌", "滴灌管件套装", "套", "套", 260),
    ("水电-浇灌", "雾化喷淋系统", "套", "套", 680),
    # 水电-灯光照明
    ("水电-灯光", "户外防水射灯", "个", "个", 85),
    ("水电-灯光", "太阳能庭院灯", "个", "个", 120),
    ("水电-灯光", "LED灯带", "5m/卷", "卷", 90),
    ("水电-灯光", "氛围串灯", "套", "套", 60),
]


# ---------------------------------------------------------------------------
# 数据库
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def hash_pw(pw, salt=None):
    if salt is None:
        salt = secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"{salt}${h}"


def verify_pw(pw, stored):
    try:
        salt, h = stored.split("$", 1)
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return hmac.compare_digest(calc, h)


def init_db():
    if os.path.dirname(DB_PATH):
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
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE, pw TEXT, name TEXT,
        role TEXT DEFAULT 'sales', active INTEGER DEFAULT 1,
        created_at TEXT
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS price_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, name TEXT, spec TEXT, unit TEXT,
        unit_price REAL, notes TEXT, active INTEGER DEFAULT 1,
        updated_at TEXT
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER, quote_no TEXT, title TEXT,
        items TEXT, area REAL,
        design_fee REAL, hardscape_fee REAL, plant_fee REAL, soil_fee REAL, mep_fee REAL,
        transport_rate REAL, transport_fee REAL,
        subtotal REAL, mgmt_rate REAL, mgmt_fee REAL,
        tax_rate REAL, tax REAL, discount REAL, total REAL,
        status TEXT DEFAULT '草稿', remark TEXT,
        created_by TEXT, approved_by TEXT, created_at TEXT, updated_at TEXT
    )""")
    conn.commit()

    # 种子：账号
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        t = now_str()
        for u, pw, name, role in DEFAULT_USERS:
            conn.execute("INSERT INTO users (username, pw, name, role, active, created_at) VALUES (?,?,?,?,1,?)",
                         (u, hash_pw(pw), name, role, t))
    # 种子：价格库
    if conn.execute("SELECT COUNT(*) FROM price_items").fetchone()[0] == 0:
        t = now_str()
        for cat, name, spec, unit, price in DEFAULT_PRICE_ITEMS:
            conn.execute("INSERT INTO price_items (category, name, spec, unit, unit_price, active, updated_at) VALUES (?,?,?,?,?,1,?)",
                         (cat, name, spec, unit, float(price), t))
    # 种子：公式参数
    for k, v in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)", (k, v))
    conn.commit()

    # 账号迁移：将旧管理员 admin 平滑迁移为新管理员账号（无论全新库还是已有库都生效）
    _migrate_admin(conn)

    conn.close()


def _migrate_admin(conn):
    """将默认管理员账号平滑迁移为 DEFAULT_USERS[0] 指定的账号/密码。
    处理三种情况：① 旧 admin 存在 → 重命名+重置密码；② 新账号已存在(非admin) → 仅确保其为admin且密码正确；
    ③ 都不存在 → 不处理（由种子负责）。避免在已有库上重复创建导致查无此账号。"""
    if not DEFAULT_USERS:
        return
    new_user, new_pw, new_name, new_role = DEFAULT_USERS[0]
    t = now_str()
    old = conn.execute("SELECT * FROM users WHERE username=?", ("admin",)).fetchone()
    exist_new = conn.execute("SELECT * FROM users WHERE username=?", (new_user,)).fetchone()
    if old and old["username"] != new_user:
        # 若新账号名已被别人占用，先释放（理论上不会发生）
        if exist_new:
            conn.execute("DELETE FROM users WHERE username=?", (new_user,))
        conn.execute(
            "UPDATE users SET username=?, pw=?, name=?, role=?, active=1 WHERE id=?",
            (new_user, hash_pw(new_pw), new_name, new_role, old["id"]))
        conn.commit()
    elif exist_new:
        # 新账号已存在：确保角色为 admin 且密码正确（修复历史库中可能不一致的密码）
        if exist_new["role"] != new_role or not verify_pw(new_pw, exist_new["pw"]):
            conn.execute("UPDATE users SET role=?, pw=?, active=1 WHERE id=?",
                         (new_role, hash_pw(new_pw), exist_new["id"]))
            conn.commit()


def now_str():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    out = dict(DEFAULT_SETTINGS)
    for r in rows:
        out[r["key"]] = r["value"]
    return out


def to_float(v, default=0.0):
    try:
        if v in (None, ""):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# 报价计算引擎
# ---------------------------------------------------------------------------
def calc_quote(items, params):
    """items: [{category, name, spec, unit, qty, unit_price}], params: dict"""
    groups = {"plant_fee": 0.0, "hardscape_fee": 0.0, "soil_fee": 0.0, "mep_fee": 0.0}
    norm_items = []
    for it in items:
        qty = to_float(it.get("qty"), 0)
        up = to_float(it.get("unit_price"), 0)
        sub = round(qty * up, 2)
        cat = it.get("category", "植物-其他")
        groups[cat_group(cat)] += sub
        norm_items.append({
            "category": cat, "name": it.get("name", ""), "spec": it.get("spec", ""),
            "unit": it.get("unit", ""), "qty": qty, "unit_price": up, "subtotal": sub,
            "matched": it.get("matched", True),
        })

    s = get_settings()
    # 设计费：优先取传入值，否则按面积公式
    if params.get("design_fee") not in (None, ""):
        design_fee = to_float(params.get("design_fee"), 0)
    else:
        area = to_float(params.get("area"), 0)
        design_fee = max(area * to_float(s["design_fee_per_sqm"], 80), to_float(s["design_fee_min"], 600))
    design_fee = round(design_fee, 2)

    plant_fee = round(groups["plant_fee"], 2)
    hardscape_fee = round(groups["hardscape_fee"], 2)
    soil_fee = round(groups["soil_fee"], 2)
    mep_fee = round(groups["mep_fee"], 2)

    materials_base = plant_fee + hardscape_fee + soil_fee + mep_fee
    transport_rate = to_float(params.get("transport_rate"), to_float(s["transport_rate"], 0.08))
    transport_fee = round(materials_base * transport_rate, 2)

    subtotal = round(design_fee + materials_base + transport_fee, 2)
    mgmt_rate = to_float(params.get("mgmt_rate"), to_float(s["mgmt_rate"], 0.06))
    mgmt_fee = round(subtotal * mgmt_rate, 2)

    tax_rate = to_float(params.get("tax_rate"), to_float(s["tax_rate"], 0.03))
    tax = round((subtotal + mgmt_fee) * tax_rate, 2)

    discount = to_float(params.get("discount"), 0)
    total = round(subtotal + mgmt_fee + tax - discount, 2)

    return {
        "items": norm_items,
        "area": to_float(params.get("area"), 0),
        "design_fee": design_fee,
        "plant_fee": plant_fee, "hardscape_fee": hardscape_fee,
        "soil_fee": soil_fee, "mep_fee": mep_fee,
        "transport_rate": transport_rate, "transport_fee": transport_fee,
        "subtotal": subtotal,
        "mgmt_rate": mgmt_rate, "mgmt_fee": mgmt_fee,
        "tax_rate": tax_rate, "tax": tax,
        "discount": discount, "total": total,
    }


_NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")


def is_num(s):
    return bool(_NUM_RE.match(s.strip()))


def norm(s):
    return re.sub(r"[\s\(\)（）·、,，]", "", (s or "")).lower()


def match_price_item(name, price_items):
    """在价格库中找最优匹配：精确 > 名称包含 > 词包含"""
    n = norm(name)
    if not n:
        return None
    # 精确
    for p in price_items:
        if norm(p["name"]) == n:
            return p
    # 库名包含在输入里 / 输入包含库名
    best = None
    best_len = 0
    for p in price_items:
        pn = norm(p["name"])
        if not pn:
            continue
        if pn in n or n in pn:
            if len(pn) > best_len:
                best = p
                best_len = len(pn)
    return best


def parse_quote_list(text, price_items):
    """解析粘贴/上传的清单文本 -> 匹配价格库"""
    matched = []
    unmatched = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        # 跳过明显的表头
        if line.replace("|", "").strip() in ("", "序号名称规格数量单价", "名称规格数量"):
            continue
        parts = [p for p in re.split(r"[\t,，;；|]+|\s{2,}", line) if p.strip()]
        if len(parts) == 1:
            parts = line.split()
        if not parts:
            continue
        # 去掉可能的行首序号
        if len(parts) > 1 and is_num(parts[0]) and float(parts[0]) < 1000 and float(parts[0]) == int(float(parts[0])):
            # 仅当后面还有非数字名称时，才视首列为序号
            if any(not is_num(x) for x in parts[1:]):
                parts = parts[1:]
        name = parts[0]
        rest = parts[1:]
        nums = [x for x in rest if is_num(x)]
        texts = [x for x in rest if not is_num(x)]
        qty = float(nums[0]) if len(nums) >= 1 else 1.0
        given_price = float(nums[1]) if len(nums) >= 2 else None
        spec = texts[0] if texts else ""

        p = match_price_item(name, price_items)
        if p:
            matched.append({
                "price_id": p["id"], "category": p["category"], "name": p["name"],
                "spec": spec or p["spec"], "unit": p["unit"],
                "qty": qty, "unit_price": given_price if given_price is not None else p["unit_price"],
                "matched": True, "input": line,
            })
        elif given_price is not None:
            matched.append({
                "price_id": None, "category": "植物-其他", "name": name,
                "spec": spec, "unit": "项", "qty": qty, "unit_price": given_price,
                "matched": False, "input": line,
            })
        else:
            unmatched.append(line)
    return {"items": matched, "unmatched": unmatched}


# ---------------------------------------------------------------------------
# 轻量 Markdown -> HTML
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
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if nxt.startswith("|") and set(nxt.replace("|", "").replace(" ", "")) <= set("-:"):
                i += 1
                table_buf = [line]
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
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def inline(t):
    t = esc(t)
    while "**" in t:
        t = t.replace("**", "<strong>", 1).replace("**", "</strong>", 1)
    t = t.replace("□", '<span class="chk">☐</span>').replace("☑", '<span class="chk on">☑</span>')
    return t


def parse_forms_from_md(md):
    forms = []
    for line in md.split("\n"):
        s = line.strip()
        if s.startswith("## 表单"):
            forms.append(s[2:].strip())
    return forms


def money(v):
    try:
        return "{:,.2f}".format(float(v or 0))
    except (TypeError, ValueError):
        return "0.00"


# ---------------------------------------------------------------------------
# HTTP 处理
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
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

    # ---- 鉴权 ----
    def _auth(self):
        """返回当前用户 dict 或 None"""
        h = self.headers.get("Authorization", "")
        token = h[7:].strip() if h.startswith("Bearer ") else ""
        if not token:
            return None
        sess = SESSIONS.get(token)
        if not sess:
            return None
        if sess["exp"] < datetime.datetime.now().timestamp():
            SESSIONS.pop(token, None)
            return None
        sess["exp"] = datetime.datetime.now().timestamp() + SESSION_TTL
        return sess

    def _need(self, roles=None):
        """要求登录，可选角色限制。通过返回 user，否则已回写响应并返回 None"""
        u = self._auth()
        if not u:
            self._json({"error": "未登录或会话已过期", "code": 401}, 401)
            return None
        if roles and u["role"] not in roles:
            self._json({"error": "无权限", "code": 403}, 403)
            return None
        return u

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/", "/index.html"):
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
        # 报价单打印页（内嵌 token 校验，用查询参数携带 token 以便新窗口打开）
        if path.startswith("/api/quotes/") and path.endswith("/print"):
            return self._quote_print(path)

        u = self._need()
        if not u:
            return
        if path == "/api/me":
            return self._json({"user": {k: u[k] for k in ("username", "name", "role")}})
        if path == "/api/stages":
            return self._json(STAGES)
        if path == "/api/customers":
            return self._json(self._list_customers(u))
        if path == "/api/stats":
            return self._json(self._stats(u))
        if path == "/api/forms":
            return self._json(self._forms_index())
        if path.startswith("/api/forms/"):
            fname = urllib.parse.unquote(path[len("/api/forms/"):])
            return self._form_detail(fname)
        if path == "/api/prices":
            return self._json(self._list_prices())
        if path == "/api/prices/categories":
            return self._json(self._price_categories())
        if path == "/api/settings":
            return self._json(get_settings())
        if path == "/api/users":
            if u["role"] != "admin":
                return self._json({"error": "无权限"}, 403)
            return self._json(self._list_users())
        if path == "/api/quotes":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            cid = qs.get("customer_id", [None])[0]
            return self._json(self._list_quotes(int(cid) if cid and cid.isdigit() else None))
        if path.startswith("/api/quotes/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit():
                return self._json(self._quote_detail(int(parts[3])))
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
        # 登录/登出无需鉴权
        if path == "/api/login" and method == "POST":
            return self._login(body)
        if path == "/api/logout" and method == "POST":
            return self._logout()

        u = self._need()
        if not u:
            return

        # 客户
        if path == "/api/customers" and method == "POST":
            return self._json(self._create_customer(body, u), 201)
        if path.startswith("/api/customers/"):
            parts = path.split("/")
            if len(parts) >= 4 and parts[3].isdigit():
                cid = int(parts[3])
                if len(parts) == 4:
                    if method == "PUT":
                        return self._json(self._update_customer(cid, body, u))
                    if method == "DELETE":
                        return self._json(self._delete_customer(cid, u))
                if len(parts) == 6 and parts[4] == "stage" and parts[5].isdigit():
                    if method == "PUT":
                        return self._json(self._save_stage(cid, int(parts[5]), body, u))

        # 价格库（管理员/店长可写）
        if path == "/api/prices" and method == "POST":
            if u["role"] not in ("admin", "manager"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._create_price(body), 201)
        if path.startswith("/api/prices/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit():
                if u["role"] not in ("admin", "manager"):
                    return self._json({"error": "无权限"}, 403)
                pid = int(parts[3])
                if method == "PUT":
                    return self._json(self._update_price(pid, body))
                if method == "DELETE":
                    return self._json(self._delete_price(pid))

        # 公式参数
        if path == "/api/settings" and method == "PUT":
            if u["role"] not in ("admin", "manager"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._update_settings(body))

        # 员工账号（管理员）
        if path == "/api/users" and method == "POST":
            if u["role"] != "admin":
                return self._json({"error": "无权限"}, 403)
            return self._json(self._create_user(body), 201)
        if path.startswith("/api/users/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit():
                if u["role"] != "admin":
                    return self._json({"error": "无权限"}, 403)
                uid = int(parts[3])
                if method == "PUT":
                    return self._json(self._update_user(uid, body))
                if method == "DELETE":
                    return self._json(self._delete_user(uid, u))

        # 报价
        if path == "/api/quotes/parse" and method == "POST":
            return self._json(self._quote_parse(body))
        if path == "/api/quotes/calc" and method == "POST":
            return self._json(calc_quote(body.get("items", []), body))
        if path == "/api/quotes" and method == "POST":
            return self._json(self._create_quote(body, u), 201)
        if path.startswith("/api/quotes/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit():
                qid = int(parts[3])
                if method == "PUT":
                    return self._json(self._update_quote(qid, body, u))
                if method == "DELETE":
                    return self._json(self._delete_quote(qid))
            if len(parts) == 5 and parts[3].isdigit() and parts[4] == "status":
                if u["role"] not in ("admin", "manager"):
                    return self._json({"error": "仅店长/管理员可审批"}, 403)
                return self._json(self._quote_status(int(parts[3]), body, u))

        return self._json({"error": "unknown"}, 404)

    # ---- 鉴权业务 ----
    def _login(self, body):
        username = (body.get("username") or "").strip()
        pw = body.get("password") or ""
        conn = get_db()
        r = conn.execute("SELECT * FROM users WHERE username=? AND active=1", (username,)).fetchone()
        conn.close()
        if not r or not verify_pw(pw, r["pw"]):
            return self._json({"error": "用户名或密码错误"}, 401)
        token = secrets.token_hex(24)
        SESSIONS[token] = {
            "username": r["username"], "name": r["name"], "role": r["role"],
            "exp": datetime.datetime.now().timestamp() + SESSION_TTL,
        }
        return self._json({"token": token, "user": {"username": r["username"], "name": r["name"], "role": r["role"]}})

    def _logout(self):
        h = self.headers.get("Authorization", "")
        token = h[7:].strip() if h.startswith("Bearer ") else ""
        SESSIONS.pop(token, None)
        return self._json({"ok": True})

    # ---- 客户业务 ----
    def _can_see_all(self, u):
        return u["role"] in ("admin", "manager", "designer")

    def _list_customers(self, u):
        conn = get_db()
        rows = conn.execute("SELECT * FROM customers ORDER BY id DESC").fetchall()
        conn.close()
        data = [dict(r) for r in rows]
        if not self._can_see_all(u):
            # 销售仅看自己（负责人 == 姓名或用户名）
            mine = {u["name"], u["username"]}
            data = [c for c in data if (c.get("owner") or "") in mine]
        return data

    def _owned(self, c, u):
        return self._can_see_all(u) or (c.get("owner") or "") in {u["name"], u["username"]}

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
        quotes = [dict(r) for r in conn.execute(
            "SELECT id, quote_no, title, total, status, created_at FROM quotes WHERE customer_id=? ORDER BY id DESC", (cid,))]
        conn.close()
        return {"customer": dict(c), "stages": stages, "log": log, "quotes": quotes}

    def _customer_stages(self, cid):
        conn = get_db()
        out = {}
        for r in conn.execute("SELECT stage, data, operator, updated_at FROM stage_data WHERE customer_id=?", (cid,)):
            out[r["stage"]] = {"data": json.loads(r["data"]), "operator": r["operator"], "updated_at": r["updated_at"]}
        conn.close()
        return out

    def _create_customer(self, body, u):
        t = now_str()
        name = (body.get("name") or "").strip()
        owner = body.get("owner") or u["name"]
        conn = get_db()
        cur = conn.execute(
            """INSERT INTO customers (name, phone, wechat, source_channel, residence_type,
               balcony_area, budget_range, current_stage, owner, status, address, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (name, body.get("phone"), body.get("wechat"), body.get("source_channel"),
             body.get("residence_type"), body.get("balcony_area"), body.get("budget_range"),
             1, owner, body.get("status", "线索"), body.get("address"),
             body.get("notes"), t, t))
        cid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": cid, "name": name}

    def _update_customer(self, cid, body, u):
        t = now_str()
        conn = get_db()
        c = conn.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if not c:
            conn.close()
            return {"error": "not found"}
        if not self._owned(dict(c), u):
            conn.close()
            return {"error": "无权限操作他人客户", "code": 403}
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
            if "current_stage" in body and int(body["current_stage"]) != c["current_stage"]:
                conn.execute(
                    "INSERT INTO activity_log (customer_id, stage, action, operator, detail, created_at) VALUES (?,?,?,?,?,?)",
                    (cid, int(body["current_stage"]), "推进阶段", u["name"],
                     f"阶段由 {STAGE_NAMES.get(c['current_stage'],'?')} → {STAGE_NAMES.get(int(body['current_stage']),'?')}", t))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _delete_customer(self, cid, u):
        conn = get_db()
        c = conn.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone()
        if c and not self._owned(dict(c), u):
            conn.close()
            return {"error": "无权限删除他人客户", "code": 403}
        conn.execute("DELETE FROM customers WHERE id=?", (cid,))
        conn.execute("DELETE FROM stage_data WHERE customer_id=?", (cid,))
        conn.execute("DELETE FROM activity_log WHERE customer_id=?", (cid,))
        conn.execute("DELETE FROM quotes WHERE customer_id=?", (cid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _save_stage(self, cid, stage, body, u):
        t = now_str()
        data = body.get("data", {})
        operator = body.get("operator") or u["name"]
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

    # ---- 价格库 ----
    def _list_prices(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        cat = qs.get("category", [None])[0]
        q = qs.get("q", [None])[0]
        conn = get_db()
        rows = conn.execute("SELECT * FROM price_items WHERE active=1 ORDER BY category, id").fetchall()
        conn.close()
        out = [dict(r) for r in rows]
        if cat:
            out = [r for r in out if r["category"] == cat]
        if q:
            out = [r for r in out if q in (r["name"] or "")]
        return out

    def _price_categories(self):
        conn = get_db()
        rows = conn.execute("SELECT DISTINCT category FROM price_items WHERE active=1 ORDER BY category").fetchall()
        conn.close()
        return [r["category"] for r in rows]

    def _create_price(self, body):
        t = now_str()
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO price_items (category, name, spec, unit, unit_price, notes, active, updated_at) VALUES (?,?,?,?,?,?,1,?)",
            (body.get("category", "植物-其他"), body.get("name", ""), body.get("spec", ""),
             body.get("unit", "项"), to_float(body.get("unit_price"), 0), body.get("notes", ""), t))
        conn.commit()
        pid = cur.lastrowid
        conn.close()
        return {"id": pid}

    def _update_price(self, pid, body):
        t = now_str()
        conn = get_db()
        conn.execute(
            "UPDATE price_items SET category=?, name=?, spec=?, unit=?, unit_price=?, notes=?, updated_at=? WHERE id=?",
            (body.get("category"), body.get("name"), body.get("spec"), body.get("unit"),
             to_float(body.get("unit_price"), 0), body.get("notes", ""), t, pid))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _delete_price(self, pid):
        conn = get_db()
        conn.execute("UPDATE price_items SET active=0 WHERE id=?", (pid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _update_settings(self, body):
        conn = get_db()
        for k in DEFAULT_SETTINGS:
            if k in body:
                conn.execute("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                             (k, str(body[k])))
        conn.commit()
        conn.close()
        return get_settings()

    # ---- 员工账号 ----
    def _list_users(self):
        conn = get_db()
        rows = conn.execute("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _create_user(self, body):
        username = (body.get("username") or "").strip()
        pw = body.get("password") or ""
        if not username or not pw:
            return {"error": "用户名和密码必填"}
        conn = get_db()
        exist = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        if exist:
            conn.close()
            return {"error": "用户名已存在"}
        cur = conn.execute(
            "INSERT INTO users (username, pw, name, role, active, created_at) VALUES (?,?,?,?,1,?)",
            (username, hash_pw(pw), body.get("name", username), body.get("role", "sales"), now_str()))
        conn.commit()
        uid = cur.lastrowid
        conn.close()
        return {"id": uid}

    def _update_user(self, uid, body):
        conn = get_db()
        r = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        sets = []
        vals = []
        for f in ("name", "role", "active"):
            if f in body:
                sets.append(f"{f}=?")
                vals.append(body[f])
        if body.get("password"):
            sets.append("pw=?")
            vals.append(hash_pw(body["password"]))
        if sets:
            vals.append(uid)
            conn.execute(f"UPDATE users SET {','.join(sets)} WHERE id=?", vals)
            conn.commit()
        conn.close()
        return {"ok": True}

    def _delete_user(self, uid, u):
        conn = get_db()
        r = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if r and r["username"] == u["username"]:
            conn.close()
            return {"error": "不能删除当前登录账号"}
        # 保留至少一个管理员
        if r and r["role"] == "admin":
            cnt = conn.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1").fetchone()[0]
            if cnt <= 1:
                conn.close()
                return {"error": "至少保留一个管理员账号"}
        conn.execute("UPDATE users SET active=0 WHERE id=?", (uid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    # ---- 报价 ----
    def _quote_parse(self, body):
        text = body.get("text", "") or ""
        conn = get_db()
        items = [dict(r) for r in conn.execute("SELECT * FROM price_items WHERE active=1").fetchall()]
        conn.close()
        return parse_quote_list(text, items)

    def _gen_quote_no(self, conn):
        d = datetime.datetime.now().strftime("%Y%m%d")
        cnt = conn.execute("SELECT COUNT(*) FROM quotes WHERE quote_no LIKE ?", (f"GF{d}%",)).fetchone()[0]
        return f"GF{d}-{cnt + 1:03d}"

    def _list_quotes(self, cid=None):
        conn = get_db()
        if cid:
            rows = conn.execute("SELECT * FROM quotes WHERE customer_id=? ORDER BY id DESC", (cid,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM quotes ORDER BY id DESC").fetchall()
        conn.close()
        out = []
        for r in rows:
            d = dict(r)
            d["items"] = json.loads(d["items"] or "[]")
            out.append(d)
        return out

    def _quote_detail(self, qid):
        conn = get_db()
        r = conn.execute("SELECT * FROM quotes WHERE id=?", (qid,)).fetchone()
        cust = None
        if r:
            c = conn.execute("SELECT * FROM customers WHERE id=?", (r["customer_id"],)).fetchone()
            cust = dict(c) if c else None
        conn.close()
        if not r:
            return {"error": "not found"}
        d = dict(r)
        d["items"] = json.loads(d["items"] or "[]")
        d["customer"] = cust
        return d

    def _create_quote(self, body, u):
        calc = calc_quote(body.get("items", []), body)
        t = now_str()
        conn = get_db()
        quote_no = body.get("quote_no") or self._gen_quote_no(conn)
        cur = conn.execute(
            """INSERT INTO quotes (customer_id, quote_no, title, items, area,
               design_fee, hardscape_fee, plant_fee, soil_fee, mep_fee,
               transport_rate, transport_fee, subtotal, mgmt_rate, mgmt_fee,
               tax_rate, tax, discount, total, status, remark, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.get("customer_id"), quote_no, body.get("title", "阳台花园项目报价"),
             json.dumps(calc["items"], ensure_ascii=False), calc["area"],
             calc["design_fee"], calc["hardscape_fee"], calc["plant_fee"], calc["soil_fee"], calc["mep_fee"],
             calc["transport_rate"], calc["transport_fee"], calc["subtotal"], calc["mgmt_rate"], calc["mgmt_fee"],
             calc["tax_rate"], calc["tax"], calc["discount"], calc["total"],
             body.get("status", "草稿"), body.get("remark", ""), u["name"], t, t))
        qid = cur.lastrowid
        # 回写阶段5报价总额，供统计
        cid = body.get("customer_id")
        if cid:
            self._sync_quote_to_stage(conn, cid, calc, u)
        conn.commit()
        conn.close()
        return {"id": qid, "quote_no": quote_no, **calc}

    def _sync_quote_to_stage(self, conn, cid, calc, u):
        t = now_str()
        row = conn.execute("SELECT data FROM stage_data WHERE customer_id=? AND stage=5", (cid,)).fetchone()
        data = json.loads(row["data"]) if row else {}
        data["quote_total"] = calc["total"]
        data["design_fee"] = calc["design_fee"]
        detail = (f"设计费{calc['design_fee']} / 硬景{calc['hardscape_fee']} / 植物{calc['plant_fee']} / "
                  f"辅材{calc['soil_fee']} / 水电{calc['mep_fee']} / 运输{calc['transport_fee']} / "
                  f"管理费{calc['mgmt_fee']} / 税金{calc['tax']} / 合计{calc['total']}")
        data["quote_detail"] = detail
        conn.execute(
            """INSERT INTO stage_data (customer_id, stage, data, operator, updated_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(customer_id, stage)
               DO UPDATE SET data=excluded.data, operator=excluded.operator, updated_at=excluded.updated_at""",
            (cid, 5, json.dumps(data, ensure_ascii=False), u["name"], t))

    def _update_quote(self, qid, body, u):
        calc = calc_quote(body.get("items", []), body)
        t = now_str()
        conn = get_db()
        r = conn.execute("SELECT * FROM quotes WHERE id=?", (qid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        conn.execute(
            """UPDATE quotes SET title=?, items=?, area=?, design_fee=?, hardscape_fee=?, plant_fee=?,
               soil_fee=?, mep_fee=?, transport_rate=?, transport_fee=?, subtotal=?, mgmt_rate=?, mgmt_fee=?,
               tax_rate=?, tax=?, discount=?, total=?, remark=?, updated_at=? WHERE id=?""",
            (body.get("title", r["title"]), json.dumps(calc["items"], ensure_ascii=False), calc["area"],
             calc["design_fee"], calc["hardscape_fee"], calc["plant_fee"], calc["soil_fee"], calc["mep_fee"],
             calc["transport_rate"], calc["transport_fee"], calc["subtotal"], calc["mgmt_rate"], calc["mgmt_fee"],
             calc["tax_rate"], calc["tax"], calc["discount"], calc["total"], body.get("remark", r["remark"]), t, qid))
        if r["customer_id"]:
            self._sync_quote_to_stage(conn, r["customer_id"], calc, u)
        conn.commit()
        conn.close()
        return {"ok": True, "id": qid, **calc}

    def _quote_status(self, qid, body, u):
        status = body.get("status", "已批")
        t = now_str()
        conn = get_db()
        conn.execute("UPDATE quotes SET status=?, approved_by=?, updated_at=? WHERE id=?",
                     (status, u["name"], t, qid))
        conn.commit()
        conn.close()
        return {"ok": True, "status": status}

    def _delete_quote(self, qid):
        conn = get_db()
        conn.execute("DELETE FROM quotes WHERE id=?", (qid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _quote_print(self, path):
        """报价单打印页；token 通过查询参数 ?token= 传入"""
        parts = urllib.parse.urlparse(self.path)
        qid = path.split("/")[3]
        if not qid.isdigit():
            return self._send(404, "not found")
        qs = urllib.parse.parse_qs(parts.query)
        token = qs.get("token", [""])[0]
        sess = SESSIONS.get(token)
        if not sess or sess["exp"] < datetime.datetime.now().timestamp():
            return self._send(401, "<h3 style='font-family:sans-serif'>会话已过期，请回系统重新打开报价单</h3>",
                              "text/html; charset=utf-8")
        d = self._quote_detail(int(qid))
        if d.get("error"):
            return self._send(404, "not found")
        return self._send(200, render_quote_html(d), "text/html; charset=utf-8")

    # ---- 统计 ----
    def _stats(self, u):
        conn = get_db()
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers").fetchall()]
        stage_rows = conn.execute("SELECT customer_id, stage, data FROM stage_data").fetchall()
        conn.close()
        if not self._can_see_all(u):
            mine = {u["name"], u["username"]}
            customers = [c for c in customers if (c.get("owner") or "") in mine]
        cid_set = {c["id"] for c in customers}
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
            if r["customer_id"] in cid_set:
                stage_data_map.setdefault(r["customer_id"], {})[r["stage"]] = json.loads(r["data"])
        for c in customers:
            by_stage[c["current_stage"]] = by_stage.get(c["current_stage"], 0) + 1
            by_source[c["source_channel"] or "未填"] = by_source.get(c["source_channel"] or "未填", 0) + 1
            by_owner[c["owner"] or "未分配"] = by_owner.get(c["owner"] or "未分配", 0) + 1
            by_status[c["status"] or "线索"] = by_status.get(c["status"] or "线索", 0) + 1
            if c["status"] == "已成交":
                deal_count += 1
            sd = stage_data_map.get(c["id"], {})
            total_quote += to_float(sd.get(5, {}).get("quote_total"))
            total_received += to_float(sd.get(6, {}).get("received_total"))
            total_settle += to_float(sd.get(7, {}).get("settle_total"))
        total = len(customers)
        return {
            "total": total, "by_stage": by_stage, "by_source": by_source,
            "by_owner": by_owner, "by_status": by_status, "deal_count": deal_count,
            "conversion": round(deal_count / total, 3) if total else 0,
            "total_quote": total_quote, "total_received": total_received, "total_settle": total_settle,
        }

    def _forms_index(self):
        out = []
        for s in STAGES:
            fp = os.path.join(FORMS_DIR, s["form_file"])
            names = []
            if os.path.exists(fp):
                with open(fp, encoding="utf-8") as f:
                    names = parse_forms_from_md(f.read())
            out.append({"stage_id": s["id"], "stage_name": s["name"], "file": s["form_file"], "forms": names})
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
        body = "\ufeff" + buf.getvalue()
        self._send(200, body.encode("utf-8"), "text/csv; charset=utf-8",
                   {"Content-Disposition": "attachment; filename=greenfun_customers.csv"})

    def _export_json(self):
        conn = get_db()
        customers = [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY id").fetchall()]
        stage_rows = conn.execute("SELECT customer_id, stage, data, operator, updated_at FROM stage_data").fetchall()
        logs = [dict(r) for r in conn.execute("SELECT * FROM activity_log ORDER BY id").fetchall()]
        quotes = [dict(r) for r in conn.execute("SELECT * FROM quotes ORDER BY id").fetchall()]
        conn.close()
        sdm = {}
        for r in stage_rows:
            sdm.setdefault(r["customer_id"], {})[r["stage"]] = {
                "data": json.loads(r["data"]), "operator": r["operator"], "updated_at": r["updated_at"]}
        for c in customers:
            c["stages"] = sdm.get(c["id"], {})
        payload = {"exported_at": now_str(), "customers": customers, "activity_log": logs,
                   "quotes": quotes, "stages": STAGES}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(200, body, "application/json; charset=utf-8",
                   {"Content-Disposition": "attachment; filename=greenfun_backup.json"})

    def log_message(self, fmt, *args):
        pass


# ---------------------------------------------------------------------------
# 报价单打印 HTML
# ---------------------------------------------------------------------------
def render_quote_html(q):
    cust = q.get("customer") or {}
    rows = ""
    for i, it in enumerate(q["items"], 1):
        rows += (f"<tr><td>{i}</td><td>{esc(it.get('category',''))}</td><td>{esc(it.get('name',''))}</td>"
                 f"<td>{esc(it.get('spec',''))}</td><td class='r'>{esc(it.get('qty',''))}</td>"
                 f"<td>{esc(it.get('unit',''))}</td><td class='r'>{money(it.get('unit_price'))}</td>"
                 f"<td class='r'>{money(it.get('subtotal'))}</td></tr>")
    fee = lambda label, v: (f"<tr><td>{label}</td><td class='r'>¥{money(v)}</td></tr>")
    return f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>报价单 {esc(q.get('quote_no',''))}</title>
<style>
  body{{font-family:'Microsoft YaHei',sans-serif;color:#1a2e22;max-width:880px;margin:0 auto;padding:34px}}
  .head{{text-align:center;border-bottom:3px solid #2e7d4f;padding-bottom:14px;margin-bottom:20px}}
  .head h1{{margin:0;color:#1f6b40;font-size:24px}}
  .head .sub{{color:#5a6b60;font-size:13px;margin-top:4px}}
  .meta{{display:flex;justify-content:space-between;flex-wrap:wrap;font-size:13px;margin-bottom:16px}}
  .meta div{{margin:3px 0;min-width:48%}}
  table{{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:18px}}
  th,td{{border:1px solid #cfe0d5;padding:7px 8px;text-align:left}}
  th{{background:#eaf5ee;color:#1f6b40}}
  td.r,th.r{{text-align:right}}
  .fees{{width:52%;margin-left:48%}}
  .total-row td{{font-weight:bold;background:#eaf5ee;color:#1f6b40;font-size:15px}}
  .pay{{background:#f6fbf8;border:1px solid #cfe0d5;border-radius:8px;padding:12px 14px;font-size:13px;margin-top:6px}}
  .sign{{display:flex;justify-content:space-between;margin-top:36px;font-size:13px}}
  .foot{{text-align:center;color:#8a988f;font-size:12px;margin-top:26px}}
  @media print{{.noprint{{display:none}}body{{padding:8px}}}}
</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:8px 18px;background:#2e7d4f;color:#fff;border:0;border-radius:6px;cursor:pointer;margin-bottom:14px">🖨 打印 / 存为 PDF</button>
<div class="head">
  <h1>温州绿趣植物空间艺术科技有限公司</h1>
  <div class="sub">家装阳台植物花园 · 项目报价单 &nbsp;|&nbsp; 让植物成为空间的加分项</div>
</div>
<div class="meta">
  <div><b>报价单号：</b>{esc(q.get('quote_no',''))}</div>
  <div><b>日期：</b>{esc((q.get('created_at') or '')[:10])}</div>
  <div><b>客户：</b>{esc(cust.get('name',''))}　{esc(cust.get('phone',''))}</div>
  <div><b>项目地址：</b>{esc(cust.get('address',''))}</div>
  <div><b>阳台面积：</b>{esc(q.get('area',''))} ㎡</div>
  <div><b>状态：</b>{esc(q.get('status',''))}</div>
</div>
<h3 style="color:#1f6b40">一、植物与材料明细</h3>
<table>
  <thead><tr><th>#</th><th>类别</th><th>名称</th><th>规格</th><th class="r">数量</th><th>单位</th><th class="r">单价</th><th class="r">小计</th></tr></thead>
  <tbody>{rows or '<tr><td colspan=8 style="text-align:center;color:#999">无明细</td></tr>'}</tbody>
</table>
<h3 style="color:#1f6b40">二、费用汇总</h3>
<table class="fees">
  <tbody>
    {fee('1. 设计费', q.get('design_fee'))}
    {fee('2. 硬景施工费', q.get('hardscape_fee'))}
    {fee('3. 植物费用', q.get('plant_fee'))}
    {fee('4. 土壤及辅材', q.get('soil_fee'))}
    {fee('5. 水电工程', q.get('mep_fee'))}
    {fee(f"6. 运输安装费（{round(q.get('transport_rate',0)*100,1)}%）", q.get('transport_fee'))}
    {fee(f"7. 项目管理费（{round(q.get('mgmt_rate',0)*100,1)}%）", q.get('mgmt_fee'))}
    {fee(f"8. 税金（{round(q.get('tax_rate',0)*100,1)}%）", q.get('tax'))}
    {fee('优惠减免', -abs(q.get('discount',0) or 0)) if q.get('discount') else ''}
    <tr class="total-row"><td>合计</td><td class="r">¥{money(q.get('total'))}</td></tr>
  </tbody>
</table>
<div class="pay"><b>付款方式：</b>定金 30% ｜ 中期款 40%（施工开始时）｜ 尾款 30%（验收合格后）　　
<b>报价有效期：</b>15 天　　{('<b>备注：</b>' + esc(q.get('remark',''))) if q.get('remark') else ''}</div>
<div class="sign">
  <div>客户签字：______________　日期：__________</div>
  <div>绿趣（盖章）：______________　设计师：{esc(q.get('created_by',''))}</div>
</div>
<div class="foot">温州绿趣植物空间艺术科技有限公司 &nbsp;|&nbsp; 鹿城区六虹桥路991号 &nbsp;|&nbsp; 0577-88868293</div>
</body></html>"""


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"绿趣全流程管理系统已启动： http://localhost:{PORT}")
    print(f"数据库：{DB_PATH}")
    print("默认账号：lvquguanliyuan/123456（管理员）、dianzhang/green123（店长）、xiaoshou/green123（销售）、sheji/green123（设计师）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
