const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(300);
  await p.click('[data-act="demo"]'); await p.waitForTimeout(300);
  const got = new Set();
  const grab = async () => { await p.waitForTimeout(250); (await p.evaluate(() => { addHears(); return [...document.querySelectorAll('.hearbtn')].map(b => b.dataset.v); })).forEach(x => got.add(x)); };
  await p.evaluate(() => { Object.values(S.kids).forEach(k => k.readAloud = 'on'); save(); });
  for (const kid of ['rosie', 'ava', 'leo']) {
    await p.evaluate(k => { DB.session = { role: 'kid', kid: k }; S.tab = 'home'; render(); }, kid);
    for (const tab of ['home', 'explore', 'build', 'market', 'buddies']) {
      await p.evaluate(t => { S.tab = t; render(); }, tab); await grab();
      if (tab === 'market') for (const c of ['Buildings', 'Decor', 'Buddies', 'Holiday']) { await p.evaluate(c => { ui.cat = c; render(); }, c); await grab(); }
      if (tab === 'market') for (const sl of ['acc', 'top', 'bottom', 'shoes', 'back']) { await p.evaluate(sl => { ui.cat = 'Outfits'; ui.slot = sl; render(); }, sl); await grab(); }
    }
    for (const t of Object.keys(await p.evaluate(() => Object.fromEntries(Object.keys(ROOMS).filter(k => k !== 'event').map(k => [k, 1]))))) {
      const tabs = await p.evaluate(t => { openRoom({ t, id: 'crawl-' + t, i: 9, j: 6 }); return ROOMS[t].tabs.map(x => x[0]); }, t);
      for (const tb of tabs) { await p.evaluate(tb => { ui.room.tab = tb; drawRoom(); }, tb); await grab(); }
      await p.evaluate(() => roomClose());
    }
    for (const r of ['bolt', 'lexi', 'kindy', 'penny', 'sprout', 'cosmo', 'wave']) { await p.evaluate(r => openRobot(r), r); await grab(); await p.evaluate(() => closeSheet()); }
    await p.evaluate(() => { const t = todays(K().id).find(x => x.status === 'todo'); if (t){ ui.done = { id: t.id, act: 'home', note: 'All done!', photo: null }; openSheet(doneSheet()); } }); await grab(); await p.evaluate(() => closeSheet());
    await p.evaluate(() => A.openChat()); await grab(); await p.evaluate(() => closeSheet());
    await p.evaluate(() => openEvent()); for (const tb of ['ch', 'catch', 'craft', 'rw']) { await p.evaluate(tb => { ui.room.tab = tb; drawRoom(); }, tb); await grab(); } await p.evaluate(() => roomClose());
  }
  const cat = await p.evaluate(() => voiceCatalog());
  const sents = await p.evaluate(list => { const o = new Set(); list.forEach(x => vsplit(x).forEach(s => o.add(s))); return [...o]; }, [...got]);
  fs.writeFileSync(process.argv[2], JSON.stringify({ catalog: cat, crawled: sents }, null, 1));
  console.log('catalog', cat.length, 'crawled sentences', sents.length, 'errors', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
