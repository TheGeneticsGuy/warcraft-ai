import { a as L, n as I } from './utils-BR9Q9_H-.js';
/* empty css              */ import { g as x } from './blizzAPI-ZIwjDhYC.js';
const p = document.getElementById('realm-detail-name'),
  f = document.getElementById('realm-detail-region'),
  C = document.getElementById('realm-detail-type'),
  d = document.getElementById('realm-detail-status'),
  $ = document.getElementById('realm-detail-population'),
  z = document.getElementById('realm-detail-category'),
  u = document.getElementById('realm-detail-error'),
  h = document.getElementById('realm-detail-info');
console.log('SUCCESFULLY LOADED');
function l(a) {
  console.error('Realm Detail Error:', a),
    (p.textContent = 'Error'),
    (h.style.display = 'none'),
    (u.textContent = a),
    (u.style.display = 'block');
}
async function A() {
  const a = window.location.pathname.split('/').filter((e) => e !== '');
  if (a.length !== 4 || a[0] !== 'realms') {
    l('Invalid URL format.');
    return;
  }
  const s = a[1],
    o = a[2],
    c = a[3];
  (f.textContent = s.toUpperCase()),
    (C.textContent = o.charAt(0).toUpperCase() + o.slice(1)),
    (p.textContent = `Loading ${c}...`);
  const y = await x();
  if (!y) {
    l('Could not authenticate with Battle.net API.');
    return;
  }
  const g = L(o);
  if (g === 'unknown') {
    l(`Unknown realm type: ${o}`);
    return;
  }
  const U = `${g}-${s}`,
    E = new URL(
      `https://${s}.api.blizzard.com/data/wow/search/connected-realm`,
    );
  E.searchParams.append('namespace', U);
  try {
    const e = await fetch(E.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${y}`,
        'Content-Type': 'application/json',
      },
    });
    if (!e.ok) {
      const n = await e
        .json()
        .catch(() => ({ message: `API Error: ${e.status}` }));
      throw new Error(n.message || `API Error: ${e.status}`);
    }
    const w = await e.json();
    let t = null;
    for (const n of w.results) {
      const r = n.data.realms[0],
        m = r.name.en_US || Object.values(r.name)[0];
      if (m && I(m) === c) {
        const i = 'en_US';
        t = {
          name: r.name[i] || m,
          status: n.data.status.type,
          statusLocalized: n.data.status.name[i] || n.data.status.name.en_US,
          popLocalized:
            n.data.population.name[i] || n.data.population.name.en_US,
          categoryLocalized: r.category[i] || r.category.en_US,
          region: s.toUpperCase(),
          type: o,
        };
        break;
      }
    }
    t
      ? ((p.textContent = t.name),
        (f.textContent = t.region),
        (C.textContent = t.type.charAt(0).toUpperCase() + t.type.slice(1)),
        (d.textContent = t.statusLocalized),
        (d.className = 'realm-status'),
        d.classList.add(t.status === 'UP' ? 'status-up' : 'status-down'),
        ($.textContent = t.popLocalized),
        (z.textContent = t.categoryLocalized),
        (h.style.display = 'block'),
        (u.style.display = 'none'))
      : l(`Realm with slug "${c}" not found in region "${s}" for type "${o}".`);
  } catch (e) {
    l(`Failed to fetch realm details: ${e.message}`);
  }
}
document.addEventListener('DOMContentLoaded', A);
