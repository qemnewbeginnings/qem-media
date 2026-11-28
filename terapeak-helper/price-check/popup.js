const $ = id => document.getElementById(id);
chrome.storage.local.get(['status']).then(s => { $('status').textContent = s.status || ''; });
const go = () => {
  const q = $('q').value.trim(); if (!q) { $('status').textContent = 'Type the brand and item first.'; return; }
  chrome.runtime.sendMessage({ type: 'lookUp', query: q, sku: $('sku').value.trim(), condition: document.querySelector('input[name=c]:checked').value });
  $('status').textContent = 'Looking it up… about 1 minute. The answer opens in a new tab.';
};
$('go').onclick = go;
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
$('past').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
