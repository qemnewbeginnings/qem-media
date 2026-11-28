// Christina's price check rules for Kim (from christina-client.md, D 11-07/11-08), done with plain math, no AI.
// Used by the background (to send the card to Christina) and by the results page (to show it).
(function (root) {
  const num = v => parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0;
  const SKIP = /\b(lot|lots|bundle|set of|sets|for parts|parts only|pcs|pieces|\d+\s*pc)\b/i;
  const SEASONS = [ // [words, from month-day, to month-day, name]
    [/christmas|santa|nutcracker|ornament|snowman|reindeer|nativity|xmas|holiday village/i, '10-15', '12-20', 'Christmas'],
    [/halloween|pumpkin|witch|skeleton|jack.o.lantern|spooky/i, '09-01', '10-31', 'Halloween'],
    [/easter|bunny|spring|egg tree/i, '02-01', '03-31', 'Easter and spring'],
    [/coat|boots|sweater|jacket|parka|scarf|mittens/i, '09-01', '01-31', 'cold weather'],
    [/swim|bikini|shorts|sandals|beach|pool/i, '04-01', '07-31', 'summer'],
    [/back.to.school|backpack|lunch box|team|jersey/i, '07-01', '09-15', 'back to school']];
  function inSeason(q, d) {
    const md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    for (const [re, a, b, name] of SEASONS) if (re.test(q) && (a <= b ? md >= a && md <= b : md >= a || md <= b)) return name;
    return '';
  }
  const q = (arr, p) => { if (!arr.length) return 0; const i = (arr.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return arr[lo] + (arr[hi] - arr[lo]) * (i - lo); };
  function hold(st) {
    if (st >= 90) return 'days to 2 weeks'; if (st >= 80) return '1 to 3 weeks'; if (st >= 70) return '3 to 6 weeks';
    if (st >= 60) return '6 to 8 weeks'; if (st >= 50) return '2 to 3 months'; if (st >= 40) return '3 to 4 months';
    if (st >= 30) return '4 to 7 months'; if (st >= 20) return '7 to 12 months'; if (st >= 10) return '1 to 2 years'; return '2 years or more';
  }
  function christinaCard(r, heavy) {
    const at = new Date(r.at || Date.now());
    const title = 'Price check ' + at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const when = at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const what = r.query + (r.sku ? ' (sticker #' + r.sku + ')' : '');
    if (!r.ok) return { title, at: when, what, problem: true, summary: "I couldn't check this one on eBay right now. I'll check it for you and put it on your Command Center. - Christina" };
    let sales = (r.soldListings || []).map(x => ({ title: x.title, price: num(x.price), date: x.date, url: x.link })).filter(x => x.price > 0);
    const singles = sales.filter(x => !SKIP.test(x.title));
    if (singles.length >= 3) sales = singles;
    if (!sales.length) return { title, at: when, what, problem: true, summary: "I didn't find any eBay sales for these words in the last 90 days. Try fewer or different words (brand + what it is), or send me a photo on your Command Center. - Christina" };
    const ps = sales.map(x => x.price).sort((a, b) => a - b);
    const low = Math.floor(q(ps, 0.25)), high = Math.max(Math.ceil(q(ps, 0.75)), low + 1);
    const season = inSeason(r.query, at);
    const est = season ? q(ps, 0.75) : q(ps, 0.5);
    const raw = est + 5;
    let site, list;
    if (heavy) { site = 'Facebook'; list = Math.round(raw); }
    else if (Math.round(raw) >= 25) { site = 'eBay'; list = Math.max(0.99, Math.round(raw) - 0.01); }
    else { site = 'Vinted'; list = Math.max(1, Math.round(raw)); }
    const offer = Math.max(0, list - 5);
    const pay = Math.floor((site === 'eBay' ? offer * 0.75 / 3 : offer / 3) * 2) / 2;
    const st = Math.round(num((r.sold || {}).sellThrough));
    const holdTime = 'about ' + hold(st);
    const slow = st < 50;
    const comps = sales.slice().sort((a, b) => Math.abs(a.price - est) - Math.abs(b.price - est)).slice(0, 3);
    const s = r.sold || {}, a = r.active || {};
    const sold = s.totalSold || (r.soldEstimate ? 'about ' + r.soldEstimate : '');
    let why = `From real eBay sales in the last 90 days (Terapeak): ${sold ? sold + ' sold' : 'recent sales'}, most between $${low} and $${high}, the middle one about $${Math.round(q(ps, 0.5))}.`;
    if (a.totalActive) why += ` ${a.totalActive} are listed right now.`;
    if (season) why += ` In season (${season}): priced high.`;
    if (sales.length < 3) why += ` Only ${sales.length} sale${sales.length === 1 ? '' : 's'} found, so I'll double-check it.`;
    if (heavy) why += ' Big or heavy, so it goes on Facebook for local pickup.';
    why += ' These are searched by your words, so if yours is a different size or style, tell me.';
    const shown = site === 'eBay' ? list.toFixed(2) : String(list);
    const summary = `Post this on ${site} for $${shown} (see Why for details). It has an estimated sell-through rate of about ${st}%, which means you can expect to hold it for ${holdTime}. If you're shopping, you can pay up to $${pay.toFixed(2)} and still 3x your $$ after fees.${slow ? ' This one may take a while, so only grab it if you have the room.' : ''} Know something I don't? Go with your gut on price, just try to stay within my $${low}-${high} range. - Christina`;
    return { title, at: when, what, low, high, estimate: Math.round(est), listPrice: list, platform: site, sellThrough: st, holdTime, payUpTo: pay, payUpToPlatform: site, slow, why, comps, summary, heavy: !!heavy, source: 'Terapeak (add-on)' };
  }
  root.christinaCard = christinaCard;
})(typeof self !== 'undefined' ? self : this);
