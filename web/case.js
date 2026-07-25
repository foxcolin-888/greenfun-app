// 绿趣 · 案例详情页（数据驱动，从 /api/cases/<id> 拉取）
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const GRAD = ['linear-gradient(145deg,#2e7d32,#1b3a1d)', 'linear-gradient(145deg,#cfe3c5,#8bc09a)', 'linear-gradient(145deg,#aed7ae,#5e9a6d)'];
  const detail = $('#caseDetail');
  const lb = $('#imgLightbox');
  const lbImg = $('#imgLightboxImg');

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
      detail.innerHTML = '<div class="case-missing">未指定案例。</div>';
      return;
    }
    let data;
    try {
      const res = await fetch('/api/cases/' + id);
      data = await res.json();
    } catch (e) {
      detail.innerHTML = '<div class="case-missing">加载失败，请稍后重试。</div>';
      return;
    }
    if (!data || data.error) {
      detail.innerHTML = '<div class="case-missing">未找到该案例，可能已下架。</div>';
      return;
    }

    const coverStyle = data.cover
      ? "background-image:url('" + String(data.cover).replace(/'/g, "\\'") + "')"
      : 'background:' + GRAD[id % GRAD.length];

    let gallery = [];
    if (Array.isArray(data.gallery)) gallery = data.gallery;

    let galleryHtml = '';
    if (gallery.length) {
      galleryHtml = '<div class="case-gallery">' + gallery.map(g =>
        '<img src="' + esc(g) + '" alt="案例图片" loading="lazy">').join('') + '</div>';
    }

    detail.innerHTML =
      '<div class="case-breadcrumb"><a href="index.html#cases">经典案例</a> / ' + esc(data.title) + '</div>' +
      '<div class="case-hero"><div class="case-hero-media" style="' + coverStyle + '"></div>' +
      '<div class="case-hero-overlay"><span class="case-tag">' + esc(data.category || '案例') + '</span>' +
      '<h1>' + esc(data.title) + '</h1><p>' + esc(data.summary || '') + '</p></div></div>' +
      (data.detail ? '<div class="case-body">' + data.detail + '</div>' : '') +
      galleryHtml +
      '<a class="case-back" href="index.html#cases">← 返回案例列表</a>';

    // 图集点击放大
    detail.querySelectorAll('.case-gallery img').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.src));
    });
  }

  load();
})();
