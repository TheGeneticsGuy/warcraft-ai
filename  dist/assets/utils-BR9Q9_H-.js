(function () {
  const c = document.createElement('link').relList;
  if (c && c.supports && c.supports('modulepreload')) return;
  for (const e of document.querySelectorAll('link[rel="modulepreload"]')) a(e);
  new MutationObserver((e) => {
    for (const r of e)
      if (r.type === 'childList')
        for (const s of r.addedNodes)
          s.tagName === 'LINK' && s.rel === 'modulepreload' && a(s);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(e) {
    const r = {};
    return (
      e.integrity && (r.integrity = e.integrity),
      e.referrerPolicy && (r.referrerPolicy = e.referrerPolicy),
      e.crossOrigin === 'use-credentials'
        ? (r.credentials = 'include')
        : e.crossOrigin === 'anonymous'
          ? (r.credentials = 'omit')
          : (r.credentials = 'same-origin'),
      r
    );
  }
  function a(e) {
    if (e.ep) return;
    e.ep = !0;
    const r = n(e);
    fetch(e.href, r);
  }
})();
async function o(t, c, n, a, e = 'afterbegin', r = !0) {
  r && (c.innerHTML = '');
  const s = await t(n);
  c.insertAdjacentHTML(e, s);
}
function i(t) {
  return async function () {
    const c = await fetch(t);
    if (c.ok) return await c.text();
  };
}
async function l() {
  const t = i('/partials/header.html'),
    c = i('/partials/footer.html'),
    n = document.querySelector('#main-header'),
    a = document.querySelector('#main-footer');
  o(t, n), o(c, a);
}
function u(t) {
  return t
    ? t
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
    : '';
}
function f(t) {
  switch (t.split('-')[0]) {
    case 'dynamic':
      return t.includes('classic1x')
        ? 'classicera'
        : t.includes('classic')
          ? 'classic'
          : 'retail';
    default:
      return 'unknown';
  }
}
function d(t) {
  switch (t) {
    case 'retail':
      return 'dynamic';
    case 'classic':
      return 'dynamic-classic';
    case 'classicera':
      return 'dynamic-classic1x';
    default:
      return 'dynamic';
  }
}
export { d as a, l, f as m, u as n };
