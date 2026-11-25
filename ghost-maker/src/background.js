// QEM Ghost Maker - background. One item at a time, slow on purpose, stops at the first problem.
const QUEUE_URL = 'https://raw.githubusercontent.com/qemnewbeginnings/qem-media/refs/heads/claude/project-thread-00r6ag/ghost-queue/queue.json';
const EDIT_URL = id => 'https://app.nifty.ai/inventory/edit/' + id;
const CHECK_MIN = 20;
const GAP_MIN = 45, GAP_MAX = 90; // seconds between items
const DEFAULT_CAP = 10;           // ghosts a day (5 credits each = 50 credits)
const SUBS_URL = 'https://app.nifty.ai/settings/subscription';
const GHOST_COST = 5;
// Google Form "QEM ghost credits" (one short-answer question). Filled in 11-24; empty = no report.
const FORM_POST = 'https://docs.google.com/forms/d/e/1FAIpQLSfmmdzvJ0m3RE2JZpAH2NeFM4asDwEUWghDrEVpFXyh6gf8VQ/formResponse';
const FORM_ENTRY = 'entry.573921451';
async function reportCredits(c, when) {
  if (!FORM_POST || !FORM_ENTRY) return;
  const line = `monthly=${c.monthly} bonus=${c.bonus} total=${c.monthly + c.bonus} when=${when} at=${new Date().toISOString()}`;
  try { await fetch(FORM_POST, { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ [FORM_ENTRY]: line }) }); } catch (e) {}
}
// Stay out of the way of Chrome Claude runs (9:30am, 11:45am, 1:45pm, 2:30pm, 3:45pm, 5pm, 9pm, 9:30pm) and of the night.
const BLACKOUT = [[9*60+15, 10*60+20], [11*60+30, 12*60+40], [13*60+30, 15*60+20], [15*60+30, 16*60+40], [16*60+45, 17*60+50]];
const OPEN_FROM = 8*60, OPEN_TO = 21*60; // 8am to 9pm (9pm = Chrome Claude)
const mins = d => d.getHours()*60 + d.getMinutes();
function quietReason(d = new Date()) {
  const m = mins(d);
  if (m < OPEN_FROM || m >= OPEN_TO) return 'outside ghost hours (8am to 9pm)';
  for (const [a, b] of BLACKOUT) if (m >= a && m < b) return 'Chrome Claude time';
  return '';
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); };
async function setStatus(status) { await chrome.storage.local.set({ status }); }
let tabId = null, winId = null;

async function checkQueue(manual) {
  const s = await chrome.storage.local.get(['auto', 'running', 'queue', 'doneIds', 'spentIds', 'failedIds', 'day', 'cap']);
  if (!s.auto && !manual) return;
  if (s.running) return;
  const why = quietReason();
  if (why && !manual) { await setStatus('Auto is on. Waiting: ' + why + '.'); return; }
  const cap = s.cap || DEFAULT_CAP;
  const day = (s.day && s.day.date === today()) ? s.day : { date: today(), n: 0 };
  const left = cap - day.n;
  if (left <= 0) { await setStatus(`Auto is on. Today's limit reached (${day.n} ghosts). More tomorrow.`); return; }
  let list = [];
  try {
    const r = await fetch(QUEUE_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('queue ' + r.status);
    const j = await r.json(); list = Array.isArray(j) ? j : (j.items || []);
  } catch (e) { await setStatus("Couldn't read Denny's ghost list (" + String(e).slice(0, 60) + '). Will try again.'); return; }
  // Never touch an item twice: done, credits already spent, or failed (D clears problems in the pop-up).
  const skip = new Set([...(s.doneIds || []), ...(s.spentIds || []), ...(s.failedIds || [])]);
  const q = list.filter(it => it.id && (it.mode || 'ghost') === 'ghost' && !skip.has(it.id)).slice(0, left);
  const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!q.length) { await setStatus('Auto is on. No ghosts waiting (checked ' + stamp + ').'); return; }
  if (why) { await setStatus(q.length + " ghosts waiting, but it's " + why + '.'); return; }
  await chrome.storage.local.set({ queue: q, results: [], running: true, day, phase: 'before' });
  tabId = null; await openTab(SUBS_URL, 'Checking AI credits…');
}
const ensureAlarm = () => chrome.alarms.create('ghostQueue', { periodInMinutes: CHECK_MIN });
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'ghostQueue') checkQueue(false); });

async function closeWindow() {
  if (winId !== null) { try { await chrome.windows.remove(winId); } catch (e) {} winId = null; tabId = null; }
}
async function openTab(url, msg) {
  await setStatus(msg);
  if (tabId !== null) { try { await chrome.tabs.update(tabId, { url }); return; } catch (e) { tabId = null; } }
  // Its own window behind yours, so it never takes over the screen or your own Nifty tab.
  const w = await chrome.windows.create({ url, focused: false, width: 1300, height: 950 });
  winId = w.id; tabId = w.tabs[0].id;
}
async function next() {
  const s = await chrome.storage.local.get(['queue', 'running']);
  if (!s.running) return;
  const q = s.queue || [];
  if (!q.length) { await chrome.storage.local.set({ phase: 'after' }); await openTab(SUBS_URL, 'All ghosts done. Reading credits left…'); return; }
  const why = quietReason();
  if (why) { await chrome.storage.local.set({ running: false }); await closeWindow(); await setStatus('Paused for ' + why + '. ' + q.length + ' left; picks up again later.'); return; }
  const it = q[0];
  await openTab(EDIT_URL(it.id), 'Opening Nifty for ' + (it.sku || it.title || it.id) + '…');
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'checkNow') { await checkQueue(true); reply({}); return; }
    if (msg.type === 'setAuto') { await chrome.storage.local.set({ auto: !!msg.on }); ensureAlarm(); if (msg.on) await checkQueue(false); reply({}); return; }
    if (msg.type === 'setStatus') { await setStatus(msg.text); reply({}); return; }
    if (msg.type === 'creditsJob') {
      const s = await chrome.storage.local.get(['running', 'phase']);
      reply({ want: !!(s.running && s.phase && sender.tab && sender.tab.id === tabId) }); return;
    }
    if (msg.type === 'credits') {
      const s = await chrome.storage.local.get(['queue', 'phase']);
      const c = { monthly: msg.monthly || 0, bonus: msg.bonus || 0 };
      const total = c.monthly + c.bonus;
      if (msg.ok) await chrome.storage.local.set({ credits: { ...c, total, at: new Date().toISOString() } });
      await reportCredits(c, s.phase || '');
      if (s.phase === 'after') {
        await chrome.storage.local.set({ running: false, phase: '' }); await closeWindow();
        await setStatus('All done. ' + (msg.ok ? total + ' AI credits left. ' : '') + 'Izzy checks the new ghosts.'); reply({}); return;
      }
      // before the batch
      await chrome.storage.local.set({ phase: '' });
      if (!msg.ok) { await setStatus("Couldn't read the credits, going ahead."); await next(); reply({}); return; }
      const can = Math.floor(total / GHOST_COST);
      if (can < 1) {
        await chrome.storage.local.set({ running: false, queue: [] }); await closeWindow();
        await setStatus(`Out of AI credits (${total} left). Ghosts wait for the renewal. Auto stays on.`); reply({}); return;
      }
      const q = (s.queue || []).slice(0, can);
      await chrome.storage.local.set({ queue: q });
      await setStatus(`${total} AI credits left (${can} ghosts). Starting ${q.length}…`);
      await next(); reply({}); return;
    }
    if (msg.type === 'getJob') {
      const s = await chrome.storage.local.get(['queue', 'running']);
      const it = s.running && (s.queue || [])[0];
      if (!it || !sender.tab || sender.tab.id !== tabId || !msg.path.includes(it.id)) { reply({ job: null }); return; }
      reply({ job: it }); return;
    }
    if (msg.type === 'spent') {
      const s = await chrome.storage.local.get(['spentIds']);
      await chrome.storage.local.set({ spentIds: (s.spentIds || []).concat([msg.id]).slice(-3000) }); reply({}); return;
    }
    if (msg.type === 'result') {
      const s = await chrome.storage.local.get(['queue', 'results', 'running', 'doneIds', 'failedIds', 'day', 'log', 'gens']);
      const auto = !!msg.auto;
      const row = { id: msg.id, sku: msg.sku, ok: msg.ok, practice: !!msg.practice, step: msg.step, note: msg.note, gen: msg.gen || 0, at: new Date().toISOString() };
      const upd = { log: (s.log || []).concat([row]).slice(-300), gens: (s.gens || 0) + (msg.gen || 0) };
      let q = s.queue || [];
      if (auto) { q = q.filter(it => it.id !== msg.id); upd.queue = q; upd.results = (s.results || []).concat([row]); }
      if (msg.ok && !msg.practice) {
        upd.doneIds = (s.doneIds || []).concat([msg.id]).slice(-3000);
        const day = (s.day && s.day.date === today()) ? s.day : { date: today(), n: 0 };
        upd.day = { date: day.date, n: day.n + 1 };
      }
      if (!msg.ok && !msg.practice) upd.failedIds = (s.failedIds || []).concat([msg.id]).slice(-1000);
      await chrome.storage.local.set(upd);
      if (!msg.ok) {
        // First problem: stop and turn Auto off so nothing else runs until D looks.
        await chrome.storage.local.set({ running: false, auto: false });
        await setStatus('Stopped at "' + msg.step + '": ' + msg.note + (auto ? ' Auto is now OFF.' : '') + ' Tap "Copy report".');
        reply({}); return;
      }
      if (!auto) { await setStatus((msg.practice ? 'Practice worked! ' : 'Ghost made and saved! ') + msg.note); reply({}); return; }
      if (!s.running || !q.length) { await next(); reply({}); return; }
      const wait = GAP_MIN + Math.floor(Math.random() * (GAP_MAX - GAP_MIN));
      await setStatus('Ghost saved for ' + (msg.sku || msg.id) + '. Next one in ' + wait + ' seconds…');
      // The background sleeps after ~30s, so the wait timer lives in the Nifty tab.
      const tid = (sender.tab && sender.tab.id) || tabId;
      try { await chrome.scripting.executeScript({ target: { tabId: tid }, args: [wait * 1000], func: ms => { setTimeout(() => chrome.runtime.sendMessage({ type: 'next' }), ms); } }); }
      catch (e) { await next(); }
      reply({}); return;
    }
    if (msg.type === 'next') { if (sender.tab) tabId = sender.tab.id; await next(); reply({}); return; }
  })();
  return true;
});
