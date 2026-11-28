// QEM Terapeak Helper - runs on www.ebay.com/sh/research (Terapeak). Read-only: it reads the
// numbers on the page and never clicks list, buy, revise or anything that changes eBay.
(() => {
  if (window.__qemTp) return; window.__qemTp = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const send = m => new Promise(r => { try { chrome.runtime.sendMessage(m, r); } catch (e) { r(null); } });
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const low = t => norm(t).toLowerCase();
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  async function waitFor(fn, ms = 60000, every = 500) {
    const end = Date.now() + ms;
    while (Date.now() < end) { let v = null; try { v = fn(); } catch (e) {} if (v) return v; await sleep(every); }
    return null;
  }
  // Terapeak's summary boxes. Each label sits next to its number.
  const LABELS = {
    'avg sold price': 'avgSold', 'sold price range': 'soldRange', 'avg shipping': 'avgShipping',
    'free shipping': 'freeShipping', 'total sold': 'totalSold', 'sell-through': 'sellThrough',
    'total sellers': 'totalSellers', 'total item sales': 'totalSales',
    'avg listing price': 'avgListing', 'listing price range': 'listingRange', 'total active listings': 'totalActive',
    'promoted listings': 'promoted', 'avg watchers': 'avgWatchers', 'total active': 'totalActive'
  };
  const NUM = /(\$\s?[\d,]+(\.\d+)?(\s?[-–—]\s?\$\s?[\d,]+(\.\d+)?)?|[\d,]+(\.\d+)?\s?%|[\d,]+(\.\d+)?\+?)/;
  function metrics() {
    const out = {};
    // Read hidden boxes too: Terapeak hides some summary boxes when the window is narrow.
    const els = [...document.querySelectorAll('div,span,p,h3,h4,dt,dd,td,th,label')];
    for (const el of els) {
      if (el.children.length > 3 || el.closest('table,thead,[role=columnheader]')) continue;
      const t = low(el.innerText || el.textContent);
      const key = LABELS[t]; if (!key || out[key]) continue;
      // Look in the label's own box (parent, then grandparent) for the number that is not the label.
      for (let box = el.parentElement, i = 0; box && i < 3; box = box.parentElement, i++) {
        const txt = norm(box.innerText || box.textContent).replace(new RegExp(t.replace(/[-]/g, '\\-'), 'i'), ' ');
        const m = txt.match(NUM);
        if (m && txt.length < 200) { out[key] = m[0].replace(/\s+/g, ''); break; }
      }
    }
    return out;
  }
  // Listing rows: each has a link to the eBay item. Keep title, price, date, item number.
  function rows(n = 15) {
    const seen = new Set(), out = [];
    for (const a of document.querySelectorAll('a[href*="/itm/"]')) {
      const m = a.href.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/); if (!m || seen.has(m[1])) continue;
      const row = a.closest('tr,[role=row],li,.research-table-row') || a.parentElement;
      const t = norm(row && row.innerText);
      const title = norm(a.innerText) || t.slice(0, 80);
      if (!title) continue;
      seen.add(m[1]);
      const prices = t.match(/\$\s?[\d,]+(\.\d{2})?/g) || [];
      const date = (t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/) || [''])[0];
      out.push({ itemId: m[1], title: title.slice(0, 120), price: prices[0] || '', shipping: prices[1] || '', date, link: 'https://www.ebay.com/itm/' + m[1] });
      if (out.length >= n) break;
    }
    return out;
  }
  // Sum the "Total sold" column of the sold listings table.
  function qtySum() {
    const head = [...document.querySelectorAll('th,[role=columnheader]')].find(h => /^total sold\b/i.test(norm(h.textContent)));
    if (!head) return null;
    const hr = head.closest('tr,[role=row]'); if (!hr) return null;
    const idx = [...hr.children].indexOf(head.closest('th,[role=columnheader]'));
    const table = hr.closest('table,[role=table],[role=grid]') || document;
    let sum = 0, n = 0;
    for (const r of table.querySelectorAll('tr,[role=row]')) {
      if (r === hr || !r.querySelector('a[href*="/itm/"]')) continue;
      const c = r.children[idx]; if (!c) continue;
      const v = parseInt(norm(c.textContent).replace(/,/g, ''), 10);
      if (v > 0) { sum += v; n++; }
    }
    return n ? { sum, n } : null;
  }
  function problem() {
    const t = low(document.body && document.body.innerText).slice(0, 4000);
    if (/sign in|signin/.test(location.href) || /^sign in\b|hello! sign in|sign in to your account/.test(t)) return 'eBay is asking to sign in.';
    if (/captcha|verify (you|that you).{0,20}(human|not a robot)|please verify yourself|security measure/.test(t)) return 'eBay is showing a "verify you are human" check.';
    if (/terapeak.{0,40}(subscribe|subscription|not available)|you don.t have access/.test(t)) return 'Terapeak says no access.';
    return '';
  }
  const noResults = () => /no results found|no sold listings|we didn.t find any|0 results/i.test(document.body.innerText || '');

  async function run(job, tab) {
    await sleep(3000);
    const p = problem(); if (p) return send({ type: 'page', ok: false, fatal: true, note: p });
    // Wait for the summary numbers (or a clear "no results") to load.
    const got = await waitFor(() => noResults() || (Object.keys(metrics()).length >= 2 ? true : null), 60000);
    const p2 = problem(); if (p2) return send({ type: 'page', ok: false, fatal: true, note: p2 });
    if (!got) return send({ type: 'page', ok: false, fatal: true, note: 'Terapeak numbers never showed on the ' + tab + ' tab within 60 seconds (page layout may have changed). Seen: ' + scout().slice(0, 400) });
    await sleep(1500);
    const q = tab === 'SOLD' && !noResults() ? qtySum() : null;
    const data = noResults() ? { metrics: { none: 'no results' }, rows: [] } : { metrics: metrics(), rows: rows(tab === 'SOLD' ? 15 : 5), qtySum: q && q.sum, qtyRows: q && q.n };
    return send({ type: 'page', ok: true, data });
  }
  function scout() {
    const lines = ['URL ' + location.href, 'METRICS ' + JSON.stringify(metrics()), 'QTY ' + JSON.stringify(qtySum()), 'PROBLEM ' + (problem() || 'none')];
    const r = rows(5); lines.push('ROWS ' + r.length + ' ' + JSON.stringify(r).slice(0, 1200));
    const heads = [...document.querySelectorAll('h1,h2,h3,[role=tab],button')].filter(visible).map(e => norm(e.innerText).slice(0, 30)).filter(Boolean);
    lines.push('BUTTONS/HEADINGS ' + [...new Set(heads)].slice(0, 40).join(' | '));
    const all = norm(document.body.textContent), i = all.search(/Avg sold price|Avg listing price/i);
    lines.push('SUMMARY ' + (i >= 0 ? all.slice(Math.max(0, i - 200), i + 900) : 'not found'));
    return lines.join('\n');
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'scout') { reply({ text: scout() }); return; }
  });
  (async () => {
    const r = await send({ type: 'getJob' });
    if (r && r.job) run(r.job, r.tab);
  })();
})();
