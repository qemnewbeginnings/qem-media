// BootyBoots Terapeak Helper - background. Reads Christina's Terapeak list from Kim's Google web app,
// looks each one up on Terapeak (sold tab, then active tab) in its own window, and sends results back. Read-only.
// The web app link is pasted once in the pop-up (Settings). No code editing needed.
importScripts('christina.js');
const CHECK_MIN = 1;  // D 11-27: check the list every minute so look-ups start right away
const GAP_MIN = 40, GAP_MAX = 100;   // seconds between look-ups
const DEFAULT_CAP = 60;              // look-ups a day
const OPEN_FROM = 7*60, OPEN_TO = 22*60; // 7am to 10pm
async function webapp() { const s = await chrome.storage.local.get(['webapp']); return (s.webapp || '').trim(); }

function researchUrl(it, tab) {
  const end = Date.now(), days = it.days || 90, start = end - days * 864e5;
  const p = new URLSearchParams({ marketplace: 'EBAY-US', keywords: it.query, dayRange: String(days),
    endDate: String(end), startDate: String(start), categoryId: String(it.categoryId || 0),
    offset: '0', limit: '50', tabName: tab, tz: 'America/New_York' });
  if (it.condition === 'used') p.set('conditionId', '3000');
  if (it.condition === 'new') p.set('conditionId', '1000');
  return 'https://www.ebay.com/sh/research?' + p.toString();
}
const mins = d => d.getHours()*60 + d.getMinutes();
const quietReason = (d = new Date()) => (mins(d) < OPEN_FROM || mins(d) >= OPEN_TO) ? 'outside Terapeak hours (7am to 10pm)' : '';
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); };
const setStatus = status => chrome.storage.local.set({ status });
let tabId = null, winId = null;

async function report(row) {
  const url = await webapp(); if (!url) return;
  try { await fetch(url, { method: 'POST', body: new URLSearchParams({ result: JSON.stringify(row) }) }); } catch (e) {}
}
async function checkQueue(manual) {
  const s = await chrome.storage.local.get(['auto', 'running', 'doneIds', 'failedIds', 'day', 'cap']);
  if ((!s.auto && !manual) || s.running) return;
  const why = quietReason();
  if (why && !manual) { await setStatus('Auto is on. Waiting: ' + why + '.'); return; }
  const cap = s.cap || DEFAULT_CAP;
  const day = (s.day && s.day.date === today()) ? s.day : { date: today(), n: 0 };
  const left = cap - day.n;
  if (left <= 0) { await setStatus(`Auto is on. Today's limit reached (${day.n} look-ups). More tomorrow.`); return; }
  let list = [];
  const url = await webapp();
  if (!url) { await setStatus('Paste the web app link in Settings first.'); return; }
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('list ' + r.status);
    const j = await r.json(); list = Array.isArray(j) ? j : (j.items || []);
  } catch (e) { await setStatus("Couldn't read Christina's Terapeak list (" + String(e).slice(0, 60) + '). Will try again.'); return; }
  const skip = new Set([...(s.doneIds || []), ...(s.failedIds || [])]);
  const q = list.filter(it => it.id && it.query && !skip.has(it.id)).slice(0, left);
  const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!q.length) { await setStatus('Auto is on. No Terapeak look-ups waiting (checked ' + stamp + ').'); return; }
  await start(q, day, true);
}
async function start(q, day, auto) {
  await chrome.storage.local.set({ queue: q, running: true, auto_run: auto, day: day || { date: today(), n: 0 }, cur: null });
  await next();
}
const ensureAlarm = () => chrome.alarms.create('tpQueue', { periodInMinutes: CHECK_MIN });
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tpQueue') checkQueue(false); });

async function closeWindow() {
  if (winId !== null) { try { await chrome.windows.remove(winId); } catch (e) {} winId = null; tabId = null; }
}
async function openTab(url, msg) {
  await setStatus(msg);
  if (tabId !== null) { try { await chrome.tabs.update(tabId, { url }); return; } catch (e) { tabId = null; } }
  // Its own window behind yours, so it never takes over the screen.
  const w = await chrome.windows.create({ url, focused: false, width: 1900, height: 1000 });
  winId = w.id; tabId = w.tabs[0].id;
}
async function next() {
  const s = await chrome.storage.local.get(['queue', 'running']);
  if (!s.running) return;
  const q = s.queue || [];
  if (!q.length) { await chrome.storage.local.set({ running: false, cur: null }); await closeWindow(); await setStatus('All Terapeak look-ups done.'); return; }
  const it = q[0];
  await chrome.storage.local.set({ cur: { id: it.id, tab: 'SOLD', sold: null } });
  await openTab(researchUrl(it, 'SOLD'), 'Terapeak sold: ' + (it.sku ? it.sku + ' ' : '') + it.query);
}
async function finish(row, sender) {
  const s = await chrome.storage.local.get(['queue', 'doneIds', 'failedIds', 'day', 'log', 'auto_run']);
  const q = (s.queue || []).filter(it => it.id !== row.id);
  const upd = { queue: q, cur: null, log: (s.log || []).concat([row]).slice(-300) };
  if (row.ok) {
    upd.doneIds = (s.doneIds || []).concat([row.id]).slice(-5000);
    const day = (s.day && s.day.date === today()) ? s.day : { date: today(), n: 0 };
    upd.day = { date: day.date, n: day.n + 1 };
  } else upd.failedIds = (s.failedIds || []).concat([row.id]).slice(-2000);
  if (row.source === 'kim') {
    try { row.card = christinaCard(row, !!row.heavy); } catch (e) { row.card = null; }
    const h = await chrome.storage.local.get(['history']);
    const num = v => parseFloat(String(v || '').replace(/[^\d.]/g, '')) || 0;
    const sm = row.sold || {};
    upd.history = [{ id: row.id, at: row.at, card: row.card }].concat(h.history || []).slice(0, 30);
  }
  await chrome.storage.local.set(upd);
  await report(row);
  if (row.source === 'kim') { try { await chrome.tabs.create({ url: chrome.runtime.getURL('results.html'), active: true }); } catch (e) {} }
  if (!row.ok && row.fatal) {
    // Signed out, a "verify you're human" page, or the page layout changed: stop and turn Auto off.
    await chrome.storage.local.set({ running: false, auto: false }); await closeWindow();
    await setStatus('Stopped: ' + row.note + ' Auto is now OFF. Tap "Copy report" and send it to D.'); return;
  }
  if (!q.length) { await next(); return; }
  const wait = GAP_MIN + Math.floor(Math.random() * (GAP_MAX - GAP_MIN));
  await setStatus((row.ok ? 'Done: ' : 'Skipped: ') + (row.sku || row.query) + '. Next in ' + wait + ' seconds…');
  const tid = (sender.tab && sender.tab.id) || tabId;
  try { await chrome.scripting.executeScript({ target: { tabId: tid }, args: [wait * 1000], func: ms => { setTimeout(() => chrome.runtime.sendMessage({ type: 'next' }), ms); } }); }
  catch (e) { await next(); }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'checkNow') { await checkQueue(true); reply({}); return; }
    if (msg.type === 'tryOne') {
      const it = { id: 'kim-' + Date.now(), query: msg.query, condition: msg.condition || '', sku: msg.sku || '', heavy: !!msg.heavy, source: 'kim' };
      // Kim's own look-up goes first; anything Auto was doing carries on after it. Keeps today's count.
      const s = await chrome.storage.local.get(['queue', 'running', 'day', 'auto_run']);
      const day = (s.day && s.day.date === today()) ? s.day : null;
      await start([it].concat(s.running ? (s.queue || []) : []), day, s.running ? !!s.auto_run : false); reply({}); return;
    }
    if (msg.type === 'setAuto') { await chrome.storage.local.set({ auto: !!msg.on }); ensureAlarm(); if (msg.on) await checkQueue(false); reply({}); return; }
    if (msg.type === 'setStatus') { await setStatus(msg.text); reply({}); return; }
    if (msg.type === 'getJob') {
      const s = await chrome.storage.local.get(['queue', 'running', 'cur']);
      const it = s.running && (s.queue || [])[0];
      if (!it || !s.cur || s.cur.id !== it.id || !sender.tab || sender.tab.id !== tabId) { reply({ job: null }); return; }
      reply({ job: it, tab: s.cur.tab }); return;
    }
    if (msg.type === 'page') {
      const s = await chrome.storage.local.get(['queue', 'cur']);
      const it = (s.queue || [])[0];
      if (!it || !s.cur || s.cur.id !== it.id) { reply({}); return; }
      const base = { id: it.id, source: it.source || 'christina', heavy: !!it.heavy, sku: it.sku || '', item: it.item || '', batch: it.batch || '', query: it.query,
        condition: it.condition || '', days: it.days || 90, at: new Date().toISOString() };
      if (!msg.ok) { await finish({ ...base, ok: false, fatal: !!msg.fatal, step: s.cur.tab, note: msg.note }, sender); reply({}); return; }
      if (s.cur.tab === 'SOLD') {
        await chrome.storage.local.set({ cur: { id: it.id, tab: 'ACTIVE', sold: msg.data } });
        await openTab(researchUrl(it, 'ACTIVE'), 'Terapeak active: ' + (it.sku ? it.sku + ' ' : '') + it.query);
        reply({}); return;
      }
      const sold = s.cur.sold || {}, act = msg.data || {};
      const ps = (sold.rows || []).map(r => parseFloat(String(r.price).replace(/[$,]/g, ''))).filter(n => n > 0).sort((a, b) => a - b);
      const median = ps.length ? (ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2) : null;
      const num = v => parseFloat(String(v || '').replace(/[^\d.]/g, '')) || 0;
      const sm = sold.metrics || {};
      // If Total sold didn't show, estimate it: eBay's sell-through = sold / active listings.
      // Terapeak has no Total sold box: add up each sold listing's own Total sold column (page 1, up to 50 listings).
      if (!sm.totalSold && sold.qtySum) sm.totalSold = String(sold.qtySum) + (sold.qtyRows >= 50 ? '+' : '');
      const soldEstimate = (!sm.totalSold && sm.sellThrough && (act.metrics || {}).totalActive)
        ? Math.round(num(sm.sellThrough) / 100 * num(act.metrics.totalActive)) : null;
      const row = { ...base, ok: true, sold: sm, soldEstimate, soldMedianTop: median, active: act.metrics || {}, soldListings: sold.rows || [],
        activeListings: (act.rows || []).slice(0, 5), url: researchUrl(it, 'SOLD') };
      await finish(row, sender); reply({}); return;
    }
    if (msg.type === 'next') { if (sender.tab) tabId = sender.tab.id; await next(); reply({}); return; }
  })();
  return true;
});
