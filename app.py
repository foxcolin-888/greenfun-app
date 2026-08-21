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
import base64
import hmac
import hashlib
import secrets
import sqlite3
import datetime
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
FORMS_DIR = os.path.join(BASE_DIR, "forms")
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "greenfun.db"))
# 上传资源（现场照片 / AI 效果图）根目录；持久化部署时设 UPLOAD_DIR=/data/uploads
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(WEB_DIR, "uploads"))
# 全新库时管理员的起始积分（持久盘下仅首次种子一次，后续充值/花费均保留）
ADMIN_START_CREDITS = int(os.environ.get("ADMIN_START_CREDITS", "1000"))
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
# 默认账号（首次启动内置，并强制同步密码；上线后请在后台「用户管理」改为各员工专属强密码，并删除示例账号）
# ---------------------------------------------------------------------------
DEFAULT_USERS = [
    ("lvquguanliyuan", "LvquAdmin#2026", "系统管理员", "admin"),
    ("dianzhang", "Dianzhang#2026", "店长", "manager"),
    ("xiaoshou", "Xiaoshou#2026", "销售顾问", "sales"),
    ("sheji", "Sheji#2026", "设计师", "designer"),
]

# ---------------------------------------------------------------------------
# 门店销售记录：收入类别 / 收款方式预设
# ---------------------------------------------------------------------------
SALES_CATEGORIES = [
    "盆栽零售收入", "沙龙手作收入", "盆栽团购收入",
    "家装收入", "其它收入", "茶饮收入",
]
SALES_PAYMENT_METHODS = [
    "桂林3812卡", "充值抵扣", "有赞余额", "有赞储值",
    "应收账款", "内部结算", "门店赠送", "绿趣公账",
    "租赁收款", "微信支付", "支付宝", "现金",
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
    # 利润率档位（后台可编辑，逗号分隔的百分比）
    "margin_tiers": "20,25,30,40,50",
    "default_margin": "30",        # 默认毛利率(%)
    # 付款方式（JSON 数组：[{label, note}]，后台可编辑）
    "payment_methods": '[{"label":"全款","note":"签约即付全款"},{"label":"3-4-3","note":"定金30% ｜ 中期款40%(施工开始) ｜ 尾款30%(验收合格)"},{"label":"5-5","note":"首付50% ｜ 尾款50%(验收合格)"},{"label":"方案确认-验收付清","note":"方案确认后付款50%，完工验收后付剩余50%"}]',
    # 打印样式（后台可编辑）
    "print_company": "温州绿趣植物空间艺术科技有限公司",
    "print_slogan": "让植物成为空间的加分项",
    "print_footer": "鹿城区六虹桥路991号 ｜ 0577-88868293",
    "print_color": "#2e7d4f",
    "print_title": "绿趣植物软装报价单",
    "print_show_cost": "0",        # 是否在报价单上显示成本价/毛利率(0/1)
    "print_note": "本报价含植物、硬景、辅材及基础施工费用；不含土建与大型水电改造。报价有效期 15 天，以定金到账之日起算。",
    # ---- AI 生图（方案设计模块）----
    "img_gen_provider": "pollinations",   # pollinations=免费免key / openai=OpenAI兼容(含豆包/通义万相/智谱/火山/硅基流动等)
    "img_gen_api_key": "",                 # 平台级 API Key（全站共用）；个人也可在生成时临时填写
    "img_gen_model": "",                   # 模型名：pollinations留空；openai=gpt-image-1/dall-e-3；豆包=doubao-seedream-5-0-260128；通义万相=wanx2.1-t2i-...
    "img_gen_base_url": "",                # OpenAI兼容基地址，留空默认 https://api.openai.com/v1（豆包 https://ark.cn-beijing.volces.com/api/v3；硅基 https://api.siliconflow.cn/v1）
    "img_gen_size": "1024x1024",           # 生图尺寸
    "img_gen_quality": "standard",         # 画质：standard/hd（OpenAI/DALL-E 用；豆包主要用尺寸控制）
    "img_gen_watermark": "0",              # 是否添加水印（豆包支持；1=添加，0=不添加）
    # ---- AI 图像分析（根据效果图生成设计理念 / 识别物料清单）----
    "img_analysis_model": "gpt-4o-mini",   # 多模态模型名，复用 img_gen_api_key / img_gen_base_url（如 APIYI 的 gpt-4o-mini / qwen-vl-max）
    # ---- 生图积分扣费（1积分=1分；负数表示扣费）----
    "img_credit_pollinations": "0",        # Pollinations 免费渠道
    "img_credit_hf": "0",                  # Hugging Face 免费推理（有限额）
    "img_credit_siliconflow": "3",         # 硅基流动等国内低价渠道
    "img_credit_doubao": "5",              # 豆包 Seedream
    "img_credit_openai": "10",             # OpenAI DALL-E / GPT-Image
    "img_credit_default": "5",             # 未知/自定义模型默认单价
    "credits_enabled": "1",                # 是否启用积分扣费（0=关闭，仅记录不扣费）
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
        unit_price REAL, cost_price REAL, notes TEXT, active INTEGER DEFAULT 1,
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
        margin REAL, payment_method TEXT,
        status TEXT DEFAULT '草稿', remark TEXT,
        created_by TEXT, approved_by TEXT, created_at TEXT, updated_at TEXT
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, phone TEXT, service TEXT, note TEXT,
        status TEXT DEFAULT '待跟进', created_at TEXT
    )""")
    # 方案设计模块
    c.execute("""
    CREATE TABLE IF NOT EXISTS schemes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        customer TEXT,
        project_name TEXT,
        room_type TEXT,
        requirements TEXT,
        concept TEXT,
        photos TEXT,
        images TEXT,
        items TEXT,
        status TEXT DEFAULT '草稿',
        quote_id INTEGER,
        gen_config TEXT DEFAULT '{}',
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT
    )""")
    # 官网案例库（管理员后台编辑，官网卡片点击进入详情）
    c.execute("""
    CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT,
        summary TEXT,
        cover TEXT,
        detail TEXT,
        gallery TEXT,
        sort INTEGER DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
    )""")
    # 官网通用内容（服务 / 课程活动 / 合作伙伴 / 团队 / 创始人 等卡片的详情数据）
    conn.execute("""
    CREATE TABLE IF NOT EXISTS contents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        cover TEXT,
        detail TEXT,
        gallery TEXT,
        sort INTEGER DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
    )""")
    try:
        conn.execute("ALTER TABLE contents ADD COLUMN meta TEXT")
    except Exception:
        pass  # 旧库已有该列
    try:
        conn.execute("ALTER TABLE contents ADD COLUMN icon TEXT")
    except Exception:
        pass  # 旧库已有该列
    # 全站可自定义文案与外观（后台「站点装修」模块管理；key-value 存各区块 JSON）
    conn.execute("""
    CREATE TABLE IF NOT EXISTS site_meta (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")
    # 积分账户与流水
    c.execute("""
    CREATE TABLE IF NOT EXISTS credits (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount INTEGER,
        type TEXT,
        ref_type TEXT,
        ref_id INTEGER,
        note TEXT,
        created_at TEXT
    )""")
    conn.commit()
    # 上传目录（现场照片 / AI 效果图 / 官网案例 / 官网通用内容），可指向持久盘 UPLOAD_DIR
    os.makedirs(os.path.join(UPLOAD_DIR, "schemes"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "cases"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "content"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "sales"), exist_ok=True)

    # 门店每日销售记录
    c.execute("""
    CREATE TABLE IF NOT EXISTS daily_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_date TEXT NOT NULL,
        category TEXT NOT NULL,
        product_name TEXT DEFAULT '',
        photo_url TEXT DEFAULT '',
        photo_urls TEXT DEFAULT '',
        price_note TEXT DEFAULT '',
        recharge_amount REAL DEFAULT 0,
        sales_amount REAL DEFAULT 0,
        payment_method TEXT DEFAULT '',
        customer_name TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT
    )""")
    conn.commit()

    # 数据库迁移：已有库补列（兼容历史数据，旧记录只有单张 photo_url）
    try:
        c.execute("ALTER TABLE daily_sales ADD COLUMN photo_urls TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # 列已存在则忽略

    # 种子：账号
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        t = now_str()
        for u, pw, name, role in DEFAULT_USERS:
            conn.execute("INSERT INTO users (username, pw, name, role, active, created_at) VALUES (?,?,?,?,1,?)",
                         (u, hash_pw(pw), name, role, t))
    # 种子：积分账户（仅全新库；持久盘下首次种子后保留，充值/花费不丢）
    if conn.execute("SELECT COUNT(*) FROM credits").fetchone()[0] == 0:
        for (u, pw, name, role) in DEFAULT_USERS:
            row = conn.execute("SELECT id FROM users WHERE username=?", (u,)).fetchone()
            if row:
                conn.execute("INSERT INTO credits (user_id, balance) VALUES (?,?)",
                             (row["id"], ADMIN_START_CREDITS))
    # 种子：价格库
    if conn.execute("SELECT COUNT(*) FROM price_items").fetchone()[0] == 0:
        t = now_str()
        for cat, name, spec, unit, price in DEFAULT_PRICE_ITEMS:
            # 旧数据仅有行情单价；将其同时作为初始成本价（用户可在后台改为真实成本）
            conn.execute("INSERT INTO price_items (category, name, spec, unit, unit_price, cost_price, active, updated_at) VALUES (?,?,?,?,?,?,1,?)",
                         (cat, name, spec, unit, float(price), float(price), t))
    # 种子：公式参数与系统设置（含新增键；已存在的键不会覆盖）
    for k, v in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)", (k, v))
    conn.commit()

    # 用环境变量持久化基础设施类设置（如生图 API Key）。
    # 免费版 Render 磁盘随重建重置，但环境变量保留在服务配置中；
    # 把 Key 等敏感配置放到环境变量后，无需每次重建后在后台重填。
    _seed_env_settings(conn)
    conn.commit()

    # 表结构迁移：兼容早期数据库，补加新列
    _migrate_schema(conn)
    conn.commit()

    # 账号迁移：将旧管理员 admin 平滑迁移为新管理员账号（无论全新库还是已有库都生效）
    _migrate_admin(conn)

    # 付款方式迁移：新版默认方案自动追加到已有库，避免老库缺少新选项
    _migrate_payment_methods(conn)

    # 种子：官网案例与通用内容（全新库自动播种；Render 免费版重启重建后内容不丢）
    try:
        _seed_site_content(conn)
    except Exception as e:
        print("[seed] 官网内容种子失败:", e, flush=True)
    # 种子：全站可自定义文案与外观（全新库自动播种）
    try:
        _seed_site_meta(conn)
    except Exception as e:
        print("[seed] 站点配置种子失败:", e, flush=True)

    conn.close()


def _seed_site_content(conn):
    """全新库自动播种官网案例与通用内容（服务/课程/伙伴/团队/创始人）。
    Render 免费版磁盘随重建重置，此函数确保每次重建后官网内容仍在。
    已有数据时不覆盖（管理员后台编辑的内容优先）。"""
    seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_data.json")
    if not os.path.exists(seed_path):
        return
    with open(seed_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    t = now_str()
    # 官网案例
    if conn.execute("SELECT COUNT(*) FROM cases").fetchone()[0] == 0:
        for it in data.get("cases", []):
            conn.execute(
                "INSERT INTO cases (title, category, summary, cover, detail, gallery, sort, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (it.get("title", ""), it.get("category", ""), it.get("summary", ""),
                 it.get("cover", ""), it.get("detail", ""),
                 json.dumps(it.get("gallery", []), ensure_ascii=False),
                 int(it.get("sort", 0)), int(it.get("status", 1)), t, t))
    # 官网通用内容（服务 / 课程 / 伙伴 / 团队 / 创始人）
    if conn.execute("SELECT COUNT(*) FROM contents").fetchone()[0] == 0:
        for it in data.get("contents", []):
            conn.execute(
                "INSERT INTO contents (type, title, summary, cover, detail, gallery, meta, sort, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (it.get("type", ""), it.get("title", ""), it.get("summary", ""),
                 it.get("cover", ""), it.get("detail", ""),
                 json.dumps(it.get("gallery", []), ensure_ascii=False),
                 it.get("meta", ""),
                 int(it.get("sort", 0)), int(it.get("status", 1)), t, t))
    conn.commit()


# ---------------------------------------------------------------------------
# 全站可自定义文案与外观（后台「站点装修」模块管理）
#   site_meta 表以 key-value 存储各区块 JSON；前端拉取后渲染。
# ---------------------------------------------------------------------------
def _default_site_meta():
    """默认全站文案（首次部署与 Render 重启重建时的兜底内容，与官网首页原静态文案一致）。"""
    return {
        "hero": {
            "kicker": "EST. 2010 · 室内绿植空间美学专家",
            "title": ["让植物", "成为空间的加分项"],
            "desc": "以差异化的植物美学设计，让热爱生活的人享受植物的美与乐趣。温州绿趣植物空间艺术科技有限公司，为商业与家庭空间注入自然生命力。",
            "cta1": "预约免费设计", "cta1_href": "#contact",
            "cta2": "了解服务 →", "cta2_href": "#services",
            "photo": "",
        },
        "about": {
            "kicker": "关于绿趣",
            "title": ["15 年深耕，", "用植物重新定义", "空间价值"],
            "lead": "我们不仅提供绿植，更提供一种与自然共生的生活方式。每一位绿趣人都是植物美学的传递者，用专业与热爱，为每一个空间注入生命的力量。",
            "values": [
                {"label": "品牌理念", "text": "让热爱生活的人，享受植物的美和乐趣"},
                {"label": "核心理念", "text": "融合自然，融美于居"},
                {"label": "服务承诺", "text": "科学设计、美学方案、场景化布置全流程服务"},
            ],
            "photo": "",
            "chip_title": "城市森林会客厅", "chip_sub": "杨府山公园 · 映秀山房",
        },
        "stats": [
            {"num": "15", "suffix": "", "label": "年行业深耕"},
            {"num": "300", "suffix": "+", "label": "企业客户"},
            {"num": "92", "suffix": "%", "label": "续约率"},
            {"num": "600", "suffix": "+", "label": "经典案例"},
            {"num": "38", "suffix": "", "label": "人专业团队"},
        ],
        "voices": [
            {"quote": "绿趣团队对植物的呈现超出预期。他们不只是摆放几盆花，而是真正把室内外空间当作一个整体来设计，每次方案都让我们惊喜。", "name": "华夏银行温州分行", "role": "行政部负责人", "avatar": "华"},
            {"quote": "和绿趣合作的植物租赁已经第七年，专业及时的养护响应让我们省心，绿植状态始终保持得很好。", "name": "温州机场集团", "role": "物业管理部门", "avatar": "温"},
            {"quote": "家里的阳台原本堆满杂物，绿趣帮我们变成了全家人最喜欢待的地方。科学养护方案让植物一直长得很好，四季都有生机。", "name": "陈女士", "role": "家庭植物软装客户", "avatar": "陈"},
        ],
        "founder": {
            "kicker": "创始人故事", "title": "15 年，只做一件事",
            "quote": "让热爱生活的人，享受植物的美和乐趣。",
            "paras": [
                "2010 年，一次日本京都庭院植物之旅，让戴晓东深深感受到了东方植物美学的力量。那些精心修剪的松树、随四季变化的庭院，与空间恰到好处的融合，点燃了他心中的热爱。",
                "随后他持续游学日本、韩国与台湾地区，积累了丰富的植物空间设计经验。绿趣坚持以植物美学为核心，从第一盆小型盆景到为银行、企业做大型空间，这颗初心已延续 15 年。",
            ],
            "sign": "— 戴晓东 · 绿趣创始人",
            "photo": "", "card_title": "城市森林会客厅", "card_sub": "杨府山公园 · 映秀山房",
        },
        "timeline": [
            {"year": "2010", "title": "品牌创立", "desc": "戴晓东创办绿趣，开始室内绿植设计服务探索之路。"},
            {"year": "2013", "title": "公司正式注册", "desc": "温州绿趣植物空间艺术科技有限公司正式成立。"},
            {"year": "2016", "title": "客户突破 100 家", "desc": "完成机关事业单位、商业空间等标杆项目，品牌影响力快速提升。"},
            {"year": "2019", "title": "家庭植物软装首创", "desc": "区域行业首创“家庭植物软装”服务，开辟全新业务板块。"},
            {"year": "2023", "title": "美学课程体系成型", "desc": "累计授课 600+ 场，触达 10000+ 人。"},
            {"year": "2024", "title": "六大板块全面布局", "desc": "春节销售 1600 盆，行业培训 102 名学员，进入全新发展阶段。"},
            {"year": "2025", "title": "迈向未来", "desc": "300+ 企业客户，92% 续约率，持续以植物美学赋能更多空间。"},
        ],
        "contact": {
            "address": "浙江省温州市鹿城区六虹桥路991号",
            "phone": "0577-88868293",
            "wechat": "扫码添加绿趣客服微信",
            "hours": "周一至周六 8:30-17:30",
        },
        "footer": {
            "desc": "温州绿趣植物空间艺术科技有限公司<br>15年专注室内绿植设计<br>让植物成为空间的加分项",
            "links": [
                {"group": "服务项目", "items": [{"label": "单位绿植租赁", "href": "#services"}, {"label": "家庭植物软装", "href": "#services"}, {"label": "艺术盆栽零售", "href": "#services"}, {"label": "美学手作课程", "href": "#services"}, {"label": "行业培训", "href": "#services"}, {"label": "茶饮咖啡", "href": "#services"}]},
                {"group": "关于绿趣", "items": [{"label": "品牌故事", "href": "#about"}, {"label": "经典案例", "href": "#cases"}, {"label": "植物美学课堂", "href": "#classroom"}, {"label": "加盟合作", "href": "#partner"}, {"label": "联系我们", "href": "#contact"}]},
                {"group": "关注我们", "items": [{"label": "微信公众号", "href": "#"}, {"label": "二维码入口", "href": "#"}, {"label": "内部管理系统", "href": "/admin"}]},
            ],
            "copyright": "© 2025 温州绿趣植物空间艺术科技有限公司 版权所有 · 浙ICP备XXXXXXXX号",
        },
        "nav": [
            {"label": "首页", "href": "#home"},
            {"label": "关于我们", "href": "#about"},
            {"label": "服务项目", "href": "#services"},
            {"label": "经典案例", "href": "#cases"},
            {"label": "美学课堂", "href": "#classroom"},
            {"label": "加盟合作", "href": "#partner"},
            {"label": "预约咨询", "href": "#contact", "cta": True},
        ],
        "appearance": {
            "font_preset": "serif",
            "primary_color": "#2D5A27",
            "logo_url": "",
            "favicon": "",
        },
    }


def _seed_site_meta(conn):
    """全新库自动播种全站可自定义文案与外观（保证 Render 重启后官网内容不丢）。已存在则跳过。"""
    defaults = _default_site_meta()
    for k, v in defaults.items():
        conn.execute("INSERT OR IGNORE INTO site_meta (key, value) VALUES (?,?)",
                     (k, json.dumps(v, ensure_ascii=False)))
    conn.commit()


def _get_site_config():
    """读取全站配置；缺失区块用默认值补全，避免前端缺字段。"""
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM site_meta").fetchall()
    conn.close()
    cfg = {}
    for r in rows:
        try:
            cfg[r["key"]] = json.loads(r["value"])
        except Exception:
            cfg[r["key"]] = r["value"]
    for k, v in _default_site_meta().items():
        cfg.setdefault(k, v)
    return cfg


def _save_site_config(body):
    """保存全站配置（逐区块写回 site_meta）。"""
    if not isinstance(body, dict):
        return {"error": "数据格式错误"}
    conn = get_db()
    for k, v in body.items():
        conn.execute("INSERT OR REPLACE INTO site_meta (key, value) VALUES (?,?)",
                     (str(k), json.dumps(v, ensure_ascii=False)))
    conn.commit()
    conn.close()
    return {"ok": True}


def _seed_env_settings(conn):
    """用环境变量为基础设施类设置提供持久化默认值（如生图 API Key）。
    免费版 Render 磁盘会随重建重置，但环境变量保留在服务配置里，
    因此把 Key 等配置放到环境变量即可跨重建持久化，不必每次在后台重填。
    规则：仅当对应环境变量存在且非空时才写入（且会覆盖 DB 中同名值）；
    其余未设环境变量的设置仍走 DB / 默认值。密钥不写入代码或数据库文件，
    而是从运行环境注入，避免泄露。"""
    env_map = {
        "GREENFUN_IMG_GEN_PROVIDER": "img_gen_provider",
        "GREENFUN_IMG_GEN_API_KEY": "img_gen_api_key",
        "GREENFUN_IMG_GEN_MODEL": "img_gen_model",
        "GREENFUN_IMG_GEN_BASE_URL": "img_gen_base_url",
        "GREENFUN_IMG_GEN_SIZE": "img_gen_size",
        "GREENFUN_IMG_ANALYSIS_MODEL": "img_analysis_model",
    }
    for env_key, setting_key in env_map.items():
        val = os.environ.get(env_key)
        if val is None or val == "":
            continue
        cur = conn.execute("UPDATE settings SET value=? WHERE key=?", (val, setting_key))
        if cur.rowcount == 0:
            conn.execute("INSERT INTO settings (key, value) VALUES (?,?)", (setting_key, val))


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


def _migrate_payment_methods(conn):
    """在老数据库上自动追加新版默认付款方式，不覆盖用户自定义项。"""
    row = conn.execute("SELECT value FROM settings WHERE key=?", ("payment_methods",)).fetchone()
    current = []
    try:
        current = json.loads(row["value"]) if row and row["value"] else []
        if not isinstance(current, list):
            current = []
    except Exception:
        current = []
    default_labels = {x["label"] for x in json.loads(DEFAULT_SETTINGS["payment_methods"])}
    existing_labels = {x.get("label") for x in current if isinstance(x, dict)}
    for x in json.loads(DEFAULT_SETTINGS["payment_methods"]):
        if x["label"] not in existing_labels:
            current.append(x)
    if current:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                     ("payment_methods", json.dumps(current, ensure_ascii=False)))
        conn.commit()


def _migrate_schema(conn):
    """在已有数据库上补加新版本引入的列，避免旧库缺列报错。"""
    def add_col(table, col, ctype, default=None):
        cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if col not in cols:
            sql = f"ALTER TABLE {table} ADD COLUMN {col} {ctype}"
            conn.execute(sql)
            if default is not None:
                conn.execute(f"UPDATE {table} SET {col}=?", (default,))
    add_col("price_items", "cost_price", "REAL", 0)
    add_col("quotes", "margin", "REAL", 0)
    add_col("quotes", "payment_method", "TEXT", "")
    add_col("schemes", "gen_config", "TEXT", "{}")
    # 积分系统（表级迁移）
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS credits (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0
    )""")
    c.execute("""
    CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount INTEGER,
        type TEXT,
        ref_type TEXT,
        ref_id INTEGER,
        note TEXT,
        created_at TEXT
    )""")
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


def to_int(v, default=0):
    try:
        if v in (None, ""):
            return default
        return int(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# 报价计算引擎
# ---------------------------------------------------------------------------
def calc_quote(items, params):
    """成本价 × 利润率倍率 模型。
    items: [{category, name, spec, unit, qty, cost_price, unit_price?}]
        - cost_price 为物料成本（优先）；缺省时回退 unit_price 作为成本
        - 售价 = 成本 / (1 - 利润率)；倍率 = 1/(1-利润率)
    params: {area, design_fee, margin(毛利率%, 默认取系统设置), transport_rate(小数),
             mgmt_rate(小数), tax_rate(小数), discount}
    """
    s = get_settings()
    # 利润率
    margin_pct = to_float(params.get("margin"), to_float(s.get("default_margin"), 30))
    fr = margin_pct / 100.0 if margin_pct > 1 else margin_pct
    fr = min(max(fr, 0.0), 0.95)          # 防止 ÷0
    mult = 1.0 / (1.0 - fr) if fr < 1 else 1.0

    groups = {"plant_fee": 0.0, "hardscape_fee": 0.0, "soil_fee": 0.0, "mep_fee": 0.0}
    norm_items = []
    total_cost = 0.0
    for it in items:
        qty = to_float(it.get("qty"), 0)
        # 成本来源：cost_price 优先，回退 unit_price
        cost = to_float(it.get("cost_price"), None)
        if cost is None or cost == 0:
            cost = to_float(it.get("unit_price"), 0)
        up = round(cost * mult, 2)         # 售价（自动满足利润率）
        sub = round(qty * up, 2)
        total_cost += round(qty * cost, 2)
        cat = it.get("category", "植物-其他")
        groups[cat_group(cat)] += sub
        norm_items.append({
            "category": cat, "name": it.get("name", ""), "spec": it.get("spec", ""),
            "unit": it.get("unit", ""), "qty": qty,
            "cost_price": round(cost, 2), "unit_price": up, "subtotal": sub,
            "matched": it.get("matched", True),
        })

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
        "margin_pct": round(fr * 100, 1), "margin": fr, "multiplier": round(mult, 4),
        "material_cost": round(total_cost, 2),
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
            cost = p.get("cost_price")
            if cost is None or cost == 0:
                cost = p.get("unit_price", 0)
            matched.append({
                "price_id": p["id"], "category": p["category"], "name": p["name"],
                "spec": spec or p["spec"], "unit": p["unit"],
                "qty": qty, "cost_price": cost,
                "unit_price": given_price if given_price is not None else cost,
                "matched": True, "input": line,
            })
        elif given_price is not None:
            matched.append({
                "price_id": None, "category": "植物-其他", "name": name,
                "spec": spec, "unit": "项", "qty": qty, "cost_price": given_price,
                "unit_price": given_price,
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

    def _html_error(self, code, msg):
        # 友好 HTML 错误页：避免浏览器直接显示苍白的 "Not found" 纯文本
        html = (
            "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='UTF-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1.0'>"
            "<title>🌿 绿趣 · 提示</title></head>"
            "<body style='margin:0;font-family:system-ui,-apple-system,sans-serif;"
            "background:linear-gradient(135deg,#1b5e3a,#357a50);color:#fff;"
            "min-height:100vh;display:flex;align-items:center;justify-content:center;"
            "text-align:center'>"
            "<div><div style='font-size:52px'>🌿</div>"
            "<h1 style='font-weight:600;margin:12px 0 6px'>服务暂不可用</h1>"
            f"<p style='opacity:.85;margin:0'>{msg}</p>"
            "<p style='opacity:.6;font-size:14px;margin-top:14px'>请稍后刷新重试（Ctrl/Cmd + Shift + R）</p>"
            "</div></body></html>"
        )
        self._send(code, html, "text/html; charset=utf-8")

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except Exception:
            length = 0
        if length <= 0:
            return {}
        # 关键修复：socket 上的 rfile.read(n) 不保证一次读满 n 字节，
        # 中文等多字节 UTF-8 负载常被截断导致 json 解析失败、body 变 {}。
        # 必须循环读到 length 字节为止。
        raw = b""
        while len(raw) < length:
            chunk = self.rfile.read(min(65536, length - len(raw)))
            if not chunk:
                break
            raw += chunk
        if len(raw) < length:
            return {}
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
        return self._serve_get(path)

    def do_HEAD(self):
        path = urllib.parse.urlparse(self.path).path
        return self._serve_get(path, head_only=True)

    def _serve_get(self, path, head_only=False):
        # 内部管理后台 /admin/* -> web/admin/
        if path == "/admin" or path == "/admin/":
            return self._static("admin/index.html", "text/html; charset=utf-8", head_only=head_only)
        if path.startswith("/admin/"):
            return self._static(path[1:], None, head_only=head_only)  # 自动推断 content-type
        # 上传资源（现场照片 / AI 效果图） -> UPLOAD_DIR（可指向持久盘 /data/uploads）
        if path.startswith("/uploads/"):
            return self._serve_upload(path[len("/uploads/"):], head_only=head_only)
        # 对外品牌官网根路径 -> web/index.html
        if path in ("/", "/index.html"):
            return self._static("index.html", "text/html; charset=utf-8", head_only=head_only)
        if path == "/app.js":
            return self._static("app.js", "text/javascript; charset=utf-8", head_only=head_only)
        if path == "/styles.css":
            return self._static("styles.css", "text/css; charset=utf-8", head_only=head_only)
        if path == "/case.html":
            return self._static("case.html", "text/html; charset=utf-8", head_only=head_only)
        if path == "/case.js":
            return self._static("case.js", "text/javascript; charset=utf-8", head_only=head_only)
        if path == "/detail.html":
            return self._static("detail.html", "text/html; charset=utf-8", head_only=head_only)
        if path == "/detail.js":
            return self._static("detail.js", "text/javascript; charset=utf-8", head_only=head_only)
        if path.startswith("/api/"):
            if head_only:
                return self._send(200, b"", "application/json")
            return self._api_get(path)
        return self._html_error(404, "您访问的页面不存在")

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "POST")

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "PUT")

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        return self._api_write(path, self._body(), "DELETE")

    def _static(self, name, ctype=None, head_only=False):
        fp = os.path.join(WEB_DIR, name)
        if not os.path.exists(fp) or os.path.isdir(fp):
            return self._html_error(404, "资源未找到：%s" % name)
        if ctype is None:
            ctype = self._guess_ctype(fp)
        if head_only:
            size = os.path.getsize(fp)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return
        with open(fp, "rb") as f:
            self._send(200, f.read(), ctype)

    def _serve_upload(self, rel, head_only=False):
        """服务 UPLOAD_DIR 下的上传资源（持久盘感知）。"""
        fp = os.path.join(UPLOAD_DIR, rel)
        if not os.path.exists(fp) or os.path.isdir(fp):
            return self._html_error(404, "资源未找到：%s" % rel)
        ctype = self._guess_ctype(fp)
        if head_only:
            size = os.path.getsize(fp)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.end_headers()
            return
        with open(fp, "rb") as f:
            self._send(200, f.read(), ctype)

    def _guess_ctype(self, fp):
        ext = os.path.splitext(fp)[1].lower()
        return {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
            ".pdf": "application/pdf",
        }.get(ext, "application/octet-stream")

    # ---- API GET ----
    def _api_get(self, path):
        if path == "/api/health":
            return self._json({"ok": True, "stages": len(STAGES)})
        # 报价单打印页（内嵌 token 校验，用查询参数携带 token 以便新窗口打开）
        if path.startswith("/api/quotes/") and path.endswith("/print"):
            return self._quote_print(path)
        # 方案设计打印页（内嵌 token 校验，用查询参数携带 token 以便新窗口打开）
        if path.startswith("/api/schemes/") and path.endswith("/print"):
            return self._scheme_print(path)
        # 门店销售单打印页（内嵌 token 校验，用查询参数携带 token 以便新窗口打开）
        if path.startswith("/api/sales/") and path.endswith("/print"):
            return self._sales_print(path)

        # 官网案例（公开，无需登录）：列表 + 单条详情
        if path == "/api/cases":
            return self._json(self._list_cases(public_only=True))
        if path.startswith("/api/cases/") and len(path.split("/")) == 4 and path.split("/")[3].isdigit():
            return self._json(self._case_detail(int(path.split("/")[3])))
        # 官网通用内容（公开，无需登录）：按类型列表 + 单条详情
        if path == "/api/contents":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            ctype = (qs.get("type") or [None])[0]
            return self._json(self._list_contents(public_only=True, ctype=ctype))
        if path.startswith("/api/contents/") and len(path.split("/")) == 4 and path.split("/")[3].isdigit():
            return self._json(self._content_detail(int(path.split("/")[3])))

        # 全站可自定义文案与外观（公开接口，官网渲染使用，无需登录）
        if path == "/api/site":
            return self._json(_get_site_config())

        u = self._need()
        if not u:
            return

        # ---- 门店销售记录 ----
        # 预设选项（无需查库）
        if path == "/api/sales/categories":
            return self._json(SALES_CATEGORIES)
        if path == "/api/sales/payments":
            return self._json(SALES_PAYMENT_METHODS)
        # 销售列表（支持 ?date_from=&date_to=&customer=&category=）
        if path == "/api/sales":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            params = {}
            for k in ("date_from","date_to","customer","category"):
                v = qs.get(k)
                if v: params[k] = v[0]
            return self._json(_sales_list(params))
        # 本周客户消费汇总（须排在通用前缀匹配之前）
        if path == "/api/sales/weekly":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            ws = (qs.get("week_start") or [None])[0]
            cat = (qs.get("category") or [None])[0]
            return self._json(_sales_weekly_summary(ws, cat))
        # 本月客户消费汇总（须排在 /api/sales/<id> 之前）
        if path == "/api/sales/monthly":
            import datetime as dt
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            y = (qs.get("year") or [None])[0]
            m = (qs.get("month") or [None])[0]
            cat = (qs.get("category") or [None])[0]
            yr = int(y) if y else dt.date.today().year
            mo = int(m) if m else dt.date.today().month
            return self._json(_sales_monthly_summary(yr, mo, cat))
        # 单条销售详情 /api/sales/<id>（需登录）
        if path.startswith("/api/sales/") and len(path.split("/")) == 4 and path.split("/")[3].isdigit():
            return self._json(_sales_get(int(path.split("/")[3])))

        if path == "/api/me":
            return self._json({"user": {k: u[k] for k in ("username", "name", "role")}})
        if path == "/api/me/credits":
            return self._json({"balance": self._credit_balance(u["username"])})
        if path == "/api/credits/prices":
            return self._json(self._credit_prices())
        if path == "/api/credits/transactions":
            return self._json(self._credit_transactions(u))
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
        if path == "/api/contacts":
            return self._json(self._list_contacts())
        if path == "/api/quotes":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            cid = qs.get("customer_id", [None])[0]
            return self._json(self._list_quotes(int(cid) if cid and cid.isdigit() else None))
        if path.startswith("/api/quotes/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit():
                return self._json(self._quote_detail(int(parts[3])))
        # 方案设计
        if path == "/api/schemes":
            return self._json(self._list_schemes())
        if path.startswith("/api/schemes/") and len(path.split("/")) == 4 and path.split("/")[3].isdigit():
            return self._json(self._scheme_detail(int(path.split("/")[3])))
        # 官网案例（后台管理列表：含未上架）
        if path == "/api/cases/all":
            if u["role"] not in ("admin", "manager", "designer"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._list_cases(public_only=False))
        # 官网通用内容（后台管理列表：含未上架、可按 type 过滤）
        if path == "/api/contents/all":
            if u["role"] not in ("admin", "manager", "designer"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._list_contents(public_only=False))
        # 全站可自定义文案与外观（编辑接口，需登录，见上方公开 GET /api/site）
        if path == "/api/site/edit":
            if u["role"] not in ("admin", "manager"):
                return self._json({"error": "无权限"}, 403)
            return self._json(_get_site_config())
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
        # 官网预约表单（公开接口）
        if path == "/api/contact" and method == "POST":
            return self._json(self._create_contact(body), 201)

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

        # ---- 门店销售记录（写入） ----
        if path == "/api/sales" and method == "POST":
            return self._json(_sales_create(body, u), 201)
        if path.startswith("/api/sales/"):
            sp = path.split("/")
            if len(sp) == 4 and sp[3].isdigit():
                sid = int(sp[3])
                if method == "PUT":
                    return self._json(_sales_update(sid, body))
                if method == "DELETE":
                    return self._json(_sales_delete(sid))

        # 预约线索（管理员/店长可删除）
        if path.startswith("/api/contacts/"):
            parts = path.split("/")
            if len(parts) == 4 and parts[3].isdigit() and method == "DELETE":
                if u["role"] not in ("admin", "manager"):
                    return self._json({"error": "无权限"}, 403)
                return self._json(self._delete_contact(int(parts[3])))

        # 积分充值（管理员/店长）
        if path == "/api/credits/recharge" and method == "POST":
            if u["role"] not in ("admin", "manager"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._credit_recharge(body, u))

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

        # 方案设计（设计师/店长/管理员均可）
        if path == "/api/scheme/upload" and method == "POST":
            return self._json(self._scheme_upload(body), 201)
        if path == "/api/scheme/generate" and method == "POST":
            return self._json(self._scheme_generate(body, u))
        if path == "/api/scheme/analyze" and method == "POST":
            return self._json(self._scheme_analyze(body, u))
        if path == "/api/schemes" and method == "POST":
            return self._json(self._create_scheme(body, u), 201)
        if path.startswith("/api/schemes/"):
            sp = path.split("/")
            if len(sp) == 4 and sp[3].isdigit():
                sid = int(sp[3])
                if method == "PUT":
                    return self._json(self._update_scheme(sid, body))
                if method == "DELETE":
                    return self._json(self._delete_scheme(sid))
            if len(sp) == 5 and sp[3].isdigit() and sp[4] == "quote" and method == "POST":
                return self._json(self._scheme_to_quote(int(sp[3]), u), 201)

        # 官网案例（管理员/店长/设计师可管理）
        if path == "/api/cases" and method == "POST":
            if u["role"] not in ("admin", "manager", "designer"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._create_case(body, u), 201)
        if path.startswith("/api/cases/"):
            cp = path.split("/")
            if len(cp) == 4 and cp[3].isdigit():
                cid = int(cp[3])
                if u["role"] not in ("admin", "manager", "designer"):
                    return self._json({"error": "无权限"}, 403)
                if method == "PUT":
                    return self._json(self._update_case(cid, body))
                if method == "DELETE":
                    return self._json(self._delete_case(cid))

        # 官网通用内容（管理员/店长/设计师可管理）
        if path == "/api/contents" and method == "POST":
            if u["role"] not in ("admin", "manager", "designer"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._create_content(body, u), 201)
        if path.startswith("/api/contents/"):
            ctp = path.split("/")
            if len(ctp) == 4 and ctp[3].isdigit():
                ctid = int(ctp[3])
                if u["role"] not in ("admin", "manager", "designer"):
                    return self._json({"error": "无权限"}, 403)
                if method == "PUT":
                    return self._json(self._update_content(ctid, body))
                if method == "DELETE":
                    return self._json(self._delete_content(ctid))

        # 站点装修：保存全站文案与外观（管理员/店长）
        if path == "/api/site" and method == "PUT":
            if u["role"] not in ("admin", "manager"):
                return self._json({"error": "无权限"}, 403)
            return self._json(_save_site_config(body))

        # 站点配图上传（管理员/店长/设计师），folder=site 用于全站背景/配图/Logo 等
        if path == "/api/upload" and method == "POST":
            if u["role"] not in ("admin", "manager", "designer"):
                return self._json({"error": "无权限"}, 403)
            return self._json(self._scheme_upload({**body, "folder": body.get("folder") or "site"}))

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

    def _create_contact(self, body):
        """官网预约表单提交：保存为待跟进线索。"""
        name = (body.get("name") or "").strip()
        phone = (body.get("phone") or "").strip()
        if not name or not phone:
            return {"error": "姓名和电话为必填项", "code": 400}
        conn = get_db()
        cur = conn.execute(
            "INSERT INTO contacts (name, phone, service, note, status, created_at) VALUES (?,?,?,?,?,?)",
            (name, phone, body.get("service"), body.get("note"), "待跟进", now_str()))
        cid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": cid}

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
            "INSERT INTO price_items (category, name, spec, unit, unit_price, cost_price, notes, active, updated_at) VALUES (?,?,?,?,?,?,?,1,?)",
            (body.get("category", "植物-其他"), body.get("name", ""), body.get("spec", ""),
             body.get("unit", "项"), to_float(body.get("unit_price"), 0),
             to_float(body.get("cost_price"), to_float(body.get("unit_price"), 0)),
             body.get("notes", ""), t))
        conn.commit()
        pid = cur.lastrowid
        conn.close()
        return {"id": pid}

    def _update_price(self, pid, body):
        t = now_str()
        conn = get_db()
        conn.execute(
            "UPDATE price_items SET category=?, name=?, spec=?, unit=?, unit_price=?, cost_price=?, notes=?, updated_at=? WHERE id=?",
            (body.get("category"), body.get("name"), body.get("spec"), body.get("unit"),
             to_float(body.get("unit_price"), 0),
             to_float(body.get("cost_price"), to_float(body.get("unit_price"), 0)),
             body.get("notes", ""), t, pid))
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

    # ---- 积分系统 ----
    def _credit_prices(self):
        s = get_settings()
        return {
            "pollinations": int(s.get("img_credit_pollinations") or 0),
            "hf": int(s.get("img_credit_hf") or 0),
            "siliconflow": int(s.get("img_credit_siliconflow") or 3),
            "doubao": int(s.get("img_credit_doubao") or 5),
            "openai": int(s.get("img_credit_openai") or 10),
            "default": int(s.get("img_credit_default") or 5),
            "enabled": (s.get("credits_enabled") or "1") == "1",
        }

    def _credit_price_for(self, provider, model):
        s = get_settings()
        prices = self._credit_prices()
        provider = (provider or "").lower()
        model = (model or "").lower()
        if provider == "pollinations":
            return prices["pollinations"]
        if provider == "hf" or "huggingface" in model or "flux.1-schnell" in model:
            return prices["hf"]
        if "siliconflow" in provider or "siliconflow" in model:
            return prices["siliconflow"]
        if "doubao" in model or "seedream" in model:
            return prices["doubao"]
        if "openai" in provider or model in ("dall-e-3", "gpt-image-1"):
            return prices["openai"]
        return prices["default"]

    def _credit_balance(self, username):
        conn = get_db()
        r = conn.execute("SELECT balance FROM credits JOIN users ON credits.user_id=users.id WHERE users.username=?", (username,)).fetchone()
        conn.close()
        return r["balance"] if r else 0

    def _credit_change(self, username, amount, tx_type, ref_type=None, ref_id=None, note=""):
        """修改积分余额并记录流水；amount 正为充值/退款，负为消费。"""
        conn = get_db()
        r = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        if not r:
            conn.close()
            return {"error": "用户不存在"}
        uid = r["id"]
        try:
            conn.execute("INSERT INTO credits (user_id, balance) VALUES (?, 0) ON CONFLICT(user_id) DO UPDATE SET balance=credits.balance",
                         (uid,))
            conn.execute("UPDATE credits SET balance = balance + ? WHERE user_id=?", (amount, uid))
            conn.execute("INSERT INTO credit_transactions (user_id, amount, type, ref_type, ref_id, note, created_at) VALUES (?,?,?,?,?,?,?)",
                         (uid, amount, tx_type, ref_type, ref_id, note, now_str()))
            conn.commit()
            bal = conn.execute("SELECT balance FROM credits WHERE user_id=?", (uid,)).fetchone()["balance"]
        finally:
            conn.close()
        return {"ok": True, "balance": bal}

    def _credit_consume(self, username, provider, model, n, ref_type=None, ref_id=None):
        s = get_settings()
        if (s.get("credits_enabled") or "1") != "1":
            return {"ok": True, "cost": 0, "balance": self._credit_balance(username)}
        price = self._credit_price_for(provider, model)
        cost = price * max(1, int(n or 1))
        bal = self._credit_balance(username)
        if bal < cost:
            return {"error": f"积分不足：本次需 {cost} 积分，当前余额 {bal}。请联系管理员充值。"}
        res = self._credit_change(username, -cost, "consume", ref_type, ref_id,
                                  f"生图 {provider}/{model} x{n}，-{cost} 积分")
        res["cost"] = cost
        return res

    def _credit_refund(self, username, cost, ref_type=None, ref_id=None):
        if cost <= 0:
            return {"ok": True}
        return self._credit_change(username, cost, "refund", ref_type, ref_id, f"生图失败退款 +{cost} 积分")

    def _credit_recharge(self, body, u):
        username = (body.get("username") or "").strip()
        try:
            amount = int(body.get("amount") or 0)
        except Exception:
            return {"error": "积分数量必须是整数"}
        note = (body.get("note") or "").strip() or f"管理员 {u['name']} 充值"
        if not username or amount == 0:
            return {"error": "用户名和积分数量必填"}
        return self._credit_change(username, amount, "recharge", note=note)

    def _credit_transactions(self, u):
        conn = get_db()
        if u["role"] in ("admin", "manager"):
            rows = conn.execute("""
                SELECT t.*, u.username, u.name FROM credit_transactions t
                JOIN users u ON t.user_id=u.id ORDER BY t.id DESC LIMIT 200
            """).fetchall()
        else:
            rows = conn.execute("""
                SELECT t.*, u.username, u.name FROM credit_transactions t
                JOIN users u ON t.user_id=u.id WHERE u.username=?
                ORDER BY t.id DESC LIMIT 100
            """, (u["username"],)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    # ---- 员工账号 ----
    def _list_users(self):
        conn = get_db()
        rows = conn.execute("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _list_contacts(self):
        conn = get_db()
        rows = conn.execute("SELECT id, name, phone, service, note, status, created_at FROM contacts ORDER BY id DESC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _delete_contact(self, cid):
        conn = get_db()
        conn.execute("DELETE FROM contacts WHERE id=?", (cid,))
        conn.commit()
        conn.close()
        return {"ok": True}

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
               tax_rate, tax, discount, total, margin, payment_method,
               status, remark, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.get("customer_id"), quote_no, body.get("title", "阳台花园项目报价"),
             json.dumps(calc["items"], ensure_ascii=False), calc["area"],
             calc["design_fee"], calc["hardscape_fee"], calc["plant_fee"], calc["soil_fee"], calc["mep_fee"],
             calc["transport_rate"], calc["transport_fee"], calc["subtotal"], calc["mgmt_rate"], calc["mgmt_fee"],
             calc["tax_rate"], calc["tax"], calc["discount"], calc["total"],
             calc["margin"], body.get("payment_method", ""),
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
               tax_rate=?, tax=?, discount=?, total=?, margin=?, payment_method=?, remark=?, updated_at=? WHERE id=?""",
            (body.get("title", r["title"]), json.dumps(calc["items"], ensure_ascii=False), calc["area"],
             calc["design_fee"], calc["hardscape_fee"], calc["plant_fee"], calc["soil_fee"], calc["mep_fee"],
             calc["transport_rate"], calc["transport_fee"], calc["subtotal"], calc["mgmt_rate"], calc["mgmt_fee"],
             calc["tax_rate"], calc["tax"], calc["discount"], calc["total"],
             calc["margin"], body.get("payment_method", r.get("payment_method", "")),
             body.get("remark", r["remark"]), t, qid))
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

    # ---- 方案设计 ----
    def _he(self, s):
        return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;") \
            .replace(">", "&gt;").replace('"', "&quot;")

    def _upload_dir(self):
        d = os.path.join(UPLOAD_DIR, "schemes")
        os.makedirs(d, exist_ok=True)
        return d

    def _scheme_upload(self, body):
        folder = (body.get("folder") or "schemes").strip() or "schemes"
        if folder not in ("schemes", "cases", "content", "site", "sales"):
            folder = "schemes"
        data = body.get("data", "")
        if "," in data:
            header, b64 = data.split(",", 1)
        else:
            header, b64 = "", data
        mime = "image/jpeg"
        if header.startswith("data:"):
            mime = header[5:].split(";")[0]
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(mime, "jpg")
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return {"error": "文件数据无法解析"}
        if len(raw) > 12 * 1024 * 1024:
            return {"error": "文件过大（上限 12MB）"}
        name = secrets.token_hex(12) + "." + ext
        d = os.path.join(UPLOAD_DIR, folder)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "wb") as f:
            f.write(raw)
        return {"url": "/uploads/" + folder + "/" + name}

    def _scheme_generate(self, body, u):
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return {"error": "请输入生图提示词"}
        try:
            n = int(body.get("n") or 1)
        except Exception:
            n = 1
        n = max(1, min(n, 4))
        s = get_settings()
        # 请求级参数优先，未提供时回退到系统设置
        provider = (body.get("provider") or s.get("img_gen_provider") or "pollinations").strip() or "pollinations"
        size = (body.get("size") or s.get("img_gen_size") or "1024x1024").strip() or "1024x1024"
        quality = (body.get("quality") or s.get("img_gen_quality") or "standard").strip() or "standard"
        watermark = str(body.get("watermark", s.get("img_gen_watermark") or "0")).strip()
        model = (body.get("model") or s.get("img_gen_model") or "").strip()
        base_url = (body.get("base_url") or s.get("img_gen_base_url") or "").strip()
        # 平台级 Key（系统设置）优先；方案 B：员工端不再传入个人 Key
        api_key = (body.get("api_key") or s.get("img_gen_api_key") or "").strip()
        # 需要 Key 的渠道若未配置平台级 Key，提前拦截（避免白扣积分）
        if provider in ("openai", "hf") and not api_key:
            return {"error": ("Hugging Face 模型" if provider == "hf" else "豆包 / OpenAI / 硅基流动等模型")
                    + "需要平台 API Key，请由管理员在「系统设置 → 生图模型」中统一配置后使用。"}
        try:
            w, h = size.lower().split("x")
            w, h = int(w), int(h)
        except Exception:
            w, h = 1024, 1024
        scheme_id = body.get("scheme_id")

        # 计算并扣除积分（失败会回滚）
        cost_res = self._credit_consume(u["username"], provider, model, n, "scheme_generate", scheme_id)
        if cost_res.get("error"):
            return cost_res
        cost = cost_res.get("cost", 0)

        # 把本次生图配置持久化到方案（方便下次复用）
        if scheme_id and str(scheme_id).isdigit():
            gen_config = {
                "provider": provider, "model": model, "base_url": base_url,
                "size": size, "quality": quality, "watermark": watermark
            }
            conn = get_db()
            conn.execute("UPDATE schemes SET gen_config=? WHERE id=?",
                         (json.dumps(gen_config, ensure_ascii=False), int(scheme_id)))
            conn.commit()
            conn.close()
        # 图生图 / 垫图参考（前端传第一张现场照片 URL）
        reference_image = (body.get("reference_image") or "").strip()
        cfg = {"provider": provider, "model": model, "base_url": base_url,
               "api_key": api_key, "size": size, "quality": quality, "watermark": watermark,
               "reference_image": reference_image}
        try:
            if provider == "pollinations":
                urls = self._gen_pollinations(prompt, w, h, n, cfg)
            elif provider == "hf":
                urls = self._gen_hf(prompt, w, h, n, cfg)
            else:
                urls = self._gen_openai(s, prompt, w, h, n, cfg)
        except urllib.error.HTTPError as he:
            # 生图失败，回滚积分
            self._credit_refund(u["username"], cost, "scheme_generate", scheme_id)
            detail = ""
            try:
                detail = he.read().decode("utf-8", "ignore")[:400]
            except Exception:
                pass
            msg = f"HTTP {he.code}"
            # 尽量提取上游真实错误信息（APIYI 常把额度不足也返回 403，需靠报文区分）
            upstream = detail
            try:
                _j = json.loads(detail)
                if isinstance(_j, dict):
                    _e = _j.get("error")
                    if isinstance(_e, dict) and _e.get("message"):
                        upstream = _e["message"]
                    elif isinstance(_e, str):
                        upstream = _e
                    elif _j.get("message"):
                        upstream = _j["message"]
            except Exception:
                pass
            low = (detail + " " + upstream).lower()
            if he.code == 401:
                msg += "：API Key 无效或未授权（请检查 Key 是否正确、是否已开通该模型、或 Key 是否已被禁用）"
            elif he.code == 403:
                if any(k in low for k in ("quota", "余额", "额度", "balance", "insufficient", "preconsumed", "pre_consumed")):
                    msg += "：上游账户额度/余额不足（请在 APIYI 控制台充值后再试）"
                elif any(k in low for k in ("permission", "权限", "开通", "authorize", "unauthorized", "forbidden")):
                    msg += "：没有权限调用该模型，请在控制台确认已开通并授权"
                else:
                    msg += "：调用被上游拒绝（请检查模型名 / Key / 账户状态）"
            elif he.code == 429:
                msg += "：请求过于频繁，请稍后重试"
            elif he.code >= 500:
                msg += "：模型服务暂时不可用，请稍后重试"
            if upstream and upstream != detail:
                msg += f"；上游：{upstream[:200]}"
            elif detail:
                msg += f"；详情：{detail[:200]}"
            return {"error": "生图失败：" + msg}
        except Exception as e:
            self._credit_refund(u["username"], cost, "scheme_generate", scheme_id)
            return {"error": "生图失败：" + str(e)}
        if not urls:
            self._credit_refund(u["username"], cost, "scheme_generate", scheme_id)
            return {"error": "生图失败：未获取到图片，请检查 API Key / 网络 / 模型名"}
        return {"urls": urls, "url": urls[0], "provider": provider, "model": model,
                "size": size, "quality": quality, "cost": cost}

    def _scheme_analyze(self, body, u):
        image_url = (body.get("image_url") or "").strip()
        task = (body.get("task") or "").strip()  # concept / items
        scheme_id = body.get("scheme_id")
        if task not in ("concept", "items"):
            return {"error": "task 参数错误，应为 concept 或 items"}
        s = get_settings()
        api_key = (body.get("api_key") or s.get("img_gen_api_key") or "").strip()
        base_url = (body.get("base_url") or s.get("img_gen_base_url") or "").strip()
        model = (body.get("model") or s.get("img_analysis_model") or s.get("img_gen_model") or "").strip()
        if not model:
            model = "gpt-4o-mini"
        if not api_key:
            return {"error": "未配置 API Key（请在系统设置 → 生图模型填写平台级 Key）"}
        if not image_url:
            return {"error": "请选择要分析的效果图"}
        try:
            text = self._analyze_image(image_url, task, api_key, base_url, model)
        except urllib.error.HTTPError as he:
            detail = ""
            try:
                detail = he.read().decode("utf-8", "ignore")[:400]
            except Exception:
                pass
            msg = f"HTTP {he.code}"
            try:
                _j = json.loads(detail)
                if isinstance(_j, dict) and isinstance(_j.get("error"), dict) and _j["error"].get("message"):
                    detail = _j["error"]["message"]
                elif isinstance(_j, dict) and _j.get("message"):
                    detail = _j["message"]
            except Exception:
                pass
            return {"error": f"分析失败：{msg}；上游：{detail[:200]}"}
        except Exception as e:
            return {"error": "分析失败：" + str(e)}
        if task == "items":
            items = []
            try:
                items = json.loads(text)
            except Exception:
                m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
                if m:
                    try:
                        items = json.loads(m.group(1))
                    except Exception:
                        pass
            out = []
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict):
                        out.append({
                            "category": str(it.get("category", "植物-其他")),
                            "name": str(it.get("name", "")),
                            "spec": str(it.get("spec", "")),
                            "qty": to_float(it.get("qty", 1)),
                            "unit": str(it.get("unit", "项")),
                            "cost_price": to_float(it.get("cost_price", 0))
                        })
            return {"text": text, "items": out, "task": task}
        return {"text": text, "task": task}

    def _analyze_image(self, image_url, task, api_key, base_url, model):
        # 读取图片为 base64 data URL（多模态 API 通用）
        if image_url.startswith("/uploads/"):
            path = os.path.join(UPLOAD_DIR, image_url[len("/uploads/"):])
            ext = os.path.splitext(path)[1].lower()
            mime = "image/png" if ext == ".png" else "image/jpeg"
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            image_data = f"data:{mime};base64,{b64}"
        elif image_url.startswith("http"):
            req = urllib.request.Request(image_url, headers={"User-Agent": "greenfun/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                ct = r.headers.get("Content-Type", "image/jpeg")
                raw = r.read()
            b64 = base64.b64encode(raw).decode("utf-8")
            mime = ct.split(";")[0].strip() if ct else "image/jpeg"
            image_data = f"data:{mime};base64,{b64}"
        else:
            image_data = image_url
        if task == "concept":
            prompt = ("你是一位专业的室内绿植软装设计师。请根据这张阳台/室内植物花园效果图，写一段设计方案理念。"
                      "要求：1）说明整体设计思路；2）植物选择逻辑与层次搭配；3）色彩与材质风格；4）日常养护要点。"
                      "字数控制在 200-300 字，语言专业且有感染力。")
        else:
            prompt = ("你是一位专业的室内绿植软装设计师与预算师。请分析这张阳台/室内植物花园效果图，列出实现该方案所需的植物与物料清单。"
                      "请输出 JSON 数组，每个元素包含字段：category（类别，如植物-乔木/植物-灌木/植物-草本/植物-藤本/硬景/辅材/容器/水电）、"
                      "name（名称）、spec（规格描述）、qty（数量，数字）、unit（单位）、cost_price（估算成本单价，数字，单位元）。"
                      "只输出 JSON 数组，不要有任何额外解释、Markdown 说明或代码块标记。")
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": image_data}},
                    {"type": "text", "text": prompt}
                ]}
            ],
            "max_tokens": 2000
        }
        base = base_url.strip() or "https://api.openai.com/v1"
        req = urllib.request.Request(
            base.rstrip("/") + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key})
        with urllib.request.urlopen(req, timeout=180) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        text = d.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not text:
            raise Exception("上游返回空内容")
        return text

    def _gen_pollinations(self, prompt, w, h, n, cfg=None):
        cfg = cfg or {}
        enc = urllib.parse.quote(prompt, safe="")
        out = []
        model = cfg.get("model") or "flux"
        # 部分 Pollinations 模型对尺寸敏感，超出范围会自动截断
        for _ in range(n):
            seed = secrets.randbelow(10 ** 9)
            url = ("https://image.pollinations.ai/prompt/%s?width=%d&height=%d&seed=%d&model=%s&nologo=true"
                   % (enc, w, h, seed, urllib.parse.quote(model, safe="")))
            reference_image = cfg.get("reference_image")
            if reference_image and reference_image.startswith("http"):
                url += "&image=" + urllib.parse.quote(reference_image, safe="")
            req = urllib.request.Request(url, headers={"User-Agent": "greenfun/1.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                raw = resp.read()
            if not raw or len(raw) < 200:
                raise Exception("Pollinations 返回空图片")
            name = secrets.token_hex(12) + ".jpg"
            with open(os.path.join(self._upload_dir(), name), "wb") as f:
                f.write(raw)
            out.append("/uploads/schemes/" + name)
        return out

    def _gen_hf(self, prompt, w, h, n, cfg=None):
        """Hugging Face 免费推理（需要 HF Token；免费账户有 rate limit）。"""
        cfg = cfg or {}
        key = (cfg.get("api_key") or "").strip()
        if not key:
            raise Exception("Hugging Face 模型需要 API Token（可在系统设置或生成时填写）")
        model = cfg.get("model") or "black-forest-labs/FLUX.1-schnell"
        url = f"https://router.huggingface.co/hf-inference/models/{model}"
        out = []
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        for _ in range(n):
            payload = {"inputs": prompt, "parameters": {"width": w, "height": h}}
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read()
            if not raw or len(raw) < 200:
                raise Exception("Hugging Face 返回空图片")
            ext = ".png" if raw[:8].startswith(b"\x89PNG\r\n\x1a\n") else ".jpg"
            name = secrets.token_hex(12) + ext
            with open(os.path.join(self._upload_dir(), name), "wb") as f:
                f.write(raw)
            out.append("/uploads/schemes/" + name)
        return out

    def _gen_openai(self, s, prompt, w, h, n, cfg=None):
        cfg = cfg or {}
        key = (cfg.get("api_key") or s.get("img_gen_api_key") or "").strip()
        if not key:
            raise Exception("未配置 API Key（请在系统设置→生图模型填写，或在生成时填写）")
        base = (cfg.get("base_url") or s.get("img_gen_base_url") or "https://api.openai.com/v1").strip() or "https://api.openai.com/v1"
        model = (cfg.get("model") or s.get("img_gen_model") or "gpt-image-1").strip() or "gpt-image-1"
        quality = (cfg.get("quality") or s.get("img_gen_quality") or "standard").strip() or "standard"
        watermark = str(cfg.get("watermark", s.get("img_gen_watermark") or "0")).strip()
        size = cfg.get("size") or s.get("img_gen_size") or "%dx%d" % (w, h)
        payload = {"model": model, "prompt": prompt, "n": n, "size": size}
        # gpt-image-1 / gpt_image_1 等部分模型不支持 response_format 参数，默认返回 url 也会兼容下载
        # OpenAI/DALL-E 支持 quality；豆包 Seedream 文档未明确支持 quality，避免传非标准值
        if quality in ("standard", "hd") and "doubao" not in model.lower():
            payload["quality"] = quality
        # 豆包支持 watermark 参数：false 去掉 "AI生成" 水印
        if watermark in ("1", "true", "True"):
            payload["watermark"] = True
        elif watermark in ("0", "false", "False"):
            payload["watermark"] = False
        # 图生图 / 垫图：优先用本地上传的图片（/uploads/...）
        reference_image = cfg.get("reference_image")
        if reference_image:
            img_url = reference_image
            if not img_url.startswith("http") and img_url.startswith("/uploads/"):
                try:
                    path = os.path.join(UPLOAD_DIR, img_url[len("/uploads/"):])
                    ext = os.path.splitext(path)[1].lower()
                    mime = "image/png" if ext == ".png" else "image/jpeg"
                    with open(path, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("utf-8")
                    img_url = f"data:{mime};base64,{b64}"
                except Exception:
                    img_url = reference_image
            if img_url:
                # 豆包 Seedream 系列通常用 image_url；gpt-image-1 用 image
                if "seedream" in model.lower():
                    payload["image_url"] = img_url
                else:
                    payload["image"] = img_url
        # Gemini OpenAI 兼容层：显式要求返回 b64_json（避免 url 临时链接下载失败），
        # 且单次仅生成 1 张（Gemini images.generate 实际只返回 1 张）
        is_gemini = ("generativelanguage.googleapis.com" in base) or model.lower().startswith("gemini")
        if is_gemini:
            payload["response_format"] = "b64_json"
            payload["n"] = 1
        req = urllib.request.Request(
            base.rstrip("/") + "/images/generations",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=180) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        out = []
        for item in d.get("data", []):
            b64 = item.get("b64_json") or item.get("url")
            if not b64:
                continue
            if b64.startswith("http"):
                with urllib.request.urlopen(urllib.request.Request(b64, headers={"User-Agent": "greenfun/1.0"}), timeout=90) as r2:
                    raw = r2.read()
            else:
                raw = base64.b64decode(b64)
            ext = ".jpg"
            # 豆包 5.0-lite 支持 output_format=png，根据返回 content-type 判断更准
            if raw[:8].startswith(b"\x89PNG\r\n\x1a\n"):
                ext = ".png"
            name = secrets.token_hex(12) + ext
            with open(os.path.join(self._upload_dir(), name), "wb") as f:
                f.write(raw)
            out.append("/uploads/schemes/" + name)
        return out

    def _list_schemes(self):
        conn = get_db()
        rows = conn.execute(
            "SELECT id, customer, project_name, room_type, status, created_at, quote_id FROM schemes ORDER BY id DESC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _scheme_detail(self, sid):
        conn = get_db()
        r = conn.execute("SELECT * FROM schemes WHERE id=?", (sid,)).fetchone()
        conn.close()
        if not r:
            return {"error": "not found"}
        d = dict(r)
        for k in ("photos", "images", "items"):
            try:
                d[k] = json.loads(d[k] or "[]")
            except Exception:
                d[k] = []
        try:
            d["gen_config"] = json.loads(d.get("gen_config") or "{}")
        except Exception:
            d["gen_config"] = {}
        return d

    def _create_scheme(self, body, u):
        t = now_str()
        conn = get_db()
        gen_config = body.get("gen_config") or {}
        if not isinstance(gen_config, dict):
            gen_config = {}
        cur = conn.execute(
            """INSERT INTO schemes (customer_id, customer, project_name, room_type, requirements, concept,
               photos, images, items, status, quote_id, gen_config, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.get("customer_id") or None, body.get("customer", ""), body.get("project_name", ""),
             body.get("room_type", ""), body.get("requirements", ""), body.get("concept", ""),
             json.dumps(body.get("photos", []), ensure_ascii=False),
             json.dumps(body.get("images", []), ensure_ascii=False),
             json.dumps(body.get("items", []), ensure_ascii=False),
             body.get("status", "草稿"), None,
             json.dumps(gen_config, ensure_ascii=False),
             u["name"], t, t))
        sid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": sid, **self._scheme_detail(sid)}

    def _update_scheme(self, sid, body):
        t = now_str()
        conn = get_db()
        r = conn.execute("SELECT * FROM schemes WHERE id=?", (sid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        gen_config = body.get("gen_config")
        if gen_config is None:
            gen_config = json.loads(r.get("gen_config") or "{}")
        elif not isinstance(gen_config, dict):
            gen_config = {}
        conn.execute(
            """UPDATE schemes SET customer_id=?, customer=?, project_name=?, room_type=?, requirements=?,
               concept=?, photos=?, images=?, items=?, status=?, gen_config=?, updated_at=? WHERE id=?""",
            (body.get("customer_id", r["customer_id"]), body.get("customer", r["customer"]),
             body.get("project_name", r["project_name"]), body.get("room_type", r["room_type"]),
             body.get("requirements", r["requirements"]), body.get("concept", r["concept"]),
             json.dumps(body.get("photos", json.loads(r["photos"] or "[]")), ensure_ascii=False),
             json.dumps(body.get("images", json.loads(r["images"] or "[]")), ensure_ascii=False),
             json.dumps(body.get("items", json.loads(r["items"] or "[]")), ensure_ascii=False),
             body.get("status", r["status"]),
             json.dumps(gen_config, ensure_ascii=False), t, sid))
        conn.commit()
        conn.close()
        return self._scheme_detail(sid)

    def _delete_scheme(self, sid):
        conn = get_db()
        conn.execute("DELETE FROM schemes WHERE id=?", (sid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    # ---- 官网案例 ----
    def _list_cases(self, public_only=False):
        conn = get_db()
        if public_only:
            rows = conn.execute(
                "SELECT id, title, category, summary, cover, sort FROM cases WHERE status=1 ORDER BY sort ASC, id DESC").fetchall()
        else:
            rows = conn.execute(
                "SELECT id, title, category, summary, cover, sort, status, created_at FROM cases ORDER BY sort ASC, id DESC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _case_detail(self, cid):
        conn = get_db()
        r = conn.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
        conn.close()
        if not r:
            return {"error": "not found"}
        d = dict(r)
        try:
            d["gallery"] = json.loads(d.get("gallery") or "[]")
        except Exception:
            d["gallery"] = []
        return d

    def _create_case(self, body, u):
        t = now_str()
        conn = get_db()
        cur = conn.execute(
            """INSERT INTO cases (title, category, summary, cover, detail, gallery, sort, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (body.get("title", "").strip(), body.get("category", ""),
             body.get("summary", ""), body.get("cover", ""),
             body.get("detail", ""), json.dumps(body.get("gallery", []), ensure_ascii=False),
             to_int(body.get("sort", 0)), to_int(body.get("status", 1)), t, t))
        cid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": cid, **self._case_detail(cid)}

    def _update_case(self, cid, body):
        t = now_str()
        conn = get_db()
        r = conn.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        gallery = body.get("gallery")
        if gallery is None:
            gallery = json.loads(r["gallery"] or "[]")
        elif not isinstance(gallery, list):
            gallery = []
        conn.execute(
            """UPDATE cases SET title=?, category=?, summary=?, cover=?, detail=?, gallery=?, sort=?, status=?, updated_at=? WHERE id=?""",
            (body.get("title", r["title"]).strip(), body.get("category", r["category"]),
             body.get("summary", r["summary"]), body.get("cover", r["cover"]),
             body.get("detail", r["detail"]), json.dumps(gallery, ensure_ascii=False),
             to_int(body.get("sort", r["sort"])), to_int(body.get("status", r["status"])), t, cid))
        conn.commit()
        conn.close()
        return self._case_detail(cid)

    def _delete_case(self, cid):
        conn = get_db()
        conn.execute("DELETE FROM cases WHERE id=?", (cid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    # ---- 官网通用内容（服务 / 课程活动 / 伙伴 / 团队 / 创始人） ----
    def _list_contents(self, public_only=False, ctype=None):
        conn = get_db()
        sql = "SELECT id, type, title, summary, cover, meta, icon, sort FROM contents"
        where, args = [], []
        if public_only:
            where.append("status=1")
        if ctype:
            where.append("type=?")
            args.append(ctype)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY sort ASC, id ASC"
        rows = conn.execute(sql, args).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _content_detail(self, ctid):
        conn = get_db()
        r = conn.execute("SELECT * FROM contents WHERE id=?", (ctid,)).fetchone()
        conn.close()
        if not r:
            return {"error": "not found"}
        d = dict(r)
        try:
            d["gallery"] = json.loads(d.get("gallery") or "[]")
        except Exception:
            d["gallery"] = []
        return d

    def _create_content(self, body, u):
        t = now_str()
        ctype = (body.get("type") or "").strip()
        if not ctype:
            return {"error": "缺少 type"}
        conn = get_db()
        cur = conn.execute(
            """INSERT INTO contents (type, title, summary, cover, detail, gallery, meta, icon, sort, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ctype, body.get("title", "").strip(), body.get("summary", ""),
             body.get("cover", ""), body.get("detail", ""),
             json.dumps(body.get("gallery", []), ensure_ascii=False),
             body.get("meta", ""), body.get("icon", ""),
             to_int(body.get("sort", 0)), to_int(body.get("status", 1)), t, t))
        ctid = cur.lastrowid
        conn.commit()
        conn.close()
        return {"id": ctid, **self._content_detail(ctid)}

    def _update_content(self, ctid, body):
        t = now_str()
        conn = get_db()
        r = conn.execute("SELECT * FROM contents WHERE id=?", (ctid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        gallery = body.get("gallery")
        if gallery is None:
            gallery = json.loads(r["gallery"] or "[]")
        elif not isinstance(gallery, list):
            gallery = []
        conn.execute(
            """UPDATE contents SET type=?, title=?, summary=?, cover=?, detail=?, gallery=?, meta=?, icon=?, sort=?, status=?, updated_at=? WHERE id=?""",
            (body.get("type", r["type"]).strip(), body.get("title", r["title"]).strip(),
             body.get("summary", r["summary"]), body.get("cover", r["cover"]),
             body.get("detail", r["detail"]), json.dumps(gallery, ensure_ascii=False),
             body.get("meta", r.get("meta", "")), body.get("icon", r.get("icon", "")),
             to_int(body.get("sort", r["sort"])), to_int(body.get("status", r["status"])), t, ctid))
        conn.commit()
        conn.close()
        return self._content_detail(ctid)

    def _delete_content(self, ctid):
        conn = get_db()
        conn.execute("DELETE FROM contents WHERE id=?", (ctid,))
        conn.commit()
        conn.close()
        return {"ok": True}

    def _scheme_to_quote(self, sid, u):
        conn = get_db()
        r = conn.execute("SELECT * FROM schemes WHERE id=?", (sid,)).fetchone()
        if not r:
            conn.close()
            return {"error": "not found"}
        d = dict(r)
        items = json.loads(d["items"] or "[]")
        qitems = [{"category": it.get("category", "植物-其他"), "name": it.get("name", ""),
                   "spec": it.get("spec", ""), "unit": it.get("unit", "项"),
                   "qty": to_float(it.get("qty", 1)), "cost_price": to_float(it.get("cost_price", 0)),
                   "unit_price": to_float(it.get("cost_price", 0)), "matched": True} for it in items]
        body = {
            "customer_id": d["customer_id"] if d["customer_id"] else None,
            "title": (d["project_name"] or "阳台花园") + " 植物软装方案报价",
            "items": qitems,
            "area": to_float(d.get("area") or 0),
        }
        res = self._create_quote(body, u)
        qid = res.get("id")
        if qid:
            conn.execute("UPDATE schemes SET quote_id=?, status='已转报价' WHERE id=?", (qid, sid))
            conn.commit()
        conn.close()
        return {"quote_id": qid, **res}

    def _scheme_print(self, path):
        parts = urllib.parse.urlparse(self.path)
        sid = path.split("/")[3]
        if not sid.isdigit():
            return self._send(404, "not found")
        token = urllib.parse.parse_qs(parts.query).get("token", [""])[0]
        sess = SESSIONS.get(token)
        if not sess or sess["exp"] < datetime.datetime.now().timestamp():
            return self._send(401, "<h3 style='font-family:sans-serif'>会话已过期，请回系统重新打开方案</h3>",
                              "text/html; charset=utf-8")
        conn = get_db()
        r = conn.execute("SELECT * FROM schemes WHERE id=?", (int(sid),)).fetchone()
        conn.close()
        if not r:
            return self._send(404, "not found")
        d = dict(r)
        s = get_settings()
        photos = json.loads(d["photos"] or "[]")
        images = json.loads(d["images"] or "[]")
        items = json.loads(d["items"] or "[]")
        html = self._render_scheme_html(d, s, photos, images, items)
        return self._send(200, html, "text/html; charset=utf-8")

    def _render_scheme_html(self, d, s, photos, images, items):
        color = s.get("print_color") or "#2e7d4f"
        company = s.get("print_company") or "绿趣"
        slogan = s.get("print_slogan") or ""
        footer = s.get("print_footer") or ""
        photo_html = "".join('<img src="%s" class="ph">' % self._he(u) for u in photos) or \
            '<div class="ph empty">（暂无现场照片）</div>'
        img_html = "".join('<img src="%s" class="ef">' % self._he(u) for u in images) or \
            '<div class="ef empty">（暂无 AI 效果图）</div>'
        rows = []
        for it in items:
            rows.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s %s</td><td>¥%.2f</td></tr>" % (
                self._he(it.get("category", "")), self._he(it.get("name", "")),
                self._he(it.get("spec", "")), self._he(it.get("qty", "")),
                self._he(it.get("unit", "")), to_float(it.get("cost_price", 0))))
        item_rows = "".join(rows) or '<tr><td colspan="5">（未配置植物清单）</td></tr>'
        concept = (d.get("concept") or "（待补充设计理念）").replace("\n", "<br>")
        cust = self._he(d.get("customer", "") or "—")
        proj = self._he(d.get("project_name", "") or "—")
        room = self._he(d.get("room_type", "") or "—")
        status = self._he(d.get("status", "") or "—")
        css = f"""<style>
 @page {{ size:A4; margin:16mm; }}
 * {{ box-sizing:border-box; }}
 body {{ font-family:"Noto Sans SC",system-ui,sans-serif; color:#222; margin:0; }}
 .hd {{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid {color}; padding-bottom:10px; }}
 .hd .co {{ font-size:22px; font-weight:700; color:{color}; }}
 .hd .sl {{ font-size:13px; color:#666; }}
 .meta {{ margin:14px 0; font-size:14px; }}
 .meta b {{ color:{color}; }}
 h2 {{ font-size:16px; color:{color}; border-left:4px solid {color}; padding-left:8px; margin:22px 0 10px; }}
 .grid {{ display:flex; flex-wrap:wrap; gap:10px; }}
 .ph {{ width:31%; aspect-ratio:4/3; object-fit:cover; border-radius:6px; border:1px solid #eee; }}
 .ef {{ width:48%; aspect-ratio:4/3; object-fit:cover; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.12); }}
 .empty {{ background:#f5f5f5; display:flex; align-items:center; justify-content:center; color:#999; font-size:13px; }}
 .concept {{ background:#fafafa; border:1px solid #eee; border-radius:8px; padding:14px 16px; line-height:1.9; font-size:14px; }}
 table {{ width:100%; border-collapse:collapse; margin-top:6px; font-size:13px; }}
 th,td {{ border:1px solid #ddd; padding:7px 9px; text-align:left; }}
 th {{ background:{color}; color:#fff; }}
 .ft {{ margin-top:24px; border-top:1px solid #ddd; padding-top:8px; font-size:12px; color:#888; text-align:center; }}
 @media print {{ .noprint {{ display:none; }} }}
</style>"""
        head = f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>绿趣 · 设计方案 · {proj}</title>'
        body = f"""</head><body>
 <div class="noprint" style="text-align:right;padding:8px"><button onclick="window.print()" style="padding:8px 18px;font-size:14px;background:{color};color:#fff;border:0;border-radius:6px;cursor:pointer">🖨 导出 / 打印 PDF</button></div>
 <div class="hd"><div><div class="co">{company}</div><div class="sl">{slogan}</div></div><div style="text-align:right;font-size:13px;color:#666">设计方案书<br>{proj}</div></div>
 <div class="meta">客户：<b>{cust}</b> ｜ 项目：{proj} ｜ 空间：{room} ｜ 状态：{status}</div>
 <h2>一、现场照片</h2><div class="grid">{photo_html}</div>
 <h2>二、AI 效果图</h2><div class="grid">{img_html}</div>
 <h2>三、设计理念</h2><div class="concept">{concept}</div>
 <h2>四、植物与物料清单</h2><table><thead><tr><th>类别</th><th>名称</th><th>规格</th><th>数量</th><th>成本单价</th></tr></thead><tbody>{item_rows}</tbody></table>
 <div class="ft">{footer}</div>
</body></html>"""
        return head + css + body

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

    def _sales_print(self, path):
        """销售单打印页；token 通过查询参数 ?token= 传入"""
        parts = urllib.parse.urlparse(self.path)
        sid = path.split("/")[3]
        if not sid.isdigit():
            return self._send(404, "not found")
        qs = urllib.parse.parse_qs(parts.query)
        token = qs.get("token", [""])[0]
        sess = SESSIONS.get(token)
        if not sess or sess["exp"] < datetime.datetime.now().timestamp():
            return self._send(401, "<h3 style='font-family:sans-serif'>会话已过期，请回系统重新打开销售单</h3>",
                              "text/html; charset=utf-8")
        html = _sales_receipt_html(int(sid))
        return self._send(200, html, "text/html; charset=utf-8")

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
    s = get_settings()
    cust = q.get("customer") or {}
    # 客户版报价单：强制不显示成本价与毛利率，避免商业信息泄露
    show_cost = False
    color = s.get("print_color") or "#2e7d4f"
    company = s.get("print_company") or "绿趣植物空间艺术科技有限公司"
    slogan = s.get("print_slogan") or ""
    footer = s.get("print_footer") or ""
    title = s.get("print_title") or "报价单"
    note = s.get("print_note") or ""
    # 付款方式（后台可编辑）
    pm_label = q.get("payment_method") or ""
    pms = []
    try:
        pms = json.loads(s.get("payment_methods") or "[]")
    except Exception:
        pms = []
    pm_note = ""
    for x in pms:
        if x.get("label") == pm_label:
            pm_note = x.get("note", "")
            break
    if pm_label:
        pay_text = f"{esc(pm_label)}　{esc(pm_note)}"
    else:
        pay_text = "（详见合同）"
    foot_full = esc(footer) + "\n\n" + esc(note)

    cost_th = "<th class='r'>成本</th>" if show_cost else ""
    rows = ""
    for i, it in enumerate(q["items"], 1):
        cost_td = f"<td class='r'>{money(it.get('cost_price'))}</td>" if show_cost else ""
        rows += (f"<tr><td>{i}</td><td>{esc(it.get('category',''))}</td><td>{esc(it.get('name',''))}</td>"
                 f"<td>{esc(it.get('spec',''))}</td><td class='r'>{esc(it.get('qty',''))}</td>"
                 f"<td>{esc(it.get('unit',''))}</td><td class='r'>{money(it.get('unit_price'))}</td>"
                 f"{cost_td}<td class='r'>{money(it.get('subtotal'))}</td></tr>")
    fee = lambda label, v: (f"<tr><td>{label}</td><td class='r'>¥{money(v)}</td></tr>")
    # margin_pct = q.get("margin_pct")
    # if margin_pct in (None, ""):
    #     margin_pct = round(to_float(q.get("margin"), 0) * 100, 1)
    # 客户版报价单不显示毛利率
    margin_line = ""
    return f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>{esc(title)} {esc(q.get('quote_no',''))}</title>
<style>
  body{{font-family:'Microsoft YaHei',sans-serif;color:#1a2e22;max-width:880px;margin:0 auto;padding:34px}}
  .head{{text-align:center;border-bottom:3px solid {color};padding-bottom:14px;margin-bottom:20px}}
  .head h1{{margin:0;color:{color};font-size:24px}}
  .head .sub{{color:#5a6b60;font-size:13px;margin-top:4px}}
  .meta{{display:flex;justify-content:space-between;flex-wrap:wrap;font-size:13px;margin-bottom:16px}}
  .meta div{{margin:3px 0;min-width:48%}}
  table{{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:18px}}
  th,td{{border:1px solid #cfe0d5;padding:7px 8px;text-align:left}}
  th{{background:#eaf5ee;color:{color}}}
  td.r,th.r{{text-align:right}}
  .fees{{width:52%;margin-left:48%}}
  .total-row td{{font-weight:bold;background:#eaf5ee;color:{color};font-size:15px}}
  .pay{{background:#f6fbf8;border:1px solid #cfe0d5;border-radius:8px;padding:12px 14px;font-size:13px;margin-top:6px}}
  .sign{{display:flex;justify-content:space-between;margin-top:36px;font-size:13px}}
  .foot{{text-align:center;color:#8a988f;font-size:12px;margin-top:26px;white-space:pre-line}}
  @media print{{.noprint{{display:none}}body{{padding:8px}}}}
</style></head><body>
<button class="noprint" onclick="window.print()" style="padding:8px 18px;background:{color};color:#fff;border:0;border-radius:6px;cursor:pointer;margin-bottom:14px">🖨 打印 / 存为 PDF</button>
<div class="head">
  <h1>{esc(company)}</h1>
  <div class="sub">{esc(title)}　{('| ' + esc(slogan)) if slogan else ''}</div>
</div>
<div class="meta">
  <div><b>报价单号：</b>{esc(q.get('quote_no',''))}</div>
  <div><b>日期：</b>{esc((q.get('created_at') or '')[:10])}</div>
  <div><b>客户：</b>{esc(cust.get('name',''))}　{esc(cust.get('phone',''))}</div>
  <div><b>项目地址：</b>{esc(cust.get('address',''))}</div>
  <div><b>阳台面积：</b>{esc(q.get('area',''))} ㎡</div>
  <div><b>状态：</b>{esc(q.get('status',''))}</div>
</div>
<h3 style="color:{color}">一、植物与材料明细</h3>
<table>
  <thead><tr><th>#</th><th>类别</th><th>名称</th><th>规格</th><th class="r">数量</th><th>单位</th><th class="r">单价</th>{cost_th}<th class="r">小计</th></tr></thead>
  <tbody>{rows or '<tr><td colspan=8 style="text-align:center;color:#999">无明细</td></tr>'}</tbody>
</table>
<h3 style="color:{color}">二、费用汇总</h3>
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
    {margin_line}
    <tr class="total-row"><td>合计</td><td class="r">¥{money(q.get('total'))}</td></tr>
  </tbody>
</table>
<div class="pay"><b>付款方式：</b>{pay_text}　　{('<b>备注：</b>' + esc(q.get('remark',''))) if q.get('remark') else ''}</div>
<div class="sign">
  <div>客户签字：______________　日期：__________</div>
  <div>{esc(company)}（盖章）：______________　设计师：{esc(q.get('created_by',''))}</div>
</div>
<div class="foot">{foot_full}</div>
</body></html>"""


# ---------------------------------------------------------------------------
# 门店每日销售记录 —— 业务函数
# ---------------------------------------------------------------------------

def _sales_list(params=None):
    """查询销售记录，支持按日期/客户筛选"""
    conn = get_db()
    sql = "SELECT * FROM daily_sales ORDER BY sale_date DESC, id DESC"
    args = []
    if params:
        conds = []
        if params.get("date_from"):
            conds.append("sale_date >= ?")
            args.append(params["date_from"])
        if params.get("date_to"):
            conds.append("sale_date <= ?")
            args.append(params["date_to"])
        if params.get("customer"):
            conds.append("customer_name LIKE ?")
            args.append("%" + params["customer"] + "%")
        if params.get("category"):
            conds.append("category = ?")
            args.append(params["category"])
        if conds:
            sql = "SELECT * FROM daily_sales WHERE " + " AND ".join(conds) + " ORDER BY sale_date DESC, id DESC"
    rows = conn.execute(sql, args).fetchall()
    conn.close()
    out = [dict(r) for r in rows]
    for rec in out:
        rec["photo_urls"] = _parse_sales_photos(rec)
    return out


def _parse_sales_photos(rec):
    """统一返回图片数组：优先 photo_urls(JSON)，兼容旧 photo_url 单张"""
    raw = rec.get("photo_urls") or ""
    urls = []
    if raw:
        try:
            urls = json.loads(raw)
        except Exception:
            urls = []
    if not isinstance(urls, list):
        urls = []
    urls = [u for u in urls if u]
    if not urls and rec.get("photo_url"):
        urls = [rec["photo_url"]]
    return urls


def _sales_get(sid):
    """获取单条销售记录"""
    conn = get_db()
    r = conn.execute("SELECT * FROM daily_sales WHERE id=?", (sid,)).fetchone()
    conn.close()
    if not r:
        return None
    rec = dict(r)
    rec["photo_urls"] = _parse_sales_photos(rec)
    return rec


def _sales_create(body, user=None):
    """新建销售记录"""
    t = now_str()
    conn = get_db()
    photo_urls = body.get("photo_urls")
    if isinstance(photo_urls, list):
        photo_urls = json.dumps(photo_urls, ensure_ascii=False)
    elif not photo_urls:
        photo_urls = ""
    # 封面图：优先用传入的 photo_url，否则取 photo_urls 第一张
    cover = body.get("photo_url") or ""
    if not cover and photo_urls:
        try:
            arr = json.loads(photo_urls)
            if isinstance(arr, list) and arr:
                cover = arr[0]
        except Exception:
            pass
    cur = conn.execute("""
        INSERT INTO daily_sales (sale_date, category, product_name, photo_url, photo_urls, price_note,
            recharge_amount, sales_amount, payment_method, customer_name, note,
            created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        body.get("sale_date", t[:10]),
        body.get("category", ""),
        body.get("product_name", ""),
        cover,
        photo_urls,
        body.get("price_note", ""),
        float(body.get("recharge_amount") or 0),
        float(body.get("sales_amount") or 0),
        body.get("payment_method", ""),
        body.get("customer_name", ""),
        body.get("note", ""),
        user.get("username", "") if user else "",
        t,
    ))
    conn.commit()
    sid = cur.lastrowid
    conn.close()
    return {"id": sid}


def _sales_update(sid, body):
    """更新销售记录"""
    conn = get_db()
    fields = []
    values = []
    for k in ("sale_date","category","product_name","photo_url","photo_urls","price_note",
              "recharge_amount","sales_amount","payment_method","customer_name","note"):
        if k in body:
            fields.append(f"{k}=?")
            # numeric fields
            if k in ("recharge_amount","sales_amount"):
                values.append(float(body[k]) or 0)
            elif k == "photo_urls":
                v = body[k]
                values.append(json.dumps(v, ensure_ascii=False) if isinstance(v, list) else (v or ""))
            else:
                values.append(body[k])
    if not fields:
        conn.close()
        return {"ok": True}
    values.append(sid)
    conn.execute(f"UPDATE daily_sales SET {','.join(fields)},created_at=created_at WHERE id=?", values)
    conn.commit()
    conn.close()
    return {"ok": True}


def _sales_delete(sid):
    """删除销售记录"""
    conn = get_db()
    conn.execute("DELETE FROM daily_sales WHERE id=?", (sid,))
    conn.commit()
    conn.close()
    return {"ok": True}


def _sales_receipt_html(sid):
    """生成单笔销售单 HTML（可打印）"""
    s = _sales_get(sid)
    if not s:
        return "<p>未找到该销售记录</p>"
    company = "温州绿趣植物空间艺术科技有限公司"
    addr = "鹿城区六虹桥路991号"
    phone = "0577-88868293"
    sales_amt = float(s.get("sales_amount", 0) or 0)
    recharge_amt = float(s.get("recharge_amount", 0) or 0)
    total = sales_amt + recharge_amt
    # 预先拼好可选行，避免在 f-string 表达式内使用引号/反斜杠
    recharge_row = ""
    if recharge_amt > 0:
        recharge_row = ('<tr><th class="r">充值金额</th><td class="r">'
                        + "&yen;" + ("%.2f" % recharge_amt) + "</td></tr>")
    photo_row = ""
    photos = s.get("photo_urls") or []
    if photos:
        photo_imgs = "".join(
            '<img src="' + esc(u) + '" style="max-height:120px;border-radius:4px;margin:4px">'
            for u in photos
        )
        photo_row = '<tr><th>商品图片</th><td>' + photo_imgs + '</td></tr>'
    note_row = ""
    if s.get("note"):
        note_row = "<tr><th>备注</th><td>" + esc(s.get("note", "")) + "</td></tr>"
    return f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>销售单 #{s['id']}</title>
<style>
body{{font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;padding:40px;max-width:520px;margin:auto;color:#333}}
h1{{text-align:center;font-size:20px;color:#2D5A27;border-bottom:2px solid #2D5A27;padding-bottom:10px}}
.info{{display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:16px}}
table{{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}}
th,td{{border:1px solid #ddd;padding:8px 10px;text-align:left}}
th{{background:#f5f7f4;color:#2D5A27;font-weight:600}}.r{{text-align:right}}
.tot{{font-size:17px;font-weight:bold;text-align:right;padding:12px;background:#f0f7f2;border:1px solid #c8d9c6}}
.sign{{margin-top:30px;display:flex;justify-content:space-between;font-size:13px;color:#555}}
.foot{{margin-top:24px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:10px}}
@media print{{body{{padding:20px}} .no-print{{display:none}}}}
</style></head><body>
<h1>{company} 销售单</h1>
<div class="info">
  <span>单号：#{s['id']}</span>
  <span>日期：{s.get('sale_date','')}</span>
</div>
<div class="info">
  <span>操作员：{s.get('created_by','')}</span>
  <span>客户：{s.get('customer_name','-')}</span>
</div>
<table>
  <tr><th>收入类别</th><td>{s.get('category','-')}</td></tr>
  <tr><th>商品名称</th><td>{s.get('product_name','-')}</td></tr>
  <tr><th>价格/折扣说明</th><td>{s.get('price_note','-') or '-'}</td></tr>
  {recharge_row}
  <tr><th class="r">销售收入</th><td class="r">&yen;{sales_amt:.2f}</td></tr>
  <tr><th>收款方式</th><td>{s.get('payment_method','-')}</td></tr>
  {photo_row}
  {note_row}
</table>
<div class="tot">合计：&yen;{total:.2f}</div>
<div class="sign">
  <span>客户签字：______________</span>
  <span>日期：__________</span>
</div>
<div class="foot">{company} · {addr} · {phone}</div>
<script>window.onload=function(){{window.print()}}</script>
</body></html>"""


def _sales_weekly_summary(week_start=None, category=None):
    """本周客户消费汇总：按客户分组，列出买了什么、消费多少；可选按收入类别筛选"""
    import datetime as dt
    if not week_start:
        today = dt.date.today()
        week_start = today - dt.timedelta(days=today.weekday())  # 本周一
    elif isinstance(week_start, str):
        week_start = dt.date.fromisoformat(week_start)
    week_end = week_start + dt.timedelta(days=6)
    ds = week_start.isoformat()
    de = week_end.isoformat()

    conn = get_db()
    sql = "SELECT * FROM daily_sales WHERE sale_date BETWEEN ? AND ?"
    args = [ds, de]
    if category:
        sql += " AND category = ?"
        args.append(category)
    sql += " ORDER BY customer_name, sale_date, id"
    rows = conn.execute(sql, args).fetchall()
    conn.close()

    # 按客户分组
    customers = {}
    for r in rows:
        d = dict(r)
        name = d.get("customer_name") or "(未登记客户)"
        if name not in customers:
            customers[name] = {"items": [], "total_sales": 0, "total_recharge": 0}
        customers[name]["items"].append(d)
        customers[name]["total_sales"] += float(d.get("sales_amount") or 0)
        customers[name]["total_recharge"] += float(d.get("recharge_amount") or 0)

    return {
        "week_start": ds,
        "week_end": de,
        "customers": customers,
        "grand_total_sales": sum(c["total_sales"] for c in customers.values()),
        "grand_total_recharge": sum(c["total_recharge"] for c in customers.values()),
    }


def _sales_monthly_summary(year=None, month=None, category=None):
    """本月（或指定年月）客户消费汇总：复用 weekly 逻辑，日期范围改为整月；可选按收入类别筛选"""
    import datetime as dt
    today = dt.date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month
    ds = dt.date(year, month, 1)
    if month == 12:
        de = dt.date(year + 1, 1, 1) - dt.timedelta(days=1)
    else:
        de = dt.date(year, month + 1, 1) - dt.timedelta(days=1)
    conn = get_db()
    sql = "SELECT * FROM daily_sales WHERE sale_date BETWEEN ? AND ?"
    args = [ds.isoformat(), de.isoformat()]
    if category:
        sql += " AND category = ?"
        args.append(category)
    sql += " ORDER BY customer_name, sale_date, id"
    rows = conn.execute(sql, args).fetchall()
    conn.close()
    customers = {}
    for r in rows:
        d = dict(r)
        name = d.get("customer_name") or "(未登记客户)"
        if name not in customers:
            customers[name] = {"items": [], "total_sales": 0, "total_recharge": 0}
        customers[name]["items"].append(d)
        customers[name]["total_sales"] += float(d.get("sales_amount") or 0)
        customers[name]["total_recharge"] += float(d.get("recharge_amount") or 0)
    return {
        "date_start": ds.isoformat(),
        "date_end": de.isoformat(),
        "customers": customers,
        "grand_total_sales": sum(c["total_sales"] for c in customers.values()),
        "grand_total_recharge": sum(c["total_recharge"] for c in customers.values()),
    }


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"绿趣全流程管理系统已启动： http://localhost:{PORT}")
    print(f"数据库：{DB_PATH}")
    print("系统已内置默认管理员账号，请首次登录后立即在后台「用户管理」修改管理员密码并删除示例员工账号。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
