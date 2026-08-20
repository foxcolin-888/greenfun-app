// 全局错误兜底：脚本异常时给出提示而非静默空白
window.addEventListener('error', function () {
  var t = document.getElementById('toast');
  if (t) { t.textContent = '页面脚本异常，请刷新重试'; t.classList.remove('hidden'); }
});
// 绿趣 · 家装阳台植物花园全流程管理 —— 前端逻辑（原生 JS，无第三方依赖）
const API = '/api';
const ROLE_NAMES = { admin: '管理员', manager: '店长', sales: '销售顾问', designer: '设计师' };
const state = {
  view: 'customers',
  token: localStorage.getItem('gf_token') || '',
  user: null,               // {username,name,role}
  customers: [],
  stages: [],
  current: null,
  activeStage: 1,
  filters: { q: '', stage: '', owner: '', status: '' },
  operator: '',
  activeFormFile: null,
  // 报价台
  quote: { customerId: '', items: [], params: {}, editing: null },
  // 方案设计
  scheme: null,
  settings: null,
  categories: [],
  prices: [],
  creditBalance: 0,
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// 方案设计 · AI 生图模型预设
// credit 为单张消耗积分（0=免费）；最终扣费 = credit × 张数，可被系统设置覆盖
const IMG_MODELS = [
  { id: 'pollinations-flux', name: 'Pollinations Flux（免费免 Key）', provider: 'pollinations', model: 'flux', base_url: '', credit: 0, quality: 'standard', desc: '免费免 Key，速度中等，适合快速出图' },
  { id: 'pollinations-turbo', name: 'Pollinations Turbo（免费免 Key）', provider: 'pollinations', model: 'turbo', base_url: '', credit: 0, quality: 'standard', desc: '免费快速版，适合草图预览' },
  { id: 'pollinations-realism', name: 'Pollinations 写实（免费免 Key）', provider: 'pollinations', model: 'flux-realism', base_url: '', credit: 0, quality: 'standard', desc: '免费写实风格增强' },
  { id: 'hf-flux-schnell', name: 'FLUX.1-schnell（Hugging Face 免费）', provider: 'hf', model: 'black-forest-labs/FLUX.1-schnell', base_url: '', credit: 0, quality: 'standard', desc: '当下最火开源 FLUX 模型，需 HF Token（免费账户有额度）' },
  { id: 'siliconflow-flux-11', name: '硅基流动 FLUX.1（国内低价）', provider: 'openai', model: 'black-forest-labs/FLUX.1-schnell', base_url: 'https://api.siliconflow.cn/v1', credit: 3, quality: 'standard', desc: '国内 SiliconFlow 加速，价格便宜，需 API Key' },
  { id: 'siliconflow-qvq', name: '硅基流动 QVQ-72B-Preview（国内低价）', provider: 'openai', model: 'QVQ-72B-Preview', base_url: 'https://api.siliconflow.cn/v1', credit: 3, quality: 'standard', desc: '硅基流动多模态模型，需 API Key' },
  { id: 'doubao-seedream-5-lite', name: '豆包 Seedream 5.0 Lite', provider: 'openai', model: 'doubao-seedream-5-0-lite-260128', base_url: 'https://ark.cn-beijing.volces.com/api/v3', credit: 5, quality: 'standard', desc: '豆包最新轻量版，支持 2K/3K，需火山引擎 API Key' },
  { id: 'doubao-seedream-5', name: '豆包 Seedream 5.0', provider: 'openai', model: 'doubao-seedream-5-0-260128', base_url: 'https://ark.cn-beijing.volces.com/api/v3', credit: 8, quality: 'standard', desc: '豆包旗舰版，支持 2K/3K，需火山引擎 API Key' },
  { id: 'doubao-seedream-4-5', name: '豆包 Seedream 4.5', provider: 'openai', model: 'doubao-seedream-4-5-251128', base_url: 'https://ark.cn-beijing.volces.com/api/v3', credit: 7, quality: 'standard', desc: '豆包 4.5，支持 2K/4K，需火山引擎 API Key' },
  { id: 'doubao-seedream-4', name: '豆包 Seedream 4.0', provider: 'openai', model: 'doubao-seedream-4-0-250828', base_url: 'https://ark.cn-beijing.volces.com/api/v3', credit: 6, quality: 'standard', desc: '豆包 4.0，支持 1K/2K/4K，需火山引擎 API Key' },
  { id: 'doubao-seedream-3', name: '豆包 Seedream 3.0-t2i', provider: 'openai', model: 'doubao-seedream-3-0-t2i-250415', base_url: 'https://ark.cn-beijing.volces.com/api/v3', credit: 4, quality: 'standard', desc: '豆包文生图基础版，512–2048 像素，需火山引擎 API Key' },
  { id: 'openai-dall-e-3', name: 'OpenAI DALL·E 3', provider: 'openai', model: 'dall-e-3', base_url: '', credit: 10, quality: 'hd', desc: 'OpenAI 官方，按张计费' },
  { id: 'openai-gpt-image-1', name: 'OpenAI GPT-Image-1', provider: 'openai', model: 'gpt-image-1', base_url: '', credit: 12, quality: 'hd', desc: 'OpenAI 最新生图模型，按张计费' },
  // —— APIYI 聚合网关（OpenAI 兼容，平台 Key 由系统设置统一配置）——
  { id: 'apiyi-seedream-5', name: 'APIYI · 豆包 Seedream 5.0', provider: 'openai', model: 'seedream-5-0-260128', base_url: 'https://api.apiyi.com/v1', credit: 5, quality: 'standard', desc: 'APIYI 聚合 · 豆包 Seedream 5.0，需 APIYI 平台 Key' },
  { id: 'apiyi-dall-e-3', name: 'APIYI · DALL·E 3', provider: 'openai', model: 'dall-e-3', base_url: 'https://api.apiyi.com/v1', credit: 10, quality: 'hd', desc: 'APIYI 聚合 · OpenAI DALL·E 3，需 APIYI 平台 Key' },
  { id: 'apiyi-gpt-image-1', name: 'APIYI · GPT-Image-1', provider: 'openai', model: 'gpt-image-1', base_url: 'https://api.apiyi.com/v1', credit: 12, quality: 'hd', desc: 'APIYI 聚合 · OpenAI GPT-Image-1，需 APIYI 平台 Key' },
  { id: 'apiyi-flux-pro', name: 'APIYI · FLUX Pro', provider: 'openai', model: 'flux-pro', base_url: 'https://api.apiyi.com/v1', credit: 6, quality: 'standard', desc: 'APIYI 聚合 · FLUX Pro 写实，需 APIYI 平台 Key' },
  { id: 'apiyi-nano-banana', name: 'APIYI · NanoBanana Pro', provider: 'openai', model: 'nano-banana-pro', base_url: 'https://api.apiyi.com/v1', credit: 4, quality: 'standard', desc: 'APIYI 聚合 · NanoBanana 高性价比，需 APIYI 平台 Key' },
  { id: 'apiyi-gemini-image', name: 'APIYI · Gemini 生图', provider: 'openai', model: 'gemini-2.5-flash-image', base_url: 'https://api.apiyi.com/v1', credit: 5, quality: 'standard', desc: 'APIYI 聚合 · Gemini 图像生成，需 APIYI 平台 Key' },
  { id: 'custom', name: '自定义（使用系统设置）', provider: '', model: '', base_url: '', credit: 5, quality: 'standard', desc: '读取系统设置→生图模型中的配置' },
];
const ASPECT_RATIOS = [
  { id: 'auto', label: '自动', size: '' },
  { id: '1:1', label: '1:1', size: '1024x1024' },
  { id: '16:9', label: '16:9', size: '1024x576' },
  { id: '9:16', label: '9:16', size: '576x1024' },
  { id: '4:3', label: '4:3', size: '1024x768' },
  { id: '3:4', label: '3:4', size: '768x1024' },
  { id: '3:2', label: '3:2', size: '1024x683' },
  { id: '2:3', label: '2:3', size: '683x1024' },
];
const QUALITY_SIZES = {
  // Seedream 5.0 标准：短边 ≥ 1920、长边 ≤ 4096、总像素 ≥ 3686400
  // 各比例按短边 {标清1920 / 高清2048 / 2K2560 / 4K4096} 等比换算，长边超出 4096 时截断
  '1:1': { sd: '1920x1920', hd: '2048x2048', '2k': '2560x2560', '4k': '4096x4096' },
  '16:9': { sd: '3413x1920', hd: '3640x2048', '2k': '4096x2304', '4k': '4096x2304' },
  '9:16': { sd: '1920x3413', hd: '2048x3640', '2k': '2304x4096', '4k': '2304x4096' },
  '4:3': { sd: '2560x1920', hd: '2731x2048', '2k': '3413x2560', '4k': '4096x3072' },
  '3:4': { sd: '1920x2560', hd: '2048x2731', '2k': '2560x3413', '4k': '3072x4096' },
  '3:2': { sd: '2880x1920', hd: '3072x2048', '2k': '3840x2560', '4k': '4096x2731' },
  '2:3': { sd: '1920x2880', hd: '2048x3072', '2k': '2560x3840', '4k': '2731x4096' },
};
const QUALITY_LABELS = { sd: '标清', hd: '高清', '2k': '2K', '4k': '4K', custom: '自定义 (不限制)' };

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const stageName = id => (state.stages.find(s => s.id === +id) || {}).name || ('阶段' + id);
const STATUS_CLASS = { '线索': 'st-lead', '已成交': 'st-deal', '无效': 'st-loss' };
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
function fmt(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt0(n) { return (n || 0).toLocaleString('zh-CN'); }

// 根据模型预设 + 画面比例 + 画质 计算最终 size 字符串
// customW/customH 仅当 qualityId==='custom' 时生效，可填任意像素（后端不截断 → 不限制）
// 部分模型有最小尺寸限制（如豆包 Seedream 5.0 要求短边≥1920），低于下限时按比例放大
function computeGenSize(modelId, aspectId, qualityId, fallbackSize, customW, customH) {
  let w, h;
  if (qualityId === 'custom') {
    w = (customW && +customW > 0) ? Math.round(+customW) : 4096;
    h = (customH && +customH > 0) ? Math.round(+customH) : 4096;
  } else if (aspectId === 'auto') {
    [w, h] = (fallbackSize || '1024x1024').split('x').map(Number);
  } else {
    const map = QUALITY_SIZES[aspectId];
    const s = (map && map[qualityId]) || (map && map.sd) || fallbackSize || '1024x1024';
    [w, h] = s.split('x').map(Number);
  }
  const isSeedream = /seedream/i.test(modelId || '');
  const minShort = isSeedream ? 1920 : 0;
  if (minShort > 0) {
    const shortSide = Math.min(w, h);
    if (shortSide > 0 && shortSide < minShort) {
      const scale = minShort / shortSide;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
  }
  return w + 'x' + h;
}
// 根据设置值反推当前选中的预设
function findImgModelPreset(cfg) {
  if (!cfg) return IMG_MODELS[0];
  if (cfg.provider === 'pollinations') return IMG_MODELS.find(m => m.id === 'pollinations-flux') || IMG_MODELS[0];
  const m = IMG_MODELS.find(x => x.provider === cfg.provider && x.model === cfg.model && x.id !== 'custom');
  return m || IMG_MODELS[IMG_MODELS.length - 1]; // custom
}
function parseQualityFromSize(aspectId, size) {
  if (aspectId === 'auto') return 'sd';
  const map = QUALITY_SIZES[aspectId] || {};
  for (const k of ['sd', 'hd', '2k', '4k']) { if (map[k] === size) return k; }
  return 'sd';
}

async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (state.token) opt.headers['Authorization'] = 'Bearer ' + state.token;
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(API + path, opt);
  if (r.status === 401) { forceLogin(); throw new Error('未登录'); }
  if (!r.ok && r.status !== 404 && r.status !== 403) throw new Error('请求失败 ' + r.status);
  try { return await r.json(); } catch { return {}; }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ---------------- 登录 ----------------
function forceLogin() {
  state.token = ''; state.user = null; localStorage.removeItem('gf_token');
  $('#loginGate').classList.remove('hidden');
  $('#topbar').classList.add('hidden');
  $('#app').classList.add('hidden');
}
async function doLogin() {
  const username = $('#loginUser').value.trim();
  const password = $('#loginPw').value;
  if (!username || !password) { $('#loginErr').textContent = '请输入账号和密码'; return; }
  try {
    const r = await fetch(API + '/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) { $('#loginErr').textContent = d.error || '登录失败'; return; }
    state.token = d.token; state.user = d.user; state.operator = d.user.name;
    localStorage.setItem('gf_token', d.token);
    await enterApp();
  } catch (e) { $('#loginErr').textContent = '网络错误，请重试'; }
}
async function enterApp() {
  $('#loginGate').classList.add('hidden');
  $('#topbar').classList.remove('hidden');
  $('#app').classList.remove('hidden');
  $('#ubName').textContent = state.user.name;
  $('#ubRole').textContent = ROLE_NAMES[state.user.role] || state.user.role;
  // 角色导航
  $$('#nav .nav-btn').forEach(b => {
    const need = b.dataset.role;
    b.style.display = (need && !need.split(',').includes(state.user.role)) ? 'none' : '';
  });
  state.stages = await api('GET', '/stages');
  await loadCreditBalance();
  await switchView('customers');
}
async function loadCreditBalance() {
  try {
    const d = await api('GET', '/me/credits');
    state.creditBalance = d.balance || 0;
    const el = $('#ubCredit');
    if (el) el.textContent = '💎 ' + fmt0(state.creditBalance);
  } catch (e) { /* 忽略 */ }
}

// ---------------- 初始化 ----------------
async function init() {
  $('#loginBtn').addEventListener('click', doLogin);
  $('#loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('POST', '/logout'); } catch {} forceLogin(); });
  $('#ubCredit').addEventListener('click', loadCreditBalance);
  $$('#nav .nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('#drawerMask').addEventListener('click', closeDrawer);
  if (state.token) {
    try {
      const me = await api('GET', '/me');
      if (me.user) { state.user = me.user; state.operator = me.user.name; return enterApp(); }
    } catch {}
  }
  forceLogin();
}
async function switchView(v) {
  state.view = v;
  $$('#nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'customers') return renderCustomers();
  if (v === 'kanban') return renderKanban();
  if (v === 'quote') return renderQuote();
  if (v === 'scheme') return renderScheme();
  if (v === 'cases') return renderCases();
  if (v === 'site') return renderSite();
  if (v === 'contacts') return renderContacts();
  if (v === 'forms') return renderForms();
  if (v === 'stats') return renderStats();
  if (v === 'prices') return renderPrices();
  if (v === 'credits') return renderCredits();
  if (v === 'settings') return renderSettings();
  if (v === 'users') return renderUsers();
  if (v === 'sales') return renderSales();
}

// ---------------- 客户档案 ----------------
async function renderCustomers() {
  state.customers = await api('GET', '/customers');
  const f = state.filters;
  const list = state.customers.filter(c => {
    if (f.q && !(`${c.name}${c.phone}${c.wechat}${c.owner}`.includes(f.q))) return false;
    if (f.stage && String(c.current_stage) !== f.stage) return false;
    if (f.owner && (c.owner || '') !== f.owner) return false;
    if (f.status && (c.status || '') !== f.status) return false;
    return true;
  });
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar">
      <input class="search" id="fQ" placeholder="搜索 姓名/电话/微信/负责人" value="${esc(f.q)}">
      <select id="fStage"><option value="">全部阶段</option>${state.stages.map(s => `<option value="${s.id}" ${f.stage==s.id?'selected':''}>${s.name}</option>`).join('')}</select>
      <select id="fStatus"><option value="">全部状态</option>${['线索','跟进中','已转化','已成交','无效'].map(s=>`<option ${f.status==s?'selected':''}>${s}</option>`).join('')}</select>
      <select id="fOwner"><option value="">全部负责人</option>${[...new Set(state.customers.map(c=>c.owner).filter(Boolean))].map(o=>`<option ${f.owner==o?'selected':''}>${esc(o)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <button class="btn" id="btnNew">+ 新增客户</button>
    </div>
    ${list.length ? `
    <table class="cust-table">
      <thead><tr><th>客户</th><th>电话</th><th>来源渠道</th><th>预算</th><th>当前阶段</th><th>负责人</th><th>状态</th><th></th></tr></thead>
      <tbody>
        ${list.map(c => `
          <tr data-id="${c.id}">
            <td><b>${esc(c.name||'未命名')}</b></td>
            <td>${esc(c.phone||'')}</td>
            <td>${esc(c.source_channel||'')}</td>
            <td>${esc(c.budget_range||'—')}</td>
            <td><span class="stage-pill">${esc(stageName(c.current_stage))}</span></td>
            <td>${esc(c.owner||'—')}</td>
            <td><span class="status-pill ${STATUS_CLASS[c.status]||'st-lead'}">${esc(c.status||'线索')}</span></td>
            <td><button class="btn sm ghost" data-open="${c.id}">打开</button></td>
          </tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">还没有客户，点右上角「+ 新增客户」开始登记</div>`}
  `;
  $('#fQ').addEventListener('input', e => { f.q = e.target.value; renderCustomers(); });
  $('#fStage').addEventListener('change', e => { f.stage = e.target.value; renderCustomers(); });
  $('#fStatus').addEventListener('change', e => { f.status = e.target.value; renderCustomers(); });
  $('#fOwner').addEventListener('change', e => { f.owner = e.target.value; renderCustomers(); });
  $('#btnNew').addEventListener('click', openNew);
  $$('[data-id]').forEach(tr => tr.addEventListener('click', () => openCustomer(+tr.dataset.id)));
  $$('[data-open]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openCustomer(+b.dataset.open); }));
}

// ---------------- 新增 / 详情抽屉 ----------------
function openDrawer() { $('#drawer').classList.remove('hidden'); }
function closeDrawer() { $('#drawer').classList.add('hidden'); $('#drawerPanel').innerHTML = ''; state.current = null; }

function openNew() {
  openDrawer();
  $('#drawerPanel').innerHTML = `
    <div class="dp-head"><h2>新增客户</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body">
      <div class="section">
        <h3>第一步 · 建立客户档案</h3>
        <div class="grid">
          <div class="field"><label>客户姓名 *</label><input id="nName" placeholder="必填"></div>
          <div class="field"><label>联系电话</label><input id="nPhone"></div>
          <div class="field"><label>微信</label><input id="nWechat"></div>
          <div class="field"><label>来源渠道</label><select id="nSource">${['','小红书','抖音','美团','微信','门店','社区活动','异业合作','B端沙龙','老客户转介绍'].map(o=>`<option>${o}</option>`).join('')}</select></div>
          <div class="field"><label>负责人</label><input id="nOwner" value="${esc(state.operator)}" placeholder="跟进人"></div>
          <div class="field"><label>状态</label><select id="nStatus">${['线索','跟进中','已转化','已成交','无效'].map(o=>`<option ${o==='线索'?'selected':''}>${o}</option>`).join('')}</select></div>
          <div class="field full"><label>地址</label><input id="nAddr"></div>
        </div>
        <div style="margin-top:14px"><button class="btn" id="nCreate">创建并填写流程</button></div>
      </div>
    </div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#nCreate').addEventListener('click', async () => {
    const name = $('#nName').value.trim();
    if (!name) return toast('请填写客户姓名');
    const c = await api('POST', '/customers', {
      name, phone: $('#nPhone').value, wechat: $('#nWechat').value,
      source_channel: $('#nSource').value, owner: $('#nOwner').value,
      status: $('#nStatus').value, address: $('#nAddr').value, operator: state.operator,
    });
    toast('已创建'); openCustomer(c.id);
  });
}

async function openCustomer(id) {
  const d = await api('GET', `/customers/${id}`);
  if (d.error) return toast('客户不存在或无权限');
  state.current = d; state.activeStage = d.customer.current_stage || 1;
  openDrawer(); renderDetail();
}

function renderDetail() {
  const { customer: c, stages, log } = state.current;
  const quotes = state.current.quotes || [];
  const panel = $('#drawerPanel');
  panel.innerHTML = `
    <div class="dp-head">
      <h2>${esc(c.name)} <span class="stage-pill">${esc(stageName(c.current_stage))}</span></h2>
      <button class="close" id="dClose">×</button>
    </div>
    <div class="dp-body">
      <div class="section">
        <h3>客户档案</h3>
        <div class="grid">
          <div class="field"><label>姓名</label><input data-p="name" value="${esc(c.name)}"></div>
          <div class="field"><label>电话</label><input data-p="phone" value="${esc(c.phone)}"></div>
          <div class="field"><label>微信</label><input data-p="wechat" value="${esc(c.wechat)}"></div>
          <div class="field"><label>来源渠道</label><select data-p="source_channel">${['','小红书','抖音','美团','微信','门店','社区活动','异业合作','B端沙龙','老客户转介绍'].map(o=>`<option ${c.source_channel===o?'selected':''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>住宅类型</label><select data-p="residence_type">${['','公寓','别墅','排屋','平层','LOFT','其他'].map(o=>`<option ${c.residence_type===o?'selected':''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>阳台面积(㎡)</label><input data-p="balcony_area" value="${esc(c.balcony_area)}"></div>
          <div class="field"><label>预算</label><select data-p="budget_range">${['','1万以下','1-3万','3-5万','5-10万','10万以上'].map(o=>`<option ${c.budget_range===o?'selected':''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>负责人</label><input data-p="owner" value="${esc(c.owner)}"></div>
          <div class="field"><label>状态</label><select data-p="status">${['线索','跟进中','已转化','已成交','无效'].map(o=>`<option ${c.status===o?'selected':''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>当前阶段</label><select id="pStage">${state.stages.map(s=>`<option value="${s.id}" ${c.current_stage===s.id?'selected':''}>${s.name}</option>`).join('')}</select></div>
          <div class="field full"><label>地址</label><input data-p="address" value="${esc(c.address)}"></div>
          <div class="field full"><label>备注</label><textarea data-p="notes">${esc(c.notes)}</textarea></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn" id="saveProfile">保存档案</button>
          <button class="btn amber" id="gotoQuote">去报价台 →</button>
          <button class="btn ghost" id="delCust">删除客户</button>
        </div>
      </div>

      ${quotes.length ? `<div class="section"><h3>报价单</h3>
        <table class="mini-table"><thead><tr><th>单号</th><th>合计</th><th>状态</th><th></th></tr></thead><tbody>
        ${quotes.map(q=>`<tr><td>${esc(q.quote_no)}</td><td>¥${fmt(q.total)}</td><td><span class="status-pill ${q.status==='已批'?'st-deal':'st-lead'}">${esc(q.status)}</span></td>
          <td><button class="btn sm ghost" data-printq="${q.id}">打印</button></td></tr>`).join('')}
        </tbody></table></div>` : ''}

      <div class="section">
        <h3>全流程八阶段登记（V5）</h3>
        <div class="stage-tabs" id="stageTabs">
          ${state.stages.map(s => `<span class="stage-tab ${stages[s.id]?'done':''} ${s.id===state.activeStage?'active':''}" data-st="${s.id}"><span class="dot"></span>${s.id}. ${esc(s.name)}</span>`).join('')}
        </div>
        <div id="stageBody"></div>
      </div>

      <div class="section">
        <h3>操作日志</h3>
        ${log.length ? `<div style="font-size:12px;color:var(--muted)">` + log.map(l=>`<div>· ${esc(l.created_at)} ${esc(l.operator||'')} — ${esc(l.detail||l.action)}</div>`).join('') + `</div>` : '<div class="empty">暂无</div>'}
      </div>
    </div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#saveProfile').addEventListener('click', saveProfile);
  $('#gotoQuote').addEventListener('click', () => { const id = c.id; closeDrawer(); switchView('quote').then(() => { state.quote.customerId = String(id); const sel = $('#qCustomer'); if (sel) { sel.value = String(id); onQuoteCustomerChange(); } }); });
  $$('[data-printq]').forEach(b => b.addEventListener('click', () => printQuote(+b.dataset.printq)));
  $('#delCust').addEventListener('click', async () => {
    if (!confirm('确认删除该客户及其所有阶段数据？')) return;
    const r = await api('DELETE', `/customers/${c.id}`);
    if (r.error) return toast(r.error);
    toast('已删除'); closeDrawer(); renderCustomers();
  });
  $$('#stageTabs .stage-tab').forEach(t => t.addEventListener('click', () => { state.activeStage = +t.dataset.st; renderStageBody(); $$('#stageTabs .stage-tab').forEach(x=>x.classList.toggle('active',+x.dataset.st===state.activeStage)); }));
  renderStageBody();
}

function renderStageBody() {
  const st = state.stages.find(s => s.id === state.activeStage);
  const data = (state.current.stages[st.id] || {}).data || {};
  const body = $('#stageBody');
  body.innerHTML = `
    <div class="form-list">本阶段对应 V5 表单：<b>${st.forms.map(esc).join('、')}</b> ｜ <a href="#" id="openTpl" style="color:var(--green-700)">查看空白模板 →</a></div>
    <div class="grid">${st.fields.map(f => renderField(f, data[f.key])).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
      <button class="btn" id="saveStage">保存本阶段登记</button>
      ${st.id < 8 ? `<button class="btn amber" id="advStage">推进到「${esc((state.stages.find(s=>s.id===st.id+1)||st).name)}」 →</button>` : ''}
      <span id="stageUpd" style="font-size:12px;color:var(--muted)">${state.current.stages[st.id]?('上次更新：'+esc(state.current.stages[st.id].updated_at)+' · '+esc(state.current.stages[st.id].operator||'')):''}</span>
    </div>`;
  $('#openTpl').addEventListener('click', e => { e.preventDefault(); const file = st.form_file; closeDrawer(); switchView('forms'); setTimeout(()=>selectForm(file), 80); });
  $('#saveStage').addEventListener('click', () => saveStage(st));
  const adv = $('#advStage');
  if (adv) adv.addEventListener('click', () => advanceStage(st));
}

function renderField(f, v) {
  const lab = `<label>${esc(f.label)}${f.required?' *':''}</label>`;
  let ctrl = '';
  if (f.type === 'textarea') {
    ctrl = `<textarea data-k="${f.key}" placeholder="${esc(f.placeholder||'')}">${esc(v||'')}</textarea>`;
  } else if (f.type === 'select') {
    ctrl = `<select data-k="${f.key}"><option value=""></option>${f.options.map(o=>`<option ${v===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  } else if (f.type === 'radio') {
    ctrl = `<div class="radio-row">${f.options.map(o=>`<label><input type="radio" name="${f.key}" value="${esc(o)}" ${v===o?'checked':''}>${esc(o)}</label>`).join('')}</div>`;
  } else if (f.type === 'checkbox') {
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    ctrl = `<div class="check-row">${f.options.map(o=>`<label><input type="checkbox" data-k="${f.key}" value="${esc(o)}" ${arr.includes(o)?'checked':''}>${esc(o)}</label>`).join('')}</div>`;
  } else if (f.type === 'number') {
    ctrl = `<input type="number" data-k="${f.key}" value="${esc(v||'')}" placeholder="${esc(f.placeholder||'')}">${f.unit?`<span style="margin-left:6px;color:var(--muted)">${esc(f.unit)}</span>`:''}`;
  } else if (f.type === 'date') {
    ctrl = `<input type="date" data-k="${f.key}" value="${esc(v||'')}">`;
  } else {
    ctrl = `<input type="text" data-k="${f.key}" value="${esc(v||'')}" placeholder="${esc(f.placeholder||'')}">`;
  }
  const span = (f.type === 'textarea' || f.type === 'checkbox' || f.type === 'radio') ? 'full' : '';
  return `<div class="field ${span}">${lab}${ctrl}</div>`;
}

function gatherStage(st) {
  const data = {};
  st.fields.forEach(f => {
    if (f.type === 'checkbox') data[f.key] = $$(`[data-k="${f.key}"]:checked`).map(x => x.value);
    else if (f.type === 'radio') { const el = $(`[name="${f.key}"]:checked`); data[f.key] = el ? el.value : ''; }
    else { const el = $(`[data-k="${f.key}"]`); if (el) data[f.key] = el.value; }
  });
  return data;
}
async function saveStage(st) {
  const data = gatherStage(st);
  await api('PUT', `/customers/${state.current.customer.id}/stage/${st.id}`, { data, operator: state.operator });
  state.current.stages[st.id] = { data, operator: state.operator, updated_at: new Date().toLocaleString('zh-CN') };
  toast(`已保存【${st.name}】`); renderStageBody();
  $$('#stageTabs .stage-tab').forEach(x => x.classList.toggle('done', !!state.current.stages[+x.dataset.st]));
}
async function advanceStage(st) {
  const next = st.id + 1;
  const r = await api('PUT', `/customers/${state.current.customer.id}`, { current_stage: next, operator: state.operator });
  if (r.error) return toast(r.error);
  state.current.customer.current_stage = next; state.activeStage = next;
  toast(`已推进到【${stageName(next)}】`); renderDetail();
}
async function saveProfile() {
  const c = state.current.customer;
  const payload = {};
  $$('[data-p]').forEach(el => payload[el.dataset.p] = el.value);
  payload.current_stage = +$('#pStage').value;
  payload.operator = state.operator;
  const r = await api('PUT', `/customers/${c.id}`, payload);
  if (r.error) return toast(r.error);
  Object.assign(c, payload); toast('档案已保存'); renderDetail();
}

// ---------------- 预约线索 ----------------
async function renderContacts() {
  const contacts = await api('GET', '/contacts');
  const rows = contacts.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.service || '-')}</td>
      <td>${esc(c.note || '-')}</td>
      <td><span class="status-pill st-lead">${esc(c.status || '待跟进')}</span></td>
      <td>${esc(c.created_at || '')}</td>
    </tr>
  `).join('');
  $('#app').innerHTML = `
    <div class="toolbar">
      <h3 style="font-family:var(--font-serif);font-size:18px;color:var(--green-900)">官网预约线索</h3>
      <span class="spacer"></span>
      <span style="color:var(--muted);font-size:13px">共 ${contacts.length} 条</span>
    </div>
    <table class="price-table">
      <thead><tr>
        <th>姓名</th><th>电话</th><th>服务类型</th><th>项目描述</th><th>状态</th><th>提交时间</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">暂无预约线索</td></tr>'}</tbody>
    </table>
  `;
}

// ---------------- 报价台 ----------------
async function ensureQuoteRefs() {
  if (!state.settings) state.settings = await api('GET', '/settings');
  if (!state.categories.length) state.categories = await api('GET', '/prices/categories');
  if (!state.prices.length) state.prices = await api('GET', '/prices');
}
async function renderQuote() {
  await ensureQuoteRefs();
  state.customers = await api('GET', '/customers');
  const q = state.quote;
  const s = state.settings;
  if (!q.params.transport_rate) q.params = {
    area: '', design_fee: '', margin: +s.default_margin || 30,
    transport_rate: +s.transport_rate * 100, mgmt_rate: +s.mgmt_rate * 100,
    tax_rate: +s.tax_rate * 100, discount: 0
  };
  const tiers = (s.margin_tiers || '').split(',').map(x => x.trim()).filter(Boolean).map(Number);
  let pmList = []; try { pmList = JSON.parse(s.payment_methods || '[]'); } catch { pmList = []; }
  if (!q.payment_method && pmList.length) q.payment_method = pmList[0].label;
  const app = $('#app');
  app.innerHTML = `
    <div class="quote-wrap">
      <div class="q-left">
        <div class="section">
          <h3>① 选择客户</h3>
          <select id="qCustomer" class="wfull">
            <option value="">— 请选择客户（面积会自动带入）—</option>
            ${state.customers.map(c=>`<option value="${c.id}" ${q.customerId==c.id?'selected':''}>${esc(c.name)}（${esc(stageName(c.current_stage))}）</option>`).join('')}
          </select>
        </div>
        <div class="section">
          <h3>② 上传 / 粘贴方案清单</h3>
          <div class="hint">每行一项：<b>名称[,规格][,数量][,单价]</b>。示例：<code>造型黑松,H1.5m,2</code> 或 <code>绣球 2加仑 5</code>。系统自动匹配价格库带出单价，未填数量默认 1。</div>
          <textarea id="qPaste" class="q-paste" placeholder="造型黑松,H1.5m,2&#10;绣球,2加仑,5&#10;防腐木地板,,8&#10;自动滴灌系统,,1&#10;营养种植土,,6"></textarea>
          <div class="q-paste-actions">
            <label class="btn sm ghost file-btn">⬆ 上传CSV/TXT<input type="file" id="qFile" accept=".csv,.txt" hidden></label>
            <button class="btn sm" id="qParse">🔍 解析清单</button>
            <span class="q-quickadd">
              <select id="qPick" class="wfull"><option value="">＋ 从价格库快速添加…</option>
                ${state.prices.map(p=>`<option value="${p.id}">${esc(p.category)} · ${esc(p.name)} ${esc(p.spec||'')}（¥${fmt(p.unit_price)}/${esc(p.unit)}）</option>`).join('')}
              </select>
            </span>
          </div>
          <div id="qUnmatched"></div>
        </div>
        <div class="section">
          <h3>③ 明细（可编辑）</h3>
          <div id="qItems"></div>
          <button class="btn sm ghost" id="qAddRow" style="margin-top:8px">＋ 手动添加一行</button>
        </div>
      </div>
      <div class="q-right">
        <div class="section q-params">
          <h3>④ 计价参数</h3>
          <div class="pfield"><label>毛利率档位</label>
            <select id="pMargin" class="wfull">
              ${tiers.map(t=>`<option value="${t}" ${+q.params.margin===t?'selected':''}>${t}%</option>`).join('')}
              <option value="custom" ${!tiers.includes(+q.params.margin)?'selected':''}>自定义…</option>
            </select>
          </div>
          <div class="pfield" id="pMarginCustomWrap" style="${tiers.includes(+q.params.margin)?'display:none':''}"><label>自定义毛利率(%)</label><input type="number" id="pMarginCustom" value="${tiers.includes(+q.params.margin)?'':esc(q.params.margin)}" min="0" max="95"></div>
          <div class="pfield"><label>付款方式</label>
            <input list="pmDataList" id="pPayment" class="wfull" value="${esc(q.payment_method || '')}" placeholder="可直接输入，或点选已有方案">
            <datalist id="pmDataList">
              ${pmList.map(p=>`<option value="${esc(p.label)}">${esc(p.label)} ｜ ${esc(p.note||'')}</option>`).join('')}
            </datalist>
          </div>
          <div class="pfield"><label>阳台面积(㎡)</label><input type="number" id="pArea" value="${esc(q.params.area)}" placeholder="用于估算设计费"></div>
          <div class="pfield"><label>设计费(元)</label><input type="number" id="pDesign" value="${esc(q.params.design_fee)}" placeholder="留空=面积×${s.design_fee_per_sqm}(保底${s.design_fee_min})"></div>
          <div class="pfield"><label>运输安装费率(%)</label><input type="number" id="pTrans" value="${esc(q.params.transport_rate)}"></div>
          <div class="pfield"><label>项目管理费率(%)</label><input type="number" id="pMgmt" value="${esc(q.params.mgmt_rate)}"></div>
          <div class="pfield"><label>税率(%)</label><input type="number" id="pTax" value="${esc(q.params.tax_rate)}"></div>
          <div class="pfield"><label>优惠减免(元)</label><input type="number" id="pDisc" value="${esc(q.params.discount)}"></div>
        </div>
        <div class="section q-summary" id="qSummary"></div>
        <div class="section">
          <button class="btn wfull" id="qSave">💾 保存报价单</button>
          <button class="btn amber wfull" id="qSavePrint" style="margin-top:8px">💾 保存并打印报价单</button>
        </div>
      </div>
    </div>`;
  $('#qCustomer').addEventListener('change', onQuoteCustomerChange);
  $('#qFile').addEventListener('change', onQuoteFile);
  $('#qParse').addEventListener('click', onQuoteParse);
  $('#qAddRow').addEventListener('click', () => { q.items.push({ category: state.categories[0]||'植物-其他', name:'', spec:'', unit:'项', qty:1, cost_price:0, unit_price:0, matched:true }); renderQuoteItems(); });
  $('#qPick').addEventListener('change', e => {
    const p = state.prices.find(x => x.id == e.target.value);
    if (p) { q.items.push({ price_id:p.id, category:p.category, name:p.name, spec:p.spec, unit:p.unit, qty:1, cost_price: p.cost_price, unit_price: p.cost_price, matched:true }); renderQuoteItems(); }
    e.target.value = '';
  });
  // 利润率档位
  const onMarginChange = () => {
    const sel = $('#pMargin').value;
    const isCustom = sel === 'custom';
    $('#pMarginCustomWrap').style.display = isCustom ? '' : 'none';
    q.params.margin = isCustom ? num($('#pMarginCustom').value) : +sel;
    renderQuoteItems(); // 重新计算左侧明细售价与小计
    syncQuoteParams();
  };
  $('#pMargin').addEventListener('change', onMarginChange);
  $('#pMarginCustom').addEventListener('input', onMarginChange);
  $('#pPayment').addEventListener('input', e => { q.payment_method = e.target.value; });
  ['pArea','pDesign','pTrans','pMgmt','pTax','pDisc','pMarginCustom'].forEach(id => $('#'+id).addEventListener('input', syncQuoteParams));
  $('#qSave').addEventListener('click', () => saveQuote(false));
  $('#qSavePrint').addEventListener('click', () => saveQuote(true));
  if (q.customerId) onQuoteCustomerChange(); else renderQuoteItems();
}
function onQuoteCustomerChange() {
  const q = state.quote; q.customerId = $('#qCustomer').value;
  const c = state.customers.find(x => x.id == q.customerId);
  if (c && c.balcony_area && !$('#pArea').value) { $('#pArea').value = c.balcony_area; }
  syncQuoteParams();
}
function onQuoteFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $('#qPaste').value = String(reader.result || ''); toast('已读取文件，点“解析清单”'); };
  reader.readAsText(file, 'utf-8');
}
async function onQuoteParse() {
  const text = $('#qPaste').value.trim();
  if (!text) return toast('请先粘贴或上传清单');
  const d = await api('POST', '/quotes/parse', { text });
  state.quote.items = (d.items || []).map(it => ({ ...it }));
  const un = d.unmatched || [];
  $('#qUnmatched').innerHTML = un.length
    ? `<div class="q-warn">⚠ ${un.length} 行未匹配到价格库（可手动添加或补价）：<br>${un.map(esc).join('<br>')}</div>` : '';
  renderQuoteItems();
  toast(`已解析 ${state.quote.items.length} 项`);
}
function marginMult() {
  const m = num(state.quote.params.margin);
  const fr = m > 1 ? m / 100 : m;
  return 1 / (1 - Math.min(Math.max(fr, 0), 0.95));
}
function itemSell(it) {
  const cost = num(it.cost_price) || num(it.unit_price) || 0;
  return Math.round(cost * marginMult() * 100) / 100;
}
function renderQuoteItems() {
  const q = state.quote;
  const box = $('#qItems');
  if (!q.items.length) { box.innerHTML = '<div class="empty">暂无明细，粘贴清单解析或手动添加</div>'; syncQuoteParams(); return; }
  const mult = marginMult();
  box.innerHTML = `
    <table class="q-items-table">
      <thead><tr><th>类别</th><th>名称</th><th>规格</th><th>数量</th><th>单位</th><th>成本单价</th><th>售价(×${mult.toFixed(3)})</th><th>小计</th><th></th></tr></thead>
      <tbody>
        ${q.items.map((it,i)=>`
          <tr data-i="${i}" class="${it.matched===false?'unmatched':''}">
            <td><select data-f="category" class="cell">${state.categories.map(c=>`<option ${it.category===c?'selected':''}>${esc(c)}</option>`).join('')}${state.categories.includes(it.category)?'':`<option selected>${esc(it.category)}</option>`}</select></td>
            <td><input data-f="name" class="cell" value="${esc(it.name)}"></td>
            <td><input data-f="spec" class="cell sm" value="${esc(it.spec||'')}"></td>
            <td><input data-f="qty" type="number" class="cell xs" value="${esc(it.qty)}"></td>
            <td><input data-f="unit" class="cell xs" value="${esc(it.unit||'')}"></td>
            <td><input data-f="cost_price" type="number" class="cell sm" value="${esc(it.cost_price)}"></td>
            <td class="q-sub">¥${fmt(itemSell(it))}</td>
            <td class="q-sub2">¥${fmt(num(it.qty)*itemSell(it))}</td>
            <td><button class="q-del" data-del="${i}">×</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $$('#qItems [data-f]').forEach(el => el.addEventListener('input', e => {
    const tr = e.target.closest('tr'); const i = +tr.dataset.i; const f = e.target.dataset.f;
    q.items[i][f] = (f==='qty'||f==='cost_price') ? e.target.value : e.target.value;
    if (f==='qty' || f==='cost_price') {
      tr.querySelector('.q-sub').textContent = '¥'+fmt(itemSell(q.items[i]));
      tr.querySelector('.q-sub2').textContent = '¥'+fmt(num(q.items[i].qty)*itemSell(q.items[i]));
      syncQuoteParams();
    }
  }));
  $$('#qItems [data-del]').forEach(b => b.addEventListener('click', () => { q.items.splice(+b.dataset.del,1); renderQuoteItems(); }));
  syncQuoteParams();
}
function catGroup(cat) { const p = (cat||'').split('-')[0]; return ({ '植物':'plant', '硬景':'hardscape', '辅材':'soil', '水电':'mep' })[p] || 'plant'; }
function computeQuote() {
  const q = state.quote; const s = state.settings;
  const g = { plant:0, hardscape:0, soil:0, mep:0 };
  q.items.forEach(it => { g[catGroup(it.category)] += num(it.qty)*itemSell(it); });
  const area = num($('#pArea')?.value);
  let design = $('#pDesign')?.value;
  design = (design==='' || design==null) ? Math.max(area*num(s.design_fee_per_sqm), num(s.design_fee_min)) : num(design);
  const matBase = g.plant + g.hardscape + g.soil + g.mep;
  const tr = num($('#pTrans')?.value)/100;
  const transport = matBase * tr;
  const subtotal = design + matBase + transport;
  const mr = num($('#pMgmt')?.value)/100;
  const mgmt = subtotal * mr;
  const txr = num($('#pTax')?.value)/100;
  const tax = (subtotal + mgmt) * txr;
  const disc = num($('#pDisc')?.value);
  const total = subtotal + mgmt + tax - disc;
  const margin = num(state.quote.params.margin);
  return { area, design, plant:g.plant, hardscape:g.hardscape, soil:g.soil, mep:g.mep, transport, tr, subtotal, mgmt, mr, tax, txr, disc, total, margin, mult: marginMult() };
}
function syncQuoteParams() {
  const c = computeQuote();
  const row = (l,v)=>`<div class="sum-row"><span>${l}</span><b>¥${fmt(v)}</b></div>`;
  $('#qSummary').innerHTML = `
    <h3>报价合计</h3>
    ${row('1. 设计费', c.design)}
    ${row('2. 硬景施工费', c.hardscape)}
    ${row('3. 植物费用', c.plant)}
    ${row('4. 土壤及辅材', c.soil)}
    ${row('5. 水电工程', c.mep)}
    ${row(`6. 运输安装费 (${(c.tr*100).toFixed(1)}%)`, c.transport)}
    ${row(`7. 项目管理费 (${(c.mr*100).toFixed(1)}%)`, c.mgmt)}
    ${row(`8. 税金 (${(c.txr*100).toFixed(1)}%)`, c.tax)}
    ${c.disc?`<div class="sum-row"><span>优惠减免</span><b>-¥${fmt(c.disc)}</b></div>`:''}
    <div class="sum-row" style="color:var(--muted)"><span>毛利率 / 倍率</span><b>${c.margin}% × ${c.mult.toFixed(3)}</b></div>
    <div class="sum-total"><span>合计</span><b>¥${fmt(c.total)}</b></div>`;
}
function collectQuotePayload() {
  const q = state.quote;
  return {
    customer_id: q.customerId ? +q.customerId : null,
    title: '阳台花园项目报价',
    items: q.items.map(it => ({ price_id: it.price_id||null, category: it.category, name: it.name, spec: it.spec, unit: it.unit, qty: num(it.qty), cost_price: num(it.cost_price), unit_price: num(it.cost_price), matched: it.matched!==false })),
    area: num($('#pArea').value),
    margin: num(q.params.margin),
    payment_method: q.payment_method || '',
    design_fee: $('#pDesign').value === '' ? '' : num($('#pDesign').value),
    transport_rate: num($('#pTrans').value)/100,
    mgmt_rate: num($('#pMgmt').value)/100,
    tax_rate: num($('#pTax').value)/100,
    discount: num($('#pDisc').value),
  };
}
async function saveQuote(thenPrint) {
  const q = state.quote;
  if (!q.customerId) return toast('请先选择客户');
  if (!q.items.length) return toast('请先添加报价明细');
  const payload = collectQuotePayload();
  const r = await api('POST', '/quotes', payload);
  if (r.error) return toast(r.error);
  toast('报价单已保存：' + r.quote_no);
  if (thenPrint) printQuote(r.id);
}
function printQuote(id) {
  window.open(`${API}/quotes/${id}/print?token=${encodeURIComponent(state.token)}`, '_blank');
}

// ---------------- 进度看板 ----------------
async function renderKanban() {
  state.customers = await api('GET', '/customers');
  const f = state.filters;
  const groups = {}; state.stages.forEach(s => groups[s.id] = []);
  state.customers.forEach(c => {
    if (f.owner && (c.owner || '') !== f.owner) return;
    if (f.q && !`${c.name}${c.phone}`.includes(f.q)) return;
    (groups[c.current_stage] || (groups[c.current_stage] = [])).push(c);
  });
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar">
      <input class="search" id="kQ" placeholder="搜索客户" value="${esc(f.q)}">
      <select id="kOwner"><option value="">全部负责人</option>${[...new Set(state.customers.map(c=>c.owner).filter(Boolean))].map(o=>`<option ${f.owner==o?'selected':''}>${esc(o)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <span style="color:var(--muted);font-size:12px">共 ${state.customers.length} 个客户</span>
    </div>
    <div class="kanban">
      ${state.stages.map(s => `
        <div class="kcol">
          <h3><span>${s.id}. ${esc(s.name)}</span><span class="count">${groups[s.id].length}</span></h3>
          ${groups[s.id].map(c => `
            <div class="kcard">
              <div class="kname">${esc(c.name||'未命名')}</div>
              <div class="kmeta">
                ${c.owner?`<span class="tag">${esc(c.owner)}</span>`:''}
                ${c.budget_range?`<span class="tag">${esc(c.budget_range)}</span>`:''}
                <span class="status-pill ${STATUS_CLASS[c.status]||'st-lead'}">${esc(c.status||'线索')}</span>
              </div>
              <div class="krow">
                ${c.current_stage<8?`<button class="btn sm amber" data-adv="${c.id}">推进→</button>`:''}
                <button class="btn sm ghost" data-open="${c.id}">打开</button>
              </div>
            </div>`).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px">空</div>'}
        </div>`).join('')}
    </div>`;
  $('#kQ').addEventListener('input', e => { f.q = e.target.value; renderKanban(); });
  $('#kOwner').addEventListener('change', e => { f.owner = e.target.value; renderKanban(); });
  $$('[data-open]').forEach(b => b.addEventListener('click', () => openCustomer(+b.dataset.open)));
  $$('[data-adv]').forEach(b => b.addEventListener('click', async () => {
    const id = +b.dataset.adv; const c = state.customers.find(x => x.id === id);
    if (c.current_stage >= 8) return;
    await api('PUT', `/customers/${id}`, { current_stage: c.current_stage + 1, operator: state.operator });
    toast('已推进'); renderKanban();
  }));
}

// ---------------- 表单模板库 ----------------
async function renderForms() {
  const idx = await api('GET', '/forms');
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar"><b style="color:var(--green-900)">V5 全流程 55 份表单 · 点击查看 / 打印 / 导出</b></div>
    <div class="forms-layout">
      <div class="forms-side" id="formsSide">
        ${idx.map(g => `
          <div class="fg">
            <div class="fg-title">${g.stage_id}. ${esc(g.stage_name)}</div>
            ${g.forms.map(fm => `<div class="fi" data-file="${esc(g.file)}">${esc(fm)}</div>`).join('')}
          </div>`).join('')}
      </div>
      <div class="form-view" id="formView"><div class="empty">← 从左侧选择一份表单查看</div></div>
    </div>`;
  $$('#formsSide .fi').forEach(el => el.addEventListener('click', () => selectForm(el.dataset.file)));
}
async function selectForm(file) {
  $$('#formsSide .fi').forEach(x => x.classList.toggle('active', x.dataset.file === file));
  const d = await api('GET', '/forms/' + encodeURIComponent(file));
  const raw = d.raw || '';
  $('#formView').innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <button class="btn sm" id="printF">🖨 打印</button>
      <button class="btn sm ghost" id="dlF">⬇ 导出 Markdown</button>
    </div>
    <div id="formHtml">${d.html}</div>`;
  $('#printF').addEventListener('click', () => {
    const w = window.open('', '_blank'); w.document.write(`<html><head><title>${esc(file)}</title><style>body{font-family:sans-serif;padding:30px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">打印</button>${d.html}</body></html>`); w.document.close();
  });
  $('#dlF').addEventListener('click', () => download(file, raw, 'text/markdown'));
}
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

// ---------------- 数据统计 ----------------
async function renderStats() {
  const s = await api('GET', '/stats');
  const maxV = Math.max(1, ...Object.values(s.by_stage), ...Object.values(s.by_source), ...Object.values(s.by_owner), ...Object.values(s.by_status));
  const bar = (label, val) => `<div class="bar-row"><span class="bl">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${val/maxV*100}%"></div></div><span class="bv">${val}</span></div>`;
  const app = $('#app');
  app.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="num">${s.total}</div><div class="lbl">客户总数</div></div>
      <div class="stat-card"><div class="num">${s.deal_count}</div><div class="lbl">成交客户</div></div>
      <div class="stat-card"><div class="num">${(s.conversion*100).toFixed(0)}%</div><div class="lbl">线索转化率</div></div>
      <div class="stat-card"><div class="num">¥${fmt0(s.total_quote)}</div><div class="lbl">累计报价额</div></div>
    </div>
    <div class="toolbar">
      <b style="color:var(--green-900)">数据导出</b>
      <div class="spacer"></div>
      <button class="btn sm" id="exCsv">⬇ 导出 CSV（Excel）</button>
      <button class="btn sm ghost" id="exJson">⬇ 导出 JSON 备份</button>
    </div>
    <div class="section"><h3>按阶段分布</h3>${Object.keys(s.by_stage).sort().map(k=>bar(stageName(k), s.by_stage[k])).join('')}</div>
    <div class="section"><h3>按来源渠道</h3>${Object.entries(s.by_source).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(k,v)).join('')}</div>
    <div class="section"><h3>按负责人</h3>${Object.entries(s.by_owner).sort((a,b)=>b[1]-a[1]).map(([k,v])=>bar(k,v)).join('')}</div>
    <div class="section"><h3>按状态</h3>${Object.entries(s.by_status).map(([k,v])=>bar(k,v)).join('')}</div>
    <div class="section"><h3>经营概览</h3>
      <div class="bar-row"><span class="bl">累计报价</span><div class="bar-track"><div class="bar-fill" style="width:100%"></div></div><span class="bv">¥${fmt0(s.total_quote)}</span></div>
      <div class="bar-row"><span class="bl">累计已收</span><div class="bar-track"><div class="bar-fill" style="width:${s.total_quote?Math.min(100,s.total_received/s.total_quote*100):0}%"></div></div><span class="bv">¥${fmt0(s.total_received)}</span></div>
      <div class="bar-row"><span class="bl">累计结算</span><div class="bar-track"><div class="bar-fill" style="width:${s.total_quote?Math.min(100,s.total_settle/s.total_quote*100):0}%"></div></div><span class="bv">¥${fmt0(s.total_settle)}</span></div>
    </div>`;
  $('#exCsv').addEventListener('click', () => authedDownload('/export/csv', 'greenfun_customers.csv'));
  $('#exJson').addEventListener('click', () => authedDownload('/export/json', 'greenfun_backup.json'));
}
async function authedDownload(path, filename) {
  const r = await fetch(API + path, { headers: { 'Authorization': 'Bearer ' + state.token } });
  const blob = await r.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

// ---------------- 价格库（管理员/店长） ----------------
async function renderPrices() {
  state.prices = await api('GET', '/prices');
  state.categories = await api('GET', '/prices/categories');
  state.settings = await api('GET', '/settings');
  const cats = state.categories;
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar">
      <b style="color:var(--green-900)">报价价格库（${state.prices.length} 项）</b>
      <div class="spacer"></div>
      <button class="btn sm" id="prNew">+ 新增价格项</button>
    </div>
    <div class="section q-params" style="max-width:640px">
      <h3>公式参数（影响自动报价）</h3>
      <div class="pfield"><label>设计费 元/㎡</label><input type="number" id="sPerSqm" value="${esc(state.settings.design_fee_per_sqm)}"></div>
      <div class="pfield"><label>设计费保底(元)</label><input type="number" id="sMin" value="${esc(state.settings.design_fee_min)}"></div>
      <div class="pfield"><label>运输安装费率</label><input type="number" step="0.01" id="sTrans" value="${esc(state.settings.transport_rate)}"><span class="unit">(0.08=8%)</span></div>
      <div class="pfield"><label>项目管理费率</label><input type="number" step="0.01" id="sMgmt" value="${esc(state.settings.mgmt_rate)}"><span class="unit">(0.06=6%)</span></div>
      <div class="pfield"><label>税率</label><input type="number" step="0.01" id="sTax" value="${esc(state.settings.tax_rate)}"><span class="unit">(0.03=3%)</span></div>
      <button class="btn sm" id="saveSettings" style="margin-top:8px">保存公式参数</button>
    </div>
    <table class="price-table">
      <thead><tr><th>类别</th><th>名称</th><th>规格</th><th>单位</th><th>成本价(元)</th><th>参考售价(元)</th><th>操作</th></tr></thead>
      <tbody>
        ${state.prices.map(p=>`<tr data-pid="${p.id}">
          <td>${esc(p.category)}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.spec||'')}</td>
          <td>${esc(p.unit||'')}</td><td>¥${fmt(p.cost_price)}</td><td>¥${fmt(p.unit_price)}</td>
          <td><button class="btn sm ghost" data-edit="${p.id}">编辑</button> <button class="btn sm ghost" data-delp="${p.id}">删除</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  $('#prNew').addEventListener('click', () => editPrice(null, cats));
  $('#saveSettings').addEventListener('click', async () => {
    await api('PUT', '/settings', {
      design_fee_per_sqm: $('#sPerSqm').value, design_fee_min: $('#sMin').value,
      transport_rate: $('#sTrans').value, mgmt_rate: $('#sMgmt').value, tax_rate: $('#sTax').value
    });
    state.settings = null; toast('公式参数已保存');
  });
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => editPrice(state.prices.find(p=>p.id==b.dataset.edit), cats)));
  $$('[data-delp]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('确认删除该价格项？')) return;
    await api('DELETE', '/prices/' + b.dataset.delp); state.prices = []; toast('已删除'); renderPrices();
  }));
}
function editPrice(p, cats) {
  const isNew = !p; p = p || { category: cats[0]||'植物-乔木', name:'', spec:'', unit:'株', unit_price:0 };
  openDrawer();
  $('#drawerPanel').innerHTML = `
    <div class="dp-head"><h2>${isNew?'新增':'编辑'}价格项</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body"><div class="section"><div class="grid">
      <div class="field"><label>类别</label><input id="epCat" list="catList" value="${esc(p.category)}"><datalist id="catList">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>名称 *</label><input id="epName" value="${esc(p.name)}"></div>
      <div class="field"><label>规格</label><input id="epSpec" value="${esc(p.spec||'')}"></div>
      <div class="field"><label>单位</label><input id="epUnit" value="${esc(p.unit||'')}"></div>
      <div class="field"><label>成本价(元) *</label><input id="epCost" type="number" value="${esc(p.cost_price)}"></div>
      <div class="field"><label>参考售价(元)</label><input id="epPrice" type="number" value="${esc(p.unit_price)}"></div>
    </div><div style="margin-top:14px"><button class="btn" id="epSave">保存</button></div></div></div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#epSave').addEventListener('click', async () => {
    const body = { category: $('#epCat').value, name: $('#epName').value.trim(), spec: $('#epSpec').value, unit: $('#epUnit').value, cost_price: num($('#epCost').value), unit_price: num($('#epPrice').value) };
    if (!body.name) return toast('请填写名称');
    if (isNew) await api('POST', '/prices', body); else await api('PUT', '/prices/'+p.id, body);
    state.prices = []; state.categories = []; closeDrawer(); toast('已保存'); renderPrices();
  });
}

// ---------------- 员工账号（管理员） ----------------
async function renderUsers() {
  const users = await api('GET', '/users');
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar">
      <b style="color:var(--green-900)">员工账号（${users.length}）</b>
      <div class="spacer"></div>
      <button class="btn sm" id="uNew">+ 新增账号</button>
    </div>
    <table class="price-table">
      <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        ${users.map(u=>`<tr>
          <td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td>
          <td>${esc(ROLE_NAMES[u.role]||u.role)}</td>
          <td>${u.active?'<span class="status-pill st-deal">启用</span>':'<span class="status-pill st-loss">停用</span>'}</td>
          <td><button class="btn sm ghost" data-eu='${JSON.stringify(u).replace(/'/g,"&#39;")}'>编辑</button> ${u.username!==state.user.username?`<button class="btn sm ghost" data-du="${u.id}">停用</button>`:''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="hint" style="margin-top:12px">角色权限：<b>管理员</b>=全部含账号与价格库；<b>店长</b>=看全部客户+审批报价+改价格库；<b>销售顾问</b>=仅自己的客户；<b>设计师</b>=看全部客户+做方案报价。</div>`;
  $('#uNew').addEventListener('click', () => editUser(null));
  $$('[data-eu]').forEach(b => b.addEventListener('click', () => editUser(JSON.parse(b.dataset.eu))));
  $$('[data-du]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('确认停用该账号？')) return;
    const r = await api('DELETE', '/users/' + b.dataset.du);
    if (r.error) return toast(r.error);
    toast('已停用'); renderUsers();
  }));
}
function editUser(u) {
  const isNew = !u; u = u || { username:'', name:'', role:'sales', active:1 };
  openDrawer();
  $('#drawerPanel').innerHTML = `
    <div class="dp-head"><h2>${isNew?'新增':'编辑'}账号</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body"><div class="section"><div class="grid">
      <div class="field"><label>账号 *</label><input id="euUser" value="${esc(u.username)}" ${isNew?'':'disabled'}></div>
      <div class="field"><label>姓名</label><input id="euName" value="${esc(u.name)}"></div>
      <div class="field"><label>角色</label><select id="euRole">${Object.entries(ROLE_NAMES).map(([k,v])=>`<option value="${k}" ${u.role===k?'selected':''}>${v}</option>`).join('')}</select></div>
      ${isNew?'':`<div class="field"><label>状态</label><select id="euActive"><option value="1" ${u.active?'selected':''}>启用</option><option value="0" ${!u.active?'selected':''}>停用</option></select></div>`}
      <div class="field full"><label>${isNew?'初始密码 *':'重置密码（留空则不改）'}</label><input id="euPw" type="text" placeholder="${isNew?'必填':'留空不修改'}"></div>
    </div><div style="margin-top:14px"><button class="btn" id="euSave">保存</button></div></div></div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#euSave').addEventListener('click', async () => {
    const body = { name: $('#euName').value, role: $('#euRole').value };
    if ($('#euPw').value) body.password = $('#euPw').value;
    if (isNew) {
      body.username = $('#euUser').value.trim();
      if (!body.username || !body.password) return toast('账号和初始密码必填');
      const r = await api('POST', '/users', body);
      if (r.error) return toast(r.error);
    } else {
      body.active = +$('#euActive').value;
      const r = await api('PUT', '/users/'+u.id, body);
      if (r.error) return toast(r.error);
    }
    closeDrawer(); toast('已保存'); renderUsers();
  });
}

// ---------------- 系统设置（管理员） ----------------
async function renderSettings() {
  if (!state.settings) state.settings = await api('GET', '/settings');
  const s = state.settings;
  let pmEdit = [];
  try { pmEdit = JSON.parse(s.payment_methods || '[]'); } catch { pmEdit = []; }
  const renderPm = () => pmEdit.map((p, i) => `
    <div class="pm-row">
      <input class="pm-label" data-i="${i}" value="${esc(p.label)}" placeholder="名称如 3-4-3">
      <input class="pm-note" data-i="${i}" value="${esc(p.note||'')}" placeholder="说明如 定金30%｜中期40%｜尾款30%">
      <button class="btn sm ghost" data-pmdel="${i}">×</button>
    </div>`).join('') || '<div class="empty">暂无付款方式，点击下方添加</div>';

  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar"><b style="color:var(--green-900)">系统设置（全部可后台自定义）</b></div>
    <div class="settings-grid">
      <div class="section">
        <h3>① 利润率档位</h3>
        <div class="hint">勾选/输入所需毛利率档位，逗号分隔；报价台将显示这些档位 + 自定义输入。</div>
        <div class="pfield"><label>档位(%)</label><input id="sMarginTiers" class="wfull" value="${esc(s.margin_tiers)}" placeholder="20,25,30,40,50"></div>
        <div class="pfield"><label>默认毛利率(%)</label><input id="sDefMargin" type="number" value="${esc(s.default_margin)}" min="0" max="95"></div>
      </div>
      <div class="section">
        <h3>② 付款方式</h3>
        <div class="hint">可增删改；报价单打印将显示所选付款方式的名称与说明。</div>
        <div id="pmList">${renderPm()}</div>
        <button class="btn sm ghost" id="pmAdd" style="margin-top:8px">＋ 添加付款方式</button>
      </div>
      <div class="section">
        <h3>③ 报价单打印样式</h3>
        <div class="pfield"><label>公司名称</label><input id="pCompany" class="wfull" value="${esc(s.print_company)}"></div>
        <div class="pfield"><label>标语/副标题</label><input id="pSlogan" class="wfull" value="${esc(s.print_slogan)}"></div>
        <div class="pfield"><label>标题</label><input id="pTitle" class="wfull" value="${esc(s.print_title)}"></div>
        <div class="pfield"><label>主色</label><input id="pColor" type="color" value="${esc(s.print_color||'#2e7d4f')}"></div>
        <div class="pfield"><label>页脚</label><input id="pFooter" class="wfull" value="${esc(s.print_footer)}"></div>
        <div class="pfield"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="pShowCost" ${s.print_show_cost==='1'?'checked':''}> 内部明细显示成本价/毛利率（给客户打印版始终隐藏）</label></div>
        <div class="pfield"><label>备注说明</label><textarea id="pNote" class="wfull" rows="3" placeholder="报价有效期、不含项等">${esc(s.print_note)}</textarea></div>
      </div>
      <div class="section">
        <h3>④ 生图模型（AI 效果图）</h3>
        <div class="hint">平台级 API Key 由管理员统一配置，员工生图时扣积分即可，无需每个人都申请 Key。如未配置平台 Key，员工可在方案设计页临时填写自己的 Key。</div>
        <div class="pfield"><label>快速选择模型</label><select id="gPreset" class="wfull">
          <option value="">— 手动填写 —</option>
          ${IMG_MODELS.filter(m => m.id !== 'custom').map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
        </select></div>
        <div class="pfield"><label>供应商</label><select id="gProvider" class="wfull">
          <option value="pollinations" ${s.img_gen_provider === 'pollinations' ? 'selected' : ''}>Pollinations（免费 · 免 Key）</option>
          <option value="openai" ${s.img_gen_provider === 'openai' ? 'selected' : ''}>OpenAI 兼容（豆包 / 通义万相 / 智谱 / 火山 / 硅基流动等）</option>
          <option value="hf" ${s.img_gen_provider === 'hf' ? 'selected' : ''}>Hugging Face 免费推理</option>
        </select></div>
        <div class="pfield"><label>平台级 API Key（全站共用）</label><input id="gKey" class="wfull" type="password" value="${esc(s.img_gen_api_key || '')}" placeholder="豆包填火山引擎 API Key；硅基流动/智谱/通义万相填对应 Key；HF 填 Token"></div>
        <div class="pfield"><label>模型名</label><input id="gModel" class="wfull" value="${esc(s.img_gen_model || '')}" placeholder="如 doubao-seedream-5-0-260128 / gpt-image-1 / black-forest-labs/FLUX.1-schnell"></div>
        <div class="pfield"><label>Base URL</label><input id="gBase" class="wfull" value="${esc(s.img_gen_base_url || '')}" placeholder="豆包 https://ark.cn-beijing.volces.com/api/v3；硅基 https://api.siliconflow.cn/v1；OpenAI 留空"></div>
        <div class="pfield"><label>默认尺寸</label><select id="gSize" class="wfull">
          ${['1024x1024', '1024x1536', '1536x1024', '1024x1792', '1792x1024', '512x512', '2048x2048', '2048x1152', '1152x2048'].map(o => `<option ${s.img_gen_size === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select></div>
        <div class="pfield"><label>默认画质</label><select id="gQuality" class="wfull">
          <option value="standard" ${s.img_gen_quality === 'standard' ? 'selected' : ''}>standard（标清）</option>
          <option value="hd" ${s.img_gen_quality === 'hd' ? 'selected' : ''}>hd（高清）</option>
        </select></div>
        <div class="pfield"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="gWatermark" ${s.img_gen_watermark==='1'?'checked':''}> 添加 "AI生成" 水印（仅部分模型支持，如豆包）</label></div>
        <div class="pfield"><label>AI 分析模型（多模态）</label><input id="gAnalysisModel" class="wfull" value="${esc(s.img_analysis_model || 'gpt-4o-mini')}" placeholder="如 gpt-4o-mini / qwen-vl-max / gpt-4o，用于根据效果图生成设计理念与识别物料清单"></div>
        <div class="hint" style="margin-top:6px">豆包 Seedream 模型 ID 示例：doubao-seedream-5-0-260128、doubao-seedream-5-0-lite-260128、doubao-seedream-4-5-251128、doubao-seedream-4-0-250828、doubao-seedream-3-0-t2i-250415。</div>
      </div>

      <div class="section">
        <h3>⑤ 生图积分扣费</h3>
        <div class="hint">1 积分 = 1 分；管理员给员工充值后，员工生图时自动扣减。免费模型扣 0 分。关闭积分扣费后系统仅记录流水，不实际扣除。</div>
        <div class="pfield"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="gCreditsEnabled" ${s.credits_enabled!=='0'?'checked':''}> 启用积分扣费</label></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          <div class="pfield"><label>Pollinations 单价</label><input id="gCreditPollinations" type="number" min="0" value="${esc(s.img_credit_pollinations || '0')}"></div>
          <div class="pfield"><label>Hugging Face 单价</label><input id="gCreditHf" type="number" min="0" value="${esc(s.img_credit_hf || '0')}"></div>
          <div class="pfield"><label>硅基流动单价</label><input id="gCreditSiliconflow" type="number" min="0" value="${esc(s.img_credit_siliconflow || '3')}"></div>
          <div class="pfield"><label>豆包单价</label><input id="gCreditDoubao" type="number" min="0" value="${esc(s.img_credit_doubao || '5')}"></div>
          <div class="pfield"><label>OpenAI 单价</label><input id="gCreditOpenai" type="number" min="0" value="${esc(s.img_credit_openai || '10')}"></div>
          <div class="pfield"><label>默认单价</label><input id="gCreditDefault" type="number" min="0" value="${esc(s.img_credit_default || '5')}"></div>
        </div>
      </div>
    </div>
    <div style="margin:14px 0 40px"><button class="btn" id="sSave">💾 保存系统设置</button></div>`;

  // 付款方式交互
  const refreshPm = () => { $('#pmList').innerHTML = renderPm(); bindPm(); };
  const bindPm = () => {
    $$('#pmList .pm-label, #pmList .pm-note').forEach(el => el.addEventListener('input', e => {
      const key = e.target.classList.contains('pm-label') ? 'label' : 'note';
      pmEdit[+e.target.dataset.i][key] = e.target.value;
    }));
    $$('#pmList [data-pmdel]').forEach(b => b.addEventListener('click', () => { pmEdit.splice(+b.dataset.pmdel, 1); refreshPm(); }));
  };
  bindPm();
  $('#pmAdd').addEventListener('click', () => { pmEdit.push({ label: '', note: '' }); refreshPm(); });

  // 快速选择模型自动填充
  $('#gPreset').addEventListener('change', () => {
    const id = $('#gPreset').value;
    if (!id) return;
    const m = IMG_MODELS.find(x => x.id === id);
    if (!m) return;
    $('#gProvider').value = m.provider;
    $('#gModel').value = m.model;
    $('#gBase').value = m.base_url;
    if (m.quality === 'hd') $('#gQuality').value = 'hd';
  });

  $('#sSave').addEventListener('click', async () => {
    const body = {
      margin_tiers: $('#sMarginTiers').value,
      default_margin: $('#sDefMargin').value,
      payment_methods: JSON.stringify(pmEdit.filter(p => p.label)),
      print_company: $('#pCompany').value,
      print_slogan: $('#pSlogan').value,
      print_title: $('#pTitle').value,
      print_color: $('#pColor').value,
      print_footer: $('#pFooter').value,
      print_show_cost: $('#pShowCost').checked ? '1' : '0',
      print_note: $('#pNote').value,
      img_gen_provider: $('#gProvider').value,
      img_gen_api_key: $('#gKey').value,
      img_gen_model: $('#gModel').value,
      img_gen_base_url: $('#gBase').value,
      img_gen_size: $('#gSize').value,
      img_gen_quality: $('#gQuality').value,
      img_gen_watermark: $('#gWatermark').checked ? '1' : '0',
      img_analysis_model: $('#gAnalysisModel').value,
      credits_enabled: $('#gCreditsEnabled').checked ? '1' : '0',
      img_credit_pollinations: $('#gCreditPollinations').value,
      img_credit_hf: $('#gCreditHf').value,
      img_credit_siliconflow: $('#gCreditSiliconflow').value,
      img_credit_doubao: $('#gCreditDoubao').value,
      img_credit_openai: $('#gCreditOpenai').value,
      img_credit_default: $('#gCreditDefault').value,
    };
    await api('PUT', '/settings', body);
    state.settings = null;
    toast('系统设置已保存');
  });
}

// ---------------- 方案设计 ----------------
async function renderScheme() {
  const list = await api('GET', '/schemes');
  const app = $('#app');
  app.innerHTML = `
    <div class="toolbar">
      <h3 style="font-family:var(--font-serif);font-size:18px;color:var(--green-900)">方案设计</h3>
      <span class="spacer"></span>
      <button class="btn sm" id="scNew">+ 新建方案</button>
    </div>
    <table class="price-table">
      <thead><tr><th>客户</th><th>项目</th><th>空间</th><th>状态</th><th>关联报价单</th><th>创建时间</th><th></th></tr></thead>
      <tbody>
        ${list.length ? list.map(s => `
          <tr data-id="${s.id}">
            <td><b>${esc(s.customer || '未命名')}</b></td>
            <td>${esc(s.project_name || '—')}</td>
            <td>${esc(s.room_type || '—')}</td>
            <td><span class="status-pill ${s.status === '已转报价' || s.status === '已确认' ? 'st-deal' : 'st-lead'}">${esc(s.status || '草稿')}</span></td>
            <td>${s.quote_id ? ('已生成 #' + s.quote_id) : '—'}</td>
            <td>${esc((s.created_at || '').slice(0, 10))}</td>
            <td><button class="btn sm ghost" data-open="${s.id}">打开</button></td>
          </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">还没有方案，点右上角「+ 新建方案」</td></tr>'}
      </tbody>
    </table>`;
  $('#scNew').addEventListener('click', () => openSchemeEditor(null));
  $$('[data-open]').forEach(b => b.addEventListener('click', async () => {
    const d = await api('GET', '/schemes/' + b.dataset.open);
    if (d.error) return toast('方案不存在');
    openSchemeEditor(d);
  }));
}

function openSchemeEditor(raw) {
  const s = raw || {};
  const gen = (typeof s.gen_config === 'object' && s.gen_config) ? s.gen_config : {};
  state.scheme = {
    id: s.id || null,
    customer_id: s.customer_id || null,
    customer: s.customer || '',
    project_name: s.project_name || '',
    room_type: s.room_type || '',
    requirements: s.requirements || '',
    concept: s.concept || '',
    photos: Array.isArray(s.photos) ? s.photos.slice() : [],
    images: Array.isArray(s.images) ? s.images.slice() : [],
    items: Array.isArray(s.items) ? s.items.slice() : [],
    status: s.status || '草稿',
    quote_id: s.quote_id || null,
    gen_config: {
      model_id: gen.model_id || '',
      aspect: gen.aspect || 'auto',
      quality: gen.quality || 'sd',
      n: gen.n || 1,
      // 反解析真实配置
      provider: gen.provider || '',
      model: gen.model || '',
      base_url: gen.base_url || '',
      size: gen.size || '',
    }
  };
  openDrawer();
  renderSchemeEditor();
}

function renderSchemeEditor() {
  const s = state.scheme;
  const panel = $('#drawerPanel');
  panel.innerHTML = `
    <div class="dp-head">
      <h2>${s.id ? '编辑方案 #' + s.id : '新建方案'}</h2>
      <button class="close" id="dClose">×</button>
    </div>
    <div class="dp-body scheme-editor">
      <div class="section">
        <h3>① 基本信息</h3>
        <div class="grid">
          <div class="field"><label>关联客户</label><select id="scCustomer">
            <option value="">— 不关联 —</option>
            ${state.customers.map(c => `<option value="${c.id}" ${s.customer_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label>客户名称 *</label><input id="scCustomerName" value="${esc(s.customer)}" placeholder="如 王女士"></div>
          <div class="field"><label>项目名称 *</label><input id="scProject" value="${esc(s.project_name)}" placeholder="如 锦绣园7栋阳台"></div>
          <div class="field"><label>空间类型</label><input id="scRoom" value="${esc(s.room_type)}" placeholder="如 南向阳台"></div>
          <div class="field"><label>状态</label><select id="scStatus">${['草稿', '待确认', '已确认', '已转报价'].map(o => `<option ${s.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div>
      </div>

      <div class="section">
        <h3>② 现场照片</h3>
        <div class="hint">上传项目现场照片，用于方案排版与给客户展示。</div>
        <label class="btn sm ghost file-btn">⬆ 上传照片<input type="file" id="scPhoto" accept="image/*" multiple hidden></label>
        <div class="scheme-thumbs" id="scPhotoThumbs">${schemeThumbs(s.photos)}</div>
      </div>

      <div class="section">
        <h3>③ AI 生成效果图</h3>
        <div class="hint">选择模型、画面比例与画质后直接生成，画质可选至 4K，也可选「自定义 (不限制)」填任意宽×高。默认 Pollinations 免费免 Key、开箱即用；豆包 / OpenAI / 硅基流动等付费模型由管理员在「系统设置 → 生图模型」统一配置平台 API Key，员工无需填写任何 Key。</div>
        <textarea id="scPrompt" class="scheme-prompt" placeholder="描述你想要的阳台花园效果，例如：现代简约南向阳台，琴叶榕为主景，垂吊绿植层次，暖木色花箱，自然采光">${esc(s.requirements)}</textarea>
        <div class="check-row" style="margin:10px 0">
          <label><input type="checkbox" id="scRefPhoto" ${s.photos.length ? 'checked' : ''} ${s.photos.length ? '' : 'disabled'}> 以现场照片为参考图（图生图 / 垫图）</label>
        </div>
        <div class="hint">勾选后，系统将自动把第一张现场照片作为垫图传给生图模型，让 AI 在真实场景基础上生成改造效果图。</div>

        <div class="gen-control-bar">
          <div class="gen-field">
            <label>生图模型</label>
            <select id="scModel" class="wfull">${IMG_MODELS.map(m => `<option value="${m.id}" ${s.gen_config.model_id === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>
            <div class="gen-field-hint" id="scModelHint"></div>
          </div>
          <div class="gen-field">
            <label>画面比例</label>
            <select id="scAspect" class="wfull">${ASPECT_RATIOS.map(a => `<option value="${a.id}" ${s.gen_config.aspect === a.id ? 'selected' : ''}>${a.label}</option>`).join('')}</select>
          </div>
          <div class="gen-field">
            <label>画质</label>
            <select id="scQuality" class="wfull">${Object.entries(QUALITY_LABELS).map(([k, v]) => `<option value="${k}" ${s.gen_config.quality === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </div>
          <div class="gen-field" id="scCustomField" style="display:none">
            <label>自定义尺寸 (W × H 像素 · 不限制)</label>
            <div class="gen-custom-size">
              <input id="scCw" type="number" min="64" max="16384" step="64" value="4096" aria-label="宽">
              <span>×</span>
              <input id="scCh" type="number" min="64" max="16384" step="64" value="4096" aria-label="高">
              <span class="gen-unit">px</span>
            </div>
          </div>
          <div class="gen-field">
            <label>张数</label>
            <select id="scN" class="wfull">${[1,2,3,4].map(n => `<option value="${n}" ${s.gen_config.n == n ? 'selected' : ''}>${n} 张</option>`).join('')}</select>
          </div>
        </div>
        <div id="scSizePreview" class="gen-size-preview"></div>
        <div class="q-paste-actions">
          <button class="btn" id="scGen">🎨 生成效果图</button>
          <span id="scProviderTag" class="provider-tag"></span>
          <span id="scCreditTag" class="credit-tag">本次消耗 0 积分</span>
          <span id="scBalanceTag" class="credit-tag muted">余额 0 积分</span>
        </div>
        <div class="scheme-thumbs" id="scImgThumbs">${schemeThumbs(s.images)}</div>
        <div id="scGenMsg" class="q-warn" style="display:none"></div>
      </div>

      <div class="section">
        <h3>④ 设计理念</h3>
        <div class="q-paste-actions" style="margin-bottom:8px">
          <button class="btn sm ghost" id="scAnalyzeConcept" ${s.images.length ? '' : 'disabled'}>🤖 根据效果图生成</button>
          <span class="hint" style="margin:0">基于最新一张效果图 AI 分析设计理念，可二次编辑</span>
        </div>
        <textarea id="scConcept" class="scheme-concept" placeholder="设计思路、植物选择逻辑、色彩与层次、养护要点...">${esc(s.concept)}</textarea>
      </div>

      <div class="section">
        <h3>⑤ 植物与物料清单</h3>
        <div class="q-paste-actions" style="margin-bottom:8px">
          <button class="btn sm ghost" id="scAnalyzeItems" ${s.images.length ? '' : 'disabled'}>🤖 根据效果图识别清单</button>
          <span class="hint" style="margin:0">基于最新一张效果图 AI 自动识别植物与物料，生成后仍可手动编辑</span>
        </div>
        <div id="scItems"></div>
        <button class="btn sm ghost" id="scAddItem" style="margin-top:8px">＋ 添加一行</button>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
        <button class="btn" id="scSave">💾 保存方案</button>
        ${s.id ? `<button class="btn amber" id="scPrint">🖨 一键排版 / 导出 PDF</button>
        <button class="btn ghost" id="scQuote">➡ 生成报价单</button>
        <button class="btn danger" id="scDel">删除</button>` : ''}
      </div>
    </div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  bindThumbRemove('photo'); bindThumbRemove('image');
  $('#scPhoto').addEventListener('change', onSchemePhoto);
  $('#scGen').addEventListener('click', genSchemeImages);
  $('#scModel').addEventListener('change', onSchemeModelChange);
  $('#scAspect').addEventListener('change', updateGenSizePreview);
  $('#scQuality').addEventListener('change', onSchemeQualityChange);
  $('#scN').addEventListener('change', updateGenCreditPreview);
  $('#scN').addEventListener('input', updateGenCreditPreview);
  const acBtn = $('#scAnalyzeConcept'); if (acBtn) acBtn.addEventListener('click', () => analyzeSchemeImage('concept'));
  const aiBtn = $('#scAnalyzeItems'); if (aiBtn) aiBtn.addEventListener('click', () => analyzeSchemeImage('items'));
  $('#scAddItem').addEventListener('click', () => { state.scheme.items.push({ category: '植物-其他', name: '', spec: '', qty: 1, unit: '项', cost_price: 0 }); renderSchemeItems(); });
  onSchemeModelChange();
  // 若已保存方案用的是自定义尺寸，回填 W×H 并展开输入框
  if (s.gen_config && s.gen_config.quality === 'custom') {
    const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(s.gen_config.size || '');
    if (m) { const cwEl = $('#scCw'), chEl = $('#scCh'); if (cwEl) cwEl.value = m[1]; if (chEl) chEl.value = m[2]; }
    const cf = $('#scCustomField'); if (cf) cf.style.display = 'flex';
  }
  updateGenSizePreview();
  if (s.id) {
    $('#scSave').addEventListener('click', saveScheme);
    $('#scPrint').addEventListener('click', () => printScheme(s.id));
    $('#scQuote').addEventListener('click', () => schemeToQuote(s.id));
    $('#scDel').addEventListener('click', () => deleteScheme(s.id));
  } else {
    $('#scSave').addEventListener('click', saveScheme);
  }
  renderSchemeItems();
}

function schemeThumbs(arr) {
  if (!arr.length) return '<div class="empty" style="padding:14px">（暂无）</div>';
  return arr.map((u, i) => `<div class="thumb"><img src="${esc(u)}" data-full="${esc(u)}"><button class="x" data-rm="${i}">×</button></div>`).join('');
}
function bindThumbRemove(kind) {
  const arr = kind === 'photo' ? state.scheme.photos : state.scheme.images;
  const sel = kind === 'photo' ? '#scPhotoThumbs' : '#scImgThumbs';
  $$(sel + ' .x').forEach(b => b.addEventListener('click', () => { arr.splice(+b.dataset.rm, 1); $(sel).innerHTML = schemeThumbs(arr); bindThumbRemove(kind); }));
  $$(sel + ' img').forEach(img => img.addEventListener('click', () => openLightbox(img.dataset.full || img.src)));
}
function openLightbox(src) {
  const box = document.createElement('div');
  box.className = 'img-lightbox';
  box.innerHTML = `<img src="${esc(src)}" alt="预览">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('文件读取失败'));
    fr.readAsDataURL(file);
  });
}
async function onSchemePhoto(e) {
  const files = [...e.target.files]; if (!files.length) return;
  for (const f of files) {
    try {
      const dataUrl = await readFileAsDataURL(f);
      const r = await api('POST', '/scheme/upload', { data: dataUrl });
      if (r.error) throw new Error(r.error);
      state.scheme.photos.push(r.url);
    } catch (err) { toast('上传失败：' + err.message); }
  }
  const sel = '#scPhotoThumbs';
  $(sel).innerHTML = schemeThumbs(state.scheme.photos);
  bindThumbRemove('photo');
  e.target.value = '';
  toast('已上传 ' + state.scheme.photos.length + ' 张照片');
}
function onSchemeModelChange() {
  const id = $('#scModel').value;
  const preset = IMG_MODELS.find(m => m.id === id) || IMG_MODELS[0];
  const hint = $('#scModelHint');
  if (hint) hint.textContent = preset.desc || '';
  const tag = $('#scProviderTag');
  if (tag) {
    if (preset.provider === 'pollinations') tag.textContent = '免费免 Key（开箱即用）';
    else if (preset.provider === 'hf') tag.textContent = '需平台配置 HF Token（管理员设置）';
    else if (preset.provider === 'openai') tag.textContent = '需平台配置 API Key（管理员设置）';
    else tag.textContent = '使用系统设置';
  }
  updateGenSizePreview();
}
function onSchemeQualityChange() {
  const quality = $('#scQuality').value;
  const customField = $('#scCustomField');
  if (customField) customField.style.display = (quality === 'custom') ? 'flex' : 'none';
  updateGenSizePreview();
}
function updateGenCreditPreview() {
  const preset = IMG_MODELS.find(m => m.id === $('#scModel').value) || IMG_MODELS[0];
  const n = +($('#scN') ? $('#scN').value : 1) || 1;
  const cost = (preset.credit || 0) * n;
  const creditTag = $('#scCreditTag');
  const balanceTag = $('#scBalanceTag');
  if (creditTag) creditTag.textContent = cost === 0 ? '本次免费' : `本次消耗 ${cost} 积分`;
  if (balanceTag) balanceTag.textContent = `余额 ${state.creditBalance || 0} 积分`;
}
function updateGenSizePreview() {
  const preset = IMG_MODELS.find(m => m.id === $('#scModel').value) || IMG_MODELS[0];
  const aspect = $('#scAspect').value;
  const quality = $('#scQuality').value;
  let cw, ch;
  if (quality === 'custom') { cw = +$('#scCw').value || 4096; ch = +$('#scCh').value || 4096; }
  const size = computeGenSize(preset.id, aspect, quality, state.settings ? state.settings.img_gen_size : '1024x1024', cw, ch);
  const box = $('#scSizePreview');
  if (box) box.textContent = '输出尺寸：' + size + (quality === 'custom' ? '（自定义 · 不限制）' : (aspect === 'auto' ? '（跟随系统设置）' : ''));
  updateGenCreditPreview();
}
async function genSchemeImages() {
  const prompt = $('#scPrompt').value.trim();
  if (!prompt) return toast('请先填写生图描述');
  const n = +$('#scN').value || 1;
  const modelId = $('#scModel').value;
  const preset = IMG_MODELS.find(m => m.id === modelId) || IMG_MODELS[0];
  const aspect = $('#scAspect').value;
  const quality = $('#scQuality').value;
  let cw, ch;
  if (quality === 'custom') { cw = +$('#scCw').value || 4096; ch = +$('#scCh').value || 4096; }
  const size = computeGenSize(preset.id, aspect, quality, state.settings ? state.settings.img_gen_size : '1024x1024', cw, ch);
  // 记忆本次选择（不含 Key：平台 Key 由系统设置统一提供，不落盘到方案）
  state.scheme.gen_config = {
    model_id: modelId, aspect, quality, n,
    provider: preset.provider, model: preset.model, base_url: preset.base_url,
    size
  };

  const btn = $('#scGen');
  btn.disabled = true; btn.textContent = '生成中…（约 10–120 秒）';
  const msg = $('#scGenMsg'); msg.style.display = 'none';
  try {
    const payload = { prompt, n, scheme_id: state.scheme.id || null };
    if (preset.provider) payload.provider = preset.provider;
    if (preset.model) payload.model = preset.model;
    if (preset.base_url) payload.base_url = preset.base_url;
    if (size) payload.size = size;
    // 图生图 / 垫图：用第一张现场照片
    const useRefPhoto = $('#scRefPhoto') ? $('#scRefPhoto').checked : false;
    if (useRefPhoto && state.scheme.photos.length) {
      payload.reference_image = location.origin + state.scheme.photos[0];
    }
    // OpenAI/DALL-E 支持 standard/hd；豆包文档未明确支持 quality，传非标准值可能报错
    if (quality === 'sd') payload.quality = 'standard';
    else if (quality === 'hd') payload.quality = 'hd';
    const r = await api('POST', '/scheme/generate', payload);
    if (r.error) throw new Error(r.error);
    const urls = r.urls || [];
    if (!urls.length) throw new Error('未获取到图片');
    state.scheme.images.push(...urls);
    $('#scImgThumbs').innerHTML = schemeThumbs(state.scheme.images);
    bindThumbRemove('image');
    state.creditBalance = Math.max(0, (state.creditBalance || 0) - (r.cost || 0));
    updateGenCreditPreview();
    loadCreditBalance();
    toast('已生成 ' + urls.length + ' 张效果图（' + (r.provider || '') + ' · ' + (r.size || size) + '）');
  } catch (err) {
    msg.style.display = 'block'; msg.textContent = '⚠ ' + err.message;
  } finally {
    btn.disabled = false; btn.textContent = '🎨 生成效果图';
  }
}
async function analyzeSchemeImage(task) {
  const s = state.scheme;
  if (!s.images.length) return toast('请先生成效果图');
  const imageUrl = location.origin + s.images[s.images.length - 1];
  const btn = task === 'concept' ? $('#scAnalyzeConcept') : $('#scAnalyzeItems');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = '分析中…';
  try {
    const r = await api('POST', '/scheme/analyze', { image_url: imageUrl, task, scheme_id: s.id });
    if (r.error) throw new Error(r.error);
    if (task === 'concept') {
      $('#scConcept').value = r.text || '';
      s.concept = r.text || '';
      toast('设计理念已生成');
    } else {
      if (r.items && r.items.length) {
        s.items.push(...r.items);
        renderSchemeItems();
        toast('已识别 ' + r.items.length + ' 项物料');
      } else {
        toast('未识别到清单，请手动添加');
      }
    }
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
}
function renderSchemeItems() {
  const box = $('#scItems');
  const items = state.scheme.items;
  if (!items.length) { box.innerHTML = '<div class="empty">暂无清单，点下方“添加一行”</div>'; return; }
  box.innerHTML = `<table class="scheme-items"><thead><tr>
    <th>类别</th><th>名称</th><th>规格</th><th>数量</th><th>单位</th><th>成本单价</th><th></th></tr></thead><tbody>
    ${items.map((it, i) => `<tr data-i="${i}">
      <td><input data-f="category" value="${esc(it.category || '植物-其他')}"></td>
      <td><input data-f="name" value="${esc(it.name || '')}"></td>
      <td><input data-f="spec" value="${esc(it.spec || '')}"></td>
      <td><input data-f="qty" type="number" value="${esc(it.qty || 1)}" style="width:62px"></td>
      <td><input data-f="unit" value="${esc(it.unit || '项')}" style="width:50px"></td>
      <td><input data-f="cost_price" type="number" value="${esc(it.cost_price || 0)}" style="width:84px"></td>
      <td><button class="q-del" data-rmi="${i}">×</button></td>
    </tr>`).join('')}
  </tbody></table>`;
  $$('#scItems [data-f]').forEach(el => el.addEventListener('input', e => {
    const i = +e.target.closest('tr').dataset.i;
    state.scheme.items[i][e.target.dataset.f] = e.target.value;
  }));
  $$('#scItems [data-rmi]').forEach(b => b.addEventListener('click', () => { state.scheme.items.splice(+b.dataset.rmi, 1); renderSchemeItems(); }));
}
async function saveScheme() {
  const s = state.scheme;
  s.customer = $('#scCustomerName').value.trim();
  s.project_name = $('#scProject').value.trim();
  s.room_type = $('#scRoom').value.trim();
  s.requirements = $('#scPrompt').value.trim();
  s.concept = $('#scConcept').value;
  s.status = $('#scStatus').value;
  const cid = $('#scCustomer').value;
  s.customer_id = cid ? +cid : null;
  if (!s.customer) return toast('请填写客户名称');
  if (!s.project_name) return toast('请填写项目名称');
  const payload = {
    customer_id: s.customer_id, customer: s.customer, project_name: s.project_name,
    room_type: s.room_type, requirements: s.requirements, concept: s.concept,
    photos: s.photos, images: s.images, items: s.items, status: s.status,
    gen_config: s.gen_config || {}
  };
  let r;
  if (s.id) r = await api('PUT', '/schemes/' + s.id, payload);
  else r = await api('POST', '/schemes', payload);
  if (r.error) return toast(r.error);
  state.scheme.id = r.id; state.scheme.quote_id = r.quote_id || null;
  toast('方案已保存 #' + r.id);
  if (!s.id) renderSchemeEditor(); // 初次保存后显示 排版/报价/删除 按钮
}
function printScheme(id) {
  window.open(`${API}/schemes/${id}/print?token=${encodeURIComponent(state.token)}`, '_blank');
}
async function schemeToQuote(id) {
  const r = await api('POST', '/schemes/' + id + '/quote', {});
  if (r.error) return toast(r.error);
  toast('已生成报价单 ' + r.quote_no);
  closeDrawer();
  await switchView('quote');
  if (state.scheme.customer_id) {
    state.quote.customerId = String(state.scheme.customer_id);
    const sel = $('#qCustomer');
    if (sel) { sel.value = String(state.scheme.customer_id); onQuoteCustomerChange(); }
  }
}
async function deleteScheme(id) {
  if (!confirm('确认删除该方案？（已生成的报价单不会同步删除）')) return;
  const r = await api('DELETE', '/schemes/' + id);
  if (r.error) return toast(r.error);
  closeDrawer(); toast('已删除'); renderScheme();
}

// ---------------- 积分管理 ----------------
async function renderCredits() {
  const [users, txs, prices] = await Promise.all([api('GET', '/users'), api('GET', '/credits/transactions'), api('GET', '/credits/prices')]);
  const app = $('#app');
  const userMap = new Map((users || []).map(u => [u.username, u]));
  app.innerHTML = `
    <div class="toolbar">
      <b style="color:var(--green-900)">积分管理</b>
      <span class="spacer"></span>
      <button class="btn sm" id="crRecharge">+ 充值积分</button>
    </div>
    <div class="section">
      <h3>当前扣费标准</h3>
      <div class="hint">积分扣费开关：${prices.enabled ? '已启用' : '已关闭'}</div>
      <table class="price-table" style="max-width:560px">
        <thead><tr><th>渠道</th><th>单张积分</th></tr></thead>
        <tbody>
          <tr><td>Pollinations（免费）</td><td>${prices.pollinations}</td></tr>
          <tr><td>Hugging Face</td><td>${prices.hf}</td></tr>
          <tr><td>硅基流动</td><td>${prices.siliconflow}</td></tr>
          <tr><td>豆包 Seedream</td><td>${prices.doubao}</td></tr>
          <tr><td>OpenAI</td><td>${prices.openai}</td></tr>
          <tr><td>默认/自定义</td><td>${prices.default}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="section">
      <h3>最近流水</h3>
      ${txs.length ? `<table class="price-table">
        <thead><tr><th>时间</th><th>账号</th><th>姓名</th><th>类型</th><th>积分变动</th><th>备注</th></tr></thead>
        <tbody>
          ${txs.map(t => `<tr>
            <td>${esc((t.created_at||'').slice(0,19))}</td>
            <td><b>${esc(t.username)}</b></td>
            <td>${esc(t.name)}</td>
            <td>${esc(t.type)}</td>
            <td style="color:${t.amount>0?'var(--green-700)':'var(--red-600)'};font-weight:600">${t.amount>0?'+':''}${t.amount}</td>
            <td>${esc(t.note||'—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty">暂无积分流水</div>'}
    </div>`;
  $('#crRecharge').addEventListener('click', () => openRechargeDialog(userMap, prices));
}

function openRechargeDialog(userMap, prices) {
  openDrawer();
  const us = [...userMap.values()];
  $('#drawerPanel').innerHTML = `
    <div class="dp-head"><h2>充值积分</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body">
      <div class="section">
        <div class="hint">正数 = 充值；负数 = 扣减。1 积分对应系统设置里的单张扣费单位。</div>
        <div class="field"><label>选择员工</label><select id="crUser" class="wfull">${us.map(u=>`<option value="${esc(u.username)}">${esc(u.name||u.username)}（${ROLE_NAMES[u.role]||u.role}）</option>`).join('')}</select></div>
        <div class="field"><label>积分数量</label><input id="crAmount" type="number" class="wfull" placeholder="如 100 或 -50"></div>
        <div class="field"><label>备注</label><input id="crNote" class="wfull" placeholder="充值说明"></div>
        <div style="margin-top:14px"><button class="btn" id="crSave">确认充值</button></div>
      </div>
    </div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#crSave').addEventListener('click', async () => {
    const username = $('#crUser').value;
    const amount = +$('#crAmount').value;
    const note = $('#crNote').value.trim();
    if (!amount) return toast('请填写积分数量');
    const r = await api('POST', '/credits/recharge', { username, amount, note });
    if (r.error) return toast(r.error);
    toast(`已调整 ${amount} 积分，当前余额 ${r.balance}`);
    closeDrawer(); renderCredits();
  });
}

// ---------------- 官网案例管理 ----------------
async function renderCases() {
  const cases = await api('GET', '/cases/all');
  const list = Array.isArray(cases) ? cases : [];
  const rows = list.map(c => `
    <tr>
      <td><img src="${esc(c.cover || '')}" onerror="this.style.visibility='hidden'" style="width:64px;height:44px;object-fit:cover;border-radius:6px"></td>
      <td>${esc(c.title)}</td>
      <td>${esc(c.category || '-')}</td>
      <td>${c.sort != null ? c.sort : 0}</td>
      <td><span class="status-pill ${c.status == 1 ? 'st-deal' : 'st-lead'}">${c.status == 1 ? '上架' : '下架'}</span></td>
      <td>
        <button class="btn sm ghost" data-edit="${c.id}">编辑</button>
        <button class="btn sm ghost" data-del="${c.id}">删除</button>
      </td>
    </tr>
  `).join('');
  $('#app').innerHTML = `
    <div class="toolbar">
      <h3 style="font-family:var(--font-serif);font-size:18px;color:var(--green-900)">官网案例管理</h3>
      <span class="spacer"></span>
      <button class="btn" id="newCaseBtn">+ 新建案例</button>
    </div>
    <table class="price-table">
      <thead><tr><th>封面</th><th>标题</th><th>分类</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">暂无案例，点击右上角新建</td></tr>'}</tbody>
    </table>`;
  $('#newCaseBtn').addEventListener('click', () => openCaseEditor(null));
  $$('#app [data-edit]').forEach(b => b.addEventListener('click', () => openCaseEditor(+b.dataset.edit)));
  $$('#app [data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('确认删除该案例？此操作不可撤销。')) return;
    const r = await api('DELETE', '/cases/' + b.dataset.del);
    if (r.error) return toast(r.error);
    toast('已删除'); renderCases();
  }));
}

async function openCaseEditor(id) {
  let c = { title: '', category: 'commercial', summary: '', detail: '', cover: '', gallery: [], sort: 0, status: 1 };
  if (id) {
    const d = await api('GET', '/cases/' + id);
    if (d.error) return toast('案例不存在');
    c = d; if (!Array.isArray(c.gallery)) c.gallery = [];
  }
  state.caseDraft = { cover: c.cover || '', gallery: (c.gallery || []).slice() };
  openDrawer();
  $('#drawerPanel').innerHTML = `
    <div class="dp-head"><h2>${id ? '编辑案例' : '新建案例'}</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body">
      <div class="field full"><label>标题 *</label><input id="csTitle" value="${esc(c.title)}" placeholder="如：雁荡山游客中心绿植设计"></div>
      <div class="field"><label>分类</label><select id="csCat">
        ${[['commercial','商业空间'],['home','家居空间'],['event','活动案例'],['other','其他']].map(o=>`<option value="${o[0]}" ${c.category===o[0]?'selected':''}>${o[1]}</option>`).join('')}
      </select></div>
      <div class="field"><label>排序（越小越靠前）</label><input id="csSort" type="number" value="${c.sort != null ? c.sort : 0}"></div>
      <div class="field"><label>状态</label><select id="csStatus">
        <option value="1" ${c.status==1?'selected':''}>上架</option>
        <option value="0" ${c.status==0?'selected':''}>下架</option>
      </select></div>
      <div class="field full"><label>摘要（列表/卡片展示）</label><textarea id="csSummary" rows="2" placeholder="一句话简介">${esc(c.summary)}</textarea></div>
      <div class="field full"><label>详情正文（支持简单 HTML）</label><textarea id="csDetail" rows="8" placeholder="<p>项目背景...</p> 或直接写文字">${esc(c.detail)}</textarea></div>
      <div class="field full"><label>封面图</label>
        <input type="file" id="csCover" accept="image/*">
        <div id="csCoverBox" style="margin-top:8px">${c.cover ? `<img src="${esc(c.cover)}" style="max-width:200px;border-radius:8px">` : '<span style="color:var(--muted);font-size:13px">未上传</span>'}</div>
      </div>
      <div class="field full"><label>图集（可多选）</label>
        <input type="file" id="csGallery" accept="image/*" multiple>
        <div id="csGalleryBox" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${(c.gallery||[]).map(g=>`<img src="${esc(g)}" style="width:90px;height:64px;object-fit:cover;border-radius:6px">`).join('')}</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn" id="csSave">保存案例</button>
        <button class="btn ghost" id="csCancel">取消</button>
      </div>
    </div>`;
  $('#dClose').addEventListener('click', closeDrawer);
  $('#csCancel').addEventListener('click', closeDrawer);
  $('#csCover').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const url = await uploadCaseImage(f);
    if (url) { state.caseDraft.cover = url; $('#csCoverBox').innerHTML = `<img src="${esc(url)}" style="max-width:200px;border-radius:8px">`; toast('封面已上传'); }
  });
  $('#csGallery').addEventListener('change', async e => {
    const files = [...e.target.files]; if (!files.length) return;
    for (const f of files) { const url = await uploadCaseImage(f); if (url) state.caseDraft.gallery.push(url); }
    $('#csGalleryBox').innerHTML = state.caseDraft.gallery.map(g=>`<img src="${esc(g)}" style="width:90px;height:64px;object-fit:cover;border-radius:6px">`).join('');
    toast('图集已添加 ' + state.caseDraft.gallery.length + ' 张');
  });
  $('#csSave').addEventListener('click', async () => {
    const title = $('#csTitle').value.trim();
    if (!title) return toast('请填写标题');
    const body = {
      title,
      category: $('#csCat').value,
      summary: $('#csSummary').value,
      detail: $('#csDetail').value,
      cover: state.caseDraft.cover || '',
      gallery: state.caseDraft.gallery || [],
      sort: +($('#csSort').value || 0),
      status: +($('#csStatus').value || 1),
    };
    let r;
    if (id) r = await api('PUT', '/cases/' + id, body);
    else r = await api('POST', '/cases', body);
    if (r.error) return toast(r.error);
    toast('已保存'); closeDrawer(); renderCases();
  });
}

async function uploadCaseImage(file) {
  try {
    const dataUrl = await readFileAsDataURL(file);
    const r = await api('POST', '/scheme/upload', { data: dataUrl, folder: 'cases' });
    if (r.error) throw new Error(r.error);
    return r.url;
  } catch (err) { toast('上传失败：' + err.message); return null; }
}

// ===================== 站点装修（全站可自定义后台） =====================
const SITE_CSS = `
.site-tabs{display:flex;gap:8px;margin:14px 0}
.site-tab{padding:8px 16px;border:1px solid var(--hair);border-radius:20px;background:#fff;cursor:pointer;font-size:14px;color:var(--text)}
.site-tab.active{background:var(--primary-green);color:#fff;border-color:var(--primary-green)}
.site-pane{max-width:920px}
.site-sec{background:#fff;border:1px solid var(--hair);border-radius:14px;padding:16px 18px;margin-bottom:16px}
.site-sec h4{margin-bottom:10px;color:var(--green-900);font-family:var(--font-serif)}
.site-sec label{display:block;font-size:12px;color:var(--text-muted);margin:10px 0 4px}
.site-sec input,.site-sec textarea,.site-sec select{width:100%;padding:8px 10px;border:1px solid var(--hair);border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box}
.srows{display:flex;flex-direction:column;gap:8px}
.srow{display:flex;gap:6px;align-items:center}
.srow textarea{flex:1;min-height:38px;font-family:inherit}
.srow-del{background:#fff;border:1px solid var(--hair);border-radius:6px;width:30px;height:30px;cursor:pointer;color:#c0392b;flex:0 0 auto}
.add-row{margin-top:8px}
.fgroup{border:1px dashed var(--hair);border-radius:10px;padding:10px;margin-bottom:10px}
.fitems{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
.site-ctab{padding:8px 14px;border:1px solid var(--hair);border-radius:8px;background:#fff;cursor:pointer;margin-right:6px;font-size:13px}
.site-ctab.active{background:var(--primary-green);color:#fff}
.content-list{display:flex;flex-direction:column;gap:10px}
.content-card{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--hair);border-radius:12px;padding:12px}
.cc-icon{font-size:26px;width:48px;text-align:center;flex:0 0 auto}
.cc-main{flex:1;min-width:0}
.cc-title{font-weight:600;color:var(--green-900)}
.cc-sum{font-size:13px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-meta{font-size:12px;color:var(--text-muted);margin-top:4px}
.cc-ops{display:flex;gap:6px;flex:0 0 auto}
.hint{font-size:12px;color:var(--text-muted);margin-top:8px}
`;
async function uploadSiteImage(file) {
  try {
    const dataUrl = await readFileAsDataURL(file);
    const r = await api('POST', '/upload', { data: dataUrl, folder: 'site' });
    if (r.error) throw new Error(r.error);
    return r.url;
  } catch (err) { toast('上传失败：' + err.message); return null; }
}
const SITE_TPL = {
  value: (d)=>`<div class="srow" data-row><input data-f="label" value="${esc(d.label||'')}" placeholder="小标题"><input data-f="text" value="${esc(d.text||'')}" placeholder="说明文字"><button class="srow-del" type="button" title="删除">✕</button></div>`,
  stat: (d)=>`<div class="srow" data-row><input data-f="num" value="${esc(d.num||'')}" placeholder="数字" style="width:80px"><input data-f="suffix" value="${esc(d.suffix||'')}" placeholder="后缀" style="width:50px"><input data-f="label" value="${esc(d.label||'')}" placeholder="标签"><button class="srow-del" type="button" title="删除">✕</button></div>`,
  voice: (d)=>`<div class="srow" data-row><input data-f="avatar" value="${esc(d.avatar||'')}" placeholder="头像字" style="width:60px"><input data-f="name" value="${esc(d.name||'')}" placeholder="姓名" style="width:120px"><input data-f="role" value="${esc(d.role||'')}" placeholder="身份" style="width:120px"><textarea data-f="quote" placeholder="评价内容">${esc(d.quote||'')}</textarea><button class="srow-del" type="button" title="删除">✕</button></div>`,
  timeline:(d)=>`<div class="srow" data-row><input data-f="year" value="${esc(d.year||'')}" placeholder="年份" style="width:70px"><input data-f="title" value="${esc(d.title||'')}" placeholder="标题" style="width:140px"><input data-f="desc" value="${esc(d.desc||'')}" placeholder="描述"><button class="srow-del" type="button" title="删除">✕</button></div>`,
  nav: (d)=>`<div class="srow" data-row><input data-f="label" value="${esc(d.label||'')}" placeholder="名称" style="width:120px"><input data-f="href" value="${esc(d.href||'')}" placeholder="链接如 #about" style="width:140px"><label style="display:flex;gap:4px;align-items:center;font-size:12px"><input type="checkbox" data-f="cta" ${d.cta?'checked':''}>高亮</label><button class="srow-del" type="button" title="删除">✕</button></div>`,
  flink: (d)=>`<div class="srow" data-row><input data-f="label" value="${esc(d.label||'')}" placeholder="名称" style="width:140px"><input data-f="href" value="${esc(d.href||'')}" placeholder="链接" style="width:160px"><button class="srow-del" type="button" title="删除">✕</button></div>`,
};
function rowsHtml(tpl, arr){ return (arr||[]).map(it=>SITE_TPL[tpl](it)).join(''); }
function collectRows(container){ return Array.from(container.querySelectorAll('[data-row]')).map(r=>{ const o={}; r.querySelectorAll('[data-f]').forEach(el=>{ o[el.dataset.f]= el.type==='checkbox'? el.checked : el.value; }); return o; }); }
function bindSiteRows(root){
  root.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{ const c=$(btn.dataset.add); const tpl=btn.dataset.tpl; if(c&&SITE_TPL[tpl]) c.insertAdjacentHTML('beforeend', SITE_TPL[tpl]({})); }));
  root.addEventListener('click', e=>{ if(e.target.classList.contains('srow-del')){ const row=e.target.closest('[data-row]'); if(row) row.remove(); } });
}
function bindSiteImg(root, fileId, urlId){
  const f=$('#'+fileId, root); if(!f) return;
  f.addEventListener('change', async e=>{ const file=e.target.files[0]; if(!file) return; const url=await uploadSiteImage(file); if(url){ const u=$('#'+urlId, root); if(u) u.value=url; toast('已上传'); } });
}

async function renderSite(){
  if(!document.getElementById('site-style')){ const st=document.createElement('style'); st.id='site-style'; st.textContent=SITE_CSS; document.head.appendChild(st); }
  const cfg = await api('GET','/site/edit');
  if(cfg.error) return toast('加载失败：'+cfg.error);
  state.site = cfg||{};
  const s = state.site;
  $('#app').innerHTML = `
    <div class="toolbar">
      <h3 style="font-family:var(--font-serif);font-size:18px;color:var(--green-900)">站点装修 · 全站可自定义</h3>
      <span class="spacer"></span>
      <button class="btn" id="siteSaveAll">保存全部更改</button>
    </div>
    <div class="site-tabs">
      <button class="site-tab active" data-tab="copy">文案区块</button>
      <button class="site-tab" data-tab="content">内容卡片</button>
      <button class="site-tab" data-tab="appearance">外观主题</button>
    </div>
    <div id="siteBody"></div>`;
  $$('.site-tab').forEach(b=>b.addEventListener('click',()=>{ $$('.site-tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); siteRenderTab(b.dataset.tab); }));
  $('#siteSaveAll').addEventListener('click', saveSiteAll);
  siteRenderTab('copy');
}
function siteRenderTab(tab){
  const body=$('#siteBody'); if(!body) return;
  if(tab==='content'){ siteRenderContent(body); return; }
  if(tab==='appearance'){ siteRenderAppearance(body); return; }
  siteRenderCopy(body);
}
function txtLines(arrOrStr){ return Array.isArray(arrOrStr)? arrOrStr.join('\n') : (arrOrStr||''); }
function siteRenderCopy(body){
  const s=state.site||{};
  const g=(k,def)=> (s[k]!=null? s[k] : def);
  body.innerHTML = `
  <div class="site-pane">
    <div class="site-sec"><h4>首屏 Hero</h4>
      <label>小标签</label><input id="hero_kicker" value="${esc(g('hero',{}).kicker||'')}">
      <label>主标题（每行一句，换行分隔）</label><textarea id="hero_title" rows="2">${esc(txtLines(g('hero',{}).title))}</textarea>
      <label>副标题</label><textarea id="hero_desc" rows="2">${esc(g('hero',{}).desc||'')}</textarea>
      <label>主按钮文字 / 链接</label><input id="hero_cta1" value="${esc(g('hero',{}).cta1||'')}"><input id="hero_cta1_href" value="${esc(g('hero',{}).cta1_href||'')}" placeholder="链接如 #contact">
      <label>次按钮文字 / 链接</label><input id="hero_cta2" value="${esc(g('hero',{}).cta2||'')}"><input id="hero_cta2_href" value="${esc(g('hero',{}).cta2_href||'')}" placeholder="链接如 #services">
      <label>背景图（可选，留空用默认）</label>
      <div style="display:flex;gap:8px;align-items:center"><input id="hero_photo" value="${esc(g('hero',{}).photo||'')}" placeholder="图片URL" style="flex:1"><input type="file" id="hero_photo_f" accept="image/*"></div>
    </div>

    <div class="site-sec"><h4>关于我们</h4>
      <label>小标签</label><input id="about_kicker" value="${esc(g('about',{}).kicker||'')}">
      <label>标题（换行分隔）</label><textarea id="about_title" rows="2">${esc(txtLines(g('about',{}).title))}</textarea>
      <label>导语</label><textarea id="about_lead" rows="2">${esc(g('about',{}).lead||'')}</textarea>
      <label>价值点 <button class="btn sm ghost add-row" data-add="#about_values" data-tpl="value" type="button">+ 添加</button></label>
      <div id="about_values" class="srows">${rowsHtml('value',g('about',{}).values)}</div>
      <label>配图（可选）</label><div style="display:flex;gap:8px;align-items:center"><input id="about_photo" value="${esc(g('about',{}).photo||'')}" placeholder="图片URL" style="flex:1"><input type="file" id="about_photo_f" accept="image/*"></div>
      <label>卡片标题 / 副标题 / 图标</label><input id="about_chip_title" value="${esc(g('about',{}).chip_title||'')}"><input id="about_chip_sub" value="${esc(g('about',{}).chip_sub||'')}"><input id="about_chip_icon" value="${esc(g('about',{}).chip_icon||'🌿')}" style="width:60px">
    </div>

    <div class="site-sec"><h4>数据条</h4>
      <div id="stats_list" class="srows">${rowsHtml('stat',g('stats'))}</div>
      <button class="btn sm ghost add-row" data-add="#stats_list" data-tpl="stat" type="button">+ 添加数据</button>
    </div>

    <div class="site-sec"><h4>客户心声</h4>
      <div id="voices_list" class="srows">${rowsHtml('voice',g('voices'))}</div>
      <button class="btn sm ghost add-row" data-add="#voices_list" data-tpl="voice" type="button">+ 添加评价</button>
    </div>

    <div class="site-sec"><h4>创始人故事</h4>
      <label>小标签 / 标题 / 引言</label><input id="fd_kicker" value="${esc(g('founder',{}).kicker||'')}"><input id="fd_title" value="${esc(g('founder',{}).title||'')}"><input id="fd_quote" value="${esc(g('founder',{}).quote||'')}">
      <label>段落一 / 段落二</label><textarea id="fd_para1" rows="2">${esc(Array.isArray(g('founder',{}).paras)?g('founder',{}).paras[0]||'':'')}</textarea><textarea id="fd_para2" rows="2">${esc(Array.isArray(g('founder',{}).paras)?g('founder',{}).paras[1]||'':'')}</textarea>
      <label>落款</label><input id="fd_sign" value="${esc(g('founder',{}).sign||'')}">
      <label>配图（可选）</label><div style="display:flex;gap:8px;align-items:center"><input id="fd_photo" value="${esc(g('founder',{}).photo||'')}" placeholder="图片URL" style="flex:1"><input type="file" id="fd_photo_f" accept="image/*"></div>
      <label>卡片标题 / 副标题 / 图标</label><input id="fd_card_title" value="${esc(g('founder',{}).card_title||'')}"><input id="fd_card_sub" value="${esc(g('founder',{}).card_sub||'')}"><input id="fd_card_icon" value="${esc(g('founder',{}).card_icon||'🌿')}" style="width:60px">
    </div>

    <div class="site-sec"><h4>品牌历程</h4>
      <div id="timeline_list" class="srows">${rowsHtml('timeline',g('timeline'))}</div>
      <button class="btn sm ghost add-row" data-add="#timeline_list" data-tpl="timeline" type="button">+ 添加节点</button>
    </div>

    <div class="site-sec"><h4>联系方式</h4>
      <label>地址</label><input id="ct_address" value="${esc(g('contact',{}).address||'')}">
      <label>电话</label><input id="ct_phone" value="${esc(g('contact',{}).phone||'')}">
      <label>微信</label><input id="ct_wechat" value="${esc(g('contact',{}).wechat||'')}">
      <label>服务时间</label><input id="ct_hours" value="${esc(g('contact',{}).hours||'')}">
    </div>

    <div class="site-sec"><h4>页脚</h4>
      <label>简介（可含 &lt;br&gt; 换行）</label><textarea id="ft_desc" rows="2">${esc(g('footer',{}).desc||'')}</textarea>
      <label>链接分组</label>
      <div id="ft_groups">${(g('footer',{}).links||[]).map((grp,i)=>`
        <div class="fgroup">
          <input data-f="group" value="${esc(grp.group||'')}" placeholder="分组名" style="width:160px;margin-bottom:6px">
          <div class="fitems" id="ft_items_${i}">${rowsHtml('flink',grp.items||[])}</div>
          <button class="btn sm ghost add-row" data-add="#ft_items_${i}" data-tpl="flink" type="button">+ 添加链接</button>
        </div>`).join('')}</div>
      <label>版权信息</label><input id="ft_copyright" value="${esc(g('footer',{}).copyright||'')}">
    </div>

    <div class="site-sec"><h4>导航菜单</h4>
      <div id="nav_list" class="srows">${rowsHtml('nav',g('nav'))}</div>
      <button class="btn sm ghost add-row" data-add="#nav_list" data-tpl="nav" type="button">+ 添加菜单</button>
    </div>
  </div>`;
  bindSiteRows(body);
  bindSiteImg(body,'hero_photo_f','hero_photo');
  bindSiteImg(body,'about_photo_f','about_photo');
  bindSiteImg(body,'fd_photo_f','fd_photo');
}
function siteRenderAppearance(body){
  const a=state.site.appearance||{};
  body.innerHTML=`
  <div class="site-pane">
    <div class="site-sec"><h4>字体风格</h4>
      <select id="ap_font">
        ${[['serif','宋体优雅（默认）'],['sans','黑体现代'],['round','圆体亲和'],['kai','文楷雅致']].map(o=>`<option value="${o[0]}" ${a.font_preset===o[0]?'selected':''}>${o[1]}</option>`).join('')}
      </select>
      <p class="hint">切换后官网标题与正文字体整体变更（部分字体首次使用会自动加载）。</p>
    </div>
    <div class="site-sec"><h4>主题色</h4>
      <input type="color" id="ap_color" value="${esc(a.primary_color||'#2D5A27')}" style="width:60px;height:40px;vertical-align:middle">
      <input id="ap_color_hex" value="${esc(a.primary_color||'#2D5A27')}" style="width:100px">
      <div id="swatches" style="margin-top:8px">${['#2D5A27','#1f6f43','#2e7d4f','#0f6f8f','#c05621','#7a3b8f','#b03a5b','#34495e'].map(c=>`<span class="swatch" style="display:inline-block;width:26px;height:26px;background:${c};border-radius:6px;cursor:pointer;margin:0 4px" data-color="${c}"></span>`).join('')}</div>
    </div>
    <div class="site-sec"><h4>Logo</h4>
      <label>文字</label><input id="ap_logo_text" value="${esc(a.logo_text||'绿趣')}">
      <label>图标 Emoji</label><input id="ap_logo_icon" value="${esc(a.logo_icon||'🌿')}" style="width:80px">
      <label>Logo 图片URL（可选，填了则用图片替代图标）</label><div style="display:flex;gap:8px;align-items:center"><input id="ap_logo_url" value="${esc(a.logo_url||'')}" placeholder="图片URL" style="flex:1"><input type="file" id="ap_logo_url_f" accept="image/*"></div>
    </div>
    <p class="hint">修改外观后点击右上角「保存全部更改」生效；也可在「文案区块」页一并保存。</p>
  </div>`;
  const colorInput=$('#ap_color'), hexInput=$('#ap_color_hex');
  colorInput.addEventListener('input',()=>hexInput.value=colorInput.value);
  hexInput.addEventListener('change',()=>{ if(/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) colorInput.value=hexInput.value; });
  $$('#swatches .swatch').forEach(sp=>sp.addEventListener('click',()=>{ colorInput.value=sp.dataset.color; hexInput.value=sp.dataset.color; }));
  const lf=$('#ap_logo_url_f'); if(lf) lf.addEventListener('change',async e=>{ const file=e.target.files[0]; if(!file) return; const url=await uploadSiteImage(file); if(url){ $('#ap_logo_url').value=url; toast('已上传'); } });
}
async function siteRenderContent(body){
  const types=[['service','服务'],['course','课程'],['partner','合作'],['team','团队'],['founder','创始人']];
  const labels={service:'服务',course:'课程',partner:'合作',team:'团队',founder:'创始人'};
  state.contentType=state.contentType||'service';
  body.innerHTML=`<div class="site-sec"><div class="ctab-row" style="margin-bottom:10px">${types.map(t=>`<button class="site-ctab ${state.contentType===t[0]?'active':''}" data-ct="${t[0]}">${t[1]}</button>`).join('')}</div><div id="contentList" class="content-list"></div></div>`;
  $$('.site-ctab').forEach(b=>b.addEventListener('click',()=>{ state.contentType=b.dataset.ct; $$('.site-ctab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); loadContentList(); }));
  await loadContentList();
}
async function loadContentList(){
  const type=state.contentType||'service';
  const list=await api('GET','/contents?type='+type);
  const arr=Array.isArray(list)?list:[];
  const box=$('#contentList'); if(!box) return;
  box.innerHTML=(arr.length?arr.map(c=>`
    <div class="content-card">
      <div class="cc-icon">${esc(c.icon||'🌿')}</div>
      <div class="cc-main"><div class="cc-title">${esc(c.title)}</div><div class="cc-sum">${esc(c.summary||'')}</div><div class="cc-meta">排序 ${c.sort!=null?c.sort:0} · <span class="status-pill ${c.status==1?'st-deal':'st-lead'}">${c.status==1?'上架':'下架'}</span></div></div>
      <div class="cc-ops"><button class="btn sm ghost" data-edit="${c.id}">编辑</button><button class="btn sm ghost" data-del="${c.id}">删除</button></div>
    </div>`).join(''):'<p class="hint">该分类暂无内容</p>');
  const addBtn=document.createElement('button'); addBtn.className='btn'; addBtn.textContent='+ 新建'+( {service:'服务',course:'课程',partner:'合作',team:'团队',founder:'创始人'}[type]||'' ); addBtn.style.marginTop='12px';
  addBtn.addEventListener('click',()=>openContentEditor(null,type));
  box.appendChild(addBtn);
  box.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openContentEditor(+b.dataset.edit,type)));
  box.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{ if(!confirm('确认删除该内容？'))return; const r=await api('DELETE','/contents/'+b.dataset.del); if(r.error)return toast(r.error); toast('已删除'); loadContentList(); }));
}
async function openContentEditor(id,type){
  let c={title:'',summary:'',detail:'',cover:'',icon:'🌿',meta:'',sort:0,status:1,type:type||state.contentType||'service'};
  if(id){ const d=await api('GET','/contents/'+id); if(d.error)return toast('不存在'); c=d; }
  state.contentDraft={cover:c.cover||'',gallery:[]};
  openDrawer();
  $('#drawerPanel').innerHTML=`
    <div class="dp-head"><h2>${id?'编辑':'新建'}内容</h2><button class="close" id="dClose">×</button></div>
    <div class="dp-body">
      <div class="field"><label>类型</label><select id="ccType">
        ${[['service','服务'],['course','课程'],['partner','合作'],['team','团队'],['founder','创始人']].map(o=>`<option value="${o[0]}" ${c.type===o[0]?'selected':''}>${o[1]}</option>`).join('')}
      </select></div>
      <div class="field"><label>图标 Emoji</label><input id="ccIcon" value="${esc(c.icon||'🌿')}" style="width:80px" placeholder="🌿"></div>
      <div class="field full"><label>标题 *</label><input id="ccTitle" value="${esc(c.title)}"></div>
      <div class="field full"><label>摘要（卡片展示）</label><textarea id="ccSummary" rows="2">${esc(c.summary||'')}</textarea></div>
      <div class="field full"><label>详情（支持 HTML）</label><textarea id="ccDetail" rows="6">${esc(c.detail||'')}</textarea></div>
      <div class="field"><label>排序（越小越靠前）</label><input id="ccSort" type="number" value="${c.sort!=null?c.sort:0}"></div>
      <div class="field"><label>状态</label><select id="ccStatus"><option value="1" ${c.status==1?'selected':''}>上架</option><option value="0" ${c.status==0?'selected':''}>下架</option></select></div>
      <div class="field full"><label>附加信息（如价格/时长）</label><input id="ccMeta" value="${esc(c.meta||'')}"></div>
      <div class="field full"><label>封面图</label><div style="display:flex;gap:8px;align-items:center"><input id="ccCover" value="${esc(c.cover||'')}" placeholder="图片URL" style="flex:1"><input type="file" id="ccCoverF" accept="image/*"></div><div id="ccCoverBox" style="margin-top:6px">${c.cover?`<img src="${esc(c.cover)}" style="max-width:180px;border-radius:8px">`:''}</div></div>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="btn" id="ccSave">保存</button><button class="btn ghost" id="ccCancel">取消</button></div>
    </div>`;
  $('#dClose').addEventListener('click',closeDrawer);
  $('#ccCancel').addEventListener('click',closeDrawer);
  $('#ccCoverF').addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f)return; const url=await uploadSiteImage(f); if(url){ state.contentDraft.cover=url; $('#ccCover').value=url; $('#ccCoverBox').innerHTML=`<img src="${esc(url)}" style="max-width:180px;border-radius:8px">`; toast('已上传'); } });
  $('#ccSave').addEventListener('click',async()=>{
    const title=$('#ccTitle').value.trim(); if(!title)return toast('请填写标题');
    const body2={type:$('#ccType').value,title,summary:$('#ccSummary').value,detail:$('#ccDetail').value,cover:state.contentDraft.cover||'',icon:$('#ccIcon').value,meta:$('#ccMeta').value,sort:+$('#ccSort').value||0,status:+$('#ccStatus').value||1};
    let r; if(id) r=await api('PUT','/contents/'+id,body2); else r=await api('POST','/contents',body2);
    if(r.error)return toast(r.error);
    toast('已保存'); closeDrawer(); loadContentList();
  });
}
async function saveSiteAll(){
  const s=state.site||{};
  const get=v=>{const el=$('#'+v); return el?el.value:'';};
  const lines=v=>get(v).split('\n').map(x=>x.trim()).filter(Boolean);
  s.hero={kicker:get('hero_kicker'),title:lines('hero_title'),desc:get('hero_desc'),cta1:get('hero_cta1'),cta1_href:get('hero_cta1_href'),cta2:get('hero_cta2'),cta2_href:get('hero_cta2_href'),photo:get('hero_photo')};
  s.about={kicker:get('about_kicker'),title:lines('about_title'),lead:get('about_lead'),values:collectRows($('#about_values')),photo:get('about_photo'),chip_title:get('about_chip_title'),chip_sub:get('about_chip_sub'),chip_icon:get('about_chip_icon')};
  s.stats=collectRows($('#stats_list'));
  s.voices=collectRows($('#voices_list'));
  s.founder={kicker:get('fd_kicker'),title:get('fd_title'),quote:get('fd_quote'),paras:[get('fd_para1'),get('fd_para2')],sign:get('fd_sign'),photo:get('fd_photo'),card_title:get('fd_card_title'),card_sub:get('fd_card_sub'),card_icon:get('fd_card_icon')};
  s.timeline=collectRows($('#timeline_list'));
  s.contact={address:get('ct_address'),phone:get('ct_phone'),wechat:get('ct_wechat'),hours:get('ct_hours')};
  s.footer={desc:get('ft_desc'),links:Array.from($$('#ft_groups .fgroup')).map(grp=>({group:grp.querySelector('[data-f="group"]').value,items:collectRows(grp.querySelector('.fitems'))})),copyright:get('ft_copyright')};
  s.nav=collectRows($('#nav_list'));
  const ap=state.site.appearance||{};
  if($('#ap_font')){ ap.font_preset=$('#ap_font').value; ap.primary_color=$('#ap_color_hex').value||$('#ap_color').value; ap.logo_text=$('#ap_logo_text').value; ap.logo_icon=$('#ap_logo_icon').value; ap.logo_url=$('#ap_logo_url').value; }
  s.appearance=ap;
  const r=await api('PUT','/site',s);
  if(r.error) return toast('保存失败：'+r.error);
  toast('已保存，刷新官网即可生效');
}

// ==================== 门店销售记录 ====================
const SALES_CSS = `
.sales-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:var(--card);border-radius:var(--radius-sm);box-shadow:var(--shadow)}
.sales-toolbar input,.sales-toolbar select{padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px}
.sales-toolbar .btn-sm{padding:6px 14px;font-size:13px}
.sales-table{width:100%;border-collapse:collapse;font-size:13px}
.sales-table th{background:var(--green-50);color:var(--green-800);padding:9px 10px;text-align:left;font-weight:600;border-bottom:2px solid var(--border)}
.sales-table td{padding:8px 10px;border-bottom:1px solid var(--hair);vertical-align:middle}
.sales-table tr:hover{background:var(--cream)}
.sales-date-group td{background:#f0f7f2;font-weight:700;color:var(--green-800);font-size:14px}
.sales-img{width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--hair)}
.sales-actions button{margin-right:4px;padding:3px 8px;font-size:12px}
.sales-form-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center}
.sales-form-card{background:var(--card);border-radius:12px;padding:24px;width:520px;max-width:92vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.sales-form-card h3{margin:0 0 16px;color:var(--green-800);font-size:18px;display:flex;justify-content:space-between;align-items:center}
.sales-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sales-form-grid .full{grid-column:1/-1}
.sales-form-grid label{font-size:12px;color:var(--muted);font-weight:600;margin-bottom:3px;display:block}
.sales-form-grid input,.sales-form-grid select,.sales-form-grid textarea{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box}
.sales-form-grid textarea{resize:vertical;min-height:50px}
.sales-form-btns{display:flex;gap:8px;margin-top:18px;justify-content:flex-end}
.weekly-summary{background:var(--card);border-radius:var(--radius-sm);box-shadow:var(--shadow);padding:20px;margin-top:16px}
.weekly-summary h3{color:var(--green-800);margin:0 0 12px}
.weekly-cust{border:1px solid var(--hair);border-radius:8px;margin-bottom:12px;overflow:hidden}
.weekly-cust-head{background:var(--green-50);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:700}
.weekly-cust-body{padding:10px 14px}
.weekly-cust-body table{width:100%;font-size:12px;border-collapse:collapse}
.weekly-cust-body th,.weekly-cust-body td{padding:5px 8px;border-bottom:1px solid var(--hair);text-align:left}
.weekly-total{text-align:right;font-size:15px;font-weight:bold;color:var(--green-800);padding:12px;background:#f0f7f2;border-radius:6px;margin-top:8px}
.weekly-ledger{width:100%;border-collapse:collapse;font-size:12px;border:1px solid #d9d9d9}
.weekly-ledger th{background:#f4a460;color:#fff;padding:8px 6px;text-align:center;font-weight:600;border:1px solid #d9d9d9;white-space:nowrap}
.weekly-ledger td{padding:6px;border:1px solid #e0e0e0;vertical-align:middle;text-align:center}
.weekly-ledger td:nth-child(6),.weekly-ledger td:nth-child(7){text-align:right}
.weekly-ledger tbody tr:nth-child(even){background:#fff8f0}
.weekly-ledger tbody tr:hover{background:#fff2e6}
.weekly-ledger tfoot td{background:#fff2cc;font-weight:700;color:#333}
.weekly-ledger .wk-img{width:44px;height:44px;object-fit:cover;border:1px solid #e0e0e0;border-radius:4px}
.weekly-ledger .wk-empty{color:#bbb}
`;

async function renderSales() {
  if (!document.getElementById('sales-style')) {
    const st = document.createElement('style');
    st.id = 'sales-style';
    st.textContent = SALES_CSS;
    document.head.appendChild(st);
  }

  const [cats, pmts] = await Promise.all([
    api('GET', '/sales/categories'),
    api('GET', '/sales/payments'),
  ]);
  state._salesCats = cats;
  state._salesPmts = pmts;

  const app = $('#app');
  app.innerHTML = `
    <div class="sales-toolbar">
      <input type="date" id="sfDateFrom" />
      <span>~</span>
      <input type="date" id="sfDateTo" />
      <input placeholder="搜索客户..." id="sfCustomer" style="width:140px" />
      <select id="sfCategory"><option value="">全部类别</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
      <button class="btn sm" id="sfSearch">🔍 查询</button>
      <button class="btn sm primary" id="sfAdd">+ 登记销售</button>
      <button class="btn sm amber" id="sfWeekly">📊 本周汇总</button>
    </div>
    <div id="salesList"></div>
    <div id="weeklyPanel" style="display:none"></div>
  `;

  // 默认日期：本月
  const now = new Date();
  $('#sfDateFrom').value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
  $('#sfDateTo').value = now.toISOString().slice(0,10);

  $('#sfSearch').addEventListener('click', loadSalesList);
  $('#sfAdd').addEventListener('click', () => openSalesForm());
  $('#sfWeekly').addEventListener('click', loadWeeklySummary);
  $('#sfCustomer').addEventListener('keydown', e => { if (e.key === 'Enter') loadSalesList(); });

  await loadSalesList();
}

async function loadSalesList() {
  const params = new URLSearchParams();
  const df = $('#sfDateFrom').value; if (df) params.set('date_from', df);
  const dt = $('#sfDateTo').value; if (dt) params.set('date_to', dt);
  const cu = $('#sfCustomer').value.trim(); if (cu) params.set('customer', cu);
  const cat = $('#sfCategory').value; if (cat) params.set('category', cat);

  const list = await api('GET', '/sales' + (params.toString() ? '?' + params : ''));
  const container = $('#salesList');

  if (!list.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px">暂无销售记录</p>';
    return;
  }

  // 按日期分组
  let html = '<table class="sales-table"><thead><tr><th width="90">日期</th><th width="110">收入类别</th><th>商品名</th><th width="60">图片</th><th width="130">价格/折扣</th><th width="80">充值</th><th width="85">销售收入</th><th width="100">收款方式</th><th width="120">客户</th><th width="120">操作</th></tr></thead><tbody>';
  let lastDate = '';
  let totalSales = 0, totalRecharge = 0;

  for (const s of list) {
    const dateLabel = s.sale_date !== lastDate ? esc(s.sale_date) : '';
    if (dateLabel) {
      if (lastDate) html += `<tr><td colspan="10" style="background:#f9f9f9;font-size:11px;color:#999;text-align:right;padding:2px 10px">小计：销售￥${totalSales.toFixed(2)} / 充值￥${totalRecharge.toFixed(2)}</td></tr>`;
      totalSales = 0; totalRecharge = 0;
      html += `<tr class="sales-date-group"><td colspan="10">📅 ${dateLabel}</td></tr>`;
      lastDate = s.sale_date;
    }
    const sa = parseFloat(s.sales_amount) || 0;
    const ra = parseFloat(s.recharge_amount) || 0;
    totalSales += sa;
    totalRecharge += ra;

    html += `<tr>
      <td>${dateLabel ? '' : ''}</td>
      <td>${esc(s.category)}</td>
      <td style="font-weight:500">${esc(s.product_name || '-')}</td>
      <td>${s.photo_url ? `<img src="${esc(s.photo_url)}" class="sales-img" onerror="this.style.display='none'">` : '-'}</td>
      <td style="font-size:12px;color:var(--muted)">${esc(s.price_note || '-')}</td>
      <td class="r">${ra > 0 ? '￥' + ra.toFixed(2) : ''}</td>
      <td class="r" style="font-weight:600;color:var(--green-700)">￥${sa.toFixed(2)}</td>
      <td>${esc(s.payment_method || '-')}</td>
      <td>${esc(s.customer_name || '-')}</td>
      <td class="sales-actions">
        <button class="btn sm ghost" onclick="printSaleReceipt(${s.id})">🖨️ 打印</button>
        <button class="btn sm ghost" onclick="editSaleRecord(${s.id})">✏️ 编辑</button>
        <button class="btn sm ghost" onclick="deleteSaleRecord(${s.id})">🗑️</button>
      </td>
    </tr>`;
  }
  html += `<tr><td colspan="10" style="background:#e8f0e4;font-size:12px;text-align:right;padding:4px 10px;font-weight:bold;color:var(--green-800)">
    合计：销售￥${totalSales.toFixed(2)} · 充值￥${totalRecharge.toFixed(2)}
  </td></tr></tbody></table>`;
  container.innerHTML = html;
}

function openSalesForm(record) {
  const r = record || {};
  const cats = state._salesCats || [];
  const pmts = state._salesPmts || [];

  const overlay = document.createElement('div');
  overlay.className = 'sales-form-overlay';
  overlay.innerHTML = `
    <div class="sales-form-card">
      <h3>${r.id ? '编辑销售记录' : '登记新销售'}<button class="btn sm ghost" id="sfClose">✕</button></h3>
      <div class="sales-form-grid">
        <div><label>日期 *</label><input type="date" id="efDate" value="${esc(r.sale_date || new Date().toISOString().slice(0,10))}" /></div>
        <div><label>收入类别 *</label><select id="efCat">${cats.map(c => `<option value="${c}" ${r.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="full"><label>商品名称</label><input id="efProduct" value="${esc(r.product_name || '')}" placeholder="如：完美生日盆栽" /></div>
        <div class="full"><label>商品图片</label>
          <div style="display:flex;gap:8px;align-items:center">
            ${r.photo_url ? `<img src="${esc(r.photo_url)}" id="efImgPreview" class="sales-img">` : ''}
            <input type="file" id="efPhoto" accept="image/*" style="font-size:13px" />
            <input type="hidden" id="efPhotoUrl" value="${esc(r.photo_url || '')}" />
          </div>
        </div>
        <div><label>销售收入金额（元）*</label><input type="number" id="efSalesAmt" value="${r.sales_amount || ''}" step="0.01" min="0" placeholder="0.00" /></div>
        <div><label>充值金额（元）</label><input type="number" id="efRechargeAmt" value="${r.recharge_amount || ''}" step="0.01" min="0" placeholder="0.00" /></div>
        <div><label>收款方式 *</label><select id="efPay">${pmts.map(p => `<option value="${p}" ${r.payment_method === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div><label>客户名称</label><input id="efCustomer" value="${esc(r.customer_name || '')}" placeholder="客户姓名/备注" /></div>
        <div class="full"><label>价格/折扣说明</label><textarea id="efPriceNote" placeholder="原价、折扣、套餐说明等">${esc(r.price_note || '')}</textarea></div>
        <div class="full"><label>备注</label><textarea id="efNote" placeholder="其他备注">${esc(r.note || '')}</textarea></div>
      </div>
      <div class="sales-form-btns">
        <button class="btn ghost" id="sfCancel">取消</button>
        <button class="btn primary" id="sfSave">${r.id ? '保存修改' : '登记'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // 图片上传
  const photoInput = $('#efPhoto', overlay);
  if (photoInput) photoInput.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    toast('上传中...');
    const b64 = await readFileAsDataURL(file);
    const r2 = await api('POST', '/upload', { data: b64, folder: 'sales' });
    if (r2.url) {
      $('#efPhotoUrl', overlay).value = r2.url;
      let prev = $('#efImgPreview', overlay);
      if (!prev) { prev = document.createElement('img'); prev.className = 'sales-img'; prev.id = 'efImgPreview'; photoInput.parentNode.insertBefore(prev, photoInput); }
      prev.src = r2.url;
      toast('已上传');
    } else { toast('上传失败'); }
  });

  $('#sfClose', overlay).onclick = () => overlay.remove();
  $('#sfCancel', overlay).onclick = () => overlay.remove();
  $('#sfSave', overlay).onclick = async () => {
    const body = {
      sale_date: $('#efDate', overlay).value,
      category: $('#efCat', overlay).value,
      product_name: $('#efProduct', overlay).value,
      photo_url: $('#efPhotoUrl', overlay).value,
      price_note: $('#efPriceNote', overlay).value,
      recharge_amount: $('#efRechargeAmt', overlay).value,
      sales_amount: $('#efSalesAmt', overlay).value,
      payment_method: $('#efPay', overlay).value,
      customer_name: $('#efCustomer', overlay).value,
      note: $('#efNote', overlay).value,
    };
    if (!body.category || !body.payment_method) return toast('收入类别和收款方式必填');
    if (body.sales_amount === '' && body.recharge_amount === '') return toast('至少填写销售收入或充值金额之一');

    let res;
    if (r.id) {
      res = await api('PUT', `/sales/${r.id}`, body);
    } else {
      res = await api('POST', '/sales', body);
    }
    if (res.error) return toast(res.error);
    toast(r.id ? '已修改' : '已登记');
    overlay.remove();
    await loadSalesList();
  };
}

window.editSaleRecord = async function(id) {
  const r = await api('GET', `/sales/${id}`);
  if (r.error) return toast(r.error);
  openSalesForm(r);
};

window.deleteSaleRecord = async function(id) {
  if (!confirm('确认删除该条销售记录？')) return;
  const r = await api('DELETE', `/sales/${id}`);
  if (r.error) return toast(r.error);
  toast('已删除');
  await loadSalesList();
};

window.printSaleReceipt = function(id) {
  window.open(`/api/sales/${id}/print?token=${state.token}`, '_blank');
};

async function loadWeeklySummary() {
  toast('加载本周数据...');
  const data = await api('GET', '/sales/weekly');
  const panel = $('#weeklyPanel');
  panel.style.display = '';

  const custNames = Object.keys(data.customers || {});
  if (!custNames.length) {
    panel.innerHTML = '<p style="text-align:center;color:var(--muted);padding:30px">本周暂无销售记录</p>';
    return;
  }

  // 拍平所有记录，按日期排序
  const rows = [];
  for (const name of custNames) {
    const c = data.customers[name];
    for (const item of c.items) rows.push(item);
  }
  rows.sort((a, b) => a.sale_date.localeCompare(b.sale_date));

  let html = `<div class="weekly-summary">
    <h3>📊 本周消费汇总（${data.week_start} ~ ${data.week_end}）</h3>
    <table class="weekly-ledger">
      <thead>
        <tr>
          <th>日期</th>
          <th>收入类别</th>
          <th>商品名</th>
          <th>图片</th>
          <th>销售价格及折扣</th>
          <th>充值金额</th>
          <th>销售收入金额</th>
          <th>收款方式</th>
          <th>客户</th>
          <th>销售单编号</th>
          <th>开票抬头</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>`;

  for (const item of rows) {
    const sa = parseFloat(item.sales_amount) || 0;
    const ra = parseFloat(item.recharge_amount) || 0;
    const code = 'SF-' + String(item.id).padStart(4, '0');
    html += `<tr>
      <td>${esc(item.sale_date)}</td>
      <td>${esc(item.category)}</td>
      <td style="text-align:left">${esc(item.product_name || '-')}</td>
      <td>${item.photo_url ? `<img src="${esc(item.photo_url)}" class="wk-img" onerror="this.style.display='none'">` : '<span class="wk-empty">-</span>'}</td>
      <td style="text-align:left">${esc(item.price_note || '-')}</td>
      <td>${ra > 0 ? '￥' + ra.toFixed(2) : ''}</td>
      <td style="font-weight:600;color:#c65c2a">￥${sa.toFixed(2)}</td>
      <td>${esc(item.payment_method || '-')}</td>
      <td style="text-align:left">${esc(item.customer_name || '-')}</td>
      <td>${code}</td>
      <td><span class="wk-empty">-</span></td>
      <td style="text-align:left">${esc(item.note || '')}</td>
    </tr>`;
  }

  html += `</tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right">本周合计</td>
          <td style="text-align:right">￥${data.grand_total_recharge.toFixed(2)}</td>
          <td style="text-align:right">￥${data.grand_total_sales.toFixed(2)}</td>
          <td colspan="5"></td>
        </tr>
      </tfoot>
    </table>
  </div>`;
  panel.innerHTML = html;
}

init();
