// 绿趣 · 通用内容详情页（服务 / 课程活动 / 合作伙伴 / 团队 / 创始人）
// 数据驱动，从 /api/contents/<id> 拉取；?id= 指定内容。
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const GRAD = [
    'linear-gradient(145deg,#2e7d32,#1b3a1d)',
    'linear-gradient(145deg,#cfe3c5,#8bc09a)',
    'linear-gradient(145deg,#aed7ae,#5e9a6d)',
    'linear-gradient(145deg,#5d4037,#2e7d32)'
  ];
  const detail = $('#contentDetail');
  const lb = $('#imgLightbox');
  const lbImg = $('#imgLightboxImg');

  // 类型 -> { 名称, 首页锚点 }
  const TYPE_MAP = {
    service: { name: '服务项目', anchor: 'index.html#services' },
    course:  { name: '美学课堂', anchor: 'index.html#classroom' },
    partner: { name: '加盟合作', anchor: 'index.html#partner' },
    team:    { name: '核心团队', anchor: 'index.html#team' },
    founder: { name: '关于绿趣', anchor: 'index.html#about' }
  };

  if (lb) {
    lb.addEventListener('click', () => lb.classList.remove('show'));
  }
  function openLightbox(src) {
    if (!lb) return;
    lbImg.src = src;
    lb.classList.add('show');
  }

  function getId() {
    const p = new URLSearchParams(location.search);
    return parseInt(p.get('id') || '', 10);
  }

  async function load() {
    const id = getId();
    if (!id) {
      detail.innerHTML = '<div class="case-missing">未指定内容。</div>';
      return;
    }
    let data;
    try {
      const res = await fetch('/api/contents/' + id);
      data = await res.json();
    } catch (e) {
      detail.innerHTML = '<div class="case-missing">加载失败，请稍后重试。</div>';
      return;
    }
    if (!data || data.error) {
      detail.innerHTML = '<div class="case-missing">未找到该内容，可能已下架。</div>';
      return;
    }

    const type = data.type || '';
    const meta = TYPE_MAP[type] || { name: '绿趣', anchor: 'index.html' };

    const coverStyle = data.cover
      ? "background-image:url('" + String(data.cover).replace(/'/g, "\\'") + "')"
      : 'background:' + GRAD[id % GRAD.length];

    let gallery = [];
    if (Array.isArray(data.gallery)) gallery = data.gallery;

    let galleryHtml = '';
    if (gallery.length) {
      galleryHtml = '<div class="case-gallery">' + gallery.map(g =>
        '<img src="' + esc(g) + '" alt="' + esc(data.title) + '" loading="lazy">').join('') + '</div>';
    }

    document.title = (data.title || '详情') + ' · 绿趣植物空间艺术';
    detail.innerHTML =
      '<div class="case-breadcrumb"><a href="' + meta.anchor + '">' + esc(meta.name) + '</a> / ' + esc(data.title) + '</div>' +
      '<div class="case-hero"><div class="case-hero-media" style="' + coverStyle + '"></div>' +
      '<div class="case-hero-overlay"><span class="c-kicker">' + esc(meta.name) + '</span>' +
      '<h1>' + esc(data.title) + '</h1><p>' + esc(data.summary || '') + '</p></div></div>' +
      (data.detail ? '<div class="case-body">' + data.detail + '</div>' : '') +
      galleryHtml +
      '<a class="case-back" href="' + meta.anchor + '">← 返回' + esc(meta.name) + '</a>';

    detail.querySelectorAll('.case-gallery img').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.src));
    });
  }

  load();
})();
