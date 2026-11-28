// Daily Readings v34 — automated checks. Run: node test.js   (needs: npm install playwright)
// Every check is date-proof: expectations are computed from the day the suite runs, or use fixed past dates.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const DIR = __dirname;
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain' };

const MOCK = {
  pascha_distance: 42,
  summary_title: "Ss. Cyrus and John; Ss. Sergius and Herman of Valaam",
  titles: [
    "Translation of the relics of Ss. Cyrus and John the Unmercenaries (412)",
    "Ss. Sergius and Herman, abbots of Valaam (1353)",
    "Icon of the Most Holy Theotokos 'Of the Three Hands'",
    "Ven. Sennuphius the Standard-Bearer of Egypt (4th c.)",
    "Righteous Anna (Hannah), mother of the prophet Samuel Righteous Anna (Hannah), mother of the prophet Samuel"
  ],
  fast_level_desc: "Apostles Fast",
  fast_exception_desc: "Wine and Oil are Allowed",
  feasts: [], saints: [], service_notes: [],
  stories: [
    { title: "Ss. Sergius and Herman of Valaam",
      story: "The holy founders of Valaam monastery laboured in asceticism on the island of Valaam in Lake Ladoga.\n\nTheir relics remain at the monastery they founded." }
  ],
  readings: [
    { source: "Epistle", display: "Romans 9:1-5",
      passage: [
        { verse: 1, content: "KJV Rom I say the truth in Christ, I lie not," },
        { verse: 2, content: "KJV Rom heaviness and continual sorrow." },
        { verse: 3, content: "KJV Rom accursed from Christ for my brethren." }
      ] },
    { source: "Gospel", desc: "Apostles", display: "Matthew 9:18-26",
      passage: [
        { verse: 18, content: "KJV Matt there came a certain ruler." },
        { verse: 19, content: "KJV Matt Jesus arose and followed him." }
      ] },
    { source: "6th Matins Gospel", display: "Luke 24:36-53",
      passage: [
        { verse: 36, content: "KJV Luke Jesus himself stood in the midst of them." },
        { verse: 37, content: "KJV Luke they were terrified and affrighted." }
      ] }
  ]
};
const clone = o => JSON.parse(JSON.stringify(o));
const MOCK_STRICT = clone(MOCK); MOCK_STRICT.fast_level_desc = "Fast"; MOCK_STRICT.fast_exception_desc = "";
const MOCK_NOFAST = clone(MOCK);
// St Vladimir case: the record carries a fish allowance that applies only when the day falls on Wed/Fri.
MOCK_NOFAST.fast_level_desc = "No Fast"; MOCK_NOFAST.fast_exception_desc = "Fish, Wine and Oil are Allowed";

// A server that can mount different folders under different paths (to mimic GitHub Pages).
function serve(port, mounts){
  const srv = http.createServer((req,res)=>{
    let p = decodeURIComponent(req.url.split('?')[0]);
    const m = mounts.find(([prefix])=>p.startsWith(prefix));
    if(!m){ res.writeHead(404); res.end('nf'); return; }
    let rel = p.slice(m[0].length); if(rel==='' || rel.endsWith('/')) rel += 'index.html';
    const f = path.join(typeof m[1]==='function' ? m[1]() : m[1], rel);
    fs.readFile(f,(e,buf)=>{
      if(e){ res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream', 'Cache-Control':'no-cache'});
      res.end(buf);
    });
  });
  return new Promise(r=>srv.listen(port,()=>r(srv)));
}
function mockBolls(route){
  const m = route.request().url().match(/NKJV\/(\d+)\/(\d+)\//);
  if(!m){ route.abort(); return; }
  const verses = [];
  for(let n=1;n<=60;n++) verses.push({ pk:n, verse:n, text: `NKJV B${m[1]} C${m[2]} v${n}${n===1?' <i>em</i>':''} text.` });
  route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(verses) });
}
async function mockApi(target, data){
  await target.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(data) }));
  await target.route('**bolls.life/**', mockBolls);
  await target.route('**allorigins.win/**', r=> r.abort());
}

const results = [];
function check(name, cond){ results.push((cond?'PASS':'FAIL')+' — '+name); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function tab(page, name){ await page.click(`.tab[data-tab="${name}"]`); await page.waitForTimeout(150); }
async function visibleView(page){ return page.evaluate(()=>['today','calendar','scripture','prayer','settings'].find(t=>!document.getElementById('view-'+t).hidden)); }
async function setDate(page, iso){
  // jump the Today view to a date (as the calendar's "Open this day" does)
  await page.evaluate(iso=>{ const p=iso.split('-'); window.__selectDay(new Date(+p[0],+p[1]-1,+p[2])); document.getElementById('dpOpen').click(); }, iso);
}
const ACCENTS = /[̀-ͯΆΈ-ΊΌΎ-ΐά-ΰό-ώἀ-῿]/;

(async()=>{
  const PORT = 8099, base = `http://localhost:${PORT}/`;
  const server = await serve(PORT, [['/', DIR]]);
  const browser = await chromium.launch({ executablePath: EXE });

  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const jd = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - 13);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ymd = '' + jd.getFullYear() + String(jd.getMonth()+1).padStart(2,'0') + String(jd.getDate()).padStart(2,'0');
  const expectedOCUrl = 'https://orthochristian.com/calendar/' + ymd + '.html';
  const expHTM = 'https://www.holytrinityorthodox.com/calendar/calendar.php?month='+(t0.getMonth()+1)+
    '&today='+t0.getDate()+'&year='+t0.getFullYear()+'&dt=1&header=1&lives=1&trp=1&scripture=1';
  const expAzbyka = 'https://azbyka.ru/worships/?date='+t0.getFullYear()+'-'+
    String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0');

  // ================= 1. TODAY — design, content and engines =================
  let ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1 });
  let page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e=>pageErrors.push(e.message));
  await page.addInitScript(()=>{ navigator.share = (o)=>{ window.__shared=o; return Promise.resolve(); };
    window.__copied=null; Object.defineProperty(navigator,'clipboard',{value:{writeText:v=>{window.__copied=v;return Promise.resolve();}},configurable:true}); });
  await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});

  // --- design language ---
  const design = await page.evaluate(()=>{
    const cs = e=>getComputedStyle(e);
    const root = cs(document.documentElement);
    return {
      bg: cs(document.body).backgroundColor,
      card: cs(document.querySelector('.card')).backgroundColor,
      ink: cs(document.body).color,
      tokens: ['--burg','--gold','--bg','--card','--ink','--line'].map(t=>root.getPropertyValue(t).trim().toUpperCase()).join(','),
      title: document.querySelector('.brand .t').textContent, sub: document.querySelector('.brand .s').textContent,
      cross: !!document.querySelector('.top .cross svg use[href="#i-cross"]'),
      serif: cs(document.querySelector('.qtext')).fontFamily, sans: cs(document.querySelector('.tab')).fontFamily,
      radius: cs(document.querySelector('.card')).borderTopLeftRadius
    };
  });
  check('palette: warm ivory ground, white cards, primary text #302B25', design.bg==='rgb(250, 247, 239)' && design.card==='rgb(255, 255, 255)' && design.ink==='rgb(48, 43, 37)');
  check('palette tokens as briefed (burgundy, gold, ivory, card, text, borders)', design.tokens==='#641E28,#C5A46D,#FAF7EF,#FFFFFF,#302B25,#E5DFD4');
  check('header: cross, "Daily Readings", "Your daily spiritual companion."', design.cross && design.title==='Daily Readings' && design.sub==='Your daily spiritual companion.');
  check('serif for Scripture and sayings, sans-serif for the interface', /Literata/.test(design.serif) && !/Literata/.test(design.sans));
  check('softly rounded cards (16px)', design.radius==='16px');
  const crossDraw = await page.evaluate(()=>document.querySelector('#i-cross path').getAttribute('d'));
  check('Orthodox cross: foot-bar raised on the viewer’s left (Christ’s right)', /M8 17\.5l8 4/.test(crossDraw));
  const fontOK = await page.evaluate(async()=>{ await document.fonts.load('16px Literata','Ἐν ἀρχῇ ἦν ὁ λόγος In the beginning'); await document.fonts.ready;
    const loaded=[...document.fonts].filter(f=>f.family.replace(/"/g,'')==='Literata' && f.status==='loaded').map(f=>f.unicodeRange);
    return loaded.some(r=>/U\+1F00-1FFF/i.test(r)) && loaded.some(r=>/U\+0?370/i.test(r)) && loaded.some(r=>/U\+0{0,3}0-0{0,2}FF/i.test(r)); });
  check('bundled serif loads for English and polytonic Greek', fontOK===true);

  // --- bottom navigation ---
  const nav = await page.evaluate(()=>{
    const t=document.querySelector('.tabs'), r=t.getBoundingClientRect();
    return { labels:[...t.querySelectorAll('.tab span')].map(s=>s.textContent).join(','),
      icons:t.querySelectorAll('.tab svg').length, fixed:getComputedStyle(t).position==='fixed',
      bottom:Math.round(r.bottom)===innerHeight, active:document.querySelector('.tab.active').getAttribute('data-tab'),
      pad: parseFloat(getComputedStyle(document.body).paddingBottom) >= r.height };
  });
  check('five-tab bar: Today, Calendar, Scripture, Prayer, Settings with icons', nav.labels==='Today,Calendar,Scripture,Prayer,Settings' && nav.icons===5);
  check('tab bar fixed to the bottom, Today active, page padded so nothing hides behind it', nav.fixed && nav.bottom && nav.active==='today' && nav.pad);

  // --- liturgical colour engine (unchanged from v33) ---
  const lit = await page.evaluate((mock)=>({
    natTheot: window.__litKey(new Date(2026,8,21), mock, ''), exalt: window.__litKey(new Date(2026,8,27), mock, ''),
    transfig: window.__litKey(new Date(2026,7,19), mock, ''), pascha: window.__litKey(new Date(2026,3,12), mock, ''),
    pentecost:window.__litKey(new Date(2026,4,31), mock, ''),
    martyr:   window.__litKey(new Date(2026,9,20), {summary_title:'Great-martyr Artemius'}, 'Fast'),
    prophet:  window.__litKey(new Date(2026,6,16), {summary_title:'Holy Prophet Elias'}, ''),
    theotIcon:window.__litKey(new Date(2026,9,22), {summary_title:'Icon of the Most Holy Theotokos of Kazan'}, ''),
    lentWk:   window.__litKey(new Date(2027,2,10), {summary_title:'Ven. Somebody'}, 'Lenten Fast'),
    plain:    window.__litKey(new Date(2026,6,16), {summary_title:'Ss. Cyrus and John'}, 'Fast'),
    beheading:window.__litKey(new Date(2026,8,11), {summary_title:'Beheading of St John the Baptist'}, 'Fast')
  }), MOCK);
  check('lit: Theotokos feast blue · Cross violet · Transfiguration white', lit.natTheot==='blue' && lit.exalt==='violet' && lit.transfig==='white');
  check('lit: Pascha red · Pentecost green · martyr red · prophet green', lit.pascha==='red' && lit.pentecost==='green' && lit.martyr==='red' && lit.prophet==='green');
  check('lit: Theotokos icon blue · Lent weekday violet · Beheading red', lit.theotIcon==='blue' && lit.lentWk==='violet' && lit.beheading==='red');
  check('lit: undetermined day has no named colour', lit.plain==='burgundy');
  const domLit = await page.evaluate((mock)=>({ applied: document.documentElement.getAttribute('data-lit'),
    expected: window.__litKey(new Date(), mock, mock.fast_level_desc), row: !document.getElementById('litRow').classList.contains('hidden') }), MOCK);
  check('liturgical colour applied; indicator row only when the colour is determined', domLit.applied===domLit.expected && domLit.row===(domLit.expected!=='burgundy'));
  const litUI = await page.evaluate(()=>{ window.__selectDay(new Date(2026,7,19)); document.getElementById('dpOpen').click(); return true; });
  await page.waitForFunction(()=>/19 August 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  const litRow = await page.evaluate(()=>({ shown:!document.getElementById('litRow').classList.contains('hidden'), text:document.getElementById('litText').textContent }));
  check('Transfiguration shows the liturgical colour indicator: White', litUI && litRow.shown && litRow.text==='White');
  await page.click('#today'); await page.waitForTimeout(300);

  // --- day card ---
  const osExp = jd.getDate()+' '+MONTHS[jd.getMonth()]+', Old Style';
  const day = await page.evaluate(()=>({ wd:document.querySelector('#date .wd').textContent, dmy:document.querySelector('#date .dmy').textContent,
    all:document.getElementById('date').textContent, alt:document.getElementById('altdate').textContent,
    tone:window.__toneOfWeek(new Date()), todayHidden:document.getElementById('today').classList.contains('hidden'),
    summary:document.getElementById('summary').textContent, ctlInCard: !!document.querySelector('#dayCard #prev') && !!document.querySelector('#dayCard #next') && !!document.querySelector('#dayCard #today') }));
  const expWd = t0.toLocaleDateString('en-AU',{weekday:'long'}), expDmy = t0.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
  check('Gregorian date: weekday line over the date', day.wd===expWd && day.dmy===expDmy && day.all===expWd+' '+expDmy);
  check('Julian (Old Style) date with the tone of the week', day.alt.replace(/\u00a0/g,' ')===osExp+(day.tone? ' · Tone '+day.tone : ''));
  check('previous, next and return-to-today live in the day card; return hidden on today', day.ctlInCard && day.todayHidden);
  check('feast / day headline shown', /Cyrus|Sergius/.test(day.summary));
  const fast = await page.evaluate(()=>({ cat:document.getElementById('fastWrap').getAttribute('data-cat'), txt:document.getElementById('fastText').textContent,
    exc:document.getElementById('fastExc').textContent, key:document.getElementById('fastKey').textContent }));
  check('fasting guidance with colour category (wine & oil)', fast.cat==='wine' && fast.txt==='Apostles Fast' && /Wine and Oil/.test(fast.exc) && fast.key==='Fasting');

  // --- tones, Paschalion, tracker ---
  const tones = await page.evaluate(()=>[[2026,2,1],[2026,3,19],[2026,3,26],[2026,7,2],[2026,10,24],[2027,0,3],[2026,3,5],[2026,3,12],[2026,3,18]].map(a=>window.__toneOfWeek(new Date(a[0],a[1],a[2]))));
  check('tone of the week matches OrthoChristian on six dates', tones.slice(0,6).join(',')==='5,1,2,8,8,6');
  check('no tone from Palm Sunday through Bright Saturday', tones[6]===null && tones[7]===null && tones[8]===null);
  const paschas = await page.evaluate(()=>[2026,2027,2028,2029,2030].map(y=>window.__paschaCivil(y).toDateString()));
  check('Paschalion 2026–2030: 12 Apr, 2 May, 16 Apr, 8 Apr, 28 Apr', paschas.join('|')==='Sun Apr 12 2026|Sun May 02 2027|Sun Apr 16 2028|Sun Apr 08 2029|Sun Apr 28 2030');
  const chips = await page.$$eval('#tracker .chip', n=>n.map(x=>x.textContent));
  let nextP = null; for(const y of [t0.getFullYear(), t0.getFullYear()+1]){ const P = await page.evaluate(y=>window.__paschaCivil(y).getTime(), y); if(P>t0.getTime()){ nextP=P; break; } }
  const expPd = Math.round((nextP - t0.getTime())/86400000);
  check('tracker: Pascha countdown ('+expPd+' days), next feast, no fast names', chips.some(c=>c==='Pascha in '+expPd+' days') && chips.some(c=>/^Next feast:/.test(c)) && !chips.some(c=>/Fast|Lent/.test(c)));

  // --- order of the home screen ---
  const order = await page.evaluate(()=>{
    const before=(a,b)=>!!(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before('#dayCard','#quoteCard') && before('#quoteCard','#readings') && before('#readings','#commemCard') && before('#commemCard','#livesCard') && before('#livesCard','#toPrayer');
  });
  check('home order: day → Wisdom → Holy Scripture → Saints → prayer link', order===true);

  // --- Wisdom of the Fathers ---
  const fjson = JSON.parse(fs.readFileSync(path.join(DIR,'fathers.json'),'utf8'));
  const doy = Math.round((t0 - new Date(t0.getFullYear(),0,1))/86400000);
  const expQ = fjson.quotes[doy % fjson.quotes.length];
  const quote = await page.evaluate(()=>({ q:document.getElementById('quoteText').textContent, by:document.getElementById('quoteBy').textContent,
    small:(document.querySelector('#quoteBy small')||{}).textContent||'', share:!!document.getElementById('quoteShare') }));
  check('saying of the day with clear attribution', quote.q.indexOf(expQ.q.slice(0,40))>-1 && quote.by.indexOf(expQ.by)===0);
  check('source reference shown where available; share button on the card', quote.small===(expQ.src||'') && quote.share);
  const clampProbe = await page.evaluate(()=>{
    const long = 'A very long saying of the fathers that certainly runs past the two hundred and twenty character clamp threshold, so the wisdom card folds it to four lines and offers a read-more control for the reader, and nothing is lost by it at all.';
    const orig = window.__setFathers({quotes:[{q:long, by:'Test Father'}]});
    const t=document.getElementById('quoteText'), m=document.getElementById('quoteMore');
    const clamped1 = t.classList.contains('clamped') && !m.classList.contains('hidden');
    m.click(); const expanded = !t.classList.contains('clamped') && /Show less/.test(m.textContent);
    window.__setFathers({quotes:[{q:'Short saying.', by:'Test Father'}]});
    const short1 = !t.classList.contains('clamped') && m.classList.contains('hidden');
    window.__setFathers(orig);
    return {clamped1, expanded, short1};
  });
  check('long saying folds with read-more; short saying never folds', clampProbe.clamped1 && clampProbe.expanded && clampProbe.short1);

  // --- Holy Scripture on Today ---
  const tools = await page.evaluate(()=>({ lang:!!document.querySelector('#readingsCtl #langSeg'), txt:!!document.querySelector('#readingsCtl #txtSeg'),
    size:!!document.querySelector('#scriptureHead #sizeSeg'), all:!document.getElementById('openAllBtn').classList.contains('hidden'),
    langActive:document.querySelector('#langSeg button.active').getAttribute('data-lang') }));
  check('reading controls: English/Parallel/Greek, KJV/NKJV, size, open-all', tools.lang && tools.txt && tools.size && tools.all && tools.langActive==='en');
  const nVerses = await page.$$eval('.reading .body .v', n=>n.length);
  const badges = await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent));
  const nk = await page.evaluate(()=>({ seg:document.querySelector('#txtSeg button.active').getAttribute('data-txt'), note:!document.getElementById('nkjvNote').classList.contains('hidden') }));
  check('NKJV swapped in (32 verses), every reading badged NKJV', nVerses===32 && badges.join(',')==='NKJV,NKJV,NKJV');
  check('NKJV default with copyright note', nk.seg==='nkjv' && nk.note===true);
  const srcLabels = await page.$$eval('.reading .src', n=>n.map(x=>x.textContent));
  check('reading labels: Epistle · Gospel — Apostles · 6th Matins Gospel', srcLabels.join('|')==='Epistle|Gospel — Apostles|6th Matins Gospel');
  const readingsClosed = await page.$$eval('.reading .body', ns=>ns.every(n=>getComputedStyle(n).display==='none'));
  await page.click('.reading .head');
  const firstOpen = await page.$eval('.reading .body', n=>getComputedStyle(n).display!=='none');
  check('readings fold; a tap opens one (expandable cards)', readingsClosed && firstOpen);
  await page.click('#langSeg button[data-lang="par"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===32,{timeout:5000}).catch(()=>{});
  const stillOpen = await page.evaluate(()=>document.querySelectorAll('.reading.open').length===1 && document.querySelector('.reading').classList.contains('open'));
  check('changing language keeps the open reading open', stillOpen===true);
  await page.click('#langSeg button[data-lang="en"]'); await page.waitForTimeout(200);
  await page.click('#openAllBtn');
  const allOpen = await page.$$eval('.reading', ns=>ns.every(n=>n.classList.contains('open')));
  const lblClose = await page.textContent('#openAllBtn');
  await page.click('#openAllBtn');
  const allClosed = await page.$$eval('.reading', ns=>ns.every(n=>!n.classList.contains('open')));
  check('open-all opens every reading and toggles back', allOpen && /Close all/.test(lblClose) && allClosed);

  // --- Saints of the Day ---
  const commClosed = await page.$eval('#commemList', e=>getComputedStyle(e).display==='none' || getComputedStyle(e.parentElement).display==='none');
  await page.click('#commemHead');
  const commems = await page.$$eval('#commemList li', n=>n.map(x=>x.textContent));
  const commemHref = await page.getAttribute('#commemLink','href');
  const commCount = await page.textContent('#commemCount');
  await page.click('#commemHead');
  check('commemorations fold by default and open with a count', commClosed && commems.length>=4 && commCount===String(commems.length));
  check('doubled feed entry collapsed (Righteous Anna case)', commems.includes('Righteous Anna (Hannah), mother of the prophet Samuel') && !commems.some(t=>/Samuel Righteous/.test(t)));
  check('complete-list link → exact OrthoChristian day page', commemHref===expectedOCUrl);
  const lifeTitle = await page.textContent('#livesList details summary');
  await page.click('#livesList details summary');
  const lifeParas = await page.$$eval('#livesList details .ltext p', n=>n.length);
  await page.click('#livesList details summary');
  const livesAttr = await page.$eval('#livesCard .tattr', e=>e.textContent);
  check('Lives of the Saints: expandable entries, Abbamoses attribution', /Sergius/.test(lifeTitle) && lifeParas===2 && /Abbamoses/.test(livesAttr) && /John Brady/.test(livesAttr));

  // --- parish supplement (unchanged) ---
  const suppUnit = await page.evaluate(()=>({
    iveron: window.__supplementFor(new Date(2026,10,24), ['Martyrs Menas, Victor and Vincent','Our Righteous Father Theodore the Studite (826)']),
    dedup:  window.__supplementFor(new Date(2026,10,24), ['Iveron Icon of the Mother of God']),
    gabriel:window.__supplementFor(new Date(2026,10,2), []), plain: window.__supplementFor(new Date(2026,10,25), []) }));
  check('supplement: Montreal Iveron 24 Nov · skipped if upstream has it · St Gabriel 2 Nov · silent otherwise',
    suppUnit.iveron.length===1 && /Montreal.*Iveron/.test(suppUnit.iveron[0]) && suppUnit.dedup.length===0 && suppUnit.gabriel.length===1 && /Urgebadze/.test(suppUnit.gabriel[0]) && suppUnit.plain.length===0);
  await setDate(page, '2026-11-24');
  await page.waitForFunction(()=>/24 November 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  await page.click('#commemHead');
  const supp = await page.evaluate(()=>({ li:[...document.querySelectorAll('#commemList li.supp')].map(x=>x.textContent),
    note:!document.getElementById('commemSuppNote').classList.contains('hidden'),
    glyph:getComputedStyle(document.querySelector('#commemList li.supp'),'::after').content }));
  await page.click('#commemHead');
  check('24 Nov: Montreal Iveron rendered with ✦ and its attribution', supp.li.length===1 && /Montreal/.test(supp.li[0]) && supp.note && /✦/.test(supp.glyph));
  await page.click('#today'); await page.waitForTimeout(400);

  // --- St Theophan / Gospel selection (unchanged) ---
  const gsel = await page.evaluate(()=>[window.__gospelRef([
      {source:'9th Matins Gospel', display:'John 20:19-31'}, {source:'Epistle', display:'1 Corinthians 3:9-17'},
      {source:'Epistle', desc:'Prophet Elijah', display:'James 5:10-20'}, {source:'Gospel', display:'Matthew 14:22-34'},
      {source:'Gospel', desc:'Prophet Elijah', display:'Luke 4:22-30'}]),
    window.__gospelRef([{source:'Matins Gospel', display:'Luke 1:39-49'},{source:'Gospel', desc:'Theotokos', display:'Luke 10:38-42'}])]);
  check('St Theophan follows the Liturgy Gospel, never the Matins Gospel', gsel[0]==='Matthew 14:22-34' && gsel[1]==='Luke 10:38-42');

  // --- year engine (unchanged) ---
  const yr = await page.evaluate(()=>{
    const ev=window.__yearEvents(2026), names=ev.feasts.map(f=>f.name);
    return { n: ev.feasts.length, first: ev.feasts[0].name+'|'+ev.feasts[0].d.toDateString(), pascha: ev.feasts.find(f=>f.pascha).d.toDateString(),
      annBeforePascha: names.indexOf('Annunciation') < names.findIndex(n=>/PASCHA/.test(n)),
      fasts: ev.fasts.map(f=>f.name+'|'+f.s.toDateString()+'|'+f.e.toDateString()) };
  });
  check('year 2026: thirteen feasts, Nativity 7 Jan first, Pascha 12 Apr', yr.n===13 && yr.first==='Nativity of Christ|Wed Jan 07 2026' && yr.pascha==='Sun Apr 12 2026' && yr.annBeforePascha);
  check('year 2026: five fasting seasons with the right dates', yr.fasts.length===5 &&
    /Nativity Fast\|Fri Nov 28 2025\|Tue Jan 06 2026/.test(yr.fasts[0]) && /Great Lent & Holy Week\|Mon Feb 23 2026\|Sat Apr 11 2026/.test(yr.fasts[1]) &&
    /Apostles’ Fast\|Mon Jun 08 2026\|Sat Jul 11 2026/.test(yr.fasts[2]) && /Dormition Fast\|Fri Aug 14 2026\|Thu Aug 27 2026/.test(yr.fasts[3]) &&
    /Nativity Fast\|Sat Nov 28 2026\|Wed Jan 06 2027/.test(yr.fasts[4]));

  // --- fasting-rule engine (unchanged) + the colour categories built on it ---
  const fr = await page.evaluate(()=>{ const f=(y,m,d)=>window.__fastRule(new Date(y,m,d)); return {
    bright:f(2026,3,13), ordWed:f(2026,6,22), ordThu:f(2026,6,23), transfig:f(2026,7,19), dorm:f(2026,7,20), exalt:f(2026,8,27),
    trinityFri:f(2026,5,5), apSat:f(2026,5,13), natStrict:f(2027,0,4), svyatki:f(2027,0,8), entryFri:f(2026,11,4), forerunWed:f(2027,6,7),
    natMon:f(2026,11,7), lentSat:f(2027,2,20), lentWed:f(2027,2,17), apThu:f(2026,5,11), apMon:f(2026,5,8), lazarus:f(2027,3,24) }; });
  check('fastRule: Bright Monday free · ordinary Wed fast · ordinary Thu free', fr.bright.f===0 && fr.ordWed.f===1 && fr.ordThu.f===0);
  check('fastRule: Transfiguration strict with fish · Dormition weekday strict · Exaltation strict', fr.transfig.f===2 && fr.transfig.fish && /Transfiguration/.test(fr.transfig.feast) && fr.dorm.f===2 && !fr.dorm.fish && fr.exalt.f===2);
  check('fastRule: Trinity-week Friday free · Apostles Saturday fish · Nativity final days strict · Svyatki free', fr.trinityFri.f===0 && fr.apSat.f===1 && fr.apSat.fish && fr.natStrict.f===2 && fr.svyatki.f===0);
  check('fastRule: fish on the Entry (Fri 4 Dec 2026) and the Forerunner (Wed 7 Jul 2027)', fr.entryFri.fish && /Entry/.test(fr.entryFri.feast||'') && fr.forerunWed.f===1 && fr.forerunWed.fish);
  check('fastRule: Nativity-fast Monday wine & oil · Lent Saturday wine & oil · Lent Wednesday strict', fr.natMon.wineOil && !fr.natMon.fish && fr.lentSat.f===2 && fr.lentSat.wineOil && fr.lentWed.f===2 && !fr.lentWed.wineOil && !fr.lentWed.fish);
  check('fastRule: Apostles Thursday fish · Monday wine & oil · Lazarus Saturday wine & oil', fr.apThu.fish && fr.apMon.wineOil && fr.lazarus.f===2 && fr.lazarus.wineOil);
  const cats = await page.evaluate(()=>{ const c=(y,m,d)=>window.__dayRule(new Date(y,m,d)); return [c(2026,3,13),c(2026,6,22),c(2026,11,4),c(2026,11,7),c(2026,8,27),c(2027,2,10)].map(r=>r.cat+':'+r.label); });
  check('fasting categories: free · fast · fish · wine & oil · strict · cheesefare', cats.join('|')===
    'free:No fast|fast:Fast day|fish:Fast — fish, wine and oil allowed|wine:Fast — wine and oil allowed|strict:Strict fast|fish:Cheesefare week — no meat; dairy, eggs and fish');
  const season = await page.evaluate(()=>{ const s=window.__seasonOf(new Date(2026,11,4)); return s && s.name+'|'+s.day+'|'+s.len; });
  check('season engine: 4 Dec 2026 is day 7 of 40 of the Nativity Fast', season==='Nativity Fast|7|40');

  // --- share sheet and images ---
  await page.click('#shareBtn');
  const shareDay = await page.evaluate(()=>({ open:!document.getElementById('shareMenu').classList.contains('hidden'), title:document.getElementById('shareTitle').textContent,
    rows:[...document.querySelectorAll('#shareMenu .arow')].filter(r=>!r.classList.contains('hidden')).map(r=>r.id).join(',') }));
  await page.click('#shareTextBtn');
  const shared = await page.evaluate(()=>window.__shared);
  const menuClosed = await page.$eval('#shareMenu', e=>e.classList.contains('hidden'));
  check('day share sheet: text and image options; choosing one closes it', shareDay.open && shareDay.title==='Share this day' && shareDay.rows==='shareTextBtn,shareDayBtn' && menuClosed);
  check('shared text holds the date, headline and readings', !!shared && /Cyrus/.test(shared.text) && /Romans 9:1-5/.test(shared.text) && /Old Calendar/.test(shared.text));
  const tiles = await page.evaluate(()=>{
    function probe(kind){ const c=window.__buildTile(kind), x=c.getContext('2d');
      const px=x.getImageData(540,540,1,1).data, corner=x.getImageData(4,4,1,1).data; return { w:c.width, h:c.height, drawn:px[3]===255, corner:[corner[0],corner[1],corner[2]] }; }
    return { w:probe('wisdom'), d:probe('day') };
  });
  check('wisdom image: 1080px square on ivory', tiles.w.w===1080 && tiles.w.h===1080 && tiles.w.drawn && tiles.w.corner.join(',')==='250,247,239');
  check('feast-day image: 1080px square on burgundy', tiles.d.w===1080 && tiles.d.drawn && tiles.d.corner.join(',')==='100,30,40');
  await page.click('#quoteShare');
  const shareQ = await page.evaluate(()=>({ title:document.getElementById('shareTitle').textContent,
    rows:[...document.querySelectorAll('#shareMenu .arow')].filter(r=>!r.classList.contains('hidden')).map(r=>r.id).join(',') }));
  await page.click('#copyQuoteBtn'); await page.waitForTimeout(150);
  const copiedQ = await page.evaluate(()=>window.__copied);
  check('saying share sheet: image, text, copy; copy carries the attribution', shareQ.title==='Share the saying' && shareQ.rows==='shareWisdomBtn,shareQuoteTextBtn,copyQuoteBtn' && copiedQ && copiedQ.indexOf(expQ.by)>-1);
  const tileShare = await page.evaluate(()=>new Promise(res=>{
    window.__shared=null; navigator.canShare=()=>true;
    document.getElementById('quoteShare').click(); document.getElementById('shareWisdomBtn').click();
    let n=0;(function poll(){ n++; if(window.__shared||n>60) res(window.__shared&&window.__shared.files?{name:window.__shared.files[0].name,size:window.__shared.files[0].size}:null); else setTimeout(poll,50); })();
  }));
  check('wisdom image shares as a PNG file', !!tileShare && /wisdom\.png$/.test(tileShare.name) && tileShare.size>20000);

  // --- reading size (Scripture, sayings and lives; the interface keeps its size) ---
  const tabFont0 = await page.$eval('.tab', e=>getComputedStyle(e).fontSize);
  await page.click('#sizeSeg button[data-sz="+"]');
  const rs1 = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--rs').trim());
  const tabFont1 = await page.$eval('.tab', e=>getComputedStyle(e).fontSize);
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const rs2 = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--rs').trim());
  await page.click('#sizeSeg button[data-sz="-"]');
  check('A+ enlarges reading text (1.1) and is remembered; navigation text unchanged', rs1==='1.1' && rs2==='1.1' && tabFont0===tabFont1);

  // --- KJV ---
  await page.click('#txtSeg button[data-txt="kjv"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===7,{timeout:5000}).catch(()=>{});
  const kjv = await page.evaluate(()=>({ v:document.querySelectorAll('.reading .body .v').length, b:[...document.querySelectorAll('.reading .ver')].map(x=>x.textContent).join(','), note:document.getElementById('nkjvNote').classList.contains('hidden') }));
  check('KJV choice restores the calendar’s own text, badges honest', kjv.v===7 && kjv.b==='KJV,KJV,KJV' && kjv.note);

  // ================= 2. CALENDAR =================
  await page.click('#date');
  const calOpen = { view: await visibleView(page), month: await page.textContent('#calTitle'), year: await page.textContent('#calYearBtn') };
  check('tapping the date opens the Calendar tab on the current month', calOpen.view==='calendar' && calOpen.month===MONTHS[t0.getMonth()] && calOpen.year===String(t0.getFullYear()));
  const grid = await page.evaluate(()=>({ cells:document.querySelectorAll('#calGrid .cd').length, wd:document.querySelectorAll('#calGrid .cwd').length,
    tod:document.querySelectorAll('#calGrid .cd.tod').length, legend:document.getElementById('calLegend').textContent }));
  check('month grid: 42 days + 7 weekday heads, today marked, colour legend', grid.cells===42 && grid.wd===7 && grid.tod===1 && /Strict fast/.test(grid.legend) && /Fish allowed/.test(grid.legend) && /Wine & oil/.test(grid.legend));
  await page.goBack(); await page.waitForTimeout(300);
  check('Back from the Calendar returns to Today and stays in the app', (await visibleView(page))==='today' && /8099/.test(page.url()));
  await tab(page,'calendar');
  for(let i=0;i<60;i++){
    const m = (await page.textContent('#calTitle')).trim(), y = parseInt(await page.textContent('#calYearBtn'),10);
    if(m==='August' && y===2026) break;
    await page.click((y*12+MONTHS.indexOf(m)) > 2026*12+7 ? '#calPrev' : '#calNext');
  }
  const aug19 = await page.evaluate(()=>{ const c=[...document.querySelectorAll('#calGrid .cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='19');
    return { cls:c.className, mk:(c.querySelector('.mk')||{}).textContent||'', title:c.title, aria:c.getAttribute('aria-label') }; });
  check('19 Aug 2026 cell: fish-allowed colour, feast cross, named in its label', /cat-fish/.test(aug19.cls) && /f2/.test(aug19.cls) && aug19.mk==='✚' && /Transfiguration/.test(aug19.title) && /fish/.test(aug19.aria));
  await page.evaluate(()=>[...document.querySelectorAll('#calGrid .cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='19').click());
  const panel = await page.evaluate(()=>({ view:['today','calendar'].find(t=>!document.getElementById('view-'+t).hidden), date:document.getElementById('dpDate').textContent,
    sub:document.getElementById('dpSub').textContent, pill:document.getElementById('dpPill').textContent, pillCat:document.getElementById('dpPill').className,
    feast:document.getElementById('dpFeast').textContent, sel:document.querySelectorAll('#calGrid .cd.sel').length }));
  check('first tap selects the day and shows its panel (date, Old Style, rule, feast)', panel.view==='calendar' && /19 August 2026/.test(panel.date) && /^6 August, Old Style/.test(panel.sub) && /fish/.test(panel.pill) && /cat-fish/.test(panel.pillCat) && /Transfiguration/.test(panel.feast) && panel.sel===1);
  await page.evaluate(()=>[...document.querySelectorAll('#calGrid .cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='19').click());
  await page.waitForFunction(()=>/19 August 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  const jumped = { view: await visibleView(page), todayBtn: await page.$eval('#today', e=>!e.classList.contains('hidden')),
    chips: await page.$$eval('#tracker .chip', n=>n.map(x=>x.textContent).join(' | ')), href: await page.getAttribute('#commemLink','href') };
  check('second tap opens that day on Today', jumped.view==='today' && /Transfiguration.*— today/.test(jumped.chips) && /20260806\.html$/.test(jumped.href));
  check('"Return to today" appears away from today', jumped.todayBtn===true);
  await page.click('#today'); await page.waitForTimeout(400);
  check('"Return to today" returns and hides', await page.$eval('#today', e=>e.classList.contains('hidden')));

  // week view
  await tab(page,'calendar');
  await page.click('#calSeg button[data-pane="week"]');
  const wk = await page.evaluate(()=>({ rows:document.querySelectorAll('#wkRows .wrow').length, mon:document.querySelector('#wkRows .wrow .wd small').textContent,
    sw:document.querySelectorAll('#wkRows .wrow .sw').length, sel:document.querySelectorAll('#wkRows .wrow.sel').length,
    os:/OS/.test(document.querySelector('#wkRows .wrow .wx small').textContent), panel:!document.getElementById('dayPanel').classList.contains('hidden') }));
  check('week view: seven rows from Monday with colour dots, Old Style dates, selected day', wk.rows===7 && wk.mon==='Mon' && wk.sw===7 && wk.sel===1 && wk.os && wk.panel);
  const wkT1 = await page.textContent('#wkTitle'); await page.click('#wkNext'); const wkT2 = await page.textContent('#wkTitle'); await page.click('#wkPrev');
  check('week arrows move a week', wkT1!==wkT2 && (await page.textContent('#wkTitle'))===wkT1);

  // year view
  await page.click('#calSeg button[data-pane="year"]');
  const yv = await page.evaluate(()=>({ rows:document.querySelectorAll('#yrBody .yrow').length, fasts:document.querySelectorAll('#yrBody .yfast').length,
    title:document.getElementById('yrTitle').textContent, panelHidden:document.getElementById('dayPanel').classList.contains('hidden') }));
  await page.click('#yrPrev'); const yPrev = await page.textContent('#yrTitle'); await page.click('#yrNext');
  check('year view: 13 great feasts and the fasting seasons; arrows change year', yv.rows===13 && yv.fasts>=4 && yv.title===String(t0.getFullYear()) && yPrev===String(t0.getFullYear()-1) && yv.panelHidden);
  const yrShared = await page.evaluate(()=>new Promise(res=>{ window.__shared=null; navigator.canShare=()=>true; document.getElementById('yrShare').click();
    let n=0;(function poll(){ n++; if(window.__shared||n>60) res(window.__shared&&window.__shared.files?window.__shared.files[0].name:null); else setTimeout(poll,50); })(); }));
  const tile2 = await page.evaluate(()=>{ const c=window.__buildYearTile(2026); const px=c.getContext('2d').getImageData(540,960,1,1).data; return {w:c.width,h:c.height,drawn:px[3]===255}; });
  check('year image: 1080×1920 PNG named for the year', yrShared==='church-year-'+t0.getFullYear()+'.png' && tile2.w===1080 && tile2.h===1920 && tile2.drawn);
  await page.$$eval('#yrBody .yrow', ns=>{ ns.find(n=>/PASCHA/.test(n.textContent)).click(); });
  const paschaThisYear = await page.evaluate(y=>window.__paschaCivil(y).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}), t0.getFullYear());
  await page.waitForFunction(p=>document.getElementById('date').textContent.indexOf(p)>-1, paschaThisYear, {timeout:5000});
  check('tapping Pascha in the year opens Pascha on Today', (await visibleView(page))==='today');
  await page.click('#today'); await page.waitForTimeout(300);

  // fasting notes and progress
  await tab(page,'calendar'); await page.click('#calSeg button[data-pane="month"]');
  await page.evaluate(()=>window.__selectDay(new Date(2026,6,22)));     // ordinary Wednesday, in the past
  const jVis = await page.$eval('#dpJournal', e=>!e.classList.contains('hidden'));
  await page.click('#logSeg button[data-log="k"]');
  const logged = await page.evaluate(()=>{ const cell=[...document.querySelectorAll('#calGrid .cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='22');
    return { store:JSON.parse(localStorage.getItem('user:fastlog')||'{}'), mark:!!(cell && cell.querySelector('.kept')),
      sum:document.getElementById('logSum').textContent, active:document.querySelector('#logSeg button.active').getAttribute('data-log') }; });
  check('fasting note: "Kept" is saved privately and marked on the day', jVis && logged.store['2026-07-22']==='k' && !!logged.mark && logged.active==='k');
  check('month summary counts fast days and your notes (no streaks or scores)', /July 2026: \d+ fast days by the general rule\. Your notes: 1 kept/.test(logged.sum) && !/streak|score|badge/i.test(logged.sum));
  await page.click('#logSeg button[data-log="p"]');
  const part = await page.evaluate(()=>JSON.parse(localStorage.getItem('user:fastlog'))['2026-07-22']);
  await page.click('#logSeg button[data-log=""]');
  const cleared = await page.evaluate(()=>!('2026-07-22' in JSON.parse(localStorage.getItem('user:fastlog'))));
  check('"In part" and "No note" update or clear the note', part==='p' && cleared);
  const futureFast = await page.evaluate(()=>{ const t=new Date(); for(let i=2;i<60;i++){ const d=new Date(t.getFullYear(),t.getMonth(),t.getDate()+i); if(window.__fastRule(d).f>0){ window.__selectDay(d); return !document.getElementById('dpJournal').classList.contains('hidden'); } } return null; });
  check('no note can be made for a future day', futureFast===false);
  await page.evaluate(()=>window.__selectDay(new Date(2026,11,4)));
  const prog = await page.evaluate(()=>({ txt:document.getElementById('seasonText').textContent, w:document.getElementById('seasonBar').style.width,
    note:document.querySelector('#fastCard .note').textContent }));
  check('season progress: Nativity Fast — day 7 of 40 with a simple bar', prog.txt==='Nativity Fast — day 7 of 40' && prog.w==='18%');
  check('discreet note: fasting guided by your spiritual father; notes stay on this device', /spiritual father/.test(prog.note) && /stay on this device/.test(prog.note));
  await page.click('.tab[data-tab="today"]'); await page.waitForTimeout(200);

  // ================= 3. PRAYER, SUPPORT =================
  await tab(page,'prayer');
  const pr = await page.evaluate(()=>({ rows:document.querySelectorAll('#view-prayer .lrow').length, t:document.getElementById('prayersTitle').textContent,
    h:document.getElementById('prayersLink').getAttribute('href'), hr:new Date().getHours(), alt:document.getElementById('prayersAltLink').getAttribute('href'),
    tropar:document.getElementById('troparLink').getAttribute('href'), theo:document.getElementById('theophanLink').getAttribute('href'),
    az:document.getElementById('azbykaLink').getAttribute('href'), azShown:!document.getElementById('azbykaCard').classList.contains('hidden'),
    pro:document.getElementById('prologueLink').getAttribute('href'), theoSub:document.getElementById('theophanSub').textContent,
    jv:document.querySelector('#troparLink .ltxt').textContent }));
  const MONL=['january','february','march','april','may','june','july','august','september','october','november','december'];
  check('Prayer tab: prayers, study links and parish support (7 rows)', pr.rows===7);
  check('daily prayers: the prayers for this time of day come first', pr.hr>=16 ? (pr.t==='Prayers Before Sleep' && /evening\.htm$/.test(pr.h) && /morning\.htm$/.test(pr.alt)) : (pr.t==='Morning Prayers' && /morning\.htm$/.test(pr.h) && /evening\.htm$/.test(pr.alt)));
  check('Jordanville (ROCOR) row → that day’s Holy Trinity calendar', pr.tropar===expHTM && /Jordanville Calendar \(ROCOR\)/.test(pr.jv));
  check('St Theophan → OrthoChristian day page, citing the Liturgy Gospel', pr.theo===expectedOCUrl && /Matthew 9:18-26/.test(pr.theoSub) && !/Luke 24/.test(pr.theoSub));
  check('Full Service Texts → azbyka for the civil date', pr.azShown && pr.az===expAzbyka);
  check('Prologue of Ohrid → the Old Style day', pr.pro==='https://www.myrrh-bearers.org/prologue/'+MONL[jd.getMonth()]+'/'+jd.getDate()+'.htm');
  check('Prologue handles 29 February Old Style', (await page.evaluate(()=>window.__prologueURL(new Date(2028,2,13))))==='https://www.myrrh-bearers.org/prologue/february/29.htm');
  await page.click('#supportLink');
  const supText = await page.$eval('.supPanel', e=>e.textContent);
  check('support sheet: parish name, Westpac, BSB 032-695, account 458 013', /Russian Orthodox Church Abroad/.test(supText) && /Wollongong Parish/.test(supText) && /032-695/.test(supText) && /458 013/.test(supText) && /Westpac/.test(supText) && /payment reference/.test(supText));
  await page.click('.supcopy[data-copy="032695"]'); await page.waitForTimeout(150);
  check('BSB copies digits only, with a tick', (await page.evaluate(()=>window.__copied))==='032695' && (await page.$eval('.supcopy[data-copy="032695"]', e=>e.textContent))==='✓');
  check('parish website link kept in the sheet', (await page.$eval('.supPanel a[href*="cerkov"]', e=>e.getAttribute('href')))==='https://wollongong.cerkov.ru/');
  await page.goBack(); await page.waitForTimeout(300);
  const afterBack1 = { sheet: await page.$eval('#supportOverlay', e=>e.classList.contains('hidden')), view: await visibleView(page) };
  await page.goBack(); await page.waitForTimeout(300);
  check('Back closes the sheet first, then returns to Today', afterBack1.sheet && afterBack1.view==='prayer' && (await visibleView(page))==='today' && /8099/.test(page.url()));

  // ================= 4. SETTINGS =================
  await page.click('#setBtn');
  const st = await page.evaluate(()=>({ view:!document.getElementById('view-settings').hidden, theme:document.querySelector('#themeSeg button.active').getAttribute('data-theme'),
    eds:[...document.querySelectorAll('#gkEdOpts .opt')].map(o=>o.getAttribute('data-ed')+(o.classList.contains('active')?'*':'')).join(','),
    cal:document.querySelector('.opt[data-cal="julian"]').classList.contains('active'), nc:document.querySelector('.opt[data-cal="revised"]').disabled,
    ncTxt:document.querySelector('.opt[data-cal="revised"]').textContent, about:document.getElementById('about').open, aboutTxt:document.getElementById('about').textContent,
    data:document.getElementById('dataLbl').textContent, ver:document.getElementById('verLbl').textContent }));
  check('header settings button opens Settings', st.view);
  check('appearance: theme Auto by default', st.theme==='auto');
  check('Greek editions offered separately: Byzantine Textform (chosen) and Patriarchal Text', st.eds==='rp*,pt');
  check('calendar: Old Calendar in use; New Calendar shown as not yet available, with the reason', st.cal && st.nc && /cannot be made by shifting dates/.test(st.ncTxt));
  check('About & sources folded; names every source and the Patriarchal transcription', !st.about && /Greek Horologion/.test(st.aboutTxt) && /Slavic Old-Calendar tradition/.test(st.aboutTxt) && /Antoniades/.test(st.aboutTxt) && /Robinson/.test(st.aboutTxt));
  check('saved-data summary and version shown', /days? of readings/.test(st.data) && / · v34/.test(st.ver));
  await page.click('#about summary');
  check('reading-size control in Settings shows the size', /^\d+%$/.test(await page.textContent('#scaleLbl')));
  await ctx.close();

  // ================= 5. GREEK — two editions, never mixed =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});
  check('Greek off by default (English)', (await page.$$eval('.reading .body .gk', n=>n.length))===0);
  await page.click('#langSeg button[data-lang="par"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===32,{timeout:5000}).catch(()=>{});
  const gk = await page.evaluate(()=>{
    const bodies=[...document.querySelectorAll('.reading .body')], first=bodies[0].querySelector('.gk');
    return { n:document.querySelectorAll('.reading .body .gk').length, per:bodies.map(b=>b.querySelectorAll('.gk').length).join(','),
      rom91:first?first.textContent:'', after:first? first.previousElementSibling.classList.contains('v') : false, lang:first?first.getAttribute('lang'):'',
      luke:(bodies[2].querySelector('.gk')||{}).textContent||'', note:document.getElementById('gkEdNote').textContent, noteShown:!document.getElementById('gkEdNote').classList.contains('hidden') };
  });
  check('Parallel: a Greek line under each of the 32 verses (5 + 9 + 18)', gk.n===32 && gk.per==='5,9,18');
  check('Greek sits under its own verse and is the right text (Romans 9:1, Luke 24:36)', gk.after && gk.lang==='grc' && /^1Ἀλήθειαν λέγω ἐν χριστῷ/.test(gk.rom91) && /^36Ταῦτα δὲ αὐτῶν λαλούντων/.test(gk.luke));
  check('the Greek edition is named under the readings', gk.noteShown && /Byzantine Textform \(Robinson–Pierpont, 2018\)/.test(gk.note));
  await page.click('#langSeg button[data-lang="grc"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===32,{timeout:5000}).catch(()=>{});
  const grc = await page.evaluate(()=>({ shownEn:[...document.querySelectorAll('.reading .body .v')].filter(v=>getComputedStyle(v).display!=='none').length,
    supShown:getComputedStyle(document.querySelector('.reading .body .gk sup')).display!=='none' }));
  check('Greek only: English hidden where Greek exists; verse numbers on the Greek', grc.shownEn===0 && grc.supShown);
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===32,{timeout:6000}).catch(()=>{});
  const persist = await page.evaluate(()=>({ n:document.querySelectorAll('.reading .body .gk').length, lang:localStorage.getItem('pref:lang'), old:localStorage.getItem('pref:greek') }));
  check('language choice remembered; the v33 Greek switch kept in step for older versions', persist.n===32 && persist.lang==='grc' && persist.old==='1');
  await page.click('#langSeg button[data-lang="par"]');
  await page.click('#txtSeg button[data-txt="kjv"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===7,{timeout:5000}).catch(()=>{});
  check('Greek pairs with the KJV text too', (await page.evaluate(()=>document.querySelectorAll('.reading .body .v').length+'/'+document.querySelectorAll('.reading .body .gk').length))==='7/7');
  // Patriarchal Text
  await page.click('#setBtn'); await page.click('#gkEdOpts .opt[data-ed="pt"]'); await page.click('.tab[data-tab="today"]');
  await page.waitForFunction(()=>{ const g=document.querySelector('.reading .body .gk'); return g && /^1αληθειαν λεγω εν χριστω/.test(g.textContent); },{timeout:5000}).catch(()=>{});
  const pt = await page.evaluate(acc=>{ const re=new RegExp(acc.slice(1,-1)); const gks=[...document.querySelectorAll('.reading .body .gk')].map(g=>g.textContent);
    return { n:gks.length, first:gks[0]||'', anyAccent:gks.some(t=>re.test(t)), note:document.getElementById('gkEdNote').textContent, ed:localStorage.getItem('pref:gkEd') }; }, ACCENTS.toString());
  check('Patriarchal Text selectable: Romans 9:1 from the 1904 edition', pt.n===7 && /^1αληθειαν λεγω εν χριστω/.test(pt.first) && pt.ed==='pt');
  check('never mixed: no Byzantine Textform line appears while the Patriarchal Text is chosen', pt.anyAccent===false && /Patriarchal Text \(Antoniades, 1904\/1912/.test(pt.note));
  await page.click('#setBtn'); await page.click('#gkEdOpts .opt[data-ed="rp"]'); await page.click('.tab[data-tab="today"]');
  await page.waitForFunction(()=>{ const g=document.querySelector('.reading .body .gk'); return g && /^1Ἀλήθειαν/.test(g.textContent); },{timeout:5000}).catch(()=>{});
  const rpBack = await page.evaluate(()=>[...document.querySelectorAll('.reading .body .gk')].every(g=>/[ἀ-῾ά-ώ]/.test(g.textContent)));
  check('switching back gives the accented Byzantine Textform throughout', rpBack===true);
  const data = await page.evaluate(async ()=>{
    const j=u=>fetch(u).then(r=>r.json());
    const r16=await j('greek/45/16.json'), r14=await j('greek/45/14.json'), a8=await j('greek/44/8.json');
    const pAc=await j('greek-pt/44.json'), pMk=await j('greek-pt/41.json'), p1j=await j('greek-pt/62.json'), pRo=await j('greek-pt/45.json');
    return { dox:r16['25']===r14['24'] && !!r16['27'], acts837rp:('37' in a8), acts837pt:('37' in pAc['8']), mk716pt:('16' in pMk['7']),
      comma:/\[\[εν τω ουρανω/.test(p1j['5']['7']), ptDox:pRo['16']['25']===pRo['14']['24'], ptBooks:27 };
  });
  check('Byzantine Textform: Romans doxology reachable at 16:25–27; Acts 8:37 absent (as printed)', data.dox && data.acts837rp===false);
  check('Patriarchal Text: Acts 8:37 present; Mark 7:16 absent; 1 John 5:7 in double brackets (as printed)', data.acts837pt && data.mk716pt===false && data.comma && data.ptDox);
  await ctx.close();
  // Old Testament reading: no Greek, with a plain note
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.addInitScript(()=>{ localStorage.setItem('pref:lang','par'); localStorage.setItem('pref:txt','kjv'); });
  const MOCK_OT = clone(MOCK);
  MOCK_OT.readings = [{ source:"Vespers", display:"Isaiah 1:1-3", passage:[{verse:1,content:"The vision of Isaiah."},{verse:2,content:"Hear, O heavens."},{verse:3,content:"The ox knoweth his owner."}] }];
  await mockApi(page, MOCK_OT);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000}); await page.waitForTimeout(400);
  const ot = await page.evaluate(()=>({ g:document.querySelectorAll('.reading .body .gk').length, note:(document.querySelector('.reading .body .gknote')||{}).textContent||'' }));
  check('Old Testament reading: no Greek, and a note says why', ot.g===0 && /New Testament readings/.test(ot.note));
  await ctx.close();

  // ================= 6. SCRIPTURE READER =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.addInitScript(()=>{ navigator.share = (o)=>{ window.__shared=o; return Promise.resolve(); };
    window.__copied=null; Object.defineProperty(navigator,'clipboard',{value:{writeText:v=>{window.__copied=v;return Promise.resolve();}},configurable:true}); });
  await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await tab(page,'scripture');
  await page.waitForFunction(()=>document.querySelectorAll('#rdBody .vs').length>0,{timeout:5000});
  const r0 = await page.evaluate(()=>({ t:document.getElementById('rdTitle').textContent, s:document.getElementById('rdSub').textContent, n:document.querySelectorAll('#rdBody .vs').length,
    prevDis:document.getElementById('rdPrev').disabled, next:document.getElementById('rdNext').textContent, ed:document.getElementById('rdEdition').textContent }));
  check('reader opens at Matthew 1 (25 verses), KJV named; nothing before Matthew 1', r0.t==='Matthew' && r0.s==='Chapter 1' && r0.n===25 && r0.prevDis && /Matthew 2/.test(r0.next) && /King James Version/.test(r0.ed));
  await page.click('#rdPick');
  const books = await page.$$eval('#pickBody .bklist button', n=>n.map(x=>x.textContent));
  check('book picker lists the 27 books of the New Testament in groups', books.length===27 && books[0]==='Matthew' && books[26]==='Revelation' && (await page.$$eval('#pickBody .bkgrp', n=>n.length))===5);
  await page.$$eval('#pickBody .bklist button', ns=>ns.find(b=>b.textContent==='John').click());
  check('chapter grid for John has 21 chapters', (await page.$$eval('#pickBody .chgrid button', n=>n.length))===21);
  await page.$$eval('#pickBody .chgrid button', ns=>ns.find(b=>b.textContent==='3').click());
  await page.waitForSelector('#rdBody[data-ch="43:3"]',{timeout:5000});
  const j316 = await page.evaluate(()=>({ sheet:document.getElementById('pickSheet').classList.contains('hidden'), t:document.getElementById('rdTitle').textContent,
    v16:document.querySelector('#rdBody .vs[data-v="16"]').textContent }));
  check('choosing John 3 opens it; verse 16 reads correctly', j316.sheet && j316.t==='John' && /For God so loved the world/.test(j316.v16));
  await page.click('#rdNext'); const n4 = await page.waitForSelector('#rdBody[data-ch="43:4"]',{timeout:5000}).then(()=>true).catch(()=>false);
  await page.click('#rdPrev'); const n3 = await page.waitForSelector('#rdBody[data-ch="43:3"]',{timeout:5000}).then(()=>true).catch(()=>false);
  check('next and previous chapter', n4 && n3);
  // verse actions
  await page.click('#rdBody .vs[data-v="16"]');
  const vsRef = await page.textContent('#vsRef');
  await page.click('#vsCopy'); await page.waitForTimeout(150);
  const copiedV = await page.evaluate(()=>window.__copied);
  check('tap a verse: its reference; Copy gives text with reference and translation', vsRef==='John 3:16' && /^For God so loved the world/.test(copiedV) && /— John 3:16 \(KJV\)$/.test(copiedV));
  await page.click('#rdBody .vs[data-v="16"]'); await page.click('#vsShare'); await page.waitForTimeout(100);
  check('Share sends the verse with its reference', /John 3:16/.test((await page.evaluate(()=>window.__shared&&window.__shared.text))||''));
  await page.click('#rdBody .vs[data-v="16"]'); await page.click('#vsMark');
  await page.click('#rdBody .vs[data-v="17"]'); await page.click('#vsHl');
  const marks = await page.evaluate(()=>({ bm:document.querySelector('#rdBody .vs[data-v="16"]').classList.contains('bm'), hl:document.querySelector('#rdBody .vs[data-v="17"]').classList.contains('hl'),
    sb:JSON.parse(localStorage.getItem('user:bookmarks')).length, sh:JSON.parse(localStorage.getItem('user:highlights')).length }));
  check('bookmark and highlight a verse; both saved on the device', marks.bm && marks.hl && marks.sb===1 && marks.sh===1);
  await page.click('#rdSaved');
  const saved = await page.$$eval('#savedBody .svrow .go b', n=>n.map(x=>x.textContent).join(','));
  await page.$$eval('#savedBody .svrow .rm', ns=>ns[0].click());
  const afterRm = { rows: await page.$$eval('#savedBody .svrow', n=>n.length), bm: await page.$eval('#rdBody .vs[data-v="16"]', e=>e.classList.contains('bm')) };
  await page.goBack(); await page.waitForTimeout(250);
  check('saved verses list (bookmarks and highlights); removing one updates the text', saved==='John 3:16,John 3:17' && afterRm.rows===1 && afterRm.bm===false);
  // languages in the reader
  await page.click('#rdLangSeg button[data-lang="par"]');
  await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="par:rp"]',{timeout:5000}).catch(()=>{});
  const rpar = await page.evaluate(()=>({ pairs:document.querySelectorAll('#rdBody .vs.pair').length, g16:document.querySelector('#rdBody .vs[data-v="16"] .gk').textContent,
    ed:document.getElementById('rdEdition').textContent, disp:getComputedStyle(document.querySelector('#rdBody .vs.pair')).display }));
  check('reader Parallel: English and Greek verse by verse (John 3: 36 pairs), stacked on a phone', rpar.pairs===36 && /Οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον/.test(rpar.g16) && /Byzantine Textform/.test(rpar.ed) && rpar.disp==='block');
  await page.click('#rdLangSeg button[data-lang="grc"]');
  await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="grc:rp"]',{timeout:5000}).catch(()=>{});
  check('reader Greek only', (await page.evaluate(()=>document.querySelectorAll('#rdBody .vs .v').length+'/'+document.querySelectorAll('#rdBody .vs .gk').length))==='0/36');
  await page.evaluate(()=>window.__openReader(42,17,1)); await page.waitForSelector('#rdBody[data-ch="42:17"][data-mode="grc:rp"]',{timeout:5000});
  const lk1736 = await page.evaluate(()=>(document.querySelector('#rdBody .vs[data-v="36"]')||{}).textContent||'');
  await page.evaluate(()=>window.__openReader(45,16,1)); await page.waitForSelector('#rdBody[data-ch="45:16"][data-mode="grc:rp"]',{timeout:5000});
  const ro16 = await page.evaluate(()=>({ v25:!!document.querySelector('#rdBody .vs[data-v="25"]'), notes:[...document.querySelectorAll('#rdBody .gknote')].map(n=>n.textContent).join(' ') }));
  check('reader is faithful to the edition: Luke 17:36 marked as not in the Byzantine Textform', /Verse 36 is not in the Byzantine Textform/.test(lk1736));
  check('Romans 16: the doxology is not duplicated; a note says it stands at 14:24–26', ro16.v25===false && /14:24–26/.test(ro16.notes));
  await page.click('#rdLangSeg button[data-lang="en"]');
  // last position
  await page.evaluate(()=>window.__openReader(43,3,1)); await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="en:rp"]',{timeout:5000});
  await page.evaluate(()=>{ const v=document.querySelector('#rdBody .vs[data-v="20"]'); window.scrollTo(0, v.getBoundingClientRect().top + pageYOffset + 2); });
  await page.waitForTimeout(800);
  const pos = await page.evaluate(()=>JSON.parse(localStorage.getItem('reader:pos')));
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await tab(page,'scripture'); await page.waitForSelector('#rdBody[data-ch="43:3"]',{timeout:5000}); await page.waitForTimeout(300);
  const back = await page.evaluate(()=>({ t:document.getElementById('rdTitle').textContent+' '+document.getElementById('rdSub').textContent,
    top:document.querySelector('#rdBody .vs[data-v="'+JSON.parse(localStorage.getItem('reader:pos')).v+'"]').getBoundingClientRect().top }));
  check('last reading position remembered (book, chapter and verse)', pos.b===43 && pos.c===3 && pos.v>=19 && pos.v<=21 && back.t==='John Chapter 3' && back.top>-5 && back.top<200);
  // focus mode
  await page.click('#rdFocus');
  const focus = await page.evaluate(()=>({ on:document.documentElement.classList.contains('focus'), tabs:getComputedStyle(document.querySelector('.tabs')).display, x:getComputedStyle(document.getElementById('focusExit')).display }));
  await page.goBack(); await page.waitForTimeout(250);
  check('distraction-free mode hides everything but the text; Back leaves it', focus.on && focus.tabs==='none' && focus.x!=='none' && !(await page.evaluate(()=>document.documentElement.classList.contains('focus'))) && (await visibleView(page))==='scripture');
  // from a daily reading to the full chapter
  await page.click('.tab[data-tab="today"]'); await page.click('.reading .head');
  await page.click('.reading.open .more');
  await page.waitForSelector('#rdBody[data-ch="45:9"]',{timeout:5000});
  check('"Read all of Romans 9" opens the chapter in the reader', (await visibleView(page))==='scripture');
  await ctx.close();

  // ================= 7. THEME =================
  ctx = await browser.newContext({ viewport:{width:390,height:844}, colorScheme:'light' });
  page = await ctx.newPage(); await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.click('#themeBtn');
  const dk = await page.evaluate(()=>({ a:document.documentElement.getAttribute('data-theme'), bg:getComputedStyle(document.body).backgroundColor, meta:document.querySelector('meta[name="theme-color"]').content }));
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const dk2 = await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  check('dark mode from the header; remembered; status bar follows', dk.a==='dark' && dk.bg==='rgb(21, 17, 15)' && dk.meta==='#15110F' && dk2==='dark');
  await page.click('#setBtn'); await page.click('#themeSeg button[data-theme="auto"]');
  check('Auto returns to the phone’s setting (light here)', (await page.evaluate(()=>!document.documentElement.hasAttribute('data-theme') && getComputedStyle(document.body).backgroundColor))==='rgb(250, 247, 239)');
  await ctx.close();
  ctx = await browser.newContext({ viewport:{width:390,height:844}, colorScheme:'dark' });
  page = await ctx.newPage(); await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const dkAuto = await page.evaluate(()=>({ bg:getComputedStyle(document.body).backgroundColor, card:getComputedStyle(document.querySelector('.card')).backgroundColor, ink:getComputedStyle(document.body).color }));
  check('dark mode follows a dark phone automatically', dkAuto.bg==='rgb(21, 17, 15)' && dkAuto.card==='rgb(31, 26, 23)' && dkAuto.ink==='rgb(238, 231, 219)');
  await ctx.close();

  // ================= 8. SCREEN SIZES (phones, Galaxy Fold cover and inner screens, tablet, desktop) =================
  for(const vp of [[344,882,'Fold cover'],[390,844,'phone'],[412,915,'large phone'],[690,829,'Fold inner'],[768,1024,'tablet'],[1280,800,'desktop']]){
    ctx = await browser.newContext({ viewport:{width:vp[0],height:vp[1]} });
    page = await ctx.newPage(); await mockApi(page, MOCK);
    await page.addInitScript(()=>{ localStorage.setItem('pref:lang','par'); });
    await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
    let overflow = [];
    for(const t of ['today','calendar','scripture','prayer','settings']){
      await page.click(`.tab[data-tab="${t}"]`); await page.waitForTimeout(t==='scripture'?700:200);
      const o = await page.evaluate(()=>document.documentElement.scrollWidth - innerWidth);
      if(o>0) overflow.push(t+':'+o);
    }
    await page.click('.tab[data-tab="scripture"]'); await page.waitForTimeout(500);
    const lay = await page.evaluate(()=>{ const r=document.querySelector('.tabs').getBoundingClientRect();
      window.scrollTo(0, document.body.scrollHeight); const last=document.getElementById('rdEdition').getBoundingClientRect();
      return { rail: r.left===0 && r.top===0 && Math.round(r.height)===innerHeight && r.width<=100, bar: Math.round(r.bottom)===innerHeight && Math.abs(r.width-document.documentElement.clientWidth)<=1,
        clear: last.bottom <= (getComputedStyle(document.querySelector('.tabs')).position==='fixed' && r.top>0 ? r.top : innerHeight)+1,
        pair: document.querySelector('#rdBody .vs.pair') ? getComputedStyle(document.querySelector('#rdBody .vs.pair')).display : '' }; });
    check(`${vp[2]} ${vp[0]}×${vp[1]}: no sideways scrolling on any tab`, overflow.length===0 || console.log(overflow));
    check(`${vp[2]}: navigation is a ${vp[0]>=960?'side rail':'bottom bar'} and never covers the last line`, (vp[0]>=960 ? lay.rail : lay.bar) && lay.clear);
    check(`${vp[2]}: parallel text ${vp[0]>=680?'side by side':'stacked'}`, lay.pair===(vp[0]>=680?'grid':'block'));
    await ctx.close();
  }

  // ================= 9. SAVED DATA FROM v33 IS KEPT AND HONOURED =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  const tk = t0.getFullYear()+'-'+(t0.getMonth()+1)+'-'+t0.getDate();
  const seeded = { 'pref:cal':'gregorian', 'pref:txt':'kjv', 'pref:scale':'120', 'pref:greek':'1', 'pref:installDismissed':'1',
    ['day:julian:'+tk]: JSON.stringify({t:Date.now()-3600e3, data:MOCK}), 'nkjv:45:9': JSON.stringify([{verse:1,text:'saved NKJV'}]) };
  await page.addInitScript(s=>{ if(!sessionStorage.getItem('seeded')){ for(const k in s) localStorage.setItem(k,s[k]); sessionStorage.setItem('seeded','1'); } }, seeded);
  await page.route('**orthocal.info/**', r=>r.abort()); await page.route('**allorigins.win/**', r=>r.abort()); await page.route('**bolls.life/**', r=>r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.reading',{timeout:5000}); await page.waitForTimeout(600);
  const kept = await page.evaluate(s=>{ const out={}; for(const k in s) out[k]=localStorage.getItem(k)===s[k]; return out; }, seeded);
  const honoured = await page.evaluate(()=>({ alt:document.getElementById('altdate').textContent, txt:document.querySelector('#txtSeg button.active').getAttribute('data-txt'),
    lang:document.querySelector('#langSeg button.active').getAttribute('data-lang'), rs:getComputedStyle(document.documentElement).getPropertyValue('--rs').trim(),
    banner:document.getElementById('installBanner').classList.contains('hidden'), off:document.getElementById('offlineBanner').classList.contains('show'),
    summary:document.getElementById('summary').textContent }));
  check('every v33 key survives untouched (prefs, saved day, saved NKJV chapter)', Object.values(kept).every(Boolean) || console.log(kept));
  check('v33 choices honoured: Old Calendar, KJV, size 120%, Greek → Parallel, install dismissed', /Old\sStyle/.test(honoured.alt) && honoured.txt==='kjv' && honoured.lang==='par' && honoured.rs==='1.2' && honoured.banner);
  check('saved day opens with no connection, with the offline notice', honoured.off && /Cyrus/.test(honoured.summary));
  const reck = await page.evaluate(()=>({ dec25: window.__fastRule(new Date(2026,11,25)).feast||null, jan7: window.__fastRule(new Date(2027,0,7)).feast||null }));
  check('reckoning fixed: Nativity on 7 Jan civil, not 25 Dec', !/Nativity/.test(reck.dec25||'') && /Nativity of Christ/.test(reck.jan7||''));
  await ctx.close();

  // ================= 10. FASTING STATES, FALLBACKS, ERRORS =================
  for(const [mock, name] of [[MOCK_STRICT,'strict'],[MOCK_NOFAST,'nofast']]){
    ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(page, mock);
    await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
    const f = await page.evaluate(()=>({ exc:document.getElementById('fastExc').textContent, cat:document.getElementById('fastWrap').getAttribute('data-cat'), strict:document.getElementById('fastWrap').classList.contains('strict') }));
    if(name==='strict') check('plain Fast day: strict norm explained honestly, strict colour', /traditionally strict/.test(f.exc) && /wine & oil/.test(f.exc) && f.cat==='strict' && f.strict);
    else check('No-Fast day: no strict note and no spurious allowance (St Vladimir case)', f.exc.trim()==='' && f.cat==='free');
    await ctx.close();
  }
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }));
  await page.route('**bolls.life/**', r=> r.abort()); await page.route('**allorigins.win/**', r=> r.abort());
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000}); await page.waitForTimeout(600);
  check('NKJV source down: KJV stays, badges honest', (await page.$$eval('.reading .body .v', n=>n.length))===7 && (await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent).join(',')))==='KJV,KJV,KJV');
  await ctx.close();
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  await page.route('**orthocal.info/**', r=> r.abort()); await page.route('**allorigins.win/**', r=> r.abort()); await page.route('**bolls.life/**', r=> r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#errorBanner.show',{timeout:6000}).catch(()=>{});
  const err = await page.evaluate(()=>({ banner:document.getElementById('errorBanner').classList.contains('show'), key:document.getElementById('fastKey').textContent,
    txt:document.getElementById('fastText').textContent, alt:document.getElementById('altdate').textContent, card:!!document.getElementById('offlineDay'), content:!document.getElementById('content').classList.contains('hidden') }));
  check('nothing reachable: error notice, yet the day card still shows the date, tone and general fasting rule', err.banner && err.content && err.key==='Fasting · general rule' && err.txt.length>3 && /Old\sStyle/.test(err.alt) && err.card);
  await ctx.close();
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  let allow = true;
  await page.route('**orthocal.info/api/**', r=> allow ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}) : r.abort());
  await page.route('**bolls.life/**', r=> allow ? mockBolls(r) : r.abort()); await page.route('**allorigins.win/**', r=> r.abort());
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});
  allow = false;
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.reading',{timeout:5000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});
  check('offline: saved day and saved NKJV chapters survive', (await page.$eval('#offlineBanner', e=>e.classList.contains('show'))) && (await page.$$eval('.reading .body .v', n=>n.length))===32);
  await ctx.close();

  // ================= 11. BACK BUTTON, INSTALL, PREFETCH =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  let apiCalls = [];
  await page.route('**orthocal.info/api/**', r=>{ apiCalls.push(r.request().url()); r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }); });
  await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await tab(page,'calendar'); await tab(page,'scripture'); await tab(page,'settings');
  await page.goBack(); await page.waitForTimeout(300);
  const b1 = await visibleView(page);
  await page.click('#shareBtn'); await page.goBack(); await page.waitForTimeout(300);
  const b2 = await page.$eval('#shareMenu', e=>e.classList.contains('hidden'));
  check('Back from any tab returns to Today; Back closes an open sheet; the app is never left by accident', b1==='today' && b2 && /8099/.test(page.url()));
  const preBanner = await page.$eval('#installBanner', e=>e.classList.contains('hidden'));
  await page.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>{ window.__prompted=true; return Promise.resolve(); }; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); });
  const postBanner = await page.$eval('#installBanner', e=>!e.classList.contains('hidden'));
  await page.click('#setBtn'); await page.waitForTimeout(100);
  const setRow = await page.$eval('#setInstallRow', e=>!e.classList.contains('hidden'));
  await page.click('.tab[data-tab="today"]');
  await page.click('#installGo'); await page.waitForTimeout(200);
  const prompted = await page.evaluate(()=>window.__prompted===true);
  const goneAfter = await page.$eval('#installBanner', e=>e.classList.contains('hidden'));
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  check('install: banner after the browser offers it; also in Settings; Install prompts; choice remembered', preBanner && postBanner && setRow && prompted && goneAfter && (await page.$eval('#installBanner', e=>e.classList.contains('hidden'))));
  apiCalls = [];
  await page.evaluate(()=>{ for(const k of Object.keys(localStorage)) if(k.startsWith('day:')) localStorage.removeItem(k); });
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.waitForTimeout(8500);
  const tomorrow = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()+1);
  const tomKey = 'day:julian:'+tomorrow.getFullYear()+'-'+(tomorrow.getMonth()+1)+'-'+tomorrow.getDate();
  check('the coming week is saved quietly for offline use', apiCalls.length>=6 && (await page.evaluate(k=>!!localStorage.getItem(k), tomKey)));
  await ctx.close();
  check('no script errors in the main session', pageErrors.length===0 || console.log(pageErrors));

  await browser.close();
  await new Promise(r=>server.close(r));

  // ================= 12. OFFLINE APP, UPDATE FROM v33, AND THE REVIEW COPY (service workers, GitHub Pages layout) =================
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-test-'));
  const V33 = path.join(tmp, 'v33'), PREV = path.join(tmp, 'preview');
  let haveV33 = false;
  try { fs.mkdirSync(V33); execSync(`git -C "${DIR}" archive backup-v33 | tar -x -C "${V33}"`); haveV33 = fs.existsSync(path.join(V33,'sw.js')); } catch(e) {}
  execSync(`python3 "${path.join(DIR,'tools','make_preview.py')}" "${PREV}"`);
  let liveRoot = haveV33 ? V33 : DIR;
  const SWPORT = 8098, swBase = `http://localhost:${SWPORT}/daily-readings/`;
  const swServer = await serve(SWPORT, [['/daily-readings/preview/', PREV], ['/daily-readings/', ()=>liveRoot]]);
  const browser2 = await chromium.launch({ executablePath: EXE });
  const swReady = p => p.waitForFunction(()=>navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout:15000}).then(()=>true).catch(()=>false);
  const cacheKeys = p => p.evaluate(()=>caches.keys());

  // 12a. v34 alone: installs, works offline, saves the New Testament
  liveRoot = DIR;
  ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
  await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000});
  const ctl = await swReady(page);
  const keys1 = await cacheKeys(page);
  const pre = await page.evaluate(async()=>{ const c=await caches.open('orthodox-readings-v34'); const ks=(await c.keys()).map(r=>new URL(r.url).pathname); return ks; });
  check('service worker v34 installs and keeps the app, fonts and sayings', ctl && keys1.includes('orthodox-readings-v34') && pre.some(p=>/fonts\/literata-latin-400/.test(p)) && pre.some(p=>/fathers\.json$/.test(p)) && pre.some(p=>/\/daily-readings\/index\.html$/.test(p)));
  await page.click('#setBtn'); await page.click('#ntOffBtn');
  await page.waitForFunction(()=>/^Saved —/.test(document.getElementById('ntOffLbl').textContent),{timeout:60000}).catch(()=>{});
  const ntSaved = await page.evaluate(async()=>{ const t=await (await caches.open('orthodox-readings-texts-1')).keys(), g=await (await caches.open('orthodox-readings-greek-1')).keys(); return {t:t.length, g:g.length, lbl:document.getElementById('ntOffLbl').textContent}; });
  check('“Save the New Testament offline” stores all 27 KJV books and 260 Greek chapters', ntSaved.t>=27 && ntSaved.g>=260 && /^Saved —/.test(ntSaved.lbl));
  await ctx.unroute('**orthocal.info/api/**'); await ctx.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
  await page.waitForSelector('.reading',{timeout:8000}).catch(()=>{});
  const offApp = await page.evaluate(()=>({ tabs:!!document.querySelector('.tabs'), reading:document.querySelectorAll('.reading').length, banner:document.getElementById('offlineBanner').classList.contains('show') }));
  await page.evaluate(()=>window.__openReader(43,3,1)); await page.evaluate(()=>{ const b=document.querySelector('#rdLangSeg button[data-lang="par"]'); b.click(); });
  await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="par:rp"]',{timeout:8000}).catch(()=>{});
  const offRd = await page.evaluate(()=>({ en:document.querySelectorAll('#rdBody .vs .v').length, gk:document.querySelectorAll('#rdBody .vs .gk').length }));
  check('with no connection: the app opens, today’s saved readings show, the New Testament reads in both languages', offApp.tabs && offApp.reading===3 && offApp.banner && offRd.en===36 && offRd.gk===36);
  await ctx.close();

  if(haveV33){
    // 12b. A phone that has v33 installed receives v34 on its next open, and keeps everything it saved.
    liveRoot = V33;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000});
    await swReady(page);
    await page.click('#greekBtn'); await page.click('#txtSeg button[data-txt="kjv"]');
    await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===7,{timeout:6000}).catch(()=>{});
    const before = await page.evaluate(()=>{ const o={}; for(const k of Object.keys(localStorage)) o[k]=localStorage.getItem(k); return o; });
    const k33 = await cacheKeys(page);
    liveRoot = DIR;                                                      // "deploy" v34
    await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
    let k34 = []; for(let i=0;i<40;i++){ k34 = await cacheKeys(page); if(k34.includes('orthodox-readings-v34') && !k34.includes('orthodox-readings-v33')) break; await sleep(250); }
    const after = await page.evaluate(()=>{ const o={}; for(const k of Object.keys(localStorage)) o[k]=localStorage.getItem(k); return o; });
    const ui = await page.evaluate(()=>({ tabs:!!document.querySelector('.tabs'), lang:(document.querySelector('#langSeg button.active')||{}).getAttribute?.('data-lang'), txt:(document.querySelector('#txtSeg button.active')||{}).getAttribute?.('data-txt') }));
    check('v33 phone: one open of the app shows v34 (page is network-first)', ui.tabs===true);
    check('v33 phone: old app cache removed, Greek cache carried over, new caches in place', k33.includes('orthodox-readings-v33') && k33.includes('orthodox-readings-greek-1') && k34.includes('orthodox-readings-v34') && !k34.includes('orthodox-readings-v33') && k34.includes('orthodox-readings-greek-1'));
    const same = k => k.startsWith('day:') ? (after[k] && JSON.stringify(JSON.parse(after[k]).data)===JSON.stringify(JSON.parse(before[k]).data)) : after[k]===before[k];
    check('v33 phone: every saved preference and day kept, and honoured (KJV, Greek → Parallel)', Object.keys(before).every(same) && ui.lang==='par' && ui.txt==='kjv');
    await ctx.setOffline(true); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
    check('v33 phone after the update: v34 opens with no connection', await page.evaluate(()=>!!document.querySelector('.tabs') && document.querySelectorAll('.reading').length===3));
    await ctx.close();

    // 12c. The review copy at /daily-readings/preview/ beside the live v33 app on the same phone
    liveRoot = V33;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000}); await swReady(page);
    const liveKeys = (await cacheKeys(page)).filter(k=>k.startsWith('orthodox-readings-')).sort().join(',');
    await page.goto(swBase+'preview/',{waitUntil:'networkidle'}); await page.waitForSelector('.tabs',{timeout:8000});
    const tag = await page.evaluate(()=>!!document.querySelector('.top .preview') && document.title==='Daily Readings (Preview)');
    await sleep(3500);                                                   // the repair runs 2.5 s after load
    const iso = await page.evaluate(async()=>{
      const live=await caches.open('orthodox-readings-v33'); const hit=await live.match(new URL('../index.html', location.href).href);
      const regs=(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname).sort();
      return { liveIsLive: hit ? !(await hit.text()).includes('class="preview"') : false, keys: await caches.keys(), regs };
    });
    check('review copy shows a Preview tag and has its own service worker and caches', tag && iso.regs.join(',')==='/daily-readings/,/daily-readings/preview/' && iso.keys.includes('dr-preview-v34'));
    check('review copy leaves the live app’s caches in place and restores its offline page', iso.liveIsLive && iso.keys.filter(k=>k.startsWith('orthodox-readings-')).sort().join(',')===liveKeys && liveKeys.includes('orthodox-readings-v33'));
    await ctx.setOffline(true);
    await page.goto(swBase,{waitUntil:'domcontentloaded'}).catch(()=>{}); await page.waitForTimeout(800);
    const liveOff = await page.evaluate(()=>!!document.querySelector('.appbar') && !document.querySelector('.tabs'));
    await page.goto(swBase+'preview/',{waitUntil:'domcontentloaded'}).catch(()=>{}); await page.waitForTimeout(800);
    const prevOff = await page.evaluate(()=>!!document.querySelector('.top .preview'));
    check('offline afterwards: the live address still opens the live app; the preview address opens the preview', liveOff && prevOff);
    await ctx.close();

    // 12d. Once v34 is live, its service worker leaves /preview/ alone
    liveRoot = DIR;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000}); await swReady(page);
    await page.goto(swBase+'preview/',{waitUntil:'networkidle'}); await sleep(600);
    const liveCopy = await page.evaluate(async()=>{ const hit=await (await caches.open('orthodox-readings-v34')).match(new URL('../index.html', location.href).href); return hit ? !(await hit.text()).includes('class="preview"') : false; });
    check('live v34 never stores the review copy as its own page', liveCopy===true);
    await ctx.close();
  } else {
    check('v33 backup branch available for the update tests (git branch backup-v33)', false);
  }
  await browser2.close();
  await new Promise(r=>swServer.close(r));
  fs.rmSync(tmp, {recursive:true, force:true});

  console.log('\n================ TEST RESULTS ================');
  results.forEach(r=>console.log(r));
  const fails = results.filter(r=>r.startsWith('FAIL')).length;
  console.log('=============================================');
  console.log(fails===0 ? 'ALL PASSED ('+results.length+')' : (fails+' FAILED of '+results.length));
  process.exit(fails===0?0:1);
})().catch(e=>{ console.error('HARNESS ERROR', e); process.exit(2); });
