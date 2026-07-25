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
})();
