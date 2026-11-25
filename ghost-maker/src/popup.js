const $ = id => document.getElementById(id);
const key = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); };
async function refresh() {
  const s = await chrome.storage.local.get(['queue', 'log', 'status', 'auto', 'day', 'cap', 'failedIds']);
  $('auto').checked = !!s.auto;
  $('cap').value = s.cap || 10;
  const n = (s.day && s.day.date === key()) ? s.day.n : 0;
  $('today').textContent = n;
  $('left').textContent = (s.queue || []).length;
  $('done').textContent = n;
  $('bad').textContent = (s.failedIds || []).length;
  $('status').textContent = s.status || 'Idle';
}
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
async function toPage(msg) {
  const t = await activeTab();
  const say = async text => { $('status').textContent = text; await chrome.storage.local.set({ status: text }); };
  if (!t || !/^https:\/\/[a-z.]*nifty\.ai\//.test(t.url || '')) { await say('This tab is not Nifty (' + String(t && t.url || '').slice(0, 50) + '). Open the item in Nifty, then tap again.'); return null; }
  try { return await chrome.tabs.sendMessage(t.id, msg); }
  catch (e) { await say('The add-on is not running in this tab yet. Reload the Nifty page once (circle arrow, top left), then tap again.'); return null; }
}
$('practice').onclick = async () => {
  const r = await toPage({ type: 'runHere', practice: true });
  if (r && r.error) $('status').textContent = r.error; else if (r) $('status').textContent = 'Practice started. Watch the Nifty page…';
};
let armed = false;
$('real').onclick = async () => {
  if (!armed) { armed = true; $('real').textContent = 'Tap again to spend 5 credits'; $('real').style.background = '#fde68a'; return; }
  armed = false; $('real').textContent = '2. Make the ghost (5 credits)'; $('real').style.background = '';
  const r = await toPage({ type: 'runHere', practice: false });
  if (r && r.error) $('status').textContent = r.error; else if (r) $('status').textContent = 'Making the ghost. Watch the Nifty page…';
};
$('scout').onclick = async () => {
  const r = await toPage({ type: 'scout' });
  if (!r) return;
  await navigator.clipboard.writeText('GHOST SCOUT\n' + r.text);
  $('status').textContent = 'Copied what the add-on sees. Paste it in the ghost thread.';
};
$('auto').onchange = () => chrome.runtime.sendMessage({ type: 'setAuto', on: $('auto').checked });
$('cap').onchange = () => chrome.storage.local.set({ cap: Math.max(1, Math.min(40, +$('cap').value || 10)) });
$('checknow').onclick = () => { $('status').textContent = 'Checking the ghost list…'; chrome.runtime.sendMessage({ type: 'checkNow' }); };
$('stop').onclick = async () => { await chrome.storage.local.set({ running: false, auto: false, queue: [], status: 'Stopped by you. Auto is off.' }); refresh(); };
$('clearbad').onclick = async () => { await chrome.storage.local.set({ failedIds: [], status: 'Problems cleared. Those items can be tried again (only ones that never spent credits).' }); refresh(); };
$('copy').onclick = async () => {
  const { log = [], gens = 0, status = '' } = await chrome.storage.local.get(['log', 'gens', 'status']);
  await navigator.clipboard.writeText('GHOST REPORT\nstatus: ' + status + '\nApply clicks so far: ' + gens + '\n' + log.slice(-15).map(r => `${r.at} ${r.sku || r.id} ${r.ok ? 'OK' : 'PROBLEM'}${r.practice ? ' (practice)' : ''} [${r.step}] ${r.note}`).join('\n'));
  $('status').textContent = 'Report copied. Paste it in the ghost thread.';
};
chrome.storage.onChanged.addListener(refresh);
refresh();
