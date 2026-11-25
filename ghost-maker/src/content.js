// QEM Ghost Maker - works inside a Nifty item page (app.nifty.ai/inventory/edit/<id>).
// Photo 1 only -> AI Studio -> Ghost mannequin (white) -> Apply edit -> keep result -> Save item.
// Stops at the first problem and says what it saw, so the steps can be tuned.
(() => {
  if (window.__qemGhost) return; window.__qemGhost = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const human = (a = 400, b = 1000) => sleep(a + Math.random() * (b - a));
  const send = m => new Promise(r => { try { chrome.runtime.sendMessage(m, r); } catch (e) { r(null); } });
  const status = text => send({ type: 'setStatus', text });
  const norm = t => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0;
  };
  const CLICKABLE = 'button,[role=button],a[href],[role=tab],[role=menuitem],[role=option],[role=switch],[role=checkbox],[role=radio],input[type=checkbox],input[type=radio],label,[aria-pressed]';
  const textOf = el => norm(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
  const disabled = el => !!el && (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled=true],[disabled]'));
  // Never click anything that could list, publish, delete or spend money. (Apply edit is the only credit click and is done on purpose.)
  const FORBIDDEN = /\b(list|relist|publish|post|schedule|delist|delete|remove|end listing|buy|upgrade|subscribe|purchase|discard|virtual model)\b/;

  function hover(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) {
      const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new E(t, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    }
  }
  function realClick(el, step, allow) {
    const t = textOf(el);
    if (!allow && FORBIDDEN.test(t)) throw { step, note: `Refused to click "${t.slice(0, 40)}" (looks like a list/delete/model/money button).` };
    el.scrollIntoView({ block: 'center' });
    hover(el);
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const E = ty.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new E(ty, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    }
    el.click();
  }
  async function waitFor(fn, ms = 20000, every = 300) {
    const end = Date.now() + ms;
    while (Date.now() < end) { let v = null; try { v = fn(); } catch (e) {} if (v) return v; await sleep(every); }
    return null;
  }
  // Short summary of what is on screen, for problem reports.
  function seen(root = document, n = 18) {
    const out = [];
    for (const el of root.querySelectorAll(CLICKABLE)) {
      if (!visible(el)) continue;
      const t = textOf(el).slice(0, 30); if (t && !out.includes(t)) out.push(t);
      if (out.length >= n) break;
    }
    return out.map(t => JSON.stringify(t)).join(', ') || 'nothing';
  }
  // Find a clickable thing by its words: exact first, then starts-with, then contains.
  function byText(cands, root = document, { exact = false } = {}) {
    const want = cands.map(norm);
    const els = [...root.querySelectorAll(CLICKABLE)].filter(visible);
    for (const mode of exact ? ['eq'] : ['eq', 'starts', 'has']) {
      for (const el of els) {
        const t = textOf(el); if (!t || t.length > 60) continue;
        if (want.some(w => mode === 'eq' ? t === w : mode === 'starts' ? t.startsWith(w) : t.includes(w))) return el;
      }
    }
    // Plain text (span/div/p) whose own words match, then its nearest clickable parent.
    for (const el of root.querySelectorAll('span,div,p,h1,h2,h3,h4,h5,h6,strong')) {
      if (!visible(el) || el.children.length > 2) continue;
      const t = norm(el.innerText); if (!t || t.length > 60) continue;
      if (want.some(w => t === w || (!exact && t.startsWith(w)))) return el.closest(CLICKABLE) || el;
    }
    return null;
  }
  function textNode(cands, root = document) { // the label element itself (not its button)
    const want = cands.map(norm);
    for (const el of root.querySelectorAll('span,div,p,label,h1,h2,h3,h4,h5,h6,strong,button')) {
      if (!visible(el)) continue;
      const t = norm(el.innerText); if (!t || t.length > 60) continue;
      if (want.some(w => t === w || t.startsWith(w))) {
        // go to the smallest element with that text
        const kid = [...el.querySelectorAll('*')].find(k => visible(k) && want.some(w => norm(k.innerText) === w || norm(k.innerText).startsWith(w)) && k.children.length === 0);
        return kid || el;
      }
    }
    return null;
  }
  const describe = el => !el ? 'none' : `${el.tagName.toLowerCase()}${el.getAttribute('role') ? ' role=' + el.getAttribute('role') : ''}${el.type ? ' type=' + el.type : ''}${el.getAttribute('aria-checked') ? ' aria-checked=' + el.getAttribute('aria-checked') : ''}${el.getAttribute('aria-pressed') ? ' aria-pressed=' + el.getAttribute('aria-pressed') : ''}${el.getAttribute('data-state') ? ' data-state=' + el.getAttribute('data-state') : ''} class="${(el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 60)}"`;

  // ---------- photos ----------
  // The item's photo strip = the biggest group of same-size product images on the page.
  function photoGroup(root = document) {
    const imgs = [...root.querySelectorAll('img')].filter(im => {
      if (!visible(im) || im.closest('[role=dialog]') && root === document) return false;
      const r = im.getBoundingClientRect();
      return r.width >= 50 && r.height >= 50 && r.width <= 420 && !/logo|avatar|icon|emoji/i.test(im.src + ' ' + im.alt + ' ' + im.className);
    });
    const groups = {};
    for (const im of imgs) { const r = im.getBoundingClientRect(); const k = Math.round(r.width / 8) + 'x' + Math.round(r.height / 8); (groups[k] = groups[k] || []).push(im); }
    let best = [];
    for (const g of Object.values(groups)) if (g.length > best.length) best = g;
    return best;
  }
  const srcOf = im => (im && (im.currentSrc || im.src) || '').split('?')[0];
  const dialogs = () => [...document.querySelectorAll('[role=dialog],[aria-modal=true],.modal,[class*="Modal"],[class*="modal"],[class*="Drawer"],[class*="drawer"]')].filter(visible);
  const studioRoot = () => { const d = dialogs(); return d.length ? d[d.length - 1] : document; };
  const studioOpen = () => studioRoot() !== document && !!textNode(['edit photos', 'ghost mannequin', 'ai studio'], studioRoot());
  // Nifty's "Edit photos" window: thumbnails with tick boxes on the left, big preview in the middle.
  function thumbBoxes(root) {
    const boxes = [...root.querySelectorAll('input[type=checkbox],[role=checkbox]')];
    // keep only tick boxes that sit on a thumbnail (an <img> close by), in screen order top to bottom
    return boxes.filter(b => { let e = b; for (let i = 0; i < 4 && e; i++, e = e.parentElement) if (e.querySelector('img')) return true; return false; })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }
  const ticked = b => b.matches('input') ? b.checked : (b.getAttribute('aria-checked') === 'true' || /checked/.test(b.getAttribute('data-state') || ''));
  function previewSrc(root) {
    let best = null, area = 0;
    for (const im of root.querySelectorAll('img')) { if (!visible(im)) continue; const r = im.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = im; } }
    return srcOf(best) + '|' + (best ? best.naturalWidth : 0);
  }

  // Everything clickable around photo 1, hidden ones too (hover buttons are hidden until a real mouse is over them).
  function photoArea(photo1) {
    let box = photo1, out = [];
    for (let i = 0; i < 5 && box.parentElement; i++) {
      const up = box.parentElement; if (up.querySelectorAll('img').length > 1) break; box = up;
    }
    for (const e of box.querySelectorAll('button,[role=button],a,[tabindex],svg,[data-testid],[aria-label],[title]')) {
      const d = [e.tagName.toLowerCase(), textOf(e).slice(0, 20), e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('data-testid'), visible(e) ? 'shown' : 'hidden', String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 30)].filter(Boolean).join(' ');
      if (!out.includes(d)) out.push(d); if (out.length >= 12) break;
    }
    return `box=${box.tagName.toLowerCase()} ${String(box.className).slice(0, 40)} | ` + (out.join(' ; ') || 'no buttons');
  }
  async function openStudio(photo1) {
    // Try 1: buttons that appear on photo 1 when you hover it (wand / AI / edit icons).
    let box = photo1;
    for (let i = 0; i < 4 && box.parentElement; i++) { box = box.parentElement; if (box.querySelectorAll('img').length > 1) { box = photo1.parentElement; break; } }
    hover(photo1); hover(box); await human(600, 1000);
    const onPhoto = [...box.querySelectorAll('button,[role=button],a,svg')].map(e => e.closest('button,[role=button],a') || e).filter(visible)
      .find(e => /ai|studio|magic|wand|edit|enhance/i.test(textOf(e) + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('data-testid') || '')));
    if (onPhoto) { realClick(onPhoto, 'Open photo 1'); await human(1200, 1800); }
    // Try 1a (Nifty): photo 1 has a hidden "Edit" overlay (pencil) that only shows under a real mouse. Click it even while hidden.
    if (!studioOpen()) {
      let tile = photo1;
      for (let i = 0; i < 5 && tile.parentElement && tile.parentElement.querySelectorAll('img').length <= 1; i++) tile = tile.parentElement;
      const ed = [...tile.querySelectorAll('*')].find(e => /^edit$/.test(norm(e.innerText || e.textContent)) || /^edit( photo| image)?$/.test(norm(e.getAttribute('aria-label'))));
      if (ed) {
        const target = ed.closest('button,[role=button],[tabindex]') || ed;
        if (FORBIDDEN.test(textOf(target))) throw { step: 'Open photo 1', note: 'The photo 1 button looks like Remove, not Edit. Stopped.' };
        realClick(target, 'Edit photo 1'); await human(1500, 2200);
        if (!studioOpen() && target !== ed) { realClick(ed, 'Edit photo 1'); await human(1500, 2200); }
      }
    }
    // Try 1b: an "Edit photos" button near the photos.
    if (!studioOpen()) { const ep = byText(['edit photos', 'edit photo', 'edit images', 'photo editor']); if (ep) { realClick(ep, 'Edit photos'); await human(1200, 1800); } }
    // Try 2: click photo 1 itself.
    if (!studioOpen() && !byText(['ai studio', 'edit with ai', 'open ai studio'])) { realClick(photo1, 'Open photo 1'); await human(1200, 1800); }
    // A menu or photo viewer may offer "AI Studio".
    for (let i = 0; i < 2 && !studioOpen(); i++) {
      const b = byText(['ai studio', 'open ai studio', 'edit with ai', 'ai edit', 'ai edits']);
      if (b) { realClick(b, 'Open AI Studio'); await human(1500, 2200); }
    }
    if (!(await waitFor(studioOpen, 15000))) throw { step: 'Open AI Studio', note: `AI Studio did not open from photo 1 (hover button ${onPhoto ? 'found' : 'not found'}). Photo 1 area: ${photoArea(photo1)}. On screen: ${seen()}.` };
  }

  function controlFor(labelEl) { // the switch/checkbox/tile that goes with a label (the nearest one, never a neighbour's)
    const lr = labelEl.getBoundingClientRect();
    const dist = c => { const r = c.getBoundingClientRect(); return Math.hypot((r.left + r.right) / 2 - (lr.left + lr.right) / 2, (r.top + r.bottom) / 2 - (lr.top + lr.bottom) / 2); };
    let el = labelEl;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      if (el.matches && el.matches('[role=switch],[role=checkbox],input[type=checkbox],[aria-checked],[aria-pressed],[aria-selected]')) return el;
      const cs = [...el.querySelectorAll('[role=switch],input[type=checkbox],[role=checkbox],[aria-checked],[aria-pressed]')].filter(c => visible(c) || c.matches('input'));
      if (cs.length) return cs.sort((a, b) => dist(a) - dist(b))[0];
      if (el.matches && el.matches('button,[role=button],label')) return el;
    }
    return labelEl.closest(CLICKABLE) || labelEl;
  }
  function isOn(c) {
    if (!c) return null;
    if (c.matches('input')) return c.checked;
    for (const a of ['aria-checked', 'aria-pressed', 'aria-selected']) if (c.hasAttribute(a)) return c.getAttribute(a) === 'true';
    const ds = c.getAttribute('data-state') || (c.querySelector('[data-state]') || {}).getAttribute?.('data-state');
    if (ds) return /checked|on|active|selected/.test(ds);
    const inp = c.querySelector && c.querySelector('input[type=checkbox],input[type=radio]');
    if (inp) return inp.checked;
    if (/\b(selected|active|checked|is-on|enabled)\b/i.test(String(c.className))) return true;
    return null; // can't tell
  }

  async function run(job) {
    const practice = !!job.practice;
    const notes = [];
    let gen = 0;
    const fail = (step, note) => { throw { step, note }; };
    await status((practice ? 'Practice: ' : '') + 'Looking at item ' + (job.sku || job.id || '') + '…');
    // 1. Wait for the item's photos.
    const group0 = await waitFor(() => { const g = photoGroup(); return g.length ? g : null; }, 30000, 500);
    if (!group0) fail('Find photos', `No item photos found on this page. On screen: ${seen()}.`);
    const before = group0.map(srcOf); const count = before.length;
    if (job.count && job.count !== count) notes.push(`queue said ${job.count} photos, page shows ${count}`);
    if (count < 2) fail('Find photos', `Only ${count} photo found; photo 2 (true front) must be there before a ghost.`);
    notes.push(`${count} photos`);
    // 2. Open photo 1 in AI Studio.
    await status('Opening photo 1 in AI Studio…');
    await openStudio(group0[0]);
    let root = studioRoot();
    // 3. Only photo 1 ticked, then the AI Studio tab.
    let boxes = thumbBoxes(root);
    if (boxes.length) {
      for (let i = 0; i < boxes.length; i++) {
        const want = i === 0;
        if (ticked(boxes[i]) !== want) { realClick(boxes[i], 'Pick photo 1 only', true); await human(400, 800); }
      }
      boxes = thumbBoxes(studioRoot());
      const on = boxes.map(ticked);
      if (!on[0] || on.slice(1).some(Boolean)) fail('Pick photo 1', `Couldn't tick ONLY photo 1 in Edit photos (ticks: ${on.map(x => x ? 'Y' : 'n').join('')}). Not spending credits.`);
      notes.push(`photo 1 only ticked (${boxes.length} thumbs)`);
    } else notes.push('no tick boxes seen in Edit photos');
    const selTxt = norm(studioRoot().innerText).match(/(\d+) selected/);
    if (selTxt && selTxt[1] !== '1') fail('Pick photo 1', `Edit photos says "${selTxt[0]}", must be 1. Not spending credits.`);
    if (!textNode(['ghost mannequin'], studioRoot())) {
      const tab = byText(['ai studio'], studioRoot());
      if (tab) { realClick(tab, 'AI Studio tab'); await human(900, 1400); }
    }
    if (!textNode(['ghost mannequin'], studioRoot())) {
      const adv = byText(['advanced: ai edits', 'advanced ai edits', 'advanced'], studioRoot());
      if (adv) { realClick(adv, 'Advanced'); await human(800, 1300); }
    }
    root = studioRoot();
    const ghostLabel = await waitFor(() => textNode(['ghost mannequin'], studioRoot()), 8000);
    if (!ghostLabel) fail('Ghost mannequin', `No "Ghost mannequin" choice in AI Studio. On screen: ${seen(studioRoot())}.`);
    // 4. Turn Ghost mannequin on.
    let ctl = controlFor(ghostLabel);
    const was = isOn(ctl);
    if (was !== true) { realClick(ctl, 'Ghost mannequin'); await human(800, 1300); }
    ctl = controlFor(textNode(['ghost mannequin'], studioRoot()) || ghostLabel);
    const now = isOn(ctl);
    notes.push(`ghost switch: ${describe(ctl)} was=${was} now=${now}`);
    if (now === false) fail('Ghost mannequin', `Clicked Ghost mannequin but it still shows off (${describe(ctl)}).`);
    if (now === null && !practice && !job.trustSwitch) fail('Ghost mannequin', `Can't tell if Ghost mannequin turned on (${describe(ctl)}). Not spending credits. On screen: ${seen(studioRoot())}.`);
    const flat = textNode(['flat lay'], studioRoot());
    if (flat && isOn(controlFor(flat)) === true) fail('Flat lay', 'Flat lay is switched on. Only Ghost mannequin should be on. Not spending credits.');
    // 5. Background white (only if AI Studio shows a background choice).
    root = studioRoot();
    const bgLabel = textNode(['background color', 'background colour', 'background'], root);
    if (bgLabel) {
      let area = bgLabel; let white = null;
      for (let i = 0; i < 5 && area && !white; i++, area = area.parentElement) {
        white = [...area.querySelectorAll('button,[role=button],[role=radio],[role=option],label,div,span')].find(e => visible(e) && [e.innerText, e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('data-value')].some(t => /^(white|#fff|#ffffff)$/.test(norm(t))));
      }
      if (white) { const c = white.closest('button,[role=button],[role=radio],[role=option],label') || white; if (isOn(c) !== true) { realClick(c, 'Background white'); await human(); } notes.push('background white picked'); }
      else notes.push('background: no White choice seen, left as is');
    } else notes.push('background: no background setting seen');
    // 6. Apply edit.
    root = studioRoot();
    const apply = byText(['apply edits', 'apply edit', 'apply ai edit', 'apply', 'generate'], root);
    if (!apply) fail('Apply edit', `No "Apply edit" button. On screen: ${seen(root)}.`);
    if (disabled(apply)) fail('Apply edit', `"Apply edit" is greyed out (Ghost mannequin may not be on). ${notes.join('; ')}.`);
    if (practice) {
      notes.push(`found "${textOf(apply)}" (not clicked)`);
      return { ok: true, practice: true, step: 'Practice done', note: 'Practice found every step up to Apply edit and stopped (no credits used). Close AI Studio by hand. ' + notes.join('; ') + '.', gen };
    }
    // Remember that credits were spent on this item BEFORE clicking, so it is never clicked twice.
    await send({ type: 'spent', id: job.id });
    const beforeBtns = new Set([...document.querySelectorAll(CLICKABLE)].filter(visible));
    const prev0 = previewSrc(studioRoot());
    realClick(apply, 'Apply edit'); gen++;
    await status('AI Studio is making the ghost (up to 3 minutes)…');
    // 7. Wait for the result.
    const DONE = ['save', 'save image', 'save photo', 'use image', 'use this', 'use photo', 'replace', 'replace photo', 'replace image', 'apply to photo', 'save to item', 'save to listing', 'accept', 'keep', 'keep image', 'done', 'confirm'];
    let doneBtn = null, changed = false;
    const end = Date.now() + 180000;
    while (Date.now() < end) {
      await sleep(2000);
      const body = norm(document.body.innerText);
      if (/out of credits|not enough credits|insufficient credits|no credits left|buy more credits|get more credits/.test(body)) throw { step: 'Apply edit', note: 'Nifty says OUT OF CREDITS.', credits: true, gen };
      if (/something went wrong|failed to (generate|apply|process)|try again later/.test(body)) throw { step: 'Apply edit', note: 'AI Studio showed an error after Apply edit. Credits may be used. ' + seen(studioRoot()), gen };
      const g = photoGroup(); if (g.length && srcOf(g[0]) !== before[0]) { changed = true; break; }
      const r = studioRoot();
      const busy = r !== document && /generating|processing|applying|working|loading|please wait/.test(norm(r.innerText));
      if (busy) continue;
      if (r !== document && previewSrc(r) !== prev0) {
        await sleep(2500);
        doneBtn = byText(['save'], r, { exact: true });
        if (doneBtn && !disabled(doneBtn)) { notes.push('ghost preview ready'); break; }
      }
      const cand = [...r.querySelectorAll(CLICKABLE)].filter(e => visible(e) && !beforeBtns.has(e) && !disabled(e));
      doneBtn = null;
      for (const w of DONE) { doneBtn = cand.find(e => textOf(e) === w); if (doneBtn) break; }
      if (doneBtn) break;
    }
    if (!changed && !doneBtn) throw { step: 'Wait for ghost', note: `No ghost result after 3 minutes (5 credits may be used). On screen: ${seen(studioRoot())}.`, gen };
    // 8. Keep the result on photo 1.
    if (!changed && doneBtn) {
      notes.push(`kept with "${textOf(doneBtn)}"`);
      realClick(doneBtn, 'Keep ghost'); await human(1500, 2500);
      changed = !!(await waitFor(() => { const g = photoGroup(); return g.length && srcOf(g[0]) !== before[0]; }, 20000, 700));
      if (!changed) {
        // Some viewers need closing before the item page shows the new photo.
        const r = studioRoot();
        if (r !== document) {
          const x = [...r.querySelectorAll('button,[role=button]')].find(e => visible(e) && /^(close|×|x|back)$/.test(textOf(e) || norm(e.getAttribute('aria-label'))));
          if (x) { realClick(x, 'Close AI Studio'); await human(1200, 1800); }
        }
        changed = !!(await waitFor(() => { const g = photoGroup(); return g.length && srcOf(g[0]) !== before[0]; }, 15000, 700));
      }
    }
    if (!changed) throw { step: 'Keep ghost', note: `The ghost was made but photo 1 on the item didn't change. ${notes.join('; ')}. On screen: ${seen(studioRoot())}.`, gen };
    // Close AI Studio if it is still open.
    if (studioRoot() !== document) {
      const r = studioRoot();
      const x = [...r.querySelectorAll('button,[role=button]')].find(e => visible(e) && /^(close|×|x|done)$/.test(textOf(e) || norm(e.getAttribute('aria-label'))));
      if (x) { realClick(x, 'Close AI Studio'); await human(1000, 1500); }
    }
    // 9. Check the photos: same count, photo 1 new, photos 2+ untouched.
    const after = photoGroup().map(srcOf);
    if (after.length !== count) throw { step: 'Check photos', note: `Item had ${count} photos, now ${after.length} (Nifty may have added the ghost as an extra photo). Fix by hand: ghost first, old photo 1 removed. Not saved.`, gen };
    const moved = before.slice(1).filter(s => !after.slice(1).includes(s));
    if (moved.length) throw { step: 'Check photos', note: `Photos 2 to ${count} changed too (${moved.length}). Not saved. Check by hand.`, gen };
    // 10. Save the item (never List / Publish / Schedule).
    await status('Saving the item…');
    const save = byText(['save', 'save changes', 'save item', 'save draft', 'update', 'update item', 'update listings', 'save & update', 'save and update'], document, { exact: true });
    if (!save) throw { step: 'Save', note: `Ghost is on photo 1 but no Save / Update button found. On screen: ${seen()}.`, gen };
    if (disabled(save)) throw { step: 'Save', note: `Save button is greyed out. On screen: ${seen()}.`, gen };
    realClick(save, 'Save'); await human(1500, 2500);
    // A price-mismatch or "update marketplaces?" question is normal: say yes to saving, never to listing.
    for (let i = 0; i < 3; i++) {
      const d = dialogs().pop(); if (!d) break;
      const yes = byText(['save anyway', 'update anyway', 'continue', 'yes', 'confirm', 'save', 'update'], d, { exact: true });
      if (!yes || disabled(yes)) break;
      notes.push(`answered "${textOf(yes)}"`); realClick(yes, 'Save question'); await human(1500, 2500);
    }
    const saved = await waitFor(() => /saved|updated|success|changes have been/.test(norm([...document.querySelectorAll('[role=status],[role=alert],[class*="toast"],[class*="Toast"],[class*="snack"],[class*="notif"]')].map(e => e.innerText).join(' '))) || (disabled(save) ? 'disabled' : null), 45000, 700);
    notes.push(saved ? 'saved' : 'clicked Save (no "saved" message seen, cloud check will confirm)');
    return { ok: true, step: 'Done', note: 'Ghost made and saved. ' + notes.join('; ') + '.', gen };
  }

  // ---------- scout: describe the page so the steps can be tuned ----------
  function scout() {
    const lines = ['URL ' + location.pathname, 'photos found: ' + photoGroup().length, 'dialog open: ' + (studioRoot() !== document)];
    const root = studioRoot();
    lines.push('buttons: ' + seen(root, 40));
    const g1 = photoGroup()[0]; if (g1) lines.push('photo 1 area: ' + photoArea(g1));
    const g = textNode(['ghost mannequin'], root);
    if (g) lines.push('ghost label: ' + describe(g) + ' | control: ' + describe(controlFor(g)) + ' on=' + isOn(controlFor(g)));
    for (const w of ['advanced', 'background', 'apply edit', 'ai studio']) { const e = byText([w], root); if (e) lines.push(w + ': ' + describe(e) + ' text="' + textOf(e).slice(0, 40) + '" disabled=' + !!disabled(e)); }
    return lines.join('\n');
  }

  async function go(job) {
    let res;
    try { res = await run(job); }
    catch (e) { res = { ok: false, step: e.step || 'Unexpected', note: e.note || String(e && e.message || e), credits: !!e.credits, gen: e.gen || 0 }; }
    res.id = job.id; res.sku = job.sku; res.url = location.pathname;
    await send({ type: 'result', ...res, auto: !!job.auto });
    return res;
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'scout') { reply({ text: scout() }); return; }
    if (msg.type === 'runHere') {
      const id = (location.href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) || [])[1] || ('page-' + location.pathname);
      status('Started on ' + location.pathname.slice(0, 60) + ' …');
      go({ id, practice: !!msg.practice, sku: msg.sku || '' });
      reply({ started: true }); return;
    }
  });

  // Auto mode: the background opens the item page; ask if there is a job for this page.
  (async () => {
    await sleep(2500);
    const r = await send({ type: 'getJob', path: location.pathname });
    if (r && r.job) go({ ...r.job, auto: true });
  })();
})();
