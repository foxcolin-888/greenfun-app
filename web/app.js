// 绿趣 · 对外品牌官网交互（杂志式 · 参照 Coze 风格）
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---- 漂浮叶片动效 ----
  const leafLayer = $('#leafLayer');
  if (leafLayer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // 三种真实树叶：全部带「底部叶柄 + 顶部叶尖」的明确方向性，绝不类似爱心
    const leafPaths = [
      // 枫树叶 —— 五裂尖 lobes + 明显叶柄（柄在底部）
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L14 6.5 L18 5 L16.5 9.5 L21 10.5 L17 13 L19 17 L14.5 15.5 L14 20 L12 16.5 L10 20 L9.5 15.5 L5 17 L7 13 L3 10.5 L7.5 9.5 L6 5 L10 6.5 Z" fill="currentColor"/><path d="M12 16.3 L12 22.6" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>',
      // 桂花树叶 —— 细长披针形（顶部尖、底部叶柄）+ 主侧脉
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 C15 5 16 10 14.5 15 C14 17 13 19 12 20.6 C11 19 10 17 9.5 15 C8 10 9 5 12 2 Z" fill="currentColor"/><path d="M12 3 L12 19.4" stroke="rgba(255,255,255,.45)" stroke-width=".9" stroke-linecap="round"/><path d="M12 7 L14 6 M12 7 L10 6 M12 11 L13.6 10 M12 11 L10.4 10 M12 15 L13.4 14 M12 15 L10.6 14" stroke="rgba(255,255,255,.32)" stroke-width=".55" stroke-linecap="round"/><path d="M12 20.2 L12 22.8" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>',
      // 梧桐叶 —— 宽掌状多裂 + 掌状叶脉 + 底部叶柄
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 C10.5 5 8 5.5 6 7 C3.5 8.5 3 11.5 4.5 14 C5.5 16 8 17.5 12 17.5 C16 17.5 18.5 16 19.5 14 C21 11.5 20.5 8.5 18 7 C16 5.5 13.5 5 12 3 Z" fill="currentColor"/><path d="M12 5 L12 16.8" stroke="rgba(255,255,255,.42)" stroke-width=".9" stroke-linecap="round"/><path d="M12 9 L6.8 7.8 M12 9 L17.2 7.8 M12 13 L7.6 13 M12 13 L16.4 13" stroke="rgba(255,255,255,.3)" stroke-width=".55" stroke-linecap="round"/><path d="M12 17.2 L12 22.8" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>',
    ];
    const leafColors = [
      'rgba(76,175,80,.5)', 'rgba(108,191,99,.42)', 'rgba(139,195,74,.4)', 'rgba(58,114,57,.4)',
    ];
    const LEAF_COUNT = 14;
    for (let i = 0; i < LEAF_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'leaf';
      const size = 16 + Math.random() * 22;
      const duration = 14 + Math.random() * 16;
      const delay = -Math.random() * duration;
      const driftX = (Math.random() - 0.5) * 160;
      const spin = (Math.random() > .5 ? 1 : -1) * (180 + Math.random() * 360);
      const opacity = 0.25 + Math.random() * 0.3;
      el.style.left = (Math.random() * 100) + '%';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.color = leafColors[Math.floor(Math.random() * leafColors.length)];
      el.style.animationDuration = duration + 's';
      el.style.animationDelay = delay + 's';
      el.style.setProperty('--drift-x', driftX + 'px');
      el.style.setProperty('--spin', spin + 'deg');
      el.style.setProperty('--leaf-opacity', opacity);
      el.innerHTML = leafPaths[Math.floor(Math.random() * leafPaths.length)];
      leafLayer.appendChild(el);
    }
  }

  // ---- 导航栏滚动效果 ----
  const navbar = $('#navbar');
  const onScroll = () => {
    if (window.scrollY > 40) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- 移动端菜单 ----
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---- 滚动渐现（干净版：.reveal → .is-visible） ----
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // ---- 作品集筛选 ----
  const tabs = $('#portfolioTabs');
  const grid = $('#portfolioGrid');
  if (tabs && grid) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      grid.querySelectorAll('.portfolio-item').forEach(item => {
        item.classList.toggle('hidden', !(filter === 'all' || item.dataset.cat === filter));
      });
    });
  }

  // ---- 预约表单提交（→ 后端 /api/contact） ----
  const form = $('#bookingForm');
  const success = $('#formSuccess');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (err) {
        console.log('contact api not ready', err);
      }
      form.classList.add('hidden');
      success.classList.remove('hidden');
    });
  }

  // ---- 官网案例（数据驱动，卡片点击进入详情页） ----
  const GRAD = ['g-forest', 'g-moss', 'g-sage', 'g-mint', 'g-leaf', 'g-fern', 'g-brown', 'g-olive'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const coverAttr = (cover, idx) => cover
    ? ' style="background-image:url(\'' + String(cover).replace(/'/g, "\\'") + '\')"'
    : ' class="' + GRAD[idx % GRAD.length] + '"';

  // ===== 全站可自定义文案与外观（后台「站点装修」） =====
  const FONT_PRESETS = {
    serif: { serif:'Noto Serif SC', sans:'Noto Sans SC', link:'' },
    sans:  { serif:'Noto Sans SC',  sans:'Noto Sans SC', link:'' },
    round: { serif:'ZCOOL KuaiLe',  sans:'Noto Sans SC', link:'https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap' },
    kai:   { serif:'LXGW WenKai TC', sans:'Noto Sans SC', link:'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap' },
  };
  function hexToRgb(h){ h=(h||'').replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16)||0; return [n>>16&255, n>>8&255, n&255]; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join(''); }
  function shade(hex, pct){ let [r,g,b]=hexToRgb(hex); const t=pct<0?0:255; const p=Math.abs(pct); r=Math.round((t-r)*p+r); g=Math.round((t-g)*p+g); b=Math.round((t-b)*p+b); return rgbToHex(r,g,b); }
  function buildPalette(base){
    base = base || '#2D5A27';
    return {
      '--primary-green': base, '--secondary-green': shade(base,0.12), '--accent-green': shade(base,0.34),
      '--green-900': shade(base,-0.42), '--green-800': shade(base,-0.30), '--green-700': shade(base,-0.12),
      '--green-600': shade(base,0.02), '--green-500': shade(base,0.14), '--green-400': shade(base,0.28),
      '--green-300': shade(base,0.42), '--green-200': shade(base,0.56), '--green-100': shade(base,0.70), '--green-50': shade(base,0.82),
    };
  }
  function applyAppearance(a){
    a = a || {};
    const p = FONT_PRESETS[a.font_preset] || FONT_PRESETS.serif;
    const root = document.documentElement.style;
    root.setProperty('--font-serif', '"'+p.serif+'", "Songti SC", "SimSun", serif');
    root.setProperty('--font-sans', '"'+p.sans+'", "PingFang SC", "Microsoft YaHei", sans-serif');
    if (p.link && !document.querySelector('link[data-font="'+a.font_preset+'"]')) {
      const l=document.createElement('link'); l.rel='stylesheet'; l.href=p.link; l.setAttribute('data-font', a.font_preset); document.head.appendChild(l);
    }
    const pal = buildPalette(a.primary_color);
    for (const k in pal) root.setProperty(k, pal[k]);
  }
  function setText(sel, val){ const el=$(sel); if(el && val!=null && String(val)!=='') el.textContent=val; }
  function setHtml(sel, val){ const el=$(sel); if(el && val!=null && String(val)!=='') el.innerHTML=val; }
  async function loadSite(){
    let cfg=null;
    try{ const r=await fetch('/api/site'); cfg=await r.json(); }catch(e){ console.log('site api not ready',e); }
    if(!cfg) return;
    applyAppearance(cfg.appearance);
    const h=cfg.hero||{};
    setText('#heroKicker', h.kicker);
    if(h.title) setHtml('#heroTitle', Array.isArray(h.title)? h.title.join('<br>') : h.title);
    setText('#heroDesc', h.desc);
    if(h.cta1){ const b=$('#heroCta1'); if(b){ b.textContent=h.cta1; if(h.cta1_href) b.href=h.cta1_href; } }
    if(h.cta2){ const b=$('#heroCta2'); if(b){ b.textContent=h.cta2; if(h.cta2_href) b.href=h.cta2_href; } }
    if(h.photo){ const ph=$('#heroPhoto'); if(ph){ ph.style.backgroundImage='url("'+h.photo+'")'; ph.style.backgroundSize='cover'; ph.style.backgroundPosition='center'; } }
    const a=cfg.about||{};
    setText('#aboutKicker', a.kicker);
    if(a.title) setHtml('#aboutTitle', Array.isArray(a.title)? a.title.join('<br>') : a.title);
    setText('#aboutLead', a.lead);
    if(a.values){ const ul=$('#aboutValues'); if(ul) ul.innerHTML=a.values.map(v=>'<li><span>'+esc(v.label||'')+'</span>'+esc(v.text||'')+'</li>').join(''); }
    if(a.photo){ const p=$('#aboutPhoto'); if(p){ p.style.backgroundImage='url("'+a.photo+'")'; p.style.backgroundSize='cover'; p.style.backgroundPosition='center'; } }
    setText('#aboutChipTitle', a.chip_title); setText('#aboutChipSub', a.chip_sub); setText('#aboutChipIcon', a.chip_icon||'🌿');
    if(Array.isArray(cfg.stats)){ const g=$('#statsGrid'); if(g) g.innerHTML=cfg.stats.map(s=>'<div class="stat-item reveal"><strong>'+esc(s.num||'')+(s.suffix?('<span>'+esc(s.suffix)+'</span>'):'')+'</strong><span>'+esc(s.label||'')+'</span></div>').join(''); }
    if(Array.isArray(cfg.voices)){ const g=$('#voicesGrid'); if(g) g.innerHTML=cfg.voices.map(v=>'<blockquote class="voice reveal"><p>'+esc(v.quote||'')+'</p><footer><span class="v-avatar">'+esc(v.avatar||(v.name||'·').charAt(0))+'</span><div><strong>'+esc(v.name||'')+'</strong><span>'+esc(v.role||'')+'</span></div></footer></blockquote>').join(''); }
    const f=cfg.founder||{};
    setText('#founderKicker', f.kicker); setText('#founderTitle', f.title); setText('#founderQuote', f.quote);
    if(f.paras){ if(f.paras[0]) setText('#founderPara1', f.paras[0]); if(f.paras[1]) setText('#founderPara2', f.paras[1]); }
    setText('#founderSign', f.sign);
    if(f.photo){ const p=$('#founderPhoto'); if(p){ p.style.backgroundImage='url("'+f.photo+'")'; p.style.backgroundSize='cover'; p.style.backgroundPosition='center'; } }
    setText('#founderCardTitle', f.card_title); setText('#founderCardSub', f.card_sub); setText('#founderCardIcon', f.card_icon||'🌿');
    if(Array.isArray(cfg.timeline)){ const g=$('#timelineList'); if(g) g.innerHTML=cfg.timeline.map(t=>'<div class="timeline-item reveal"><span class="year">'+esc(t.year||'')+'</span><div class="event"><h4>'+esc(t.title||'')+'</h4><p>'+esc(t.desc||'')+'</p></div></div>').join(''); }
    const c=cfg.contact||{};
    setText('#contactAddress', c.address); setText('#contactPhone', c.phone); setText('#contactWechat', c.wechat); setText('#contactHours', c.hours);
    const ft=cfg.footer||{};
    if(ft.desc) setHtml('#footerDesc', ft.desc);
    setText('#footerCopyright', ft.copyright);
    if(Array.isArray(ft.links)){ const fls=$$('.footer-links'); ft.links.slice(0,2).forEach((grp,i)=>{ const fl=fls[i]; if(!fl) return; fl.innerHTML='<h4>'+esc(grp.group||'')+'</h4>'+(grp.items||[]).map(it=>'<a href="'+esc(it.href||'#')+'">'+esc(it.label||'')+'</a>').join(''); }); }
    const ap=cfg.appearance||{};
    if(ap.logo_text){ setText('#logoText', ap.logo_text); setText('#footerLogoText', ap.logo_text); }
    if(ap.logo_icon){ setText('#logoIcon', ap.logo_icon); setText('#footerLogoIcon', ap.logo_icon); }
    if(Array.isArray(cfg.nav)){ const nl=$('#navLinks'); if(nl) nl.innerHTML=cfg.nav.map(n=>'<li><a href="'+esc(n.href||'#')+'"'+(n.cta?' class="nav-cta"':'')+'>'+esc(n.label||'')+'</a></li>').join(''); }
    refreshReveals();
  }

  async function loadCases() {
    const feature = $('#casesFeature');
    const grid = $('#portfolioGrid');
    if (!feature && !grid) return;
    let cases = [];
    try {
      const res = await fetch('/api/cases');
      cases = await res.json();
    } catch (e) { console.log('cases api not ready', e); }
    if (!Array.isArray(cases)) cases = [];

    if (feature) {
      if (cases.length === 0) {
        feature.innerHTML = '<p class="empty-hint">案例即将上线，敬请期待。</p>';
      } else {
        const f = cases[0];
        let html = '<article class="case-feature reveal" data-case-id="' + f.id + '">'
          + '<div class="case-media"' + coverAttr(f.cover, 0) + '></div>'
          + '<div class="case-info"><span class="case-tag">' + esc(f.category || '案例') + '</span>'
          + '<h3>' + esc(f.title) + '</h3><p>' + esc(f.summary || '') + '</p></div></article>';
        const stack = cases.slice(1, 3);
        if (stack.length) {
          html += '<div class="case-stack">';
          stack.forEach((c, i) => {
            html += '<article class="case-mini reveal" data-case-id="' + c.id + '">'
              + '<div class="case-mini-media"' + coverAttr(c.cover, i + 1) + '></div>'
              + '<div class="case-mini-info"><span class="case-tag">' + esc(c.category || '案例') + '</span><h4>' + esc(c.title) + '</h4></div></article>';
          });
          html += '</div>';
        }
        feature.innerHTML = html;
      }
    }

    if (grid) {
      if (cases.length === 0) {
        grid.innerHTML = '<p class="empty-hint">案例即将上线，敬请期待。</p>';
      } else {
        grid.innerHTML = cases.map((c, i) =>
          '<div class="portfolio-item reveal" data-case-id="' + c.id + '" data-cat="' + esc(String(c.category || 'other').toLowerCase()) + '">'
          + '<div class="p-visual"' + coverAttr(c.cover, i) + '></div><h4>' + esc(c.title) + '</h4></div>'
        ).join('');
      }
    }

    $$('[data-case-id]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => { location.href = 'case.html?id=' + el.dataset.caseId; });
    });

    if ('IntersectionObserver' in window) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io2.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
      $$('.reveal').forEach(el => io2.observe(el));
    } else {
      $$('.reveal').forEach(el => el.classList.add('is-visible'));
    }
  }

  // ---- 官网通用内容卡片（服务/课程/伙伴/团队/创始人，点击进入详情页） ----
  async function fetchContents(type) {
    try {
      const res = await fetch('/api/contents?type=' + encodeURIComponent(type));
      const arr = await res.json();
      return Array.isArray(arr) ? arr : [];
    } catch (e) { console.log('contents api not ready', e); return []; }
  }

  function bindContentClicks(root) {
    (root || document).querySelectorAll('[data-content-id]').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => { location.href = 'detail.html?id=' + el.dataset.contentId; });
    });
  }

  function refreshReveals() {
    $$('.reveal').forEach(el => io.observe(el));
  }

  async function loadServices() {
    const feat = $('#svcFeature');
    const list = $('#svcList');
    if (!feat && !list) return;
    const items = await fetchContents('service');
    if (!items.length) return;
    const idx = (i) => String(i + 1).padStart(2, '0');
    if (feat) {
      const f = items[0];
      feat.innerHTML = '<article class="svc-feature reveal" data-content-id="' + f.id + '">'
        + '<div class="svc-feature-media' + coverAttr(f.cover, 0) + '></div>'
        + '<div class="svc-feature-body"><span class="svc-index">' + idx(0) + '</span>'
        + '<h3>' + esc(f.title) + '</h3><p>' + esc(f.summary || '') + '</p></div></article>';
    }
    if (list) {
      list.innerHTML = items.slice(1).map((c, i) =>
        '<article class="svc-row reveal" data-content-id="' + c.id + '">'
        + '<span class="svc-index">' + idx(i + 1) + '</span>'
        + '<div class="svc-row-text"><h4>' + esc(c.title) + '</h4><p>' + esc(c.summary || '') + '</p></div>'
        + '<span class="svc-thumb ' + GRAD[(i + 1) % GRAD.length] + '"></span></article>'
      ).join('');
    }
    bindContentClicks(document);
    refreshReveals();
  }

  async function loadCourses() {
    const g = $('#courseGrid');
    if (!g) return;
    const items = await fetchContents('course');
    if (!items.length) return;
    g.innerHTML = items.map((c, i) =>
      '<article class="course-card reveal" data-content-id="' + c.id + '">'
      + '<div class="course-img ' + GRAD[i % GRAD.length] + '"><span class="course-ico">' + esc(c.icon || '🌿') + '</span></div>'
      + '<h4>' + esc(c.title) + '</h4><p>' + esc(c.summary || '') + '</p>'
      + (c.meta ? '<div class="course-meta">' + esc(c.meta) + '</div>' : '')
      + '</article>'
    ).join('');
    bindContentClicks(g);
    refreshReveals();
  }

  async function loadPartners() {
    const g = $('#partnerGrid');
    if (!g) return;
    const items = await fetchContents('partner');
    if (!items.length) return;
    g.innerHTML = items.map((c) =>
      '<article class="partner-card reveal" data-content-id="' + c.id + '">'
      + '<div class="pc-icon">' + esc(c.icon || '🌿') + '</div><h4>' + esc(c.title) + '</h4>'
      + '<p>' + esc(c.summary || '') + '</p>'
      + (c.meta ? '<div class="pc-price">' + esc(c.meta) + '</div>' : '')
      + '</article>'
    ).join('');
    bindContentClicks(g);
    refreshReveals();
  }

  async function loadTeam() {
    const g = $('#teamGrid');
    if (!g) return;
    const items = await fetchContents('team');
    if (!items.length) return;
    g.innerHTML = items.map((c) => {
      const av = c.icon || String(c.title || '绿').charAt(0);
      return '<div class="team-member reveal" data-content-id="' + c.id + '">'
        + '<div class="tm-avatar">' + esc(av) + '</div>'
        + '<h4>' + esc(c.title) + '</h4><p>' + esc(c.summary || '') + '</p></div>';
    }).join('');
    bindContentClicks(g);
    refreshReveals();
  }

  async function bindFounder() {
    const card = $('#founderCard');
    if (!card) return;
    const items = await fetchContents('founder');
    if (items.length) card.onclick = () => { location.href = 'detail.html?id=' + items[0].id; };
  }

  loadSite();
  loadCases();
  loadServices();
  loadCourses();
  loadPartners();
  loadTeam();
  bindFounder();
})();
