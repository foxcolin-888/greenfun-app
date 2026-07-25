// 绿趣 · 对外品牌官网交互（杂志式 · 参照 Coze 风格）
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---- 漂浮叶片动效 ----
  const leafLayer = $('#leafLayer');
  if (leafLayer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // 三种真实树叶样式：枫叶 / 桂花叶 / 梧桐叶（含叶柄与叶脉细节）
    const leafPaths = [
      // 枫树叶 —— 五裂尖 lobes + 叶柄
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.4 L13.4 6 L17.2 4.8 L15.4 8.4 L19.8 8.1 L16.4 11 L20.7 12.5 L16.3 13.2 L18.8 16.8 L14.4 15.3 L14.9 19.4 L12.2 16.5 L9.5 19.4 L10 15.3 L5.6 16.8 L8.1 13.2 L3.7 12.5 L8 11 L4.6 8.1 L8.9 8.4 L7.1 4.8 L11 6 Z" fill="currentColor"/><path d="M12 16.5 L12 22.4" stroke="rgba(255,255,255,.5)" stroke-width="1.1" stroke-linecap="round"/></svg>',
      // 桂花树叶 —— 细长披针形 + 主侧脉
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 1.6 C15.2 4.8 16.2 9 15 14 C14.4 17.2 13 20.4 12 22.4 C11 20.4 9.6 17.2 9 14 C7.8 9 8.8 4.8 12 1.6 Z" fill="currentColor"/><path d="M12 3.2 L12 21.4" stroke="rgba(255,255,255,.45)" stroke-width=".9" stroke-linecap="round"/><path d="M12 7 L14.2 6 M12 7 L9.8 6 M12 11 L14.4 10 M12 11 L9.6 10 M12 15 L14 14 M12 15 L10 14" stroke="rgba(255,255,255,.32)" stroke-width=".6" stroke-linecap="round"/></svg>',
      // 梧桐叶 —— 宽掌状多裂 + 掌状叶脉 + 叶柄
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.8 C10.4 5.4 7.8 6.6 5.8 8.2 C3.2 9.8 2.8 13 4.9 16 C6.5 18.6 9 20.6 12 20.6 C15 20.6 17.5 18.6 19.1 16 C21.2 13 20.8 9.8 18.2 8.2 C16.2 6.6 13.6 5.4 12 2.8 Z" fill="currentColor"/><path d="M12 4.6 L12 19.4" stroke="rgba(255,255,255,.42)" stroke-width=".9" stroke-linecap="round"/><path d="M12 8.5 L6.6 7.4 M12 8.5 L17.4 7.4 M12 12.5 L7.4 12.5 M12 12.5 L16.6 12.5" stroke="rgba(255,255,255,.3)" stroke-width=".6" stroke-linecap="round"/><path d="M12 20.2 L12 22.6" stroke="rgba(255,255,255,.5)" stroke-width="1.1" stroke-linecap="round"/></svg>",
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
