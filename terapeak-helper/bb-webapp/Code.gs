// BootyBoots Terapeak web app (Google Apps Script). Lives in the BootyBoots worker Google account.
// Christina drops request files in Drive folder "BB Terapeak inbox".
// The Chrome add-on on Kim's computer asks this web app for the list (doGet) and sends each result back (doPost).
// Each result is saved as <id>.json in Drive folder "BB Terapeak results", where Christina reads it.
// Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone. Paste the /exec link in the add-on Settings.
const INBOX = 'BB Terapeak inbox', RESULTS = 'BB Terapeak results', DONE = 'done';

function setup() {
  const p = PropertiesService.getScriptProperties();
  const inbox = findOrMake_(INBOX, null), results = findOrMake_(RESULTS, null), done = findOrMake_(DONE, inbox);
  p.setProperties({ inbox: inbox.getId(), results: results.getId(), done: done.getId() });
  Logger.log('Ready. Inbox folder id: ' + inbox.getId() + '  Results folder id: ' + results.getId());
}
function findOrMake_(name, parent) {
  const it = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}
function folder_(key) {
  let id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) { setup(); id = PropertiesService.getScriptProperties().getProperty(key); }
  return DriveApp.getFolderById(id);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function safeId_(id) { return String(id || '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80); }
function doneIds_() {
  const s = {}, it = folder_('results').getFiles();
  while (it.hasNext()) { const n = it.next().getName(); if (/\.json$/.test(n)) s[n.replace(/\.json$/, '')] = 1; }
  return s;
}

// The add-on asks: "what is waiting?" Returns {items:[...]} oldest file first.
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return out_({ ok: true, app: 'BB Terapeak' });
  const done = doneIds_(), seen = {}, files = [], items = [];
  const it = folder_('inbox').getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort((a, b) => a.getDateCreated() - b.getDateCreated());
  const doneFolder = folder_('done');
  files.forEach(f => {
    let body; try { body = JSON.parse(f.getBlob().getDataAsString()); } catch (x) { return; }
    const list = (body && body.items) || [];
    let open = 0;
    list.forEach(x => {
      if (!x || !x.id || !x.query) return;
      const id = safeId_(x.id);
      if (done[id]) return;
      open++;
      if (seen[id]) return; seen[id] = 1;
      items.push(Object.assign({ source: body.source || 'christina' }, x, { id: id }));
    });
    if (!open) { try { f.moveTo(doneFolder); } catch (x) {} } // every item answered: tidy the inbox
  });
  return out_({ items: items });
}

// The add-on sends one finished look-up as form field "result" (JSON text).
function doPost(e) {
  const raw = e && e.parameter && e.parameter.result;
  if (!raw) return out_({ ok: false, note: 'no result' });
  let r; try { r = JSON.parse(raw); } catch (x) { return out_({ ok: false, note: 'bad JSON' }); }
  const id = safeId_(r.id);
  if (!id) return out_({ ok: false, note: 'no id' });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rf = folder_('results');
    if (rf.getFilesByName(id + '.json').hasNext()) return out_({ ok: true, dup: true });
    rf.createFile(id + '.json', JSON.stringify(r, null, 1), MimeType.PLAIN_TEXT);
    return out_({ ok: true });
  } finally { lock.releaseLock(); }
}
