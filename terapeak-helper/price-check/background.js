// Terapeak Price Check - one look-up at a time, no AI, read-only. Results open in a results page.
function researchUrl(it, tab) {
  const end = Date.now(), days = 90, start = end - days * 864e5;
  const p = new URLSearchParams({ marketplace: 'EBAY-US', keywords: it.query, dayRange: String(days),
    endDate: String(end), startDate: String(start), categoryId: '0', offset: '0', limit: '50', tabName: tab, tz: 'America/New_York' });
  if (it.condition === 'used') p.set('conditionId', '3000');
  if (it.condition === 'new') p.set('conditionId', '1000');
  return 'https://www.ebay.com/sh/research?' + p.toString();
}
// Client's own Google Form (one paragraph question) -> their results sheet that their Christina reads. Empty = keep results in Chrome only.
const FORM_POST = '';
const FORM_ENTRY = '';
async function report(row) {
  if (!FORM_POST || !FORM_ENTRY) return;
  try { await fetch(FORM_POST, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ [FORM_ENTRY]: JSON.stringify(row) }) }); } catch (e) {}
}
const setStatus = status => chrome.storage.local.set({ status });
let tabId = null;
async function openTab(url) {
  if (tabId !== null) { try { await chrome.tabs.update(tabId, { url }); return; } catch (e) { tabId = null; } }
  const t = await chrome.tabs.create({ url, active: false }); tabId = t.id;
}
async function showResults() {
  if (tabId !== null) { try { await chrome.tabs.remove(tabId); } catch (e) {} tabId = null; }
  await chrome.tabs.create({ url: chrome.runtime.getURL('results.html'), active: true });
}
const num = v => parseFloat(String(v || '').replace(/[^\d.]/g, '')) || 0;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'lookUp') {
      const it = { id: 'pc-' + Date.now(), query: msg.query, condition: msg.condition || '', sku: msg.sku || '' };
      await chrome.storage.local.set({ queue: [it], running: true, cur: { id: it.id, tab: 'SOLD', sold: null } });
      await setStatus('Looking up "' + it.query + '"… about 1 minute. The answer opens in a new tab.');
      await openTab(researchUrl(it, 'SOLD')); reply({}); return;
    }
    if (msg.type === 'setStatus') { await setStatus(msg.text); reply({}); return; }
    if (msg.type === 'getJob') {
      const s = await chrome.storage.local.get(['queue', 'running', 'cur']);
      const it = s.running && (s.queue || [])[0];
      if (!it || !s.cur || s.cur.id !== it.id || !sender.tab || sender.tab.id !== tabId) { reply({ job: null }); return; }
      reply({ job: it, tab: s.cur.tab }); return;
    }
    if (msg.type === 'page') {
      const s = await chrome.storage.local.get(['queue', 'cur', 'history']);
      const it = (s.queue || [])[0];
      if (!it || !s.cur || s.cur.id !== it.id) { reply({}); return; }
      const base = { id: it.id, sku: it.sku, query: it.query, condition: it.condition, at: new Date().toISOString(), url: researchUrl(it, 'SOLD') };
      let row;
      if (!msg.ok) row = { ...base, ok: false, note: msg.note };
      else if (s.cur.tab === 'SOLD') {
        await chrome.storage.local.set({ cur: { id: it.id, tab: 'ACTIVE', sold: msg.data } });
        await openTab(researchUrl(it, 'ACTIVE')); reply({}); return;
      } else {
        const sold = s.cur.sold || {}, act = msg.data || {}, sm = sold.metrics || {};
        const ps = (sold.rows || []).map(r => num(r.price)).filter(n => n > 0).sort((a, b) => a - b);
        const median = ps.length ? (ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2) : null;
        let totalSold = sm.totalSold || '';
        if (!totalSold && sold.qtySum && sold.qtyRows < 50) totalSold = String(sold.qtySum);
        if (!totalSold && sm.sellThrough && (act.metrics || {}).totalActive) totalSold = 'about ' + Math.round(num(sm.sellThrough) / 100 * num(act.metrics.totalActive));
        row = { ...base, ok: true, sold: sm, totalSold, median, active: act.metrics || {}, soldListings: sold.rows || [] };
      }
      await chrome.storage.local.set({ running: false, queue: [], cur: null, last: row, history: [row].concat(s.history || []).slice(0, 30) });
      await report(row);
      await setStatus(row.ok ? 'Done: "' + row.query + '".' : 'Problem: ' + row.note);
      await showResults(); reply({}); return;
    }
  })();
  return true;
});
