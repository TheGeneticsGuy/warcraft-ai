import { m as R, n as U, l as k } from './utils-BR9Q9_H-.js';
import { g as A } from './blizzAPI-ZIwjDhYC.js';
const q = [
    'en_US',
    'ko_KR',
    'fr_FR',
    'de_DE',
    'zh_CN',
    'es_ES',
    'zh_TW',
    'es_MX',
    'ru_RU',
    'pt_BR',
    'it_IT',
  ],
  B = ['us', 'eu', 'kr', 'tw'],
  $ = {
    'retail-button': 'dynamic',
    'classic-button': 'dynamic-classic',
    'classicEra-button': 'dynamic-classic1x',
  };
let c = '',
  r = '',
  m = '',
  C = '',
  d = null;
const x = document.querySelectorAll('.icon-menu'),
  D = document.querySelector('.navigation'),
  y = document.querySelectorAll('.filter-button'),
  L = document.querySelector('#region-select'),
  f = document.querySelector('#locale-select'),
  u = document.querySelector('#lower_main_grid'),
  h = document.querySelector('#num-realms');
document.querySelector('#realm-details');
x.forEach((a) => {
  a.addEventListener('click', () => {
    D.classList.toggle('open'), a.classList.toggle('open');
  });
});
async function P(a) {
  if (!c || !m || !r)
    return (
      console.error('Missing required parameters for API call:', {
        currentRegion: c,
        currentNamespace: m,
        currentLocale: r,
      }),
      null
    );
  const s = `${m}-${c}`,
    e = new URL(
      `https://${c}.api.blizzard.com/data/wow/search/connected-realm`,
    );
  e.searchParams.append('namespace', s), e.searchParams.append('locale', r);
  try {
    const n = await fetch(e.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${a}`,
        'Content-Type': 'application/json',
      },
    });
    if (!n.ok) {
      const t = await n
        .json()
        .catch(() => ({ message: `HTTP Error! status: ${n.status}` }));
      throw (
        (console.error('API Error Response:', t),
        new Error(t.message || `Error! status: ${n.status}`))
      );
    }
    return (await n.json()).results
      .map((t) => {
        const o = t.data.realms[0],
          E = o.name[r] || o.name.en_US,
          T = t.data.status.type,
          _ = t.data.status.name[r] || t.data.status.name.en_US,
          I = t.data.population.name[r] || t.data.population.name.en_US,
          z = o.type.name[r] || o.type.name.en_US,
          w = o.category[r] || o.category.en_US;
        return E
          ? {
              name: E,
              status: T,
              statusLocalized: _,
              popLocalized: I,
              typeLocalized: z,
              categoryLocalized: w,
            }
          : null;
      })
      .filter((t) => {
        var o;
        return t !== null && !((o = t.name) != null && o.startsWith('US PS'));
      })
      .sort((t, o) => t.name.localeCompare(o.name));
  } catch (n) {
    return console.error('Error fetching or processing realms:', n), null;
  }
}
function p(a, s) {
  const e = y[a];
  e &&
    (d && d.classList.remove('selected'),
    e.classList.add('selected'),
    (d = e),
    (m = $[d.id]),
    (C = R(m)),
    s && (localStorage.setItem('selectedButtonId', d.id), g()));
}
function v(a) {
  if (((u.innerHTML = ''), !a || a.length === 0)) {
    (u.innerHTML =
      '<p class="error-message">No realms found matching your criteria, or an error occurred.</p>'),
      (h.textContent = '0');
    return;
  }
  const s = document.createElement('div');
  s.classList.add('realm-item', 'grid-header'),
    (s.innerHTML = `
        <div class="realm-name">REALM</div>
        <div class="realm-status">STATUS</div>
        <div class="realm-population">POPULATION</div>
    `),
    u.appendChild(s),
    a.forEach((e) => {
      const n = document.createElement('div');
      n.classList.add('realm-item');
      const l = document.createElement('a');
      l.classList.add('realm-name', 'realm-link'), (l.textContent = e.name);
      const S = U(e.name);
      (l.href = `/realms/${c}/${C}/${S}/`),
        l.addEventListener('click', (o) => {
          console.log('Link clicked:', l.href);
        });
      const i = document.createElement('div');
      i.classList.add('realm-status'),
        (i.textContent = e.statusLocalized),
        i.classList.toggle('status-up', e.status === 'UP'),
        i.classList.toggle('status-down', e.status === 'DOWN');
      const t = document.createElement('div');
      t.classList.add('realm-population'),
        (t.textContent = e.popLocalized),
        n.appendChild(l),
        n.appendChild(i),
        n.appendChild(t),
        n.addEventListener('click', (o) => {
          o.target;
        }),
        u.appendChild(n);
    }),
    (h.textContent = a.length);
}
function M() {
  let a = localStorage.getItem('selectedButtonId') || 'retail-button';
  const s = document.querySelector(`#${a}`);
  if (s) {
    const e = Array.from(y).indexOf(s);
    p(e !== -1 ? e : 0, !1);
  } else p(0, !1);
  (c = localStorage.getItem('selectedRegion') || B[0]),
    (L.value = c),
    (r = localStorage.getItem('selectedLocale') || q[0]),
    (f.value = r),
    y.forEach((e, n) => {
      e.addEventListener('click', () => p(n, !0));
    }),
    L.addEventListener('change', () => {
      (c = L.value), localStorage.setItem('selectedRegion', c), g();
    }),
    f.addEventListener('change', () => {
      (r = f.value), localStorage.setItem('selectedLocale', r), g();
    });
}
async function g() {
  (u.innerHTML = '<p>Loading realms...</p>'), (h.textContent = '...');
  const a = await A();
  if (!a) {
    console.error('Failed to get access token. Cannot display realms.'),
      v(null);
    return;
  }
  const s = await P(a);
  v(s);
}
document.addEventListener('DOMContentLoaded', () => {
  M(), g();
});
k();
