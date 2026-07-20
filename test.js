const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = __dirname;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png' };

const MOCK = {
  pascha_distance: 42,
  summary_title: "Ss. Cyrus and John; Ss. Sergius and Herman of Valaam",
  titles: [
    "Translation of the relics of Ss. Cyrus and John the Unmercenaries (412)",
    "Ss. Sergius and Herman, abbots of Valaam (1353)",
    "Icon of the Most Holy Theotokos 'Of the Three Hands'",
    "Ven. Sennuphius the Standard-Bearer of Egypt (4th c.)"
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
const MOCK_STRICT = JSON.parse(JSON.stringify(MOCK));
MOCK_STRICT.fast_level_desc = "Fast"; MOCK_STRICT.fast_exception_desc = "";
const MOCK_NOFAST = JSON.parse(JSON.stringify(MOCK));
MOCK_NOFAST.fast_level_desc = "No Fast"; MOCK_NOFAST.fast_exception_desc = "";

function serve(){
  return http.createServer((req,res)=>{
    let p = decodeURIComponent(req.url.split('?')[0]);
    if(p==='/'||p==='') p='/index.html';
    const f = path.join(DIR,p);
    fs.readFile(f,(e,buf)=>{
      if(e){ res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});
      res.end(buf);
    });
  });
}
function mockBolls(route){
  const m = route.request().url().match(/NKJV\/(\d+)\/(\d+)\//);
  if(!m){ route.abort(); return; }
  const book = +m[1], ch = +m[2];
  const verses = [];
  for(let n=1;n<=60;n++) verses.push({ pk:n, verse:n, text: `NKJV B${book} C${ch} v${n}${n===1?' <i>em</i>':''} text.` });
  route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(verses) });
}

const results = [];
function check(name, cond){ results.push((cond?'PASS':'FAIL')+' — '+name); }

(async()=>{
  const server = serve(); await new Promise(r=>server.listen(8099,r));
  const base = 'http://localhost:8099/index.html';
  const browser = await chromium.launch();

  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const jd = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - 13);
  const ymd = '' + jd.getFullYear() + String(jd.getMonth()+1).padStart(2,'0') + String(jd.getDate()).padStart(2,'0');
  const expectedOCUrl = 'https://orthochristian.com/calendar/' + ymd + '.html';
  const expHTM = 'https://www.holytrinityorthodox.com/calendar/calendar.php?month='+(t0.getMonth()+1)+
    '&today='+t0.getDate()+'&year='+t0.getFullYear()+'&dt=1&header=1&lives=1&trp=1&scripture=1';
  const expAzbyka = 'https://azbyka.ru/worships/?date='+t0.getFullYear()+'-'+
    String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0');

  // ================= 1. MAIN CONTEXT =================
  let ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  let page = await ctx.newPage();
  await page.addInitScript(()=>{ navigator.share = (o)=>{ window.__shared=o; return Promise.resolve(); }; });
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }));
  await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  // NKJV totals: Rom 9:1-5 (5) + Matt 9:18-26 (9) + Luke 24:36-53 (18) = 32
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});

  // --- design assertions ---
  const bodyBg = await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  const brandGold = await page.$eval('.brand b', e=>e.textContent);
  const headpiece = await page.$('.headpiece span');
  const todayHidden = await page.$eval('#today', e=>e.classList.contains('hidden'));
  const sheetHidden = await page.$eval('#sheet', e=>e.classList.contains('hidden'));
  check('parchment ground restored (rgb(244,237,223))', bodyBg==='rgb(244, 237, 223)');
  check('two-tone gold wordmark', brandGold==='Readings');
  const dateCard = await page.evaluate(()=>{
    const c=document.querySelector('.datecard');
    return { exists: !!c, hasDate: !!c.querySelector('#date'), hasSummary: !!c.querySelector('#summary'),
      centred: getComputedStyle(c).textAlign==='center',
      crowned: getComputedStyle(c).borderTopWidth==='4px' };
  });
  check('date card: centred, crowned with liturgical colour', dateCard.exists && dateCard.hasDate && dateCard.hasSummary && dateCard.centred && dateCard.crowned);

  // --- liturgical colour engine (fixed-date unit checks) ---
  const lit = await page.evaluate((mock)=>({
    natTheot: window.__litKey(new Date(2026,8,21), mock, ''),           // Nativity of the Theotokos
    exalt:    window.__litKey(new Date(2026,8,27), mock, ''),           // Exaltation of the Cross
    transfig: window.__litKey(new Date(2026,7,19), mock, ''),           // Transfiguration
    pascha:   window.__litKey(new Date(2026,3,12), mock, ''),           // Pascha 2026
    pentecost:window.__litKey(new Date(2026,4,31), mock, ''),           // Pentecost 2026 (P+49)
    martyr:   window.__litKey(new Date(2026,9,20), {summary_title:'Great-martyr Artemius'}, 'Fast'),
    prophet:  window.__litKey(new Date(2026,6,16), {summary_title:'Holy Prophet Elias'}, ''),
    theotIcon:window.__litKey(new Date(2026,9,22), {summary_title:'Icon of the Most Holy Theotokos of Kazan'}, ''),
    lentWk:   window.__litKey(new Date(2027,2,10), {summary_title:'Ven. Somebody'}, 'Lenten Fast'),
    plain:    window.__litKey(new Date(2026,6,16), {summary_title:'Ss. Cyrus and John'}, 'Fast')
  }), MOCK);
  check('lit: Theotokos feast -> blue', lit.natTheot==='blue');
  check('lit: Cross -> violet (Russian practice)', lit.exalt==='violet');
  check('lit: Transfiguration -> white', lit.transfig==='white');
  check('lit: Pascha -> red', lit.pascha==='red');
  check('lit: Pentecost -> green', lit.pentecost==='green');
  check('lit: martyr headline -> red', lit.martyr==='red');
  check('lit: prophet headline -> green', lit.prophet==='green');
  check('lit: Theotokos icon headline -> blue', lit.theotIcon==='blue');
  check('lit: ordinary day -> burgundy default', lit.plain==='burgundy');
  check('lit: Lent weekday stays violet even for a venerable', lit.lentWk==='violet');
  const litExtra = await page.evaluate(()=>({
    beheading: window.__litKey(new Date(2026,8,11), {summary_title:'Beheading of St John the Baptist'}, 'Fast')
  }));
  check('lit: Beheading -> red', litExtra.beheading==='red');
  const domLit = await page.evaluate((mock)=>({
    applied: document.documentElement.getAttribute('data-lit'),
    expected: window.__litKey(new Date(), mock, mock.fast_level_desc)
  }), MOCK);
  check('lit: applied to page and consistent', !!domLit.applied && domLit.applied===domLit.expected);
  check('gold headpiece ornament present', !!headpiece);
  check('"Go to today" hidden when on today', todayHidden===true);
  check('settings sheet closed by default', sheetHidden===true);

  // --- sheet open/close ---
  await page.click('#gearBtn');
  const sheetOpen = await page.$eval('#sheet', e=>!e.classList.contains('hidden'));
  await page.click('#gearBtn');
  const sheetClosed = await page.$eval('#sheet', e=>e.classList.contains('hidden'));
  check('gear opens and closes the settings sheet', sheetOpen===true && sheetClosed===true);

  // --- content ---
  const summary = await page.textContent('#summary');
  const fastExc = await page.textContent('#fastExc');
  const nVerses = await page.$$eval('.reading .body .v', n=>n.length);
  const badges = await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent));
  const segActive = await page.$eval('#txtSeg button.active', e=>e.getAttribute('data-txt'));
  const noteShown = await page.$eval('#nkjvNote', e=>!e.classList.contains('hidden'));
  check('summary rendered', /Cyrus|Sergius/.test(summary));
  check('fast exception shown when provided', /Wine and Oil/.test(fastExc));
  check('NKJV swapped in (32 verses across 3 readings)', nVerses===32);
  check('all readings badged NKJV', badges.join(',')==='NKJV,NKJV,NKJV');
  check('NKJV default + copyright note', segActive==='nkjv' && noteShown===true);

  // --- lectionary labels + attributions (Fr Dionysios review items) ---
  const srcLabels = await page.$$eval('.reading .src', n=>n.map(x=>x.textContent));
  const livesAttr = await page.$eval('#livesCard .tattr', e=>e.textContent);
  const footerText = await page.$eval('.footer', e=>e.textContent);
  const troparAttr = await page.$eval('#troparCard .tattr', e=>e.textContent);
  check('reading labels: plain Epistle', srcLabels[0]==='Epistle');
  check('reading labels: feast qualifier shown', srcLabels[1]==='Gospel — Apostles');
  check('reading labels: Matins Gospel shown', srcLabels[2]==='6th Matins Gospel');
  check('Lives attribution: Abbamoses/John Brady', /Abbamoses/.test(livesAttr) && /John Brady/.test(livesAttr));
  check('footer: corrected sources (Slavic tradition + Abbamoses)', /Slavic Old-Calendar tradition/.test(footerText) && /Abbamoses/.test(footerText) && !/Jordanville\./.test(footerText.split('Lives')[0]));
  check('Troparia attribution: holytrinityorthodox named', /holytrinityorthodox\.com/.test(troparAttr));

  // --- commemorations: collapsed by default, expand on tap ---
  const commClosed = await page.$eval('#commemList', e=>getComputedStyle(e).display==='none');
  await page.click('#commemHead');
  const commOpenList = await page.$eval('#commemList', e=>getComputedStyle(e).display!=='none');
  const commems = await page.$$eval('#commemList li', n=>n.length);
  const commemHref = await page.getAttribute('#commemLink','href');
  await page.click('#commemHead'); // close again for the screenshot
  check('commemorations collapsed by default', commClosed===true);
  check('commemorations expand on tap (>=4 saints)', commOpenList===true && commems>=4);
  check('full-list link -> exact OrthoChristian day page', commemHref===expectedOCUrl);

  // --- readings: collapsed by default; open first; illuminated initial ---
  const readingsClosed = await page.$$eval('.reading .body', ns=>ns.every(n=>getComputedStyle(n).display==='none'));
  await page.click('.reading .head');
  const firstOpen = await page.$eval('.reading .body', n=>getComputedStyle(n).display!=='none');
  const initSize = await page.evaluate(()=>getComputedStyle(document.querySelector('.reading.open .body .v'),'::first-letter').fontSize);
  check('readings collapsed by default', readingsClosed===true);
  check('tap opens reading', firstOpen===true);
  check('gold illuminated initial (44px first letter)', initSize==='44px');

  // --- lives ---
  const livesShown = await page.$eval('#livesCard', e=>!e.classList.contains('hidden'));
  const lifeTitle = await page.textContent('#livesList details summary');
  await page.click('#livesList details summary');
  const lifeParas = await page.$$eval('#livesList details .ltext p', n=>n.length);
  await page.click('#livesList details summary');
  check('Lives card with expandable story', livesShown===true && /Sergius/.test(lifeTitle) && lifeParas===2);

  // --- troparia + theophan links ---
  const troparHref = await page.getAttribute('#troparLink','href');
  const theoHref = await page.getAttribute('#theophanLink','href');
  check('Troparia link -> Jordanville day URL', troparHref===expHTM);
  check('St Theophan link -> OrthoChristian day page', theoHref===expectedOCUrl);

  // --- azbyka full service texts (Fr Dionysios suggestion) ---
  const azShown = await page.$eval('#azbykaCard', e=>!e.classList.contains('hidden'));
  const azHref = await page.getAttribute('#azbykaLink','href');
  check('Azbyka service-texts card shown on Old Calendar', azShown===true);
  check('Azbyka link -> civil-date worships URL', azHref===expAzbyka);

  // --- paschalion + tracker ---
  const paschas = await page.evaluate(()=>[2026,2027,2028,2029,2030].map(y=>window.__paschaCivil(y).toDateString()));
  check('Paschalion 2026 = Sun Apr 12', paschas[0]==='Sun Apr 12 2026');
  check('Paschalion 2027 = Sun May 02', paschas[1]==='Sun May 02 2027');
  check('Paschalion 2028 = Sun Apr 16', paschas[2]==='Sun Apr 16 2028');
  check('Paschalion 2029 = Sun Apr 08', paschas[3]==='Sun Apr 08 2029');
  check('Paschalion 2030 = Sun Apr 28', paschas[4]==='Sun Apr 28 2030');
  const chips = await page.$$eval('#tracker .chip', n=>n.map(x=>x.textContent));
  const p26=new Date(2026,3,12), p27=new Date(2027,4,2);
  const nextP = (p26>t0)? p26 : p27;
  const expPd = Math.round((nextP-t0)/86400000);
  check('tracker: fast day count', chips.some(c=>/day \d+/.test(c)));
  check('tracker: Pascha countdown ('+expPd+'d)', chips.some(c=>c==='Pascha in '+expPd+' days'));

  // --- Fathers quote ---
  const fjson = JSON.parse(fs.readFileSync(path.join(DIR,'fathers.json'),'utf8'));
  const doy = Math.round((t0 - new Date(t0.getFullYear(),0,1))/86400000);
  const expQ = fjson.quotes[doy % fjson.quotes.length];
  const quoteText = await page.textContent('#quoteText');
  check('Fathers quote of the day', quoteText.indexOf(expQ.q.slice(0,40))>-1);

  // --- share ---
  await page.click('#shareBtn');
  const shared = await page.evaluate(()=>window.__shared);
  check('share includes day summary + readings', !!shared && /Cyrus/.test(shared.text) && /Romans 9:1-5/.test(shared.text));

  // --- support ---
  const supHref = await page.getAttribute('#supportLink','href');
  const supVis = await page.$eval('#supportLink', e=>!e.classList.contains('hidden'));
  check('support button -> Holy Dormition', supVis && supHref==='https://wollongong.cerkov.ru/');

  // --- text size via sheet + persistence ---
  await page.click('#gearBtn');
  await page.click('#sizeSeg button[data-sz="+"]');
  const zoom1 = await page.evaluate(()=>document.body.style.zoom);
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  const zoom2 = await page.evaluate(()=>document.body.style.zoom);
  await page.click('#gearBtn'); await page.click('#sizeSeg button[data-sz="-"]'); await page.click('#gearBtn');
  check('A+ bumps zoom to 1.1', String(zoom1)==='1.1');
  check('text size persists across restart', String(zoom2)==='1.1');

  // --- screenshot (epistle open, rest collapsed) ---
  await page.click('.reading .head');
  await page.waitForFunction(()=>document.querySelectorAll('.reading.open').length===1,{timeout:3000}).catch(()=>{});
  await page.screenshot({ path: path.join(DIR,'shot-light.png'), fullPage:true });

  // --- KJV toggle via sheet ---
  await page.click('#gearBtn');
  await page.click('#txtSeg button[data-txt="kjv"]');
  await page.click('#gearBtn'); // close the sheet again
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===7,{timeout:5000}).catch(()=>{});
  const kjvVerses = await page.$$eval('.reading .body .v', n=>n.length);
  const kjvBadges = await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent));
  const noteHidden = await page.$eval('#nkjvNote', e=>e.classList.contains('hidden'));
  check('KJV toggle restores bundled text', kjvVerses===7 && kjvBadges.join(',')==='KJV,KJV,KJV' && noteHidden===true);

  // --- fasting-rule engine (sentinel days across the liturgical year) ---
  const fr = await page.evaluate(()=>({
    bright:   window.__fastRule(new Date(2026,3,13)),   // Bright Monday
    ordWed:   window.__fastRule(new Date(2026,6,22)),   // ordinary Wednesday
    ordThu:   window.__fastRule(new Date(2026,6,23)),   // ordinary Thursday
    transfig: window.__fastRule(new Date(2026,7,19)),   // Transfiguration (Dormition fast, fish)
    dorm:     window.__fastRule(new Date(2026,7,20)),   // Dormition weekday
    exalt:    window.__fastRule(new Date(2026,8,27)),   // Exaltation (strict)
    trinityFri: window.__fastRule(new Date(2026,5,5)),  // Friday of Trinity week (fast-free)
    apSat:    window.__fastRule(new Date(2026,5,13)),   // Apostles' fast Saturday (fish)
    natStrict: window.__fastRule(new Date(2027,0,4)),   // final days of Nativity fast
    svyatki:  window.__fastRule(new Date(2027,0,8))     // Svyatki Friday (fast-free)
  }));
  check('fastRule: Bright Monday fast-free', fr.bright.f===0);
  check('fastRule: ordinary Wednesday fasts', fr.ordWed.f===1);
  check('fastRule: ordinary Thursday free', fr.ordThu.f===0);
  check('fastRule: Transfiguration strict + fish + feast', fr.transfig.f===2 && fr.transfig.fish===true && /Transfiguration/.test(fr.transfig.feast));
  check('fastRule: Dormition weekday strict, no fish', fr.dorm.f===2 && fr.dorm.fish===false);
  check('fastRule: Exaltation strict one-day fast', fr.exalt.f===2);
  check('fastRule: Trinity-week Friday fast-free', fr.trinityFri.f===0);
  check('fastRule: Apostles-fast Saturday fish', fr.apSat.f===1 && fr.apSat.fish===true);
  check('fastRule: Nativity fast final days strict', fr.natStrict.f===2);
  check('fastRule: Svyatki Friday fast-free', fr.svyatki.f===0);
  const frWo = await page.evaluate(()=>({
    lentSat: window.__fastRule(new Date(2027,2,20)),   // Saturday in Great Lent 2027 -> wine & oil
    lentWed: window.__fastRule(new Date(2027,2,17))    // Wednesday in Great Lent -> strict, no marks
  }));
  check('fastRule: Lent Saturday wine & oil', frWo.lentSat.f===2 && frWo.lentSat.wineOil===true);
  check('fastRule: Lent Wednesday strict, no marks', frWo.lentWed.f===2 && !frWo.lentWed.wineOil && !frWo.lentWed.fish);
  const frAp = await page.evaluate(()=>({
    apThu: window.__fastRule(new Date(2026,5,11)),     // Apostles' fast Thursday -> fish (Slavic rule)
    apMon: window.__fastRule(new Date(2026,5,8)),      // Apostles' fast Monday -> wine & oil
    lazarus: window.__fastRule(new Date(2027,3,24))    // Lazarus Saturday 2027 (P-8) -> wine & oil
  }));
  check('fastRule: Apostles Thursday fish (Slavic rule)', frAp.apThu.f===1 && frAp.apThu.fish===true);
  check('fastRule: Apostles Monday wine & oil', frAp.apMon.f===1 && frAp.apMon.wineOil===true);
  check('fastRule: Lazarus Saturday wine & oil', frAp.lazarus.f===2 && frAp.lazarus.wineOil===true);

  // dedicated appbar calendar button
  await page.click('#calBtn');
  const calViaBtn = await page.$eval('#calOverlay', e=>!e.classList.contains('hidden'));
  await page.click('#calClose');
  check('appbar calendar button opens the month view', calViaBtn===true);

  // --- month calendar overlay ---
  await page.click('#date');
  const calVisible = await page.$eval('#calOverlay', e=>!e.classList.contains('hidden'));
  const cellCount = await page.$$eval('.cd', n=>n.length);
  const wdCount = await page.$$eval('.cwd', n=>n.length);
  const todayMarked = await page.$$eval('.cd.tod', n=>n.length);
  check('calendar opens on date tap', calVisible===true);
  check('calendar grid: 42 day cells + 7 weekday headers', cellCount===42 && wdCount===7);
  check('today ringed in grid', todayMarked===1);
  // navigate to August 2026 and inspect Transfiguration cell
  for(let i=0;i<24;i++){
    const t = await page.textContent('#calTitle');
    if(/August 2026/.test(t)) break;
    await page.click('#calNext');
  }
  const aug19 = await page.evaluate(()=>{
    const c=[...document.querySelectorAll('.cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='19');
    return { cls:c.className, mk:c.querySelector('.mk').textContent, title:c.title };
  });
  check('Aug 19 cell: strict shade + fish + feast cross', /f2/.test(aug19.cls) && /🐟/.test(aug19.mk) && /✚/.test(aug19.mk) && /Transfiguration/.test(aug19.title));
  await page.screenshot({ path: path.join(DIR,'shot-calendar.png') });
  // tap the day -> jumps and closes
  await page.evaluate(()=>{
    [...document.querySelectorAll('.cd:not(.om)')].find(x=>x.querySelector('.n').textContent==='19').click();
  });
  await page.waitForFunction(()=>/19 August 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  const calClosed = await page.$eval('#calOverlay', e=>e.classList.contains('hidden'));
  check('tapping a day jumps to it and closes the calendar', calClosed===true);
  await page.click('#today');
  await page.waitForSelector('.reading',{timeout:5000});

  // --- jump to a day (19 Aug 2026 = Transfiguration = Julian 6 Aug) ---
  await page.evaluate(()=>{
    const dp=document.getElementById('datePick');
    dp.value='2026-08-19';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(()=>/19 August 2026/.test(document.getElementById('date').textContent),{timeout:5000});
  const jumpChips = await page.$$eval('#tracker .chip', n=>n.map(x=>x.textContent).join(' | '));
  const jumpCommemHref = await page.getAttribute('#commemLink','href');
  const todayVisible = await page.$eval('#today', e=>!e.classList.contains('hidden'));
  const jumpLit = await page.evaluate(()=>document.documentElement.getAttribute('data-lit'));
  const jumpMeta = await page.evaluate(()=>document.querySelector('meta[name="theme-color"]').getAttribute('content'));
  check('date jump: Transfiguration today', /Transfiguration.*— today/.test(jumpChips));
  check('date jump: links follow (Julian 6 Aug)', /20260806\.html$/.test(jumpCommemHref||''));
  check('date jump: page turns WHITE for Transfiguration', jumpLit==='white');
  check('date jump: Android bar colour follows (#9a8a5c)', jumpMeta==='#9a8a5c');
  check('"Go to today" appears when off today', todayVisible===true);
  await page.click('#today');
  await page.waitForSelector('.reading',{timeout:5000});
  const todayHiddenAgain = await page.$eval('#today', e=>e.classList.contains('hidden'));
  check('"Go to today" returns + hides', todayHiddenAgain===true);
  await ctx.close();

  // ================= 1b. NEW CALENDAR MODE — the engine must follow the reckoning =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.addInitScript(()=>{ localStorage.setItem('pref:cal','gregorian'); });
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }));
  await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  const ns = await page.evaluate(()=>({
    dormNS:    window.__fastRule(new Date(2026,7,5)),    // 5 Aug civil = Dormition fast on NEW calendar
    aug19NS:   window.__fastRule(new Date(2026,7,19)),   // 19 Aug civil = ordinary Wednesday on NEW calendar
    natNS:     window.__fastRule(new Date(2026,11,25)),  // 25 Dec civil = Nativity of Christ on NEW calendar
    dec25Lit:  window.__litKey(new Date(2026,11,25), null, ''),
    aug15Lit:  window.__litKey(new Date(2026,7,15), null, ''),  // Dormition NS -> blue
    janSeven:  window.__fastRule(new Date(2027,0,7))     // 7 Jan civil = ordinary day on NEW calendar (Thursday)
  }));
  const nsCommemHref = await page.getAttribute('#commemLink','href');
  const nsYmd = '' + t0.getFullYear() + String(t0.getMonth()+1).padStart(2,'0') + String(t0.getDate()).padStart(2,'0');
  check('NS: Dormition fast shades 1–14 August', ns.dormNS.f===2);
  check('NS: 19 August is an ordinary Wednesday', ns.aug19NS.f===1 && !ns.aug19NS.feast);
  check('NS: Nativity feast on 25 December', /Nativity of Christ/.test(ns.natNS.feast||''));
  check('NS: 25 December wears white', ns.dec25Lit==='white');
  check('NS: 15 August wears Theotokos blue', ns.aug15Lit==='blue');
  check('NS: 7 January is no longer Nativity', !ns.janSeven.feast && ns.janSeven.f===0);
  check('NS: OrthoChristian link keys to the nominal date', nsCommemHref==='https://orthochristian.com/calendar/'+nsYmd+'.html');
  const nsAzHidden = await page.$eval('#azbykaCard', e=>e.classList.contains('hidden'));
  check('NS: Azbyka card hidden (no correct dual-cycle mapping)', nsAzHidden===true);
  await page.click('#calBtn');
  const nsCells = await page.$$eval('.cd', n=>n.length);
  check('NS: month grid renders under new reckoning', nsCells===42);
  await ctx.close();

  // ================= 2. STRICT FAST =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK_STRICT) }));
  await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  const strictExc = await page.textContent('#fastExc');
  const strictDot = await page.$eval('#fastDot', e=>getComputedStyle(e).backgroundColor);
  check('plain Fast day explains the strict norm', /Strict fast — traditionally no meat, dairy, fish, wine or oil/.test(strictExc));
  check('strict fast dot red', strictDot==='rgb(138, 43, 43)');
  await ctx.close();

  // ================= 3. NO FAST =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK_NOFAST) }));
  await page.route('**bolls.life/**', mockBolls);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  const nfExc = await page.textContent('#fastExc');
  check('No-Fast day: no strict note', nfExc.trim()==='');
  await ctx.close();

  // ================= 4. NKJV SOURCE DOWN =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.route('**orthocal.info/api/**', r=> r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MOCK) }));
  await page.route('**bolls.life/**', r=> r.abort());
  await page.route('**allorigins.win/**', r=> r.abort());
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForSelector('.reading',{timeout:5000});
  await page.waitForTimeout(600);
  const fbVerses = await page.$$eval('.reading .body .v', n=>n.length);
  const fbBadges = await page.$$eval('.reading .ver', n=>n.map(x=>x.textContent));
  check('NKJV down: KJV stays, badges honest', fbVerses===7 && fbBadges.join(',')==='KJV,KJV,KJV');
  await ctx.close();

  // ================= 5. ERROR PATH =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  await page.route('**orthocal.info/**', r=> r.abort());
  await page.route('**allorigins.win/**', r=> r.abort());
  await page.route('**bolls.life/**', r=> r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#errorBanner.show',{timeout:6000}).catch(()=>{});
  const errShown = await page.$eval('#errorBanner', e=>e.classList.contains('show')).catch(()=>false);
  check('error banner when nothing reachable', errShown===true);
  await ctx.close();

  // ================= 6. OFFLINE CACHE =================
  ctx = await browser.newContext({ viewport:{width:390,height:844} });
  page = await ctx.newPage();
  let allow = true;
  await page.route('**orthocal.info/api/**', r=> allow ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}) : r.abort());
  await page.route('**bolls.life/**', r=> allow ? mockBolls(r) : r.abort());
  await page.route('**allorigins.win/**', r=> r.abort());
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===32,{timeout:5000}).catch(()=>{});
  allow = false;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.reading',{timeout:5000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('.reading .body .v').length===14,{timeout:5000}).catch(()=>{});
  const offBanner = await page.$eval('#offlineBanner', e=>e.classList.contains('show')).catch(()=>false);
  const offVerses = await page.$$eval('.reading .body .v', n=>n.length);
  check('offline: cached day + NKJV chapters survive', offBanner===true && offVerses===32);
  await ctx.close();

  await browser.close();
  await new Promise(r=>server.close(r));

  console.log('\n================ TEST RESULTS ================');
  results.forEach(r=>console.log(r));
  const fails = results.filter(r=>r.startsWith('FAIL')).length;
  console.log('=============================================');
  console.log(fails===0 ? 'ALL PASSED ('+results.length+')' : (fails+' FAILED of '+results.length));
  process.exit(fails===0?0:1);
})().catch(e=>{ console.error('HARNESS ERROR', e); process.exit(2); });
