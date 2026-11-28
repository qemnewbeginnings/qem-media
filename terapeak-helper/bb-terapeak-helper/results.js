// Shows Kim's own look-ups as Christina's price check card, laid out like her Command Center.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v, site) => '$' + (site === 'eBay' ? Number(v).toFixed(2) : String(v));
function card(c, first) {
  if (!c) return '';
  const top = `<div class="top"><h3>${esc(c.title)}</h3><span class="note">${esc(c.at)}</span></div>`;
  if (c.problem) return `<article class="pc${first ? '' : ' old'}">${top}<div><b>${esc(c.what)}</b></div><div class="problem">${esc(c.summary)}</div></article>`;
  const comps = (c.comps || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">Sold $${esc(Number(x.price).toFixed(2))} · ${esc(x.title)} · ${esc(x.date)} ↗</a>`).join('');
  return `<article class="pc${first ? '' : ' old'}">${top}
  <div class="tablewrap"><table><thead><tr><th>#</th><th>Item</th><th>Likely sells for</th><th>List at</th><th>Platform</th><th>Why</th></tr></thead><tbody>
  <tr><td data-l="#">1</td><td data-l="Item">${esc(c.what)}</td><td data-l="Likely sells for" style="white-space:nowrap">$${c.low}–$${c.high}</td>
  <td data-l="List at"><b>${money(c.listPrice, c.platform)}</b></td><td data-l="Platform">${esc(c.platform)}</td>
  <td data-l="Why"><div class="pcwhy"><span class="tag pay">Pay up to $${Number(c.payUpTo).toFixed(2)}</span><div>${esc(c.why)}</div><div class="comps">${comps}</div></div></td></tr>
  </tbody></table></div>
  <div class="summary">${esc(c.summary)}</div></article>`;
}
chrome.storage.local.get(['history']).then(({ history = [] }) => {
  const list = history.filter(h => h && h.card);
  document.getElementById('out').innerHTML = list.length ? list.map((h, i) => card(h.card, i === 0)).join('') : '<p>No price checks yet.</p>';
});
