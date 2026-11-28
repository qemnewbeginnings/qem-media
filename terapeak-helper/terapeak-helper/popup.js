const $ = id => document.getElementById(id);
const key = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); };
async function refresh() {
  const s = await chrome.storage.local.get(['queue', 'status', 'auto', 'day', 'cap', 'failedIds']);
  $('auto').checked = !!s.auto;
  $('cap').value = s.cap || 80;
  const n = (s.day && s.day.date === key()) ? s.day.n : 0;
  $('today').textContent = n; $('done').textContent = n;
  $('left').textContent = (s.queue || []).length;
  $('bad').textContent = (s.failedIds || []).length;
  $('status').textContent = s.status || 'Idle';
}
$('try').onclick = () => {
  const q = $('q').value.trim(); if (!q) { $('status').textContent = 'Type some words first.'; return; }
  const c = document.querySelector('input[name=c]:checked').value;
  $('status').textContent = 'Looking up "' + q + '" in its own window…';
  chrome.runtime.sendMessage({ type: 'tryOne', query: q, condition: c });
};
$('scout').onclick = async () => {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!t || !/^https:\/\/www\.ebay\.com\/sh\/research/.test(t.url || '')) { $('status').textContent = 'Open a Terapeak page first, then tap Scout.'; return; }
  try {
    const r = await chrome.tabs.sendMessage(t.id, { type: 'scout' });
    await navigator.clipboard.writeText('TERAPEAK SCOUT\n' + r.text);
    $('status').textContent = 'Copied what the add-on sees. Paste it in the Terapeak thread.';
  } catch (e) { $('status').textContent = 'Reload the Terapeak page once (circle arrow), then tap Scout again.'; }
};
$('auto').onchange = () => chrome.runtime.sendMessage({ type: 'setAuto', on: $('auto').checked });
$('cap').onchange = () => chrome.storage.local.set({ cap: Math.max(1, Math.min(100, +$('cap').value || 80)) });
$('checknow').onclick = () => { $('status').textContent = 'Checking the Terapeak list…'; chrome.runtime.sendMessage({ type: 'checkNow' }); };
$('stop').onclick = async () => { await chrome.storage.local.set({ running: false, auto: false, queue: [], status: 'Stopped by you. Auto is off.' }); refresh(); };
$('clearbad').onclick = async () => { await chrome.storage.local.set({ failedIds: [], status: 'Problems cleared. Those look-ups can run again.' }); refresh(); };
$('copy').onclick = async () => {
  const { log = [], status = '' } = await chrome.storage.local.get(['log', 'status']);
  const lines = log.slice(-5).map(r => r.ok
    ? `${r.at} ${r.sku} "${r.query}" (${r.condition || 'any'}) SOLD ${JSON.stringify(r.sold)} EST ${r.soldEstimate} MEDIAN ${r.soldMedianTop} ACTIVE ${JSON.stringify(r.active)} TOP ${JSON.stringify((r.soldListings || []).slice(0, 5))}`
    : `${r.at} ${r.sku} "${r.query}" PROBLEM [${r.step}] ${r.note}`);
  await navigator.clipboard.writeText('TERAPEAK REPORT\nstatus: ' + status + '\n' + lines.join('\n'));
  $('status').textContent = 'Report copied. Paste it in the Terapeak thread.';
};
chrome.storage.onChanged.addListener(refresh);
refresh();
