const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const m = (v, l) => v ? `<div class="m"><b>${esc(v)}</b><span>${l}</span></div>` : '';
function card(r, first) {
  const when = new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!r.ok) return `<div class="card"><div class="q">${esc(r.query)}</div><div class="bad">Problem: ${esc(r.note)}</div><div>${when}</div></div>`;
  const s = r.sold || {}, a = r.active || {};
  if (s.none) return `<div class="card"><div class="q">${esc(r.query)}</div><div>No sales in the last 90 days.</div><div>${when}</div></div>`;
  const rows = (r.soldListings || []).slice(0, first ? 15 : 5).map(x => `<tr><td><a href="${esc(x.link)}" target="_blank">${esc(x.title)}</a></td><td>${esc(x.price)}</td><td>${esc(x.date)}</td></tr>`).join('');
  return `<div class="card${first ? '' : ' old'}"><div class="q">${r.sku ? '#' + esc(r.sku) + ' ' : ''}${esc(r.query)} <span style="font-size:14px;color:#666">(${esc(r.condition || 'any')}, last 90 days, ${when})</span></div>
  <div class="grid">${m(s.avgSold, 'average sold')}${m(r.median != null ? '$' + r.median.toFixed(2) : '', 'middle sale (top 15)')}${m(s.soldRange, 'sold range')}${m(r.totalSold, 'sold')}${m(s.sellThrough, 'sell-through')}${m(a.totalActive, 'listed now')}${m(a.avgListing, 'average asking')}</div>
  <table>${rows}</table><div style="margin-top:8px"><a href="${esc(r.url)}" target="_blank">Open in Terapeak</a></div></div>`;
}
chrome.storage.local.get(['history']).then(({ history = [] }) => {
  document.getElementById('out').innerHTML = history.length ? history.map((r, i) => card(r, i === 0)).join('') : '<p>No look-ups yet.</p>';
});
