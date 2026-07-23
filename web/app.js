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
  settings: null,
  categories: [],
  prices: [],
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const stageName = id => (state.stages.find(s => s.id === +id) || {}).name || ('阶段' + id);
const STATUS_CLASS = { '线索': 'st-lead', '已成交': 'st-deal', '无效': 'st-loss' };
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
function fmt(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt0(n) { return (n || 0).toLocaleString('zh-CN'); }

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
  await switchView('customers');
}

// ---------------- 初始化 ----------------
async function init() {
  $('#loginBtn').addEventListener('click', doLogin);
  $('#loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('POST', '/logout'); } catch {} forceLogin(); });
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
  if (v === 'forms') return renderForms();
  if (v === 'stats') return renderStats();
  if (v === 'prices') return renderPrices();
  if (v === 'settings') return renderSettings();
  if (v === 'users') return renderUsers();
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
    };
    await api('PUT', '/settings', body);
    state.settings = null;
    toast('系统设置已保存');
  });
}

init();
