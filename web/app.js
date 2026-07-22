// 绿趣 · 家装阳台植物花园全流程管理 —— 前端逻辑（原生 JS，无第三方依赖）
const API = '/api';
const state = {
  view: 'customers',
  customers: [],
  stages: [],
  current: null,        // 详情客户 {customer, stages, log}
  activeStage: 1,
  filters: { q: '', stage: '', owner: '', status: '' },
  operator: localStorage.getItem('gf_operator') || '',
  activeFormFile: null,
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const stageName = id => (state.stages.find(s => s.id === +id) || {}).name || ('阶段' + id);
const STATUS_CLASS = { '线索': 'st-lead', '已成交': 'st-deal', '无效': 'st-loss' };

async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(API + path, opt);
  if (!r.ok && r.status !== 404) throw new Error('请求失败 ' + r.status);
  try { return await r.json(); } catch { return {}; }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ---------------- 初始化 ----------------
async function init() {
  state.stages = await api('GET', '/stages');
  const op = $('#operator'); op.value = state.operator;
  op.addEventListener('input', () => { state.operator = op.value.trim(); localStorage.setItem('gf_operator', state.operator); });
  $$('#nav .nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('#drawerMask').addEventListener('click', closeDrawer);
  await switchView('customers');
}
async function switchView(v) {
  state.view = v;
  $$('#nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'customers') return renderCustomers();
  if (v === 'kanban') return renderKanban();
  if (v === 'forms') return renderForms();
  if (v === 'stats') return renderStats();
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
    toast('已创建');
    openCustomer(c.id);
  });
}

async function openCustomer(id) {
  const d = await api('GET', `/customers/${id}`);
  if (d.error) return toast('客户不存在');
  state.current = d; state.activeStage = d.customer.current_stage || 1;
  openDrawer();
  renderDetail();
}

function renderDetail() {
  const { customer: c, stages, log } = state.current;
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
          <button class="btn ghost" id="delCust">删除客户</button>
        </div>
      </div>

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
  $('#delCust').addEventListener('click', async () => {
    if (!confirm('确认删除该客户及其所有阶段数据？')) return;
    await api('DELETE', `/customers/${c.id}`); toast('已删除'); closeDrawer(); renderCustomers();
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
    <div class="grid">
      ${st.fields.map(f => renderField(f, data[f.key])).join('')}
    </div>
      <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
      <button class="btn" id="saveStage">保存本阶段登记</button>
      ${st.id < 8 ? `<button class="btn amber" id="advStage">推进到「${esc((state.stages.find(s=>s.id===st.id+1)||st).name)}」 →</button>` : ''}
      <span id="stageUpd" style="font-size:12px;color:var(--muted)">${state.current.stages[st.id]?('上次更新：'+esc(state.current.stages[st.id].updated_at)+' · '+esc(state.current.stages[st.id].operator||'')):''}</span>
    </div>`;
  $('#openTpl').addEventListener('click', e => { e.preventDefault(); switchView('forms'); setTimeout(()=>selectForm(st.form_file), 60); });
  $('#saveStage').addEventListener('click', () => saveStage(st));
  const adv = $('#advStage');
  if (adv) adv.addEventListener('click', () => advanceStage(st));
}

function renderField(f, v) {
  const id = 'sf_' + f.key;
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
    if (f.type === 'checkbox') {
      data[f.key] = $$(`[data-k="${f.key}"]:checked`).map(x => x.value);
    } else if (f.type === 'radio') {
      const el = $(`[name="${f.key}"]:checked`); data[f.key] = el ? el.value : '';
    } else {
      const el = $(`[data-k="${f.key}"]`); if (el) data[f.key] = el.value;
    }
  });
  return data;
}

async function saveStage(st) {
  const data = gatherStage(st);
  await api('PUT', `/customers/${state.current.customer.id}/stage/${st.id}`, { data, operator: state.operator });
  state.current.stages[st.id] = { data, operator: state.operator, updated_at: new Date().toLocaleString('zh-CN') };
  toast(`已保存【${st.name}】`);
  renderStageBody();
  $$('#stageTabs .stage-tab').forEach(x => x.classList.toggle('done', !!state.current.stages[+x.dataset.st]));
}
async function advanceStage(st) {
  const next = st.id + 1;
  await api('PUT', `/customers/${state.current.customer.id}`, { current_stage: next, operator: state.operator });
  state.current.customer.current_stage = next;
  state.activeStage = next;
  toast(`已推进到【${stageName(next)}】`);
  renderDetail();
}
async function saveProfile() {
  const c = state.current.customer;
  const payload = {};
  $$('[data-p]').forEach(el => payload[el.dataset.p] = el.value);
  payload.current_stage = +$('#pStage').value;
  payload.operator = state.operator;
  await api('PUT', `/customers/${c.id}`, payload);
  Object.assign(c, payload);
  toast('档案已保存');
  renderDetail();
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
      <div class="stat-card"><div class="num">¥${fmt(s.total_quote)}</div><div class="lbl">累计报价额</div></div>
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
      <div class="bar-row"><span class="bl">累计报价</span><div class="bar-track"><div class="bar-fill" style="width:100%"></div></div><span class="bv">¥${fmt(s.total_quote)}</span></div>
      <div class="bar-row"><span class="bl">累计已收</span><div class="bar-track"><div class="bar-fill" style="width:${s.total_quote?Math.min(100,s.total_received/s.total_quote*100):0}%"></div></div><span class="bv">¥${fmt(s.total_received)}</span></div>
      <div class="bar-row"><span class="bl">累计结算</span><div class="bar-track"><div class="bar-fill" style="width:${s.total_quote?Math.min(100,s.total_settle/s.total_quote*100):0}%"></div></div><span class="bv">¥${fmt(s.total_settle)}</span></div>
    </div>`;
  $('#exCsv').addEventListener('click', () => window.location = API + '/export/csv');
  $('#exJson').addEventListener('click', () => window.location = API + '/export/json');
}
function fmt(n) { return (n||0).toLocaleString('zh-CN'); }

init();
