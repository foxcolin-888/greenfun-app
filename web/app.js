// 绿趣 · 对外品牌官网交互
(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

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
