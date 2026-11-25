# QEM Terapeak Helper (Christina's Chrome add-on) - v0.1 draft, 11-24 night

Goal (D 11-24): do Terapeak look-ups with an add-on, like the Ghost Maker, so Chrome Claude isn't needed for anything.

## How it works
1. Cloud (Christina/Alex) adds look-ups to terapeak-queue/queue.json on this branch:
   {"items":[{"id":"tp-1125-01","query":"Plugg cargo shorts","condition":"used","sku":"K27-062","item":"Plugg cargo shorts 30","batch":"Intake 11-25 #1","days":90}]}
2. The add-on (D's Lenovo Chromebook) checks the list every 15 min, 7am-10pm, in its own window behind D's.
3. Per item it opens Terapeak (ebay.com/sh/research) SOLD tab, reads the summary (avg sold, range, total sold, sell-through, sellers, item sales) and the top 15 sold rows (title, price, shipping, date, item link); then the ACTIVE tab (total active, avg listing price). 40-100 s between items, 40 a day.
4. Results go to a Google Form "QEM Terapeak Results" (one paragraph question, JSON) -> response Sheet the cloud reads. Until the form exists: "Copy report" in the pop-up.
5. Read-only. Stops and turns Auto off if eBay asks to sign in, shows a human check, or the numbers never load.

## Still to do (with D)
- Install (Load unpacked), then "Look it up" on one real item + "Scout this page" to tune the reader to the real Terapeak page.
- Check the used/new filter (conditionId in the address) matches Terapeak's Condition filter.
- D makes the Google Form; put its formResponse link + entry id in background.js.
- Cloud side: Christina writes queue items instead of Chrome job docs; a pickup reads the results sheet into the review (dCheck line) and removes done items from the queue.
- Google Doc guide for the tool. Then Chrome Claude's Terapeak step can be turned off.
