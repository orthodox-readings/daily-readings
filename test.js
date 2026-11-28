// Daily Readings — automated checks (version from tools/build.py). Run: node test.js   (needs: npm install playwright)
// Every check is date-proof: expectations are computed from the day the suite runs, or use fixed past dates.
// Sections 1–11 test the app as a reader uses it; 12 tests offline packages, backup and restore; 13 tests the
// service worker, the update from version 34 and the review copy, laid out as on GitHub Pages; 14 tests the ROCOR
// alignment (fasting, colours, feasts, readings and the local date) against the reference dates in the ROCOR report.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const DIR = __dirname;
const VER = fs.readFileSync(path.join(__dirname,'tools','build.py'),'utf8').match(/VERSION\s*=\s*"(\d+)"/)[1];
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain' };

// A day as orthocal.info sends it. The passages are complete, as the real service sends them (KJV).
function passage(tag, a, b){ const out=[]; for(let v=a; v<=b; v++) out.push({ verse:v, content:`KJV ${tag} ${v} text.` }); return out; }
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
    { source: "Epistle", display: "Romans 9:1-5", passage: passage('Rom', 1, 5) },
    { source: "Gospel", desc: "Apostles", display: "Matthew 9:18-26", passage: passage('Matt', 18, 26) },
    { source: "6th Matins Gospel", display: "Luke 24:36-53", passage: passage('Luke', 36, 53) }
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
// The unlicensed NKJV source used by version 34. Version 35 must never call it; every call is counted.
let bollsCalls = 0;
function mockBolls(route){
  bollsCalls++;
  const m = route.request().url().match(/NKJV\/(\d+)\/(\d+)\//);
  if(!m){ route.abort(); return; }
  const verses = [];
  for(let n=1;n<=60;n++) verses.push({ pk:n, verse:n, text: `NKJV B${m[1]} C${m[2]} v${n} text.` });
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
const pkgStat = (page, id) => page.$eval('#pkg-'+id+' .pkstat', e=>e.textContent);
const waitPkg = (page, id, re, ms) => page.waitForFunction(([id,src])=>{ const e=document.querySelector('#pkg-'+id+' .pkstat'); return !!e && new RegExp(src).test(e.textContent); },
  [id, re.source], {timeout: ms||30000}).then(()=>true).catch(()=>false);
const dayKey = d => 'day:julian:'+d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
const ACCENTS = /[̀-ͯΆΈ-ΊΌΎ-ΐά-ΰό-ώἀ-῿]/;

(async()=>{
  const PORT = 8099, base = `http://localhost:${PORT}/`;
  const server = await serve(PORT, [['/', DIR]]);
  const browser = await chromium.launch({ executablePath: EXE });

  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
  const jd = addDays(t0, -13);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ymd = '' + jd.getFullYear() + String(jd.getMonth()+1).padStart(2,'0') + String(jd.getDate()).padStart(2,'0');
  const expectedOCUrl = 'https://orthochristian.com/calendar/' + ymd + '.html';
  const expHTM = 'https://www.holytrinityorthodox.com/calendar/calendar.php?month='+(t0.getMonth()+1)+
    '&today='+t0.getDate()+'&year='+t0.getFullYear()+'&dt=1&header=1&lives=1&trp=1&scripture=1';
  const expAzbyka = 'https://azbyka.ru/worships/?date='+t0.getFullYear()+'-'+
    String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0');
  const fmtLong = d => d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const swText = fs.readFileSync(path.join(DIR,'sw.js'),'utf8');
  const APP_CACHE = 'orthodox-readings-' + swText.match(/var CACHE = PREFIX \+ "([^"]+)"/)[1];      // e.g. orthodox-readings-v35-1a2b3c4d5e
  const PKGS = JSON.parse(fs.readFileSync(path.join(DIR,'packages.json'),'utf8')).packages;

  // ================= 1. TODAY — design, content and engines =================
  let ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:1 });
  let page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e=>pageErrors.push(e.message));
  await page.addInitScript(()=>{ navigator.share = (o)=>{ window.__shared=o; return Promise.resolve(); };
    window.__copied=null; Object.defineProperty(navigator,'clipboard',{value:{writeText:v=>{window.__copied=v;return Promise.resolve();}},configurable:true}); });
  bollsCalls = 0;
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
  check('no duplicate element ids in the page', (await page.evaluate(()=>{ const s={}; let d=0; document.querySelectorAll('[id]').forEach(e=>{ if(s[e.id]) d++; s[e.id]=1; }); return d; }))===0);

  // --- bottom navigation ---
  const nav = await page.evaluate(()=>{
    const t=document.querySelector('.tabs'), r=t.getBoundingClientRect();
    return { labels:[...t.querySelectorAll('.tab span')].map(s=>s.textContent).join(','),
      icons:t.querySelectorAll('.tab svg').length, fixed:getComputedStyle(t).position==='fixed',
      bottom:Math.round(r.bottom)===innerHeight, active:document.querySelector('.tab.active').getAttribute('data-tab'),
      pad: parseFloat(getComputedStyle(document.body).paddingBottom) >= r.height };
  });
  check('five-tab bar: Today, Calendar, Scripture, Prayer, Settings with icons (no extra tabs)', nav.labels==='Today,Calendar,Scripture,Prayer,Settings' && nav.icons===5);
  check('tab bar fixed to the bottom, Today active, page padded so nothing hides behind it', nav.fixed && nav.bottom && nav.active==='today' && nav.pad);

  // --- liturgical colour engine (ROCOR Liturgical Handbook; the full set is checked in section 14) ---
  const lit = await page.evaluate((mock)=>({
    natTheot: window.__litKey(new Date(2026,8,21), mock), exalt: window.__litKey(new Date(2026,8,27), mock),
    transfig: window.__litKey(new Date(2026,7,19), mock), pascha: window.__litKey(new Date(2026,3,12), mock),
    pentecost:window.__litKey(new Date(2026,4,31), mock),
    martyr:   window.__litKey(new Date(2026,9,20), {summary_title:'Great-martyr Artemius'}),
    prophet:  window.__litKey(new Date(2026,6,16), {summary_title:'Holy Prophet Elias'}),
    theotIcon:window.__litKey(new Date(2026,9,22), {summary_title:'Icon of the Most Holy Theotokos'}),
    lentWk:   window.__litKey(new Date(2027,2,17), {summary_title:'Ven. Somebody'}),
    plain:    window.__litKey(new Date(2026,6,14), {summary_title:'Tuesday of the 6th week after Pentecost'}),
    beheading:window.__litKey(new Date(2026,8,11), {summary_title:'Beheading of St John the Baptist'})
  }), MOCK);
  check('lit: Theotokos feast blue · Cross red · Transfiguration white', lit.natTheot==='blue' && lit.exalt==='red' && lit.transfig==='white');
  check('lit: Pascha white · Pentecost green · martyr red · prophet gold', lit.pascha==='white' && lit.pentecost==='green' && lit.martyr==='red' && lit.prophet==='gold');
  check('lit: Theotokos icon blue · Lent weekday black · Beheading red', lit.theotIcon==='blue' && lit.lentWk==='black' && lit.beheading==='red');
  check('lit: an ordinary day outside a fast is gold', lit.plain==='gold');
  const domLit = await page.evaluate((mock)=>({ applied: document.documentElement.getAttribute('data-lit'),
    expected: window.__litKey(new Date(), mock), row: !document.getElementById('litRow').classList.contains('hidden') }), MOCK);
  check('liturgical colour applied and named every day (the handbook gives every day a colour)', domLit.applied===domLit.expected && domLit.row===true);
  await page.evaluate(()=>{ window.__selectDay(new Date(2026,7,19)); document.getElementById('dpOpen').click(); });
  await page.waitForFunction(()=>/19 August 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  const litRow = await page.evaluate(()=>({ shown:!document.getElementById('litRow').classList.contains('hidden'), text:document.getElementById('litText').textContent }));
  check('Transfiguration shows the liturgical colour indicator: White', litRow.shown && litRow.text==='White');
  await page.click('#today'); await page.waitForTimeout(300);

  // --- A. the day card: dates, season, fast ---
  const osExp = jd.getDate()+' '+MONTHS[jd.getMonth()]+', Old Style';
  const day = await page.evaluate(()=>({ wd:document.querySelector('#date .wd').textContent, dmy:document.querySelector('#date .dmy').textContent,
    all:document.getElementById('date').textContent, alt:document.getElementById('altdate').textContent,
    tone:window.__toneOfWeek(new Date()), todayHidden:document.getElementById('today').classList.contains('hidden'),
    summary:document.getElementById('summary').textContent, ctlInCard: !!document.querySelector('#dayCard #prev') && !!document.querySelector('#dayCard #next') && !!document.querySelector('#dayCard #today') }));
  const expWd = t0.toLocaleDateString('en-AU',{weekday:'long'}), expDmy = t0.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
  check('Gregorian date: weekday line over the date', day.wd===expWd && day.dmy===expDmy && day.all===expWd+' '+expDmy);
  check('Julian (Old Style) date with the tone of the week', day.alt.replace(/ /g,' ')===osExp+(day.tone? ' · Tone '+day.tone : ''));
  check('previous, next and return-to-today live in the day card; return hidden on today', day.ctlInCard && day.todayHidden);
  check('feast / day headline shown', /Cyrus|Sergius/.test(day.summary));
  const fast = await page.evaluate(()=>{ const r=window.__dayRule(new Date());
    return { cat:document.getElementById('fastWrap').getAttribute('data-cat'), txt:document.getElementById('fastText').textContent,
      exc:document.getElementById('fastExc').textContent, key:document.getElementById('fastKey').textContent, r:{name:r.name, cat:r.cat, lv:r.lv},
      src:document.getElementById('fastSrc').textContent, srcShown:!document.getElementById('fastSrc').classList.contains('hidden') }; });
  check('fasting: the ROCOR rule for today with its colour category; the source calendar’s allowance shown beneath only where it differs',
    fast.key==='Fasting' && fast.txt===fast.r.name && fast.cat===fast.r.cat &&
    (fast.r.lv==='oil' ? !fast.srcShown : (fast.srcShown && /orthocal\.info, which follows the OCA’s calendar, gives: Apostles Fast — wine and oil allowed/.test(fast.src))));
  const seasonDom = await page.evaluate(()=>{ const s=window.__liturgicalSeason(new Date());
    return { name:document.getElementById('tdSeason').textContent, sub:document.getElementById('tdSeasonSub').textContent, exp:s,
      inCard: !!document.querySelector('#dayCard #seasonRow #tdSeason') }; });
  check('current liturgical season in the day card ('+seasonDom.name+')', seasonDom.inCard && seasonDom.name===seasonDom.exp.name && seasonDom.sub===(seasonDom.exp.detail||'') && seasonDom.name.length>3);
  const S = await page.evaluate(()=>{ const f=(y,m,d)=>{ const s=window.__liturgicalSeason(new Date(y,m,d)); return s.name+' | '+(s.detail||''); }; return {
    nat1:f(2026,10,28), entry:f(2026,11,4), eve:f(2027,0,6), nativity:f(2027,0,7), svyatki:f(2027,0,10), eveTh:f(2027,0,18), theoph:f(2027,0,19),
    publican:f(2026,1,1), meatfare:f(2026,1,15), cheese:f(2026,1,18), clean:f(2026,1,23), orth:f(2026,2,1), lent3:f(2026,2,11), cross:f(2026,2,15),
    lazarus:f(2026,3,4), palm:f(2026,3,5), gfri:f(2026,3,10), pascha:f(2026,3,12), bright:f(2026,3,13), thomas:f(2026,3,19), wk5:f(2026,4,13), asc:f(2026,4,21),
    pent:f(2026,4,31), allSaints:f(2026,5,7), ap1:f(2026,5,8), ap24:f(2026,6,1), dorm1:f(2026,7,14), dorm:f(2026,7,28), ord:f(2026,8,21) }; });
  check('season engine: Nativity Fast counted day by day (28 Nov 2026 day 1 of 40; 4 Dec day 7; 6 Jan 2027 day 40, the Eve)',
    S.nat1==='Nativity Fast — Day 1 of 40 | 26th week after Pentecost' && S.entry==='Nativity Fast — Day 7 of 40 | 27th week after Pentecost' &&
    S.eve==='Nativity Fast — Day 40 of 40 | Eve of the Nativity of Christ');
  check('season engine: Nativity, Christmastide (fast-free), Eve of Theophany, Theophany',
    S.nativity==='The Nativity of Christ | Christmastide — fast-free until the Eve of Theophany' && S.svyatki==='Christmastide | Fast-free until the Eve of Theophany' &&
    S.eveTh==='Eve of Theophany | 34th week after Pentecost' && S.theoph==='The Theophany of the Lord | ');
  check('season engine: the Triodion weeks before Lent (Publican, Meatfare, Cheesefare)',
    S.publican==='Pre-Lenten weeks (Triodion) | Sunday of the Publican and the Pharisee' && S.meatfare==='Pre-Lenten weeks (Triodion) | Meatfare Sunday — the Last Judgement' &&
    S.cheese==='Pre-Lenten weeks (Triodion) | Cheesefare week');
  check('season engine: Great Lent day of 40, its weeks and named Sundays (Orthodoxy, the Cross)',
    S.clean==='Great Lent — Day 1 of 40 | 1st week of Great Lent' && S.orth==='Great Lent — Day 7 of 40 | 1st Sunday of Great Lent — the Triumph of Orthodoxy' &&
    S.lent3==='Great Lent — Day 17 of 40 | 3rd week of Great Lent' && S.cross==='Great Lent — Day 21 of 40 | 3rd Sunday of Great Lent — the Veneration of the Cross');
  check('season engine: Lazarus Saturday, Palm Sunday, Holy Week, Pascha, Bright Week',
    S.lazarus==='Lazarus Saturday | The eve of Palm Sunday' && S.palm==='Palm Sunday | The Entry of the Lord into Jerusalem' && S.gfri==='Holy Week | Great and Holy Friday' &&
    S.pascha==='Pascha | The Resurrection of Christ' && S.bright==='Bright Week | Bright Monday — fast-free');
  check('season engine: Paschal season (Thomas Sunday, 5th week, Ascension), Pentecost, All Saints',
    S.thomas==='Paschal season | Thomas Sunday — 2nd Sunday of Pascha' && S.wk5==='Paschal season | 5th week of Pascha' && S.asc==='Paschal season | The Ascension of the Lord' &&
    S.pent==='Pentecost | The Holy Trinity' && S.allSaints==='1st Sunday after Pentecost — All Saints | ');
  check('season engine: Apostles’ Fast (34 days in 2026), Dormition Fast (14 days), Dormition, ordinary weeks',
    S.ap1==='Apostles’ Fast — Day 1 of 34 | 2nd week after Pentecost' && S.ap24==='Apostles’ Fast — Day 24 of 34 | 5th week after Pentecost' &&
    S.dorm1==='Dormition Fast — Day 1 of 14 | 11th week after Pentecost' && S.dorm==='The Dormition of the Theotokos | 13th week after Pentecost' && S.ord==='17th week after Pentecost | ');

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

  // --- order of the Today screen (brief §3: A date & season · B daily reading · C Wisdom · D chosen extras) ---
  const order = await page.evaluate(()=>{
    const seq=['#dayCard','#tdMorning','#readings','#otherCard','#commemCard','#tdHymns','#tdEvening','#quoteCard','#toPrayer','#customiseBtn'];
    const before=(a,b)=>!!(document.querySelector(a).compareDocumentPosition(document.querySelector(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return seq.every((s,i)=>i===0 || before(seq[i-1], s)) && !!document.querySelector('#commemCard #livesCard');
  });
  check('Today order: date & season → Morning Prayers → Epistle & Gospel → other readings → Saints (with Lives) → hymns → Evening Prayers → Wisdom → more', order===true);
  const links = await page.evaluate(()=>({ m:document.getElementById('tdMorning').getAttribute('href'), e:document.getElementById('tdEvening').getAttribute('href'),
    h:document.getElementById('tdHymns').getAttribute('href'), tgt:document.getElementById('tdMorning').getAttribute('target') }));
  check('daily prayers and hymns open directly (Morning and Evening Prayers; troparia of the day)', /morning\.htm$/.test(links.m) && /evening\.htm$/.test(links.e) && links.h===expHTM && links.tgt==='_blank');

  // --- C. Wisdom of the Fathers ---
  const fjson = JSON.parse(fs.readFileSync(path.join(DIR,'fathers.json'),'utf8'));
  const ids = new Set(fjson.quotes.map(q=>q.id));
  check('sayings file (format 2): 115 sayings, unique ids, a status each; every saying in the rotation names its work; every one awaiting review says why',
    fjson.version===2 && fjson.quotes.length===115 && ids.size===115 && fjson.quotes.every(q=>['sourced','adapted','review'].includes(q.status)) &&
    fjson.quotes.filter(q=>q.status!=='review').every(q=>q.work) && fjson.quotes.filter(q=>q.status==='review').every(q=>q.note));
  const pool = fjson.quotes.filter(q=>q.status!=='review');
  const doy = Math.round((t0 - new Date(t0.getFullYear(),0,1))/86400000);
  const expQ = pool[doy % pool.length];
  const expSrc = expQ.work + (expQ.ref ? ', '+expQ.ref : '') + (expQ.status==='adapted' ? ' · adapted' : '');
  const quote = await page.evaluate(()=>({ q:document.getElementById('quoteText').textContent, by:document.getElementById('quoteBy').textContent,
    small:(document.querySelector('#quoteBy small')||{}).textContent||'', share:!!document.getElementById('quoteShare'), fav:!!document.getElementById('quoteFav'),
    review:!document.getElementById('quoteStatus').classList.contains('hidden') }));
  check('saying of the day in full, with its saint', quote.q.indexOf(expQ.q.slice(0,40))>-1 && quote.by.indexOf(expQ.by)===0);
  check('the original work (and place in it where verified) under the saint; share and save on the card', quote.small===expSrc && quote.share && quote.fav && !quote.review);
  const rot = await page.evaluate(ids=>{ const seen=new Set(); for(let i=0;i<400;i++){ const q=window.__quoteForDay(new Date(2026,0,1+i)); if(q) seen.add(q.id); } return [...seen].filter(id=>ids.includes(id)).length; },
    fjson.quotes.filter(q=>q.status==='review').map(q=>q.id));
  check('sayings awaiting review never appear in the daily rotation (400 days checked)', rot===0);
  const clampProbe = await page.evaluate(()=>{
    const long = 'A very long saying of the fathers that certainly runs past the two hundred and twenty character clamp threshold, so the wisdom card folds it to four lines and offers a read-more control for the reader, and nothing is lost by it at all.';
    const orig = window.__setFathers({quotes:[{id:'q900', q:long, by:'Test Father', status:'sourced', work:'Test'}]});
    const t=document.getElementById('quoteText'), m=document.getElementById('quoteMore');
    const clamped1 = t.classList.contains('clamped') && !m.classList.contains('hidden');
    m.click(); const expanded = !t.classList.contains('clamped') && /Show less/.test(m.textContent);
    window.__setFathers({quotes:[{id:'q901', q:'Short saying.', by:'Test Father', status:'sourced', work:'Test'}]});
    const short1 = !t.classList.contains('clamped') && m.classList.contains('hidden');
    window.__setFathers({quotes:[{id:'q902', q:'Unverified saying.', by:'Someone', status:'review', note:'not found'}]});
    const hiddenWhenOnlyReview = document.getElementById('quoteCard').classList.contains('hidden');
    window.__setFathers(orig);
    return {clamped1, expanded, short1, hiddenWhenOnlyReview};
  });
  check('long saying folds with read-more; short saying never folds', clampProbe.clamped1 && clampProbe.expanded && clampProbe.short1);
  check('an unverified saying is never shown by default (the card hides rather than show one)', clampProbe.hiddenWhenOnlyReview);
  await page.click('#quoteFav'); await page.waitForTimeout(100);
  const fav1 = await page.evaluate(()=>({ store:JSON.parse(localStorage.getItem('user:favQuotes')||'[]'), pressed:document.getElementById('quoteFav').getAttribute('aria-pressed') }));
  check('heart saves the saying to your favourites, on this device', fav1.store.length===1 && fav1.store[0]===expQ.id && fav1.pressed==='true');
  await tab(page,'prayer');
  const favSub = await page.textContent('#savedQuotesSub');
  await page.click('#savedQuotesLink');
  const favRows = await page.$$eval('#savedQuotesBody .sqrow', n=>n.map(x=>x.textContent));
  await page.click('#savedQuotesBody .sqrow .linkbtn:nth-child(3)');     // Remove
  const favAfter = await page.evaluate(()=>({ rows:document.querySelectorAll('#savedQuotesBody .sqrow').length, store:JSON.parse(localStorage.getItem('user:favQuotes')||'[]').length }));
  await page.goBack(); await page.waitForTimeout(200); await page.goBack(); await page.waitForTimeout(200);
  check('saved sayings listed in the Prayer tab with their sources; removing one works', /1 saying saved/.test(favSub) && favRows.length===1 && favRows[0].indexOf(expQ.q.slice(0,30))>-1 && favRows[0].indexOf(expQ.work)>-1 && favAfter.rows===0 && favAfter.store===0);
  check('heart shows the saying as not saved once removed', (await page.getAttribute('#quoteFav','aria-pressed'))==='false');

  // --- B. Holy Scripture on Today ---
  const tools = await page.evaluate(()=>({ lang:!!document.querySelector('#readingsCtl #langSeg'), txt:!!document.querySelector('#txtSeg'),
    size:!!document.querySelector('#scriptureHead #sizeSeg'), all:!document.getElementById('openAllBtn').classList.contains('hidden'),
    langActive:document.querySelector('#langSeg button.active').getAttribute('data-lang') }));
  check('reading controls: English/Parallel/Greek, size, open-all (no NKJV switch)', tools.lang && !tools.txt && tools.size && tools.all && tools.langActive==='en');
  const nVerses = await page.$$eval('.reading .body .v', n=>n.length);
  const badges = await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent));
  const nkNote = await page.$eval('#nkjvNote', e=>e.classList.contains('hidden'));
  check('NKJV paused: the King James text throughout (32 verses, every reading marked KJV), no NKJV notice', nVerses===32 && badges.join(',')==='KJV,KJV,KJV' && nkNote);
  const srcLabels = await page.$$eval('.reading .src', n=>n.map(x=>x.textContent));
  check('reading labels: Epistle · Gospel — Apostles · 6th Matins Gospel', srcLabels.join('|')==='Epistle|Gospel — Apostles|6th Matins Gospel');
  const split = await page.evaluate(()=>({ main:[...document.querySelectorAll('#readings .reading')].map(r=>r.querySelector('.src').textContent),
    prim:document.querySelectorAll('#readings .reading.primary').length, other:document.querySelectorAll('#otherReadings .reading').length,
    otherShown:!document.getElementById('otherCard').classList.contains('hidden'), otherOpen:document.getElementById('otherCard').classList.contains('open'),
    count:document.getElementById('otherCount').textContent }));
  check('the Liturgy Epistle and Gospel stand first; the other readings are folded below them', split.main.join('|')==='Epistle|Gospel — Apostles' && split.prim===2 && split.other===1 && split.otherShown && !split.otherOpen && split.count==='1');
  await page.click('#otherHead');
  const otherOpen = await page.evaluate(()=>getComputedStyle(document.getElementById('otherReadings')).display!=='none' && document.getElementById('otherHead').getAttribute('aria-expanded')==='true');
  await page.click('#otherHead');
  check('“Other readings today” opens on a tap', otherOpen);
  const readingsClosed = await page.$$eval('#readings .reading .body', ns=>ns.every(n=>getComputedStyle(n).display==='none'));
  await page.click('#readings .reading .head');
  const firstOpen = await page.$eval('#readings .reading .body', n=>getComputedStyle(n).display!=='none');
  check('readings fold; a tap opens one (expandable cards)', readingsClosed && firstOpen);
  await page.click('#langSeg button[data-lang="par"]');
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .gk').length===32,{timeout:5000}).catch(()=>{});
  const stillOpen = await page.evaluate(()=>document.querySelectorAll('.reading.open').length===1 && document.querySelector('#readings .reading').classList.contains('open'));
  check('changing language keeps the open reading open', stillOpen===true);
  await page.click('#langSeg button[data-lang="en"]'); await page.waitForTimeout(200);
  await page.click('#openAllBtn');
  const allOpen = await page.$$eval('#readings .reading', ns=>ns.every(n=>n.classList.contains('open')));
  const lblClose = await page.textContent('#openAllBtn');
  await page.click('#openAllBtn');
  const allClosed = await page.$$eval('.reading', ns=>ns.every(n=>!n.classList.contains('open')));
  check('open-all opens the Epistle and Gospel and toggles back', allOpen && /Close all/.test(lblClose) && allClosed);

  // --- Saints of the Day ---
  const peek = await page.textContent('#commemPeek');
  const commClosed = await page.$eval('#commemList', e=>getComputedStyle(e).display==='none' || getComputedStyle(e.parentElement).display==='none');
  await page.click('#commemHead');
  const commems = await page.$$eval('#commemList li', n=>n.map(x=>x.textContent));
  const commemHref = await page.getAttribute('#commemLink','href');
  const commCount = await page.textContent('#commemCount');
  check('commemorations fold by default, show the first while folded, and open with a count', commClosed && /^Translation of the relics/.test(peek) && commems.length>=4 && commCount===String(commems.length));
  check('doubled feed entry collapsed (Righteous Anna case)', commems.includes('Righteous Anna (Hannah), mother of the prophet Samuel') && !commems.some(t=>/Samuel Righteous/.test(t)));
  check('complete-list link → exact OrthoChristian day page', commemHref===expectedOCUrl);
  const lifeTitle = await page.textContent('#livesList details summary');
  await page.click('#livesList details summary');
  const lifeParas = await page.$$eval('#livesList details .ltext p', n=>n.length);
  await page.click('#livesList details summary');
  const livesAttr = await page.$eval('#livesCard .tattr', e=>e.textContent);
  await page.click('#commemHead');
  check('Lives of the Saints inside Saints of the Day: expandable entries, Abbamoses attribution', /Sergius/.test(lifeTitle) && lifeParas===2 && /Abbamoses/.test(livesAttr) && /John Brady/.test(livesAttr));

  // --- the supplement: ROCOR commemorations and the parish supplement ---
  const suppUnit = await page.evaluate(()=>({
    iveron: window.__supplementFor(new Date(2026,10,24), ['Martyrs Menas, Victor and Vincent','Our Righteous Father Theodore the Studite (826)']),
    dedup:  window.__supplementFor(new Date(2026,10,24), ['Iveron Icon of the Mother of God']),
    gabriel:window.__supplementFor(new Date(2026,10,2), []), plain: window.__supplementFor(new Date(2026,10,25), []) }));
  check('supplement: Montreal Iveron 24 Nov · skipped if upstream has it · St Gabriel 2 Nov · silent otherwise; each names its source',
    suppUnit.iveron.length===1 && /Montreal.*Iveron/.test(suppUnit.iveron[0].t) && suppUnit.iveron[0].src==='parish supplement' && suppUnit.dedup.length===0 &&
    suppUnit.gabriel.length===1 && /Urgebadze/.test(suppUnit.gabriel[0].t) && suppUnit.plain.length===0);
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

  // --- the ROCOR fasting rule (Typikon) + the colour categories built on it; section 14 checks it against the references ---
  const fr = await page.evaluate(()=>{ const f=(y,m,d)=>{ const r=window.__fastRule(new Date(y,m,d)); return r.lv+'/'+r.f; }; return {
    bright:f(2026,3,13), ordWed:f(2027,6,21), ordThu:f(2026,6,23), transfig:f(2026,7,19), dorm:f(2026,7,20), exalt:f(2026,8,27), exaltMon:f(2027,8,27), beheading:f(2026,8,11),
    trinityFri:f(2026,5,5), apSat:f(2026,5,13), apMon:f(2027,5,28), apTue:f(2027,5,29), apWed:f(2027,5,30), forerunWed:f(2027,6,7),
    natMon:f(2026,10,30), natTue:f(2026,11,1), natWed:f(2026,11,2), natSat:f(2026,10,28), entryFri:f(2026,11,4), nicholasSat:f(2026,11,19),
    natLateSat:f(2027,0,2), natLateMon:f(2027,0,4), natEve:f(2027,0,6), svyatki:f(2027,0,8), theophEve:f(2027,0,18), synaxisWed:f(2027,0,20),
    cleanMon:f(2027,2,15), lentWed:f(2027,2,17), lentSat:f(2027,2,20), fortyMon:f(2027,2,22), annunciationWed:f(2027,3,7), greatCanonThu:f(2027,3,15),
    lent5Wed:f(2027,3,14), lent5Fri:f(2027,3,16), lazarus:f(2027,3,24), palm:f(2027,3,25), gthu:f(2027,3,29), gfri:f(2027,3,30), gsat:f(2027,4,1),
    cheesefareWed:f(2027,2,10), publicanWed:f(2027,1,24), paschalWed:f(2027,4,12), midfeast:f(2027,4,26), leavetakingPascha:f(2027,5,9),
    philipFri:f(2026,10,27), kazanWed:f(2026,10,4), polyFri:f(2027,6,23), savaWed:f(2027,0,27),
    feastEntry:window.__fastRule(new Date(2026,11,4)).feast, why:window.__fastRule(new Date(2026,11,4)).why }; });
  check('fastRule: Bright Monday free · ordinary Wednesday strict · ordinary Thursday no fast · Trinity-week Friday free',
    fr.bright==='free/0' && fr.ordWed==='strict/1' && fr.ordThu==='free/0' && fr.trinityFri==='free/0');
  check('fastRule: Transfiguration fish · Dormition weekday strict · Exaltation and Beheading wine and oil, whatever the weekday',
    fr.transfig==='fish/2' && fr.dorm==='strict/2' && fr.exalt==='oil/2' && fr.exaltMon==='oil/2' && fr.beheading==='oil/2');
  check('fastRule (Typikon ch. 33): Apostles’ Fast — Saturday fish, Monday strict, Tuesday wine and oil, Wednesday strict; the Forerunner’s Nativity fish',
    fr.apSat==='fish/1' && fr.apMon==='strict/1' && fr.apTue==='oil/1' && fr.apWed==='strict/1' && fr.forerunWed==='fish/1');
  check('fastRule (Typikon ch. 33): Nativity Fast — Monday strict, Tuesday wine and oil, Wednesday strict, Saturday fish; Entry and St Nicholas fish',
    fr.natMon==='strict/1' && fr.natTue==='oil/1' && fr.natWed==='strict/1' && fr.natSat==='fish/1' && fr.entryFri==='fish/1' && fr.nicholasSat==='fish/1' && /Entry/.test(fr.feastEntry||'') && /Entry/.test(fr.why));
  check('fastRule: from 20 December (OS) no fish even on Saturday · 22 December Monday strict · the Eve strict · Christmastide free · Eve of Theophany strict · Synaxis of the Forerunner fish',
    fr.natLateSat==='oil/2' && fr.natLateMon==='strict/2' && fr.natEve==='strict/2' && fr.svyatki==='free/0' && fr.theophEve==='strict/2' && fr.synaxisWed==='fish/1');
  check('fastRule: Lent — weekdays strict, weekends wine and oil, Forty Martyrs wine and oil, Annunciation fish, Thursday of the Great Canon wine and oil (Wednesday and Friday of that week strict)',
    fr.cleanMon==='strict/2' && fr.lentWed==='strict/2' && fr.lentSat==='oil/2' && fr.fortyMon==='oil/2' && fr.annunciationWed==='fish/2' && fr.greatCanonThu==='oil/2' && fr.lent5Wed==='strict/2' && fr.lent5Fri==='strict/2');
  check('fastRule: Lazarus Saturday caviar · Palm Sunday fish · Great Thursday wine and oil · Great Friday strict · Great Saturday wine without oil',
    fr.lazarus==='caviar/2' && fr.palm==='fish/2' && fr.gthu==='oil/2' && fr.gfri==='strict/2' && fr.gsat==='wine/2');
  check('fastRule: Cheesefare Wednesday meat only · Publican week free · Paschal-season Wednesday fish (with Mid-Pentecost and the Leavetaking of Pascha)',
    fr.cheesefareWed==='meat/1' && fr.publicanWed==='free/0' && fr.paschalWed==='fish/1' && fr.midfeast==='fish/1' && fr.leavetakingPascha==='fish/1');
  check('fastRule: ranked days on Wednesday or Friday — Apostle Philip wine and oil · Kazan Icon fish · a polyeleos saint wine and oil · St Sava fish',
    fr.philipFri==='oil/1' && fr.kazanWed==='fish/1' && fr.polyFri==='oil/1' && fr.savaWed==='fish/1');
  const cats = await page.evaluate(()=>{ const c=(y,m,d)=>window.__dayRule(new Date(y,m,d)); return [c(2026,3,13),c(2027,6,21),c(2026,11,4),c(2026,11,1),c(2027,2,17),c(2027,2,10),c(2027,3,24),c(2027,4,1)].map(r=>r.cat+':'+r.label); });
  check('fasting categories and plain words: free · fast · fish · wine & oil · strict · cheesefare · caviar · wine without oil', cats.join('|')===
    'free:No fast|fast:Fast day — no wine or oil|fish:Fast — fish, wine and oil allowed|wine:Fast — wine and oil allowed|strict:Strict fast — no wine or oil|fish:Cheesefare week — meat excluded; dairy, eggs and fish allowed|wine:Fast — wine, oil and caviar allowed|strict:Strict fast — wine allowed, no oil');
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
  check('saying share sheet: image, text, copy; copy carries the saint and the source', shareQ.title==='Share the saying' && shareQ.rows==='shareWisdomBtn,shareQuoteTextBtn,copyQuoteBtn' && copiedQ && copiedQ.indexOf(expQ.by)>-1 && copiedQ.indexOf(expQ.work)>-1);
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

  // --- D. Customise Today ---
  await page.click('#customiseBtn');
  const cust = await page.evaluate(()=>({ open:!document.getElementById('customiseSheet').classList.contains('hidden'),
    ids:[...document.querySelectorAll('#custList .switch')].map(s=>s.getAttribute('data-sec-id')+(s.getAttribute('aria-checked')==='true'?'+':'-')).join(',') }));
  check('Customise Today: a simple list of switches, everything on by default; the date, fast and Epistle & Gospel always stay',
    cust.open && cust.ids==='prayers+,others+,saints+,hymns+,wisdom+,tracker+,notes+,more+');
  await page.click('#custList .switch[data-sec-id="wisdom"]'); await page.click('#custList .switch[data-sec-id="prayers"]');
  const hid = await page.evaluate(()=>({ q:document.getElementById('quoteCard').classList.contains('hidden'), m:document.getElementById('tdMorning').classList.contains('hidden'),
    e:document.getElementById('tdEvening').classList.contains('hidden'), store:localStorage.getItem('pref:todayHide') }));
  await page.goBack(); await page.waitForTimeout(200);
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const hid2 = await page.evaluate(()=>({ q:document.getElementById('quoteCard').classList.contains('hidden'), m:document.getElementById('tdMorning').classList.contains('hidden'),
    r:document.querySelectorAll('#readings .reading').length, d:!document.getElementById('dayCard').classList.contains('hidden') }));
  check('hiding Wisdom and the prayers takes them off Today, and the choice is remembered', hid.q && hid.m && hid.e && hid.store==='["wisdom","prayers"]' && hid2.q && hid2.m && hid2.r===2 && hid2.d);
  await page.click('#setBtn'); await page.click('#setCustomiseBtn');
  await page.click('#custList .switch[data-sec-id="wisdom"]'); await page.click('#custList .switch[data-sec-id="prayers"]');
  await page.goBack(); await page.waitForTimeout(150); await page.click('.tab[data-tab="today"]');
  check('the same choices from Settings; turning them back on restores Today', !(await page.$eval('#quoteCard', e=>e.classList.contains('hidden'))) && (await page.evaluate(()=>localStorage.getItem('pref:todayHide')))==='[]');

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
  await page.fill('#fastNoteText', 'Kept it with the family.'); await page.click('#dpDate');
  await page.evaluate(()=>window.__selectDay(new Date(2026,6,24)));
  const otherDayNote = await page.inputValue('#fastNoteText');
  await page.evaluate(()=>window.__selectDay(new Date(2026,6,22)));
  const backNote = await page.inputValue('#fastNoteText');
  const noteStore = await page.evaluate(()=>JSON.parse(localStorage.getItem('user:fastnotes')||'{}'));
  check('a private written note for a fast day: saved for that day only, shown again on return', noteStore['2026-07-22']==='Kept it with the family.' && Object.keys(noteStore).length===1 && otherDayNote==='' && backNote==='Kept it with the family.');
  await page.fill('#fastNoteText', ''); await page.click('#dpDate');
  check('emptying the note removes it', (await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('user:fastnotes')||'{}')).length))===0);
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
    jv:document.querySelector('#troparLink .ltxt').textContent, dio:document.getElementById('dioceseLink').getAttribute('href') }));
  const MONL=['january','february','march','april','may','june','july','august','september','october','november','december'];
  check('Prayer tab: prayers, study links (with the ROCOR diocesan calendar), saved sayings and parish support (9 rows)', pr.rows===9 && /rocor\.org\.au/.test(pr.dio));
  check('daily prayers: the prayers for this time of day come first', pr.hr>=16 ? (pr.t==='Prayers Before Sleep' && /evening\.htm$/.test(pr.h) && /morning\.htm$/.test(pr.alt)) : (pr.t==='Morning Prayers' && /morning\.htm$/.test(pr.h) && /evening\.htm$/.test(pr.alt)));
  check('Holy Trinity calendar row → that day’s page, named for what it is (the calendar Jordanville’s website shows)', pr.tropar===expHTM && /^Holy Trinity Calendar/.test(pr.jv) && /Jordanville/.test(pr.jv) && !/\(ROCOR\)/.test(pr.jv));
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
  await page.click('#setBtn'); await page.waitForTimeout(600);
  const st = await page.evaluate(()=>({ view:!document.getElementById('view-settings').hidden, theme:document.querySelector('#themeSeg button.active').getAttribute('data-theme'),
    eds:[...document.querySelectorAll('#gkEdOpts .opt')].map(o=>o.getAttribute('data-ed')+(o.classList.contains('active')?'*':'')).join(','),
    cal:document.querySelector('.opt[data-cal="julian"]').classList.contains('active'), nc:document.querySelector('.opt[data-cal="revised"]').disabled,
    ncTxt:document.querySelector('.opt[data-cal="revised"]').textContent, about:document.getElementById('about').open, aboutTxt:document.getElementById('about').textContent,
    data:document.getElementById('dataLbl').textContent, ver:document.getElementById('verLbl').textContent, eng:document.getElementById('engTextLbl').textContent,
    logos:document.getElementById('logosRow').classList.contains('hidden'), review:document.getElementById('reviewQuotesSw').getAttribute('aria-checked') }));
  check('header settings button opens Settings', st.view);
  check('appearance: theme Auto by default', st.theme==='auto');
  check('Greek editions offered separately: Byzantine Textform (chosen) and Patriarchal Text', st.eds==='rp*,pt');
  check('English text: King James Version; the NKJV is paused until its publisher grants permission', /King James Version \(public domain\)/.test(st.eng) && /paused until its publisher grants permission/.test(st.eng));
  check('calendar: Old Calendar in use; New Calendar shown as not yet available, with the reason', st.cal && st.nc && /cannot be made by shifting dates/.test(st.ncTxt));
  check('About & sources folded; names ROCOR as the tradition, the OCA basis of the day data, every source and the Patriarchal transcription', !st.about && /Greek Horologion/.test(st.aboutTxt) && /ROCOR/.test(st.aboutTxt) && /OCA’s calendar/.test(st.aboutTxt) && /Antoniades/.test(st.aboutTxt) && /Robinson/.test(st.aboutTxt));
  check('saved-data summary and version shown (Version '+VER+' · build)', /days? of readings/.test(st.data) && /fasting notes?/.test(st.data) && new RegExp('^ · Version '+VER+' · build [0-9a-f]{10}$').test(st.ver));
  check('the ΛΟΓΟΣ link stays hidden until that app is published (no link to an unavailable app)', st.logos);
  check('“Sayings awaiting review” is off by default', st.review==='false');
  await page.click('#about summary'); await page.waitForTimeout(400);
  const srcs = await page.evaluate(()=>({ n:document.querySelectorAll('#sourcesList .srcitem').length,
    titles:[...document.querySelectorAll('#sourcesList .srcitem .stitle')].map(t=>t.textContent),
    nkjv:[...document.querySelectorAll('#sourcesList .srcitem')].find(d=>/New King James/.test(d.textContent)),
    allLic:[...document.querySelectorAll('#sourcesList .srcitem')].every(d=>/Licence:/.test(d.textContent) && /Checked:/.test(d.textContent)) }));
  const nkjvItem = await page.evaluate(()=>{ const d=[...document.querySelectorAll('#sourcesList .srcitem')].find(d=>/New King James/.test(d.textContent)); return d ? d.querySelector('.stag').textContent : ''; });
  const sayItem = await page.evaluate(()=>{ const d=[...document.querySelectorAll('#sourcesList .srcitem')].find(d=>/Sayings of the Fathers/.test(d.textContent)); return d ? d.textContent : ''; });
  const reg = JSON.parse(fs.readFileSync(path.join(DIR,'data','sources.json'),'utf8'));
  const counts = fjson.quotes.reduce((a,q)=>(a[q.status]=(a[q.status]||0)+1,a),{});
  check('content source registry: every source with its licence and the date checked ('+reg.sources.length+' sources)', srcs.n===reg.sources.length && srcs.n>=12 && srcs.allLic &&
    reg.sources.every(s=>s.title && s.licence && s.status && s.checked && 'url' in s && 'attribution' in s && 'review' in s));
  check('registry: NKJV shown as paused; the sayings show how many are sourced, adapted and awaiting review', /Paused/.test(nkjvItem) &&
    sayItem.indexOf(counts.sourced+' sourced · '+counts.adapted+' adapted · '+counts.review+' awaiting review')>-1);
  check('reading-size control in Settings shows the size', /^\d+%$/.test(await page.textContent('#scaleLbl')));
  await page.click('#reviewQuotesSw');
  const revOn = await page.evaluate(ids=>{ let n=0; for(let i=0;i<400;i++){ const q=window.__quoteForDay(new Date(2026,0,1+i)); if(q && ids.includes(q.id)) n++; } return {n, store:localStorage.getItem('pref:reviewQuotes')}; },
    fjson.quotes.filter(q=>q.status==='review').map(q=>q.id));
  const revCard = await page.evaluate(()=>{ window.__setFathers({quotes:[{id:'q903', q:'Unverified saying.', by:'Someone', status:'review', note:'not found'}]});
    return { shown:!document.getElementById('quoteCard').classList.contains('hidden'), label:!document.getElementById('quoteStatus').classList.contains('hidden') && document.getElementById('quoteStatus').textContent,
      small:(document.querySelector('#quoteBy small')||{}).textContent||'' }; });
  await page.click('#reviewQuotesSw');
  check('turning on “Sayings awaiting review” adds them, clearly marked “Source awaiting review” and with no source claimed', revOn.n>0 && revOn.store==='1' && revCard.shown && revCard.label==='Source awaiting review' && revCard.small==='');
  check('turning it off again leaves them out', (await page.evaluate(()=>localStorage.getItem('pref:reviewQuotes')))==='0');
  const pk = await page.evaluate(()=>[...document.querySelectorAll('#pkgList .pkg')].map(p=>p.id.replace('pkg-','')+'|'+p.querySelector('.pksub').textContent+'|'+p.querySelector('.pkstat').textContent+'|'+(p.querySelector('.pkbtn').classList.contains('hidden')?'':p.querySelector('.pkbtn').textContent)));
  // (the coming week is saved quietly, and Greek chapters already read are kept, so some may be partly there)
  check('offline reading: the coming 30 days and three New Testament texts, each with its size, what is already on the device, and a Save button', pk.length===4 &&
    /^days-30\|Readings, saints and fasting for each day · 30 days · about [\d.]+ (KB|MB)\|(\d+ of the coming 30 days (is|are) on this device\|Save all 30|Not saved\|Save)$/.test(pk[0]) &&
    /^nt-kjv\|King James Version · 27 books · \d+ KB\|Not saved\|Save$/.test(pk[1]) &&
    /^nt-rp\|Byzantine Textform \(Robinson–Pierpont\) · 260 chapters · [\d.]+ MB\|(Not saved\|Save|Partly on this device: \d+ of 260 chapters\|Save all)$/.test(pk[2]) &&
    /^nt-pt\|Patriarchal Text \(1904\/1912\) · 27 books · [\d.]+ MB\|Not saved\|Save$/.test(pk[3]) || console.log(pk));
  check('offline reading names what cannot be saved and why (NKJV licence; later stages)', /New King James Version cannot be saved: its licence does not allow it/.test(await page.$eval('#offlineCard', e=>e.textContent)));
  await ctx.close();
  check('no request was made to the unlicensed NKJV source', bollsCalls===0);

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
  check('Parallel: a Greek line under each of the 32 KJV verses (5 + 9 + 18)', gk.n===32 && gk.per==='5,9,18');
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
  // Patriarchal Text
  await page.click('#setBtn'); await page.click('#gkEdOpts .opt[data-ed="pt"]'); await page.click('.tab[data-tab="today"]');
  await page.waitForFunction(()=>{ const g=document.querySelector('.reading .body .gk'); return g && /^1αληθειαν λεγω εν χριστω/.test(g.textContent); },{timeout:5000}).catch(()=>{});
  const pt = await page.evaluate(acc=>{ const re=new RegExp(acc.slice(1,-1)); const gks=[...document.querySelectorAll('.reading .body .gk')].map(g=>g.textContent);
    return { n:gks.length, first:gks[0]||'', anyAccent:gks.some(t=>re.test(t)), note:document.getElementById('gkEdNote').textContent, ed:localStorage.getItem('pref:gkEd') }; }, ACCENTS.toString());
  check('Patriarchal Text selectable: Romans 9:1 from the 1904 edition', pt.n===32 && /^1αληθειαν λεγω εν χριστω/.test(pt.first) && pt.ed==='pt');
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
  await page.addInitScript(()=>{ localStorage.setItem('pref:lang','par'); });
  const MOCK_OT = clone(MOCK);
  MOCK_OT.readings = [{ source:"Vespers", display:"Isaiah 1:1-3", passage:[{verse:1,content:"The vision of Isaiah."},{verse:2,content:"Hear, O heavens."},{verse:3,content:"The ox knoweth his owner."}] }];
  await mockApi(page, MOCK_OT);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000}); await page.waitForTimeout(400);
  const ot = await page.evaluate(()=>({ g:document.querySelectorAll('.reading .body .gk').length, note:(document.querySelector('.reading .body .gknote')||{}).textContent||'',
    main:document.querySelectorAll('#readings .reading').length }));
  check('Old Testament reading: no Greek, and a note says why', ot.g===0 && /New Testament readings/.test(ot.note));
  check('a day with no Liturgy reading still shows what is appointed, first', ot.main===1);
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
  await page.evaluate(()=>window.__openReader(43,3,1)); await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="en:rp"]',{timeout:5000});
  await page.evaluate(()=>{ const v=document.querySelector('#rdBody .vs[data-v="20"]'); window.scrollTo(0, v.getBoundingClientRect().top + pageYOffset + 2); });
  await page.waitForTimeout(800);
  const pos = await page.evaluate(()=>JSON.parse(localStorage.getItem('reader:pos')));
  await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await tab(page,'scripture'); await page.waitForSelector('#rdBody[data-ch="43:3"]',{timeout:5000}); await page.waitForTimeout(300);
  const back = await page.evaluate(()=>({ t:document.getElementById('rdTitle').textContent+' '+document.getElementById('rdSub').textContent,
    top:document.querySelector('#rdBody .vs[data-v="'+JSON.parse(localStorage.getItem('reader:pos')).v+'"]').getBoundingClientRect().top }));
  check('last reading position remembered (book, chapter and verse)', pos.b===43 && pos.c===3 && pos.v>=19 && pos.v<=21 && back.t==='John Chapter 3' && back.top>-5 && back.top<200);
  await page.click('#rdFocus');
  const focus = await page.evaluate(()=>({ on:document.documentElement.classList.contains('focus'), tabs:getComputedStyle(document.querySelector('.tabs')).display, x:getComputedStyle(document.getElementById('focusExit')).display }));
  await page.goBack(); await page.waitForTimeout(250);
  check('distraction-free mode hides everything but the text; Back leaves it', focus.on && focus.tabs==='none' && focus.x!=='none' && !(await page.evaluate(()=>document.documentElement.classList.contains('focus'))) && (await visibleView(page))==='scripture');
  await page.click('.tab[data-tab="today"]'); await page.click('#readings .reading .head');
  await page.click('#readings .reading.open .more');
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
      if(t==='settings'){ await page.click('#about summary'); await page.evaluate(()=>document.querySelectorAll('#sourcesList details').forEach(d=>d.open=true)); await page.waitForTimeout(200); }
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

  // ================= 9. SAVED DATA FROM v33 AND v34 IS KEPT AND HONOURED =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  const old40 = addDays(t0,-40), ahead30 = addDays(t0,30);
  const seeded = { 'pref:cal':'gregorian', 'pref:txt':'nkjv', 'pref:scale':'120', 'pref:greek':'1', 'pref:installDismissed':'1',
    'pref:lang':'par', 'pref:gkEd':'rp', 'reader:pos':JSON.stringify({b:43,c:3,v:16}),
    'user:bookmarks':JSON.stringify([{b:43,c:3,v:16,s:'For God so loved',t:1}]), 'user:highlights':JSON.stringify([{b:45,c:8,v:28,s:'All things',t:2}]),
    'user:fastlog':JSON.stringify({'2026-07-22':'k'}),
    [dayKey(t0)]: JSON.stringify({t:Date.now()-3600e3, data:MOCK}), [dayKey(old40)]: JSON.stringify({t:1, data:MOCK}), [dayKey(ahead30)]: JSON.stringify({t:Date.now(), data:MOCK}),
    'nkjv:45:9': JSON.stringify([{verse:1,text:'saved NKJV'}]) };
  await page.addInitScript(s=>{ if(!sessionStorage.getItem('seeded')){ for(const k in s) localStorage.setItem(k,s[k]); sessionStorage.setItem('seeded','1'); } }, seeded);
  bollsCalls = 0;
  await page.route('**orthocal.info/**', r=>r.abort()); await page.route('**allorigins.win/**', r=>r.abort()); await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.reading',{timeout:5000}); await page.waitForTimeout(800);
  const honoured = await page.evaluate(()=>({ alt:document.getElementById('altdate').textContent, badges:[...document.querySelectorAll('.reading .ver')].map(x=>x.textContent).join(','),
    lang:document.querySelector('#langSeg button.active').getAttribute('data-lang'), rs:getComputedStyle(document.documentElement).getPropertyValue('--rs').trim(),
    banner:document.getElementById('installBanner').classList.contains('hidden'), off:document.getElementById('offlineBanner').classList.contains('show'),
    offTxt:document.getElementById('offlineBanner').textContent, summary:document.getElementById('summary').textContent }));
  check('v33/v34 choices honoured: Old Calendar, size 120%, Greek → Parallel, install dismissed', /Old\sStyle/.test(honoured.alt) && honoured.lang==='par' && honoured.rs==='1.2' && honoured.banner);
  check('a reader who had the NKJV in version 34 now gets the KJV, and the NKJV source is not contacted', honoured.badges==='KJV,KJV,KJV' && bollsCalls===0);
  check('saved day opens with no connection; the notice says it is a saved copy, of which day, and when it was saved',
    honoured.off && /Cyrus/.test(honoured.summary) && honoured.offTxt.indexOf('Showing the copy of '+fmtLong(t0)+' saved today at')>-1);
  await page.waitForTimeout(5200);                                  // housekeeping runs 5 s after opening
  const kept = await page.evaluate(s=>{ const out={}; for(const k in s) out[k]=localStorage.getItem(k)===s[k]; return out; }, seeded);
  const personal = Object.keys(seeded).filter(k=>/^(pref|user|reader):/.test(k));
  check('every earlier preference and personal record survives untouched (bookmarks, highlights, fasting notes, reading position)', personal.every(k=>kept[k]) || console.log(kept));
  check('housekeeping: days older than two weeks are cleared; today and the coming weeks are kept', !kept[dayKey(old40)] && (await page.evaluate(k=>localStorage.getItem(k)===null, dayKey(old40))) && kept[dayKey(ahead30)] && (await page.evaluate(k=>!!localStorage.getItem(k), dayKey(t0))));
  check('NKJV text saved by version 34 is cleared from the device while the NKJV is paused', await page.evaluate(()=>localStorage.getItem('nkjv:45:9')===null));
  const reck = await page.evaluate(()=>({ dec25: window.__fastRule(new Date(2026,11,25)).feast||null, jan7: window.__fastRule(new Date(2027,0,7)).feast||null }));
  check('reckoning fixed: Nativity on 7 Jan civil, not 25 Dec', !/Nativity/.test(reck.dec25||'') && /Nativity of Christ/.test(reck.jan7||''));
  await ctx.close();

  // ================= 10. FASTING STATES, FALLBACKS, ERRORS =================
  for(const [mock, name, iso] of [[MOCK_STRICT,'strict','2027-07-21'],[MOCK_NOFAST,'nofast','2026-07-28']]){
    ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(page, mock);
    await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
    await setDate(page, iso); await page.waitForFunction(d=>document.getElementById('date').textContent.indexOf(d)>-1, iso==='2027-07-21' ? '21 July 2027' : '28 July 2026', {timeout:5000});
    const f = await page.evaluate(()=>({ txt:document.getElementById('fastText').textContent, exc:document.getElementById('fastExc').textContent, cat:document.getElementById('fastWrap').getAttribute('data-cat'),
      src:!document.getElementById('fastSrc').classList.contains('hidden') }));
    if(name==='strict') check('a plain Wednesday (21 Jul 2027): “Fast day · no wine or oil”, fast colour, the source agrees so no second line', f.txt==='Fast day' && f.exc===' · no wine or oil' && f.cat==='fast' && !f.src);
    else check('No-Fast day: no allowance shown and no second line (St Vladimir on a Tuesday, 28 Jul 2026)', f.txt==='No fast' && f.exc.trim()==='' && f.cat==='free' && !f.src);
    await ctx.close();
  }
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  await page.route('**orthocal.info/**', r=> r.abort()); await page.route('**allorigins.win/**', r=> r.abort()); await page.route('**bolls.life/**', r=> r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#errorBanner.show',{timeout:8000}).catch(()=>{});
  const err = await page.evaluate(()=>({ banner:document.getElementById('errorBanner').classList.contains('show'), btxt:document.getElementById('errorBanner').textContent,
    key:document.getElementById('fastKey').textContent, txt:document.getElementById('fastText').textContent, alt:document.getElementById('altdate').textContent,
    season:document.getElementById('tdSeason').textContent, card:!!document.getElementById('offlineDay'), content:!document.getElementById('content').classList.contains('hidden'),
    readings:document.querySelectorAll('.reading').length, saints:document.getElementById('commemCard').classList.contains('hidden'), quote:!document.getElementById('quoteCard').classList.contains('hidden') }));
  const expRule = await page.evaluate(()=>window.__dayRule(new Date()).name);
  check('nothing reachable: a plain notice naming the day; readings and saints are not invented; the fasting rule is worked out on the device',
    err.banner && err.btxt.indexOf(fmtLong(t0))>-1 && /not shown/.test(err.btxt) && err.readings===0 && err.saints && err.txt===expRule && err.card);
  check('…while the day card still shows what can be worked out exactly: the dates, tone and season', err.content && /Old\sStyle/.test(err.alt) && err.season.length>3 && err.quote);
  await ctx.close();
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage();
  let allow = true;
  await page.route('**orthocal.info/api/**', r=> allow ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}) : r.abort());
  await page.route('**allorigins.win/**', r=> r.abort());
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});
  allow = false;
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.reading',{timeout:5000}).catch(()=>{});
  await page.waitForSelector('#offlineBanner.show',{timeout:8000}).catch(()=>{});
  const offTxt = await page.$eval('#offlineBanner', e=>e.textContent);
  check('calendar unreachable: the saved day shows in full, marked as a saved copy with its date', (await page.$$eval('.reading .body .v', n=>n.length))===32 &&
    offTxt.indexOf('The calendar service could not be reached. Showing the copy of '+fmtLong(t0)+' saved today at')===0);
  await ctx.setOffline(true); await page.waitForTimeout(300);
  const chipOn = await page.$eval('#netChip', e=>!e.classList.contains('hidden'));
  allow = true; await ctx.setOffline(false); await page.waitForTimeout(1500);
  const chipOff = await page.$eval('#netChip', e=>e.classList.contains('hidden'));
  const bannerGone = await page.$eval('#offlineBanner', e=>!e.classList.contains('show'));
  check('an “Offline” mark in the header while the phone has no connection; back online, the day reloads and the notice clears', chipOn && chipOff && bannerGone);
  await ctx.close();

  // ================= 11. BACK BUTTON, INSTALL, PREFETCH, A NEW DAY =================
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
  const tomorrow = addDays(t0,1);
  check('the coming week is saved quietly for offline use', apiCalls.length>=6 && (await page.evaluate(k=>!!localStorage.getItem(k), dayKey(tomorrow))));
  check('no NKJV request in normal use', bollsCalls===0);
  await ctx.close();
  // an app left open overnight moves on to the new day
  ctx = await browser.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(page, MOCK);
  const lateNight = new Date(2026,10,27,23,59,0);
  await page.clock.install({ time: lateNight });
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const before0 = await page.textContent('#date');
  await page.clock.runFor(90*1000);                                  // past midnight; the minute check runs
  await page.waitForFunction(()=>/28 November 2026/.test(document.getElementById('date').textContent),{timeout:5000}).catch(()=>{});
  const after0 = { date: await page.textContent('#date'), btn: await page.$eval('#today', e=>e.classList.contains('hidden')), season: await page.textContent('#tdSeason') };
  check('an app left open past midnight moves on to the new day by itself (27 → 28 November 2026)', /27 November 2026/.test(before0) && /28 November 2026/.test(after0.date) && after0.btn && after0.season==='Nativity Fast — Day 1 of 40');
  await ctx.close();
  check('no script errors in the main session', pageErrors.length===0 || console.log(pageErrors));

  // ================= 12. OFFLINE PACKAGES, BACKUP AND RESTORE =================
  // Service workers are blocked here so that every download is visible to the test; the page itself checks
  // and stores each file (the service worker passes package downloads straight to the network).
  const ctxOpts = { viewport:{width:390,height:844}, serviceWorkers:'block', acceptDownloads:true };
  // 12a. the download pool reports once, after every item has finished
  ctx = await browser.newContext(ctxOpts); page = await ctx.newPage(); await mockApi(page, MOCK);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  const poolRun = await page.evaluate(async()=>{
    const log=[]; const items=[...Array(12).keys()];
    const failed = await window.__pool(items, 4, i=>new Promise((res,rej)=>setTimeout(()=>{ log.push(i); (i%5===3 ? rej : res)(); }, (12-i)*25)));
    return { failed, finishedBefore: log.length };
  });
  check('download pool: the result comes once, after all 12 items have finished, with exactly the failures', poolRun.finishedBefore===12 && poolRun.failed.sort((a,b)=>a-b).join(',')==='3,8');
  await ctx.close();
  // 12b. New Testament (KJV): a slow file, a failed file and a damaged file
  ctx = await browser.newContext(ctxOpts); page = await ctx.newPage(); await mockApi(page, MOCK);
  let slowDone = 0, fail46 = true, bad47 = true;
  await page.route('**/kjv/45.json', async r=>{ await sleep(2500); slowDone = Date.now(); await r.continue(); });
  await page.route('**/kjv/46.json', r=> fail46 ? r.fulfill({status:500, body:'error'}) : r.continue());
  await page.route('**/kjv/47.json', r=> bad47 ? r.fulfill({status:200, contentType:'application/json', body:'{"1":{"1":"Paul, called to be an apostle'}) : r.continue());
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.click('#setBtn'); await page.waitForSelector('#pkg-nt-kjv .pkbtn:not(.hidden)',{timeout:5000});
  await page.evaluate(()=>{ window.__stats=[]; const e=document.getElementById('pkg-nt-kjv');
    new MutationObserver(()=>window.__stats.push([Date.now(), e.querySelector('.pkstat').textContent])).observe(e,{subtree:true,childList:true,characterData:true}); });
  await page.click('#pkg-nt-kjv .pkbtn');
  const finished = await waitPkg(page, 'nt-kjv', /^Saved \d+ of 27 books/, 30000);
  const stats = await page.evaluate(()=>window.__stats);
  const firstResult = (stats.find(s=>/^Saved|^On this device/.test(s[1]))||[0])[0];
  const msg = await pkgStat(page,'nt-kjv');
  const state1 = await page.evaluate(async()=>{ const c=await caches.open('orthodox-readings-texts-1'); const ks=(await c.keys()).map(r=>new URL(r.url).pathname).filter(p=>/\/kjv\//.test(p));
    return { n:ks.length, has47:ks.some(p=>/\/kjv\/47\.json$/.test(p)), rec:localStorage.getItem('pkg:orthodox-readings-nt-kjv'), btn:document.querySelector('#pkg-nt-kjv .pkbtn').textContent }; });
  check('downloads: the result is reported only after every file has finished — a slow file is waited for', finished && slowDone>0 && firstResult>=slowDone);
  check('downloads: a failed file and a damaged file are reported honestly (25 of 27 saved), with Retry; nothing claims “saved”',
    msg==='Saved 25 of 27 books. 2 were not downloaded — check your connection, then tap Retry.' && state1.btn==='Retry' && state1.rec===null && !stats.some(s=>/^Saved on this device|^On this device/.test(s[1])));
  check('downloads: a damaged (cut-off) file is never stored', state1.n===25 && !state1.has47);
  fail46 = false; bad47 = false;
  await page.click('#pkg-nt-kjv .pkbtn');
  const retried = await waitPkg(page, 'nt-kjv', /^Saved on this device/, 30000);
  const state2 = await page.evaluate(async()=>{ const c=await caches.open('orthodox-readings-texts-1'); const ks=(await c.keys()).map(r=>new URL(r.url).pathname).filter(p=>/\/kjv\//.test(p));
    const ok = await Promise.all(ks.map(async p=>{ try{ JSON.parse(await (await c.match(p)).text()); return true; }catch(e){ return false; } }));
    return { n:ks.length, allJSON:ok.every(Boolean), rec:JSON.parse(localStorage.getItem('pkg:orthodox-readings-nt-kjv')||'null'), btnHidden:document.querySelector('#pkg-nt-kjv .pkbtn').classList.contains('hidden') }; });
  const kjvPkg = PKGS.find(p=>p.id==='nt-kjv');
  check('Retry fetches what is missing; then all 27 books are stored, each readable, and only then is it marked saved', retried && state2.n===27 && state2.allJSON && state2.rec && state2.rec.v===kjvPkg.version && state2.rec.n===27 && state2.btnHidden);
  // two packages at once: the second waits its turn; each reports its own result
  await page.click('#pkg-nt-pt .pkbtn'); await page.click('#pkg-nt-rp .pkbtn');
  const queued = await page.$eval('#pkg-nt-rp .pkstat', e=>e.textContent);
  const both = (await waitPkg(page,'nt-pt',/^Saved on this device/,60000)) && (await waitPkg(page,'nt-rp',/^Saved on this device/,90000));
  const counts2 = await page.evaluate(async()=>({ pt:(await (await caches.open('orthodox-readings-texts-1')).keys()).filter(r=>/greek-pt\//.test(r.url)).length,
    rp:(await (await caches.open('orthodox-readings-greek-1')).keys()).length }));
  check('two packages chosen together: the second waits, then each is checked and saved in full (27 books, 260 chapters)', /^Waiting|^Saving/.test(queued) && both && counts2.pt===27 && counts2.rp===260);
  await page.click('#pkg-nt-kjv .pkrm');
  const confirmShown = await page.$eval('#pkg-nt-kjv .pkconfirm', e=>!e.classList.contains('hidden') && /Remove “New Testament — English — King James Version” from this device\?/.test(e.textContent));
  await page.click('#pkg-nt-kjv .pkconfirm .btn.soft');
  await waitPkg(page,'nt-kjv',/^Not saved$/,5000);
  const removed = await page.evaluate(async()=>({ n:(await (await caches.open('orthodox-readings-texts-1')).keys()).filter(r=>/\/kjv\//.test(r.url)).length,
    pt:(await (await caches.open('orthodox-readings-texts-1')).keys()).filter(r=>/greek-pt\//.test(r.url)).length, rec:localStorage.getItem('pkg:orthodox-readings-nt-kjv') }));
  check('Remove asks first, then deletes only that text and its record', confirmShown && removed.n===0 && removed.pt===27 && removed.rec===null);
  await page.evaluate(()=>{ localStorage.setItem('pkg:orthodox-readings-nt-pt', JSON.stringify({v:'000000000000', t:Date.now(), n:27})); });
  await page.click('.tab[data-tab="today"]'); await page.click('#setBtn');
  const upd = await waitPkg(page,'nt-pt',/^An updated text is available$/,5000) && (await page.$eval('#pkg-nt-pt .pkbtn', e=>e.textContent))==='Update';
  await page.click('#pkg-nt-pt .pkbtn');
  check('a newer text in an update is offered as “Update”, and updating saves it again', upd && await waitPkg(page,'nt-pt',/^Saved on this device/,30000));
  const storageTxt = await page.textContent('#storageLbl');
  check('storage used is shown in plain words', /^Offline data for this website: about [\d.]+ (KB|MB)\./.test(storageTxt));
  await ctx.close();
  // 12c. The coming 30 days, one day failing
  ctx = await browser.newContext(ctxOpts); page = await ctx.newPage();
  const badDay = addDays(t0,10); let failDay = true; const askedDays = new Set();
  await page.route('**orthocal.info/api/**', r=>{ const u=r.request().url(); askedDays.add(u);
    if(failDay && u.indexOf('/'+badDay.getFullYear()+'/'+(badDay.getMonth()+1)+'/'+badDay.getDate()+'/')>-1) return r.abort();
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }); });
  await page.route('**allorigins.win/**', r=>r.abort());
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.click('#setBtn'); await page.waitForSelector('#pkg-days-30 .pkbtn:not(.hidden)',{timeout:5000});
  await page.click('#pkg-days-30 .pkbtn');
  const dFail = await waitPkg(page,'days-30',/^Saved 29 of 30 days\. 1 was not downloaded/,30000);
  const dRec1 = await page.evaluate(()=>localStorage.getItem('pkg:orthodox-readings-days-30'));
  failDay = false;
  await page.click('#pkg-days-30 .pkbtn');
  const lastDay = addDays(t0,29).toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
  const dOK = await waitPkg(page,'days-30',new RegExp('^Saved: every day to '+lastDay),30000);
  const dKeys = await page.evaluate(keys=>keys.filter(k=>{ const v=localStorage.getItem(k); return v && JSON.parse(v).data; }).length, [...Array(30).keys()].map(i=>dayKey(addDays(t0,i))));
  check('the coming 30 days: a day that fails is reported (29 of 30) with Retry, and not marked saved', dFail && dRec1===null);
  check('Retry completes the 30 days; each is stored with its readings, ready for use offline', dOK && dKeys===30 && !!(await page.evaluate(()=>localStorage.getItem('pkg:orthodox-readings-days-30'))));
  await ctx.close();
  // 12d. Backup and restore
  ctx = await browser.newContext(ctxOpts); page = await ctx.newPage(); await mockApi(page, MOCK);
  const mine = { 'user:bookmarks':JSON.stringify([{b:43,c:3,v:16,s:'For God so loved',t:1}]), 'user:highlights':JSON.stringify([{b:45,c:8,v:28,s:'All things',t:2}]),
    'user:fastlog':JSON.stringify({'2026-07-22':'k','2026-07-24':'p'}), 'user:fastnotes':JSON.stringify({'2026-07-22':'With the family.'}),
    'user:favQuotes':JSON.stringify(['q001','q042']), 'reader:pos':JSON.stringify({b:43,c:3,v:16}), 'pref:lang':'par', 'pref:scale':'110', 'pref:todayHide':JSON.stringify(['notes']) };
  await page.addInitScript(s=>{ if(!sessionStorage.getItem('seeded')){ for(const k in s) localStorage.setItem(k,s[k]); sessionStorage.setItem('seeded','1'); } }, mine);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:5000});
  await page.click('#setBtn'); await page.click('#backupBtn');
  const bkSheet = await page.evaluate(()=>({ open:!document.getElementById('backupSheet').classList.contains('hidden'), txt:document.getElementById('backupBody').textContent }));
  check('Save a backup: says what it holds and warns that the file is private', bkSheet.open && /1 bookmark · 1 highlight · 2 fasting notes · 1 written note · 2 saved sayings/.test(bkSheet.txt) &&
    /Anyone who has the file can read them/.test(bkSheet.txt) && /does not send it anywhere/.test(bkSheet.txt));
  const [dl] = await Promise.all([ page.waitForEvent('download'), page.click('#bkDownload') ]);
  const dlPath = path.join(os.tmpdir(), 'dr-backup-test.json'); await dl.saveAs(dlPath);
  const bk = JSON.parse(fs.readFileSync(dlPath,'utf8'));
  check('the backup file: documented format and version, dated, named for the day', dl.suggestedFilename()==='daily-readings-backup-'+t0.getFullYear()+'-'+String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0')+'.json' &&
    bk.format==='daily-readings-backup' && bk.version===1 && bk.app===VER && !isNaN(Date.parse(bk.created)));
  check('the backup holds the reader’s records and settings — and nothing else (no saved days, no offline texts)', bk.data.bookmarks.length===1 && bk.data.highlights.length===1 &&
    Object.keys(bk.data.fastlog).length===2 && bk.data.fastnotes['2026-07-22']==='With the family.' && bk.data.savedSayings.join(',')==='q001,q042' && bk.data.reader.v===16 &&
    bk.data.settings['pref:lang']==='par' && JSON.stringify(bk.data.settings['pref:todayHide'])==='["notes"]' && !/day:julian|pkg:|nkjv:/.test(JSON.stringify(bk)));
  // Make changes on this device, then merge the backup back in
  await page.evaluate(()=>{ localStorage.setItem('user:bookmarks', JSON.stringify([{b:40,c:5,v:3,s:'Blessed',t:5}])); localStorage.setItem('user:fastlog', JSON.stringify({'2026-07-22':'p'}));
    localStorage.removeItem('user:fastnotes'); localStorage.setItem('pref:lang','en'); });
  const bkFile = { name:'daily-readings-backup.json', mimeType:'application/json', buffer: fs.readFileSync(dlPath) };
  await page.goBack().catch(()=>{}); await page.waitForTimeout(200);
  await page.setInputFiles('#restoreFile', bkFile);
  await page.waitForSelector('#restoreSheet:not(.hidden)',{timeout:5000});
  const rs = await page.evaluate(()=>({ txt:document.getElementById('restoreBody').textContent, modes:[...document.querySelectorAll('#restoreBody .opt')].map(o=>o.getAttribute('data-mode')+(o.classList.contains('active')?'*':'')).join(',') }));
  check('Restore shows the backup’s date and contents and offers Merge (chosen) or Replace', new RegExp('Backup made .* · version '+VER).test(rs.txt) && /In the backup: 1 bookmark/.test(rs.txt) && rs.modes==='merge*,replace');
  await Promise.all([ page.waitForNavigation({waitUntil:'networkidle'}), page.click('#bkRestoreGo') ]);
  await page.waitForSelector('.reading',{timeout:5000});
  const merged = await page.evaluate(()=>({ bm:JSON.parse(localStorage.getItem('user:bookmarks')).map(x=>x.b+':'+x.c+':'+x.v).join(','), fl:JSON.parse(localStorage.getItem('user:fastlog')),
    fn:JSON.parse(localStorage.getItem('user:fastnotes')), lang:localStorage.getItem('pref:lang'), toast:document.getElementById('toast').textContent, undo:!!localStorage.getItem('backup:undo') }));
  check('Merge adds what this device lacks and keeps this device’s own entries and settings', merged.bm==='40:5:3,43:3:16' && merged.fl['2026-07-22']==='p' && merged.fl['2026-07-24']==='p' &&
    merged.fn['2026-07-22']==='With the family.' && merged.lang==='en' && merged.undo);
  await page.click('#setBtn');
  await page.setInputFiles('#restoreFile', bkFile);
  await page.waitForSelector('#restoreSheet:not(.hidden)',{timeout:5000});
  await page.click('#restoreBody .opt[data-mode="replace"]'); await page.click('#bkRestoreGo');
  const confirmTxt = await page.$eval('#restoreBody .bkconfirm', e=>!e.classList.contains('hidden') ? e.textContent : '');
  await Promise.all([ page.waitForNavigation({waitUntil:'networkidle'}), page.click('#bkReplaceYes') ]);
  await page.waitForSelector('.reading',{timeout:5000});
  const replaced = await page.evaluate(()=>({ bm:JSON.parse(localStorage.getItem('user:bookmarks')).map(x=>x.b+':'+x.c+':'+x.v).join(','), fl:JSON.parse(localStorage.getItem('user:fastlog')),
    lang:localStorage.getItem('pref:lang'), active:document.querySelector('#langSeg button.active').getAttribute('data-lang') }));
  check('Replace asks for confirmation (naming what will be replaced), then makes this device match the backup', /On this device now: 2 bookmarks/.test(confirmTxt) && /can undo this afterwards/.test(confirmTxt) &&
    replaced.bm==='43:3:16' && replaced.fl['2026-07-22']==='k' && replaced.lang==='par' && replaced.active==='par');
  await page.click('#setBtn');
  const undoShown = await page.$eval('#undoRow', e=>!e.classList.contains('hidden'));
  await Promise.all([ page.waitForNavigation({waitUntil:'networkidle'}), page.click('#undoBtn') ]);
  await page.waitForSelector('.reading',{timeout:5000});
  const undone = await page.evaluate(()=>({ bm:JSON.parse(localStorage.getItem('user:bookmarks')).map(x=>x.b+':'+x.c+':'+x.v).join(','), lang:localStorage.getItem('pref:lang'), undo:localStorage.getItem('backup:undo') }));
  check('Undo puts back exactly what was there before the last restore', undoShown && undone.bm==='40:5:3,43:3:16' && undone.lang==='en' && undone.undo===null);
  const bad = await page.evaluate(()=>{ const r=window.__readBackup; return {
    other: r({format:'something-else', version:1, data:{}}).error, newer: r({format:'daily-readings-backup', version:9, data:{}}).error,
    mixed: r({format:'daily-readings-backup', version:1, data:{ bookmarks:[{b:43,c:3,v:16},{b:99,c:1,v:1},{b:43,c:30,v:1},'x'], fastlog:{'2026-07-22':'k','bad':'k','2026-07-23':'z'},
      savedSayings:['q001','<script>'], settings:{'pref:theme':'neon','pref:lang':'grc','evil':'1'} }}) }; });
  check('restore checks every entry: other files and newer versions are refused; bad entries are left out and counted',
    /not a Daily Readings backup/.test(bad.other) && /newer version/.test(bad.newer) && bad.mixed.data.bookmarks.length===1 && Object.keys(bad.mixed.data.fastlog).join(',')==='2026-07-22' &&
    bad.mixed.data.savedSayings.join(',')==='q001' && bad.mixed.data.settings['pref:lang']==='grc' && !('pref:theme' in bad.mixed.data.settings) && bad.mixed.bad===8);
  await page.click('#setBtn');
  await page.setInputFiles('#restoreFile', { name:'notes.json', mimeType:'application/json', buffer: Buffer.from('{"hello":') });
  await page.waitForSelector('#restoreSheet:not(.hidden)',{timeout:5000});
  check('a file that is not a backup is refused with a plain message, and nothing changes', /could not be read/.test(await page.textContent('#restoreBody')) &&
    (await page.evaluate(()=>JSON.parse(localStorage.getItem('user:bookmarks')).length))===2);
  await ctx.close();

  // ================= 14. ROCOR ALIGNMENT — fasting, colours, feasts, readings, the local date =================
  // Reference data (each source is named in the ROCOR discrepancy report):
  //   OC   orthocal.info day pages, Slavic tradition, Julian calendar, read on 28 November 2026 (62 dates, 2026–2027)
  //   T98  the Nativity Fast table published by a ROCOR parish (St Nicholas, McKinney, Texas) for 1998, a year whose
  //        weekdays fall exactly as 2026's
  //   HT   the Holy Trinity calendar that jordanville.org shows (27 Nov 2026 read directly; the Paschal-season and
  //        polyeleos samples as reported in orthocal's own audit of that calendar)
  //   ANZ  the ROCOR Diocese of Australia and New Zealand calendar for November 2026
  const OC_LIVE = {'2026-11-01':'free','2026-11-07':'free','2026-11-08':'free','2026-11-15':'free','2026-11-27':'oil','2026-11-28':'fish',
    '2026-11-30':'strict','2026-12-01':'oil','2026-12-02':'strict','2026-12-03':'oil','2026-12-04':'fish','2026-12-19':'fish',
    '2026-12-22':'oil','2026-12-24':'oil','2027-01-02':'oil','2027-01-04':'strict','2027-01-05':'oil','2027-01-06':'strict',
    '2027-01-18':'strict','2027-01-20':'fish','2027-01-27':'strict','2027-03-15':'strict','2027-03-17':'strict','2027-03-18':'strict',
    '2027-03-20':'oil','2027-03-22':'oil','2027-04-07':'fish','2027-04-15':'oil','2027-04-24':'caviar','2027-04-25':'fish',
    '2027-04-30':'strict','2027-05-01':'wine','2027-05-12':'oil','2027-05-26':'fish','2027-06-23':'free','2027-06-28':'strict',
    '2027-06-29':'oil','2027-06-30':'strict','2027-07-07':'fish','2026-08-19':'fish','2026-08-28':'fish','2026-09-11':'oil',
    '2026-09-27':'oil','2026-10-09':'fish','2026-10-14':'fish','2026-11-04':'strict','2026-12-11':'strict','2026-12-13':'fish',
    '2027-02-24':'free','2027-03-10':'meat','2027-03-09':'meat','2027-06-02':'oil','2027-06-09':'fish','2027-07-21':'strict',
    '2027-09-11':'oil','2027-09-27':'oil','2026-02-08':'free','2027-02-07':'free','2026-07-02':'oil','2026-07-17':'strict',
    '2026-12-10':'oil','2026-10-20':'free'};
  // Where ROCOR practice differs from OC, with the source
  const ROCOR_DIFF = {'2026-11-04':['fish','Kazan Icon, kept with a vigil (ANZ)'], '2026-12-10':['fish','Kursk Root Icon, vigil (ROCOR parish typikon note)'],
    '2026-12-22':['fish','Conception of the Theotokos on a Tuesday (T98)'], '2027-01-27':['fish','Leavetaking of Theophany · St Sava (HT)'],
    '2027-05-12':['fish','Paschal-season Wednesday (HT)'], '2027-06-02':['fish','Paschal-season Wednesday (HT)']};
  ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' }); page = await ctx.newPage();
  const dayMock = (o)=>Object.assign(clone(MOCK), {stories:[], feasts:[], saints:[], service_notes:[]}, o);
  const KAZAN = dayMock({ summary_title:'Wednesday of the 23rd week after Pentecost', titles:['Wednesday of the 23rd week after Pentecost'],
    saints:['St Abercius, Equal-to-the-Apostles','Venerable Lot of Egypt (5th c.)','Holy Seven Youths of Ephesus'], fast_level_desc:'Fast', fast_exception_desc:'',
    readings:[{source:'Epistle', display:'1 Thessalonians 2.1-8', passage:passage('1Th',1,8)}, {source:'Gospel', display:'Luke 9.44-50', passage:passage('Lk',44,50)}] });
  const JOHNK = dayMock({ summary_title:'22nd Sunday after Pentecost', titles:['22nd Sunday after Pentecost'],
    saints:['Prophet Joel','Relics Ven. John of Rila','Righteous John, Wonderworker of Kronstadt (1908).'], fast_level_desc:'No Fast', fast_exception_desc:'',
    readings:[{source:'11th Matins Gospel', display:'John 21.15-25', passage:passage('Jn',15,25)}, {source:'Epistle', display:'Galatians 6.11-18', passage:passage('Gal',11,18)},
      {source:'Gospel', display:'Luke 8.5-15', passage:passage('Lk',5,15)}] });
  const UNMERC = dayMock({ summary_title:'Synaxis of the Holy Unmercenaries', titles:['Synaxis of the Holy Unmercenaries'],
    saints:['Martyrs Acindynus, Pegasius, Aphthonius, Elpidophorus, and Anempodistus of Persia'], fast_level_desc:'No Fast', fast_exception_desc:'',
    readings:[{source:'Epistle', display:'Ephesians 2.14-22', passage:passage('Eph',14,22)}, {source:'Epistle', desc:'Unmercenaries', display:'1 Corinthians 12.27-13.8', passage:passage('1Co',27,31)},
      {source:'Gospel', display:'Luke 8.26-39', passage:passage('Lk',26,39)}, {source:'Gospel', desc:'Unmercenaries', display:'Matthew 10.1, 5-8', passage:passage('Mt',1,8)}] });
  const PHILIP = dayMock({ summary_title:'Holy Apostle Philip', titles:['Holy Apostle Philip'],
    saints:['Holy Great New Martyr Constantine of Hydra','St Gregory Palamas (1359)','Pious Emperor Justinian and His Wife Theodora (565)','Repose of Archimandrite Lazarus (Moore) (1992) (Nov. 14 OC)'],
    fast_level_desc:'Fast', fast_exception_desc:'Wine and Oil are Allowed',
    readings:[{source:'Epistle', display:'1 Timothy 4.4-8, 16', passage:passage('1Ti',4,8)}, {source:'Gospel', display:'Luke 13.31-35', passage:passage('Lk',31,35)}] });
  const KURSK = dayMock({ summary_title:'Thursday of the 28th week after Pentecost', titles:['Thursday of the 28th week after Pentecost'],
    saints:['Greatmartyr Jacob of Persia','James the Wonderworker, Bishop of Rostov'], fast_level_desc:'Nativity Fast', fast_exception_desc:'Wine and Oil are Allowed',
    readings:[{source:'Epistle', display:'Titus 1.5-2.1', passage:passage('Tit',5,16)}, {source:'Gospel', display:'Luke 18.31-34', passage:passage('Lk',31,34)}] });
  const DAYMOCKS = {'2026/11/4':KAZAN, '2026/11/1':JOHNK, '2026/11/15':UNMERC, '2026/11/27':PHILIP, '2026/12/10':KURSK};
  await page.route('**orthocal.info/api/**', r=>{ const m=r.request().url().match(/julian\/(\d+\/\d+\/\d+)\//);
    r.fulfill({status:200, contentType:'application/json', body:JSON.stringify((m && DAYMOCKS[m[1]]) || MOCK)}); });
  await page.route('**allorigins.win/**', r=>r.abort()); await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000});
  const rocor = await page.evaluate(([oc, diff])=>{
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const lv=(y,m,d)=>window.__fastRule(new Date(y,m,d)).lv;
    const ocOut=[]; let ocSame=0, ocDiff=0;
    for(const k in oc){ const p=k.split('-'), a=window.__fastRule(new Date(+p[0],+p[1]-1,+p[2])).lv, exp=diff[k] ? diff[k][0] : oc[k];
      if(a===exp){ if(diff[k]) ocDiff++; else ocSame++; } else ocOut.push(k+': app '+a+', expected '+exp); }
    // T98 applied to the Nativity Fast of 2026 (28 Nov 2026 – 6 Jan 2027)
    const t98=d=>{ const os=new Date(d.getFullYear(),d.getMonth(),d.getDate()-13), key=(os.getMonth()+1)*100+os.getDate(), w=d.getDay();
      if(key===1224) return (w===0||w===6) ? 'oil' : 'strict';
      if(w===0||w===6) return (key===1220||key===1221) ? 'oil' : 'fish';
      if({1121:1,1125:1,1204:1,1209:1}[key]) return 'fish';
      if(w===2||w===4) return 'oil';
      if({1124:1,1205:1,1212:1,1217:1}[key]) return 'oil';
      return 'strict'; };
    const tOut=[]; let tN=0;
    for(let d=new Date(2026,10,28); d<=new Date(2027,0,6); d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
      tN++; const a=window.__fastRule(d).lv, e=t98(d); if(a!==e) tOut.push(iso(d)+': app '+a+', T98 '+e); }
    return { ocOut, ocSame, ocDiff, tOut, tN,
      ht:{ apr22:lv(2026,3,22), apr24:lv(2026,3,24), apr29:lv(2026,3,29), philip:lv(2026,10,27), sava:lv(2027,0,27),
           poly:[lv(2027,6,23),lv(2027,6,30),lv(2027,7,6),lv(2027,8,8),lv(2027,8,24)] },
      tones:[[2026,10,1],[2026,10,7],[2026,10,8],[2026,10,15],[2026,10,27]].map(a=>window.__toneOfWeek(new Date(a[0],a[1],a[2]))),
      demetrius: window.__liturgicalSeason(new Date(2026,10,7)).name, demetrius27: window.__liturgicalSeason(new Date(2027,10,6)).name,
      lentSat: window.__liturgicalSeason(new Date(2027,2,27)).detail, radonitsa: window.__liturgicalSeason(new Date(2027,4,11)).detail,
      nm:[2025,2026,2027,2028].map(y=>window.__newMartyrsSunday(y).toDateString()),
      nmAdd: window.__supplementFor(new Date(2026,1,8), []).map(s=>s.t+' | '+s.src),
      nmSkip: window.__supplementFor(new Date(2027,1,7), ['New Martyrs and Confessors of Russia; St Gregory the Theologian']).length,
      memo: [window.__isMemorialOnly('Repose of Archimandrite Lazarus (Moore) (1992) (Nov. 14 OC)'), window.__isMemorialOnly('Repose of Hieromonk Seraphim (Rose) of Platina (1982).'),
             window.__isMemorialOnly('Repose of St. John of Kronstadt'), window.__isMemorialOnly('Repose of Elder Joseph the Hesychast of Mt Athos (1959) (August 15 OC)')],
      lit:{ ordinary:window.__litKey(new Date(2026,6,14), {summary_title:'Tuesday of the 6th week after Pentecost'}), natWk:window.__litKey(new Date(2026,11,1), {summary_title:'Tuesday of the 27th week after Pentecost'}),
            nicholas:window.__litKey(new Date(2026,11,19), {summary_title:'St Nicholas the Wonderworker, Abp. of Myra in Lycia'}), kazan:window.__litKey(new Date(2026,10,4), null),
            kursk:window.__litKey(new Date(2026,11,10), null), pascha:window.__litKey(new Date(2027,4,2), null), thomasWk:window.__litKey(new Date(2027,4,12), {summary_title:'Holy Martyr Isidore'}),
            lentWk:window.__litKey(new Date(2027,2,17), {summary_title:'Ven. Somebody'}), lentSat:window.__litKey(new Date(2027,2,20), null), orthodoxy:window.__litKey(new Date(2027,2,21), null),
            cross:window.__litKey(new Date(2027,3,4), null), akathist:window.__litKey(new Date(2027,3,17), null), forty:window.__litKey(new Date(2027,2,22), null),
            gthu:window.__litKey(new Date(2027,3,29), null), gfri:window.__litKey(new Date(2027,3,30), null), exalt:window.__litKey(new Date(2026,8,27), null),
            apWk:window.__litKey(new Date(2027,5,29), null), apSun:window.__litKey(new Date(2026,5,14), null), prophet:window.__litKey(new Date(2026,6,16), {summary_title:'Holy Prophet Elias'}),
            venerable:window.__litKey(new Date(2026,9,8), {summary_title:'Repose of Ven. Sergius of Radonezh'}), martyr:window.__litKey(new Date(2026,9,20), {summary_title:'Great-martyr Artemius'}) } };
  }, [OC_LIVE, ROCOR_DIFF]);
  check('ROCOR fasting: the orthocal.info dates where ROCOR agrees ('+rocor.ocSame+') give the same allowance', rocor.ocSame===56 && rocor.ocOut.length===0 || console.log(rocor.ocOut));
  check('ROCOR fasting: the six orthocal.info dates where ROCOR differs give the ROCOR allowance (Kazan, Kursk Root, Conception, St Sava, Paschal season)', rocor.ocDiff===6);
  check('ROCOR fasting: the Nativity Fast of 2026, day by day, follows the ROCOR parish table (T98) on '+(rocor.tN-rocor.tOut.length)+' of '+rocor.tN+' days — the one difference is the Kursk Root Icon (vigil)',
    rocor.tN===40 && rocor.tOut.length===1 && rocor.tOut[0]==='2026-12-10: app fish, T98 oil' || console.log(rocor.tOut));
  check('ROCOR fasting: Holy Trinity calendar — fish on Paschal-season Wednesdays and Fridays (22, 24, 29 Apr 2026)', rocor.ht.apr22==='fish' && rocor.ht.apr24==='fish' && rocor.ht.apr29==='fish');
  check('ROCOR fasting: Holy Trinity calendar — wine and oil for a polyeleos saint on a Wednesday or Friday; fish on the Leavetaking of Theophany (St Sava)',
    rocor.ht.poly.every(x=>x==='oil') && rocor.ht.sava==='fish');
  check('ROCOR fasting: Jordanville’s daily calendar, Friday 27 Nov 2026 (Apostle Philip): “Food with Oil”, tone eight', rocor.ht.philip==='oil' && rocor.tones[4]===8);
  check('ROCOR tones: the diocesan calendar (ANZ), Nov 2026 — 1 Nov tone 5, 7 Nov tone 5, 8 Nov tone 6, 15 Nov tone 7', rocor.tones.slice(0,4).join(',')==='5,5,6,7');
  check('memorial Saturdays: Demetrius Saturday 7 Nov 2026 (ANZ) and 6 Nov 2027; Saturdays of the Departed in Lent; Radonitsa',
    /Demetrius Saturday/.test(rocor.demetrius) && /Demetrius Saturday/.test(rocor.demetrius27) && /2nd Saturday of Great Lent — Saturday of the Departed/.test(rocor.lentSat) && /^Radonitsa/.test(rocor.radonitsa));
  check('New Martyrs and Confessors: the Sunday closest to 25 Jan OS — 9 Feb 2025, 8 Feb 2026, 7 Feb 2027, 6 Feb 2028; added when the data lacks it, skipped when it has it',
    rocor.nm.join('|')==='Sun Feb 09 2025|Sun Feb 08 2026|Sun Feb 07 2027|Sun Feb 06 2028' && rocor.nmAdd.length===1 && /New Martyrs and Confessors of the Russian Church \| ROCOR calendar/.test(rocor.nmAdd[0]) && rocor.nmSkip===0);
  check('memorials of the repose of people who are not saints are recognised (and saints are not)', rocor.memo.join(',')==='true,true,false,false');
  const L=rocor.lit;
  check('colours (ROCOR handbook): gold for ordinary days · red in the Nativity Fast · St Nicholas gold · Kazan and Kursk Root blue',
    L.ordinary==='gold' && L.natWk==='red' && L.nicholas==='gold' && L.kazan==='blue' && L.kursk==='blue');
  check('colours: Pascha and its season white · Lent weekday black, weekend purple · Orthodoxy and the Cross red · Akathist blue · polyeleos weekday purple',
    L.pascha==='white' && L.thomasWk==='white' && L.lentWk==='black' && L.lentSat==='purple' && L.orthodoxy==='red' && L.cross==='red' && L.akathist==='blue' && L.forty==='purple');
  check('colours: Great Thursday red, Great Friday black · Exaltation red · Apostles’ Fast red on weekdays, gold on Sundays · prophet gold · venerable green · martyr red',
    L.gthu==='red' && L.gfri==='black' && L.exalt==='red' && L.apWk==='red' && L.apSun==='gold' && L.prophet==='gold' && L.venerable==='green' && L.martyr==='red');

  // The Kazan Icon on a weekday (4 Nov 2026), as the diocesan calendar keeps it
  await setDate(page, '2026-11-04'); await page.waitForFunction(()=>/4 November 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  await page.waitForFunction(()=>/Let this mind be in you/.test((document.querySelector('#readings .reading .txt')||{}).textContent||''),{timeout:5000}).catch(()=>{});
  await page.click('#commemHead');
  const kz = await page.evaluate(()=>({ main:[...document.querySelectorAll('#readings .reading .ref')].map(e=>e.firstChild.textContent),
    other:[...document.querySelectorAll('#otherReadings .reading')].map(e=>e.querySelector('.src').textContent+' | '+e.querySelector('.ref').firstChild.textContent),
    text:(document.querySelector('#readings .reading .txt')||{}).textContent||'', note:document.getElementById('rocorNote').textContent, noteShown:!document.getElementById('rocorNote').classList.contains('hidden'),
    supp:[...document.querySelectorAll('#commemList li.supp')].map(e=>e.textContent), fast:document.getElementById('fastText').textContent+document.getElementById('fastExc').textContent,
    src:document.getElementById('fastSrc').textContent, srcShown:!document.getElementById('fastSrc').classList.contains('hidden'), lit:document.getElementById('litText').textContent,
    rsrc:(document.querySelector('#readings .reading .rsrc')||{}).textContent||'', summary:document.getElementById('summary').textContent }));
  check('Kazan Icon (4 Nov 2026): the feast’s Epistle and Gospel first, in the King James text, marked as from the ROCOR diocesan calendar',
    kz.main.join('|')==='Philippians 2:5-11|Luke 10:38-42, 11:27-28' && /Let this mind be in you/.test(kz.text) && /ROCOR — diocesan calendar \(Australia and New Zealand\)/.test(kz.rsrc));
  check('Kazan Icon: the weekday’s readings and the feast’s Matins Gospel are under Other readings, labelled; a note says why',
    kz.other.some(x=>/^Epistle — of the weekday \| 1 Thessalonians 2\.1-8/.test(x)) && kz.other.some(x=>/^Gospel — of the weekday \| Luke 9\.44-50/.test(x)) && kz.other.some(x=>/Matins Gospel — Kazan Icon \| Luke 1:39-49, 56/.test(x)) &&
    kz.noteShown && /ROCOR keeps the Kazan Icon with a vigil/.test(kz.note));
  check('Kazan Icon: heads the day, listed among the saints (ROCOR calendar), fish allowed on this Wednesday, the source calendar’s stricter line shown beneath; colour blue',
    kz.supp.some(x=>/^Kazan Icon of the Mother of God — ROCOR calendar/.test(x)) && /^Fast day · fish, wine and oil allowed — the Kazan Icon/.test(kz.fast) &&
    kz.srcShown && /orthocal\.info, which follows the OCA’s calendar, gives: Fast — no wine or oil/.test(kz.src) && kz.lit==='Blue' && kz.summary==='Kazan Icon of the Mother of God');
  // St John of Kronstadt (1 Nov 2026, a Sunday)
  await setDate(page, '2026-11-01'); await page.waitForFunction(()=>/1 November 2026/.test(document.getElementById('date').textContent),{timeout:5000}); await sleep(400);
  const jk = await page.evaluate(()=>({ main:[...document.querySelectorAll('#readings .reading')].map(e=>e.querySelector('.src').textContent+' | '+e.querySelector('.ref').firstChild.textContent), note:document.getElementById('rocorNote').textContent }));
  check('St John of Kronstadt (1 Nov 2026): the Sunday’s readings, then his Epistle and Gospel from the diocesan calendar',
    jk.main.join(' / ')==='Epistle | Galatians 6.11-18 / Gospel | Luke 8.5-15 / Epistle — St John of Kronstadt | 1 John 4:7-11 / Gospel — St John of Kronstadt | Luke 6:31-36' && /St John of Kronstadt are added/.test(jk.note));
  // The OCA's Sunday Synaxis of the Unmercenaries (15 Nov 2026)
  await setDate(page, '2026-11-15'); await page.waitForFunction(()=>/15 November 2026/.test(document.getElementById('date').textContent),{timeout:5000}); await sleep(400);
  const um = await page.evaluate(()=>({ summary:document.getElementById('summary').textContent, main:[...document.querySelectorAll('#readings .reading .ref')].map(e=>e.firstChild.textContent),
    other:[...document.querySelectorAll('#otherReadings .reading .src')].map(e=>e.textContent), note:document.getElementById('rocorNote').textContent }));
  check('15 Nov 2026: the OCA’s Sunday “Synaxis of the Holy Unmercenaries” is not the headline; its readings are under Other readings, labelled; a note explains',
    !/Unmercenaries/.test(um.summary) && /Acindynus/.test(um.summary) && um.main.join('|')==='Ephesians 2.14-22|Luke 8.26-39' &&
    um.other.filter(x=>/Unmercenaries · the OCA’s Sunday transfer — not in the ROCOR calendar/.test(x)).length===2 && /1 November \(Old Style\)/.test(um.note));
  // Apostle Philip (27 Nov 2026): a memorial that is not a saint's commemoration is not listed
  await setDate(page, '2026-11-27'); await page.waitForFunction(()=>/27 November 2026/.test(document.getElementById('date').textContent),{timeout:5000}); await sleep(300);
  const ph = await page.evaluate(()=>({ li:[...document.querySelectorAll('#commemList li')].map(e=>e.textContent), hid:document.getElementById('commemHidden').textContent,
    hidShown:!document.getElementById('commemHidden').classList.contains('hidden'), fast:document.getElementById('fastText').textContent+document.getElementById('fastExc').textContent,
    srcShown:!document.getElementById('fastSrc').classList.contains('hidden') }));
  check('27 Nov 2026: “Repose of Archimandrite Lazarus (Moore)” is not listed among the saints, and a line says one entry was left out',
    !ph.li.some(x=>/Lazarus \(Moore\)/.test(x)) && ph.li.some(x=>/Gregory Palamas/.test(x)) && ph.hidShown && /Not listed: 1 entry/.test(ph.hid));
  check('27 Nov 2026: “Fast day · wine and oil allowed — the Apostle Philip”, the same as the source, so no second line', /^Fast day · wine and oil allowed — the Apostle Philip/.test(ph.fast) && !ph.srcShown);
  // The Kursk Root Icon (10 Dec 2026)
  await setDate(page, '2026-12-10'); await page.waitForFunction(()=>/10 December 2026/.test(document.getElementById('date').textContent),{timeout:5000}); await sleep(300);
  const ku = await page.evaluate(()=>({ supp:[...document.querySelectorAll('#commemList li.supp')].map(e=>e.textContent), fast:document.getElementById('fastText').textContent+document.getElementById('fastExc').textContent, lit:document.getElementById('litText').textContent, summary:document.getElementById('summary').textContent }));
  check('Kursk Root Icon (10 Dec 2026): heads the day, in the saints (ROCOR calendar), fish allowed, colour blue', ku.supp.some(x=>/Kursk Root Icon/.test(x)) && /^Kursk Root Icon/.test(ku.summary) && /^Nativity Fast · fish, wine and oil allowed — the Kursk Root Icon/.test(ku.fast) && ku.lit==='Blue');
  // Settings: tradition and calendar; the pastoral note
  await tab(page,'settings');
  const stR = await page.evaluate(()=>({ trad:document.getElementById('tradVal').textContent, cal:document.getElementById('calVal').textContent,
    tradLbl:document.querySelector('#traditionCard .srow .sl').firstChild.textContent.trim(), about:document.getElementById('about').textContent }));
  check('Settings: “Liturgical tradition: ROCOR” and “Church calendar: Traditional Julian (Old Calendar)”', stR.tradLbl==='Liturgical tradition' && stR.trad==='ROCOR' && stR.cal==='Traditional Julian (Old Calendar)');
  check('About keeps the pastoral note: fasting is the general norm, to be discussed with one’s spiritual father', /general norm/.test(stR.about) && /discussed with your spiritual father/.test(stR.about));
  await ctx.close();

  // The local civil date decides the day — Australia/Sydney before dawn and late at night (not an American date)
  for(const [utc, expDay, label] of [['2026-11-27T20:00:00Z','2026/11/28','07:00 on Saturday 28 November'], ['2026-11-28T12:45:00Z','2026/11/28','23:45 on Saturday 28 November'], ['2026-11-28T13:15:00Z','2026/11/29','00:15 on Sunday 29 November']]){
    ctx = await browser.newContext({ viewport:{width:390,height:844}, timezoneId:'Australia/Sydney', serviceWorkers:'block' }); page = await ctx.newPage();
    const asked=[];
    await page.route('**orthocal.info/api/**', r=>{ asked.push(r.request().url()); r.fulfill({status:200, contentType:'application/json', body:JSON.stringify(MOCK)}); });
    await page.route('**allorigins.win/**', r=>r.abort()); await page.route('**bolls.life/**', mockBolls);
    await page.clock.install({ time: new Date(utc) });
    await page.goto(base,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.reading',{timeout:8000});
    const sy = await page.evaluate(()=>({ date:document.getElementById('date').textContent, alt:document.getElementById('altdate').textContent }));
    const expD = expDay.split('/'), dObj = new Date(+expD[0], +expD[1]-1, +expD[2]);
    const expTxt = dObj.toLocaleDateString('en-AU',{weekday:'long'})+' '+dObj.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
    check('Sydney time, '+label+': the app asks for and shows '+expTxt, asked.length>0 && asked[0].indexOf('/julian/'+expDay+'/')>-1 && sy.date===expTxt);
    await ctx.close();
  }

  await browser.close();
  await new Promise(r=>server.close(r));

  // ================= 13. OFFLINE APP, UPDATE FROM v34, AND THE REVIEW COPY (service workers, GitHub Pages layout) =================
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-test-'));
  const V34 = path.join(tmp, 'v34'), PREV = path.join(tmp, 'preview');
  let haveV34 = false;
  try { fs.mkdirSync(V34); execSync(`git -C "${DIR}" archive backup-v34 | tar -x -C "${V34}"`); haveV34 = fs.existsSync(path.join(V34,'sw.js')); } catch(e) {}
  execSync(`python3 "${path.join(DIR,'tools','make_preview.py')}" "${PREV}"`);
  let liveRoot = DIR;
  const SWPORT = 8098, swBase = `http://localhost:${SWPORT}/daily-readings/`;
  const swServer = await serve(SWPORT, [['/daily-readings/preview/', PREV], ['/daily-readings/', ()=>liveRoot]]);
  const browser2 = await chromium.launch({ executablePath: EXE });
  const swReady = p => p.waitForFunction(()=>navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout:15000}).then(()=>true).catch(()=>false);
  const cacheKeys = p => p.evaluate(()=>caches.keys());
  const PREVIEW_CACHE = APP_CACHE.replace('orthodox-readings-','dr-preview-');

  // 13a. This version alone: installs, keeps itself offline, repairs a damaged copy
  ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
  await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000});
  const ctl = await swReady(page);
  const keys1 = await cacheKeys(page);
  const pre = await page.evaluate(async n=>{ const c=await caches.open(n); return (await c.keys()).map(r=>new URL(r.url).pathname); }, APP_CACHE);
  check('service worker installs (cache named for version and build) and keeps the app, fonts, sayings, package list and source registry',
    ctl && keys1.includes(APP_CACHE) && new RegExp('^orthodox-readings-v'+VER+'-[0-9a-f]{10}$').test(APP_CACHE) && ['index.html','fathers.json','packages.json','data/sources.json','fonts/literata-latin-400-normal.woff2'].every(f=>pre.some(p=>p==='/daily-readings/'+f)));
  await page.click('#setBtn'); await page.waitForSelector('#pkg-nt-kjv .pkbtn:not(.hidden)',{timeout:8000});
  await page.click('#pkg-nt-kjv .pkbtn'); await page.click('#pkg-nt-rp .pkbtn');
  const swSaved = (await waitPkg(page,'nt-kjv',/^Saved on this device/,60000)) && (await waitPkg(page,'nt-rp',/^Saved on this device/,90000));
  const ntCounts = await page.evaluate(async()=>({ t:(await (await caches.open('orthodox-readings-texts-1')).keys()).length, g:(await (await caches.open('orthodox-readings-greek-1')).keys()).length }));
  check('with the service worker in charge: the New Testament in English and Greek saved in full (27 books, 260 chapters)', swSaved && ntCounts.t>=27 && ntCounts.g===260);
  await page.evaluate(async()=>{ const c=await caches.open('orthodox-readings-greek-1');
    await c.put(new URL('greek/43/3.json', location.href).href, new Response('{"1":"Ἦν δὲ ἄνθρωπος', {headers:{'Content-Type':'application/json'}})); });
  await page.evaluate(()=>window.__openReader(43,3,1)); await page.evaluate(()=>document.querySelector('#rdLangSeg button[data-lang="par"]').click());
  await page.waitForSelector('#rdBody[data-ch="43:3"][data-mode="par:rp"]',{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(600);
  const repaired = await page.evaluate(async()=>{ const hit=await (await caches.open('orthodox-readings-greek-1')).match(new URL('greek/43/3.json', location.href).href);
    let ok=false; try{ ok=!!JSON.parse(await hit.text())['16']; }catch(e){}
    return { gk:document.querySelectorAll('#rdBody .vs .gk').length, ok }; });
  check('a damaged chapter in the offline store is noticed, fetched again and repaired (John 3 reads in Greek)', repaired.gk===36 && repaired.ok);
  await ctx.unroute('**orthocal.info/api/**'); await ctx.route('**orthocal.info/**', r=>r.abort()); await ctx.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
  await page.waitForSelector('.reading',{timeout:8000}).catch(()=>{});
  await page.waitForSelector('#offlineBanner.show',{timeout:8000}).catch(()=>{});
  const offApp = await page.evaluate(()=>({ tabs:!!document.querySelector('.tabs'), reading:document.querySelectorAll('.reading').length, banner:document.getElementById('offlineBanner').classList.contains('show'),
    btxt:document.getElementById('offlineBanner').textContent, chip:!document.getElementById('netChip').classList.contains('hidden') }));
  await page.evaluate(()=>window.__openReader(40,5,1));
  await page.waitForSelector('#rdBody[data-ch="40:5"][data-mode="par:rp"]',{timeout:8000}).catch(()=>{});
  const offRd = await page.evaluate(()=>({ en:document.querySelectorAll('#rdBody .vs .v').length, gk:document.querySelectorAll('#rdBody .vs .gk').length }));
  check('with no connection: the app opens, today’s saved readings show with an “offline” notice, the New Testament reads in both languages',
    offApp.tabs && offApp.reading===3 && offApp.banner && /^You’re offline\. Showing the copy of /.test(offApp.btxt) && offApp.chip && offRd.en===48 && offRd.gk===48);
  await ctx.close();

  if(haveV34){
    // 13b. A phone with v34 installed receives this version on its next open, and keeps everything it saved.
    liveRoot = V34;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000});
    await swReady(page);
    await page.waitForFunction(()=>document.querySelectorAll('.reading .ver').length && [...document.querySelectorAll('.reading .ver')].every(b=>b.textContent==='NKJV'),{timeout:6000}).catch(()=>{});
    await page.click('#langSeg button[data-lang="par"]');
    await page.evaluate(()=>{ localStorage.setItem('user:bookmarks', JSON.stringify([{b:43,c:3,v:16,s:'For God',t:1}])); localStorage.setItem('user:fastlog', JSON.stringify({'2026-07-22':'k'})); localStorage.setItem('pref:theme','dark'); });
    await page.click('#setBtn'); await page.click('#ntOffBtn');
    await page.waitForFunction(()=>/^Saved —/.test(document.getElementById('ntOffLbl').textContent),{timeout:60000}).catch(()=>{});
    const before = await page.evaluate(()=>{ const o={}; for(const k of Object.keys(localStorage)) o[k]=localStorage.getItem(k); return o; });
    const k34 = await cacheKeys(page);
    liveRoot = DIR;                                                      // "deploy" this version
    await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
    let k35 = []; for(let i=0;i<40;i++){ k35 = await cacheKeys(page); if(k35.includes(APP_CACHE) && !k35.includes('orthodox-readings-v34')) break; await sleep(250); }
    await page.waitForTimeout(5500);                                     // housekeeping
    const after = await page.evaluate(()=>{ const o={}; for(const k of Object.keys(localStorage)) o[k]=localStorage.getItem(k); return o; });
    const ui = await page.evaluate(()=>({ v35:!!document.getElementById('tdSeason'), lang:(document.querySelector('#langSeg button.active')||{}).getAttribute?.('data-lang'),
      theme:document.documentElement.getAttribute('data-theme'), badges:[...document.querySelectorAll('.reading .ver')].map(b=>b.textContent).join(',') }));
    check('v34 phone: one open of the app shows v'+VER+' (page is network-first)', ui.v35===true);
    check('v34 phone: old app copy removed; Greek and text stores carried over; v'+VER+' in place', k34.includes('orthodox-readings-v34') && k34.includes('orthodox-readings-greek-1') &&
      k35.includes(APP_CACHE) && !k35.includes('orthodox-readings-v34') && k35.includes('orthodox-readings-greek-1') && k35.includes('orthodox-readings-texts-1'));
    const personalKeys = Object.keys(before).filter(k=>/^(pref|user|reader):/.test(k));
    check('v34 phone: every preference and personal record kept and honoured (Parallel, dark theme, bookmark, fasting note)',
      personalKeys.length>=5 && personalKeys.every(k=>after[k]===before[k]) && ui.lang==='par' && ui.theme==='dark' || console.log(personalKeys.filter(k=>after[k]!==before[k])));
    check('v34 phone: the NKJV gives way to the KJV, and the NKJV copies v34 kept are cleared', ui.badges==='KJV,KJV,KJV' && Object.keys(before).some(k=>/^nkjv:/.test(k)) && !Object.keys(after).some(k=>/^nkjv:/.test(k)));
    await page.click('#setBtn'); await page.waitForTimeout(1500);
    check('v34 phone: the New Testament saved by v34 is recognised as on this device — nothing to download again', /^On this device|^Saved on this device/.test(await pkgStat(page,'nt-kjv')) && /^On this device|^Saved on this device/.test(await pkgStat(page,'nt-rp')));
    await ctx.setOffline(true); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tabs',{timeout:8000}).catch(()=>{});
    await page.waitForSelector('.reading',{timeout:8000}).catch(()=>{});
    check('v34 phone after the update: v'+VER+' opens with no connection', await page.evaluate(()=>!!document.getElementById('tdSeason') && document.querySelectorAll('.reading').length===3));
    await ctx.close();

    // 13c. The review copy at /daily-readings/preview/ beside the live v34 app on the same phone
    liveRoot = V34;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000}); await swReady(page);
    await page.waitForTimeout(1500);
    const liveKeys = (await cacheKeys(page)).filter(k=>k.startsWith('orthodox-readings-')).sort().join(',');
    const nkjvLive = await page.evaluate(()=>Object.keys(localStorage).filter(k=>/^nkjv:/.test(k)).length);
    await page.goto(swBase+'preview/',{waitUntil:'networkidle'}); await page.waitForSelector('.tabs',{timeout:8000});
    const tag = await page.evaluate(()=>!!document.querySelector('.top .preview') && document.title==='Daily Readings (Preview)');
    await sleep(6000);                                                   // the repair runs 2.5 s after load; housekeeping at 5 s
    const iso = await page.evaluate(async()=>{
      const live=await caches.open('orthodox-readings-v34'); const hit=await live.match(new URL('../index.html', location.href).href);
      const regs=(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname).sort();
      return { liveIsLive: hit ? !(await hit.text()).includes('class="preview"') : false, keys: await caches.keys(), regs,
        nkjv: Object.keys(localStorage).filter(k=>/^nkjv:/.test(k)).length, ver: (document.getElementById('verLbl')||{}).textContent };
    });
    check('review copy shows a Preview tag and has its own service worker and caches', tag && iso.regs.join(',')==='/daily-readings/,/daily-readings/preview/' && iso.keys.includes(PREVIEW_CACHE));
    check('review copy leaves the live app’s caches in place and restores its offline page', iso.liveIsLive && iso.keys.filter(k=>k.startsWith('orthodox-readings-')).sort().join(',')===liveKeys && liveKeys.includes('orthodox-readings-v34'));
    check('review copy does not clear the live app’s NKJV copies (the two share this website’s storage)', nkjvLive>0 && iso.nkjv===nkjvLive);
    await ctx.setOffline(true);
    await page.goto(swBase,{waitUntil:'domcontentloaded'}).catch(()=>{}); await page.waitForTimeout(800);
    const liveOff = await page.evaluate(()=>!!document.querySelector('.tabs') && !document.getElementById('tdSeason') && !document.querySelector('.top .preview'));
    await page.goto(swBase+'preview/',{waitUntil:'domcontentloaded'}).catch(()=>{}); await page.waitForTimeout(800);
    const prevOff = await page.evaluate(()=>!!document.querySelector('.top .preview') && !!document.getElementById('tdSeason'));
    check('offline afterwards: the live address still opens live v34; the preview address opens the v'+VER+' preview', liveOff && prevOff);
    await ctx.close();

    // 13d. Once this version is live, its service worker leaves /preview/ alone
    liveRoot = DIR;
    ctx = await browser2.newContext({ viewport:{width:390,height:844} }); page = await ctx.newPage(); await mockApi(ctx, MOCK);
    await page.goto(swBase,{waitUntil:'networkidle'}); await page.waitForSelector('.reading',{timeout:8000}); await swReady(page);
    await page.goto(swBase+'preview/',{waitUntil:'networkidle'}); await sleep(600);
    const liveCopy = await page.evaluate(async n=>{ const hit=await (await caches.open(n)).match(new URL('../index.html', location.href).href); return hit ? !(await hit.text()).includes('class="preview"') : false; }, APP_CACHE);
    check('live v'+VER+' never stores the review copy as its own page', liveCopy===true);
    await ctx.close();
  } else {
    check('v34 backup branch available for the update tests (git branch backup-v34)', false);
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
