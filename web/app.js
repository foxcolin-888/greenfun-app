// 绿趣 · 对外品牌官网交互
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---- 漂浮叶片动效 ----
  const leafLayer = $('#leafLayer');
  if (leafLayer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // 4 种叶子 SVG 路径（简约矢量叶片）
    const leafPaths = [
      // 叶片 1 — 椭圆叶
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C7 4 4 8 4 13c0 5 4 9 8 9s8-4 8-9c0-5-3-9-8-11z" fill="currentColor"/><path d="M12 4v16" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linecap="round"/></svg>',
      // 叶片 2 — 心形叶
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21C8 17 3 13 3 8.5 3 5.5 5.2 3 8 3c1.8 0 3.2 1 4 2.5C12.8 4 14.2 3 16 3c2.8 0 5 2.5 5 5.5C21 13 16 17 12 21z" fill="currentColor"/></svg>',
      // 叶片 3 — 细长柳叶
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C8 5 6 10 6 15s2 8 6 8 6-5 6-8S16 5 12 1z" fill="currentColor"/><path d="M12 4v17" stroke="rgba(255,255,255,.3)" stroke-width=".8" stroke-linecap="round"/></svg>',
      // 叶片 4 — 枫叶三裂
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L9 6l-4-1 1.5 5L3 12l4.5 1L6 18l5-2 5 2-1.5-5L20 12l-3.5-2 1.5-5-4 1L12 2z" fill="currentColor"/></svg>',
    ];
    const leafColors = [
      'rgba(61,122,82,.5)',   // green-500
      'rgba(90,154,110,.42)', // green-400
      'rgba(140,192,154,.38)',// green-300
      'rgba(45,95,63,.35)',   // green-600
    ];
    const LEAF_COUNT = 14;
    for (let i = 0; i < LEAF_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'leaf';
      const size = 16 + Math.random() * 22;          // 16~38px
      const duration = 14 + Math.random() * 16;       // 14~30s
      const delay = -Math.random() * duration;        // 负延迟，错开起始
      const driftX = (Math.random() - 0.5) * 160;     // -80~80px
      const spin = (Math.random() > .5 ? 1 : -1) * (180 + Math.random() * 360);
      const opacity = 0.25 + Math.random() * 0.3;     // 0.25~0.55
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

  // 导航栏滚动效果
  const navbar = $('#navbar');
  const onScroll = () => {
    if (window.scrollY > 40) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 移动端菜单
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

  // 案例作品集筛选
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
        if (filter === 'all' || item.dataset.cat === filter) {
          item.classList.remove('hidden');
        } else {
          item.classList.add('hidden');
        }
      });
    });
  }

  // 表单提交
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

  // 滚动进入动画
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  $$('section > .container > *').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .7s ease, transform .7s ease';
    revealObserver.observe(el);
  });

  document.addEventListener('reveal-ready', () => {
    $$('.revealed').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  });
  document.dispatchEvent(new Event('reveal-ready'));

  // IntersectionObserver 真正触发时增加 revealed 类并移除内联样式
  const origObserve = revealObserver.observe.bind(revealObserver);
  // 已通过 CSS 类管理；这里用 MutationObserver 监听 revealed 类
  const mo = new MutationObserver(muts => {
    muts.forEach(m => {
      if (m.type === 'attributes' && m.target.classList.contains('revealed')) {
        m.target.style.opacity = '1';
        m.target.style.transform = 'translateY(0)';
      }
    });
  });
  $$('section > .container > *').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));
})();
