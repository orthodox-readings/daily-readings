const { chromium } = require('playwright');
const fs=require('fs'), http=require('http'), path=require('path');
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const MOCK={readings:[{source:'Epistle',display:'Romans 1:1',passage:[{verse:1,content:'x'}]}],titles:[],feasts:[],saints:[],stories:[],fast_level_desc:'',fast_exception_desc:''};
(async()=>{
  const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(__dirname,p),(e,b)=>{if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'text/plain'});res.end(b);});});
  await new Promise(r=>server.listen(8211,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page=await (await browser.newContext()).newPage();
  await page.route('**orthocal.info/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}));
  await page.route('**bolls.life/**', r=>r.fulfill({status:404,body:''}));
  await page.goto('http://localhost:8211/index.html',{waitUntil:'networkidle'});
  await page.waitForSelector('.reading');
  const rows = await page.evaluate(()=>{
    const out=[];
    const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for(let d=new Date(2026,9,23); d<=new Date(2026,11,31); d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)){
      const fr=window.__fastRule(d);
      const lit=window.__litKey(d, null, '');
      const os=new Date(d.getFullYear(),d.getMonth(),d.getDate()-13);
      out.push([d.toISOString().slice(0,10), DOW[d.getDay()],
        (os.getDate())+'/'+(os.getMonth()+1)+' OS',
        'f'+fr.f, fr.fish?'fish':'', fr.wineOil?'w&o':'', fr.feast||'', lit].join('\t'));
    }
    return out;
  });
  fs.writeFileSync('audit-days.tsv', rows.join('\n'));
  // summary stats
  const days=rows.map(r=>r.split('\t'));
  const fastDays=days.filter(d=>d[3]!=='f0');
  const preFast=days.filter(d=>d[0]<'2026-11-28');
  const inFast=days.filter(d=>d[0]>='2026-11-28');
  console.log('total days:', days.length);
  console.log('pre-fast period fast days (should be Wed/Fri only):');
  preFast.filter(d=>d[3]!=='f0').forEach(d=>console.log(' ', d[0], d[1], d[3], d[4]||'-', d[6]||''));
  console.log('pre-fast non-fast weekdays wrongly marked:', preFast.filter(d=>d[3]!=='f0' && d[1]!=='Wed' && d[1]!=='Fri').length);
  console.log('Nativity-fast days NOT marked as fast:', inFast.filter(d=>d[3]==='f0').map(d=>d[0]+' '+d[1]).join(', ')||'none');
  console.log('in-fast fish days by weekday:');
  const byDow={};
  inFast.forEach(d=>{ byDow[d[1]]=byDow[d[1]]||{fish:0,no:0}; d[4]==='fish'?byDow[d[1]].fish++:byDow[d[1]].no++; });
  console.log(JSON.stringify(byDow));
  console.log('feast days in range:'); days.filter(d=>d[6]).forEach(d=>console.log(' ', d[0], d[1], d[6], d[3], d[4]||'-', 'lit='+d[7]));
  console.log('non-burgundy colours in range:'); days.filter(d=>d[7]!=='burgundy').forEach(d=>console.log(' ', d[0], d[1], d[7], d[6]||''));
  await browser.close(); server.close();
})().catch(e=>{console.error(e);process.exit(1)});
