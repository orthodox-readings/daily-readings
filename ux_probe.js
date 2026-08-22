const { chromium } = require('playwright');
const fs=require('fs'), http=require('http'), path=require('path');
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const MOCK={ pascha_distance:104, summary_title:"Ss. Cyrus and John", titles:["Ss. Sergius and Herman (1353)"],
  fast_level_desc:"Apostles Fast", fast_exception_desc:"Wine and Oil are Allowed", feasts:[],saints:[],service_notes:[],stories:[],
  readings:[{source:"Epistle",display:"Romans 9:1-5",passage:[{verse:1,content:"Verse one text."}]},
            {source:"Gospel",display:"Matthew 9:18-26",passage:[{verse:18,content:"Verse text."}]}]};
(async()=>{
  const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(__dirname,p),(e,b)=>{if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'text/plain'});res.end(b);});});
  await new Promise(r=>server.listen(8166,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page=await (await browser.newContext({viewport:{width:390,height:844},hasTouch:true})).newPage();
  await page.route('**orthocal.info/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}));
  await page.route('**bolls.life/**', r=>r.fulfill({status:404,body:''}));
  await page.goto('http://localhost:8166/index.html',{waitUntil:'networkidle'});
  await page.waitForSelector('.reading');

  await page.click('#calBtn');
  const calOpen1 = await page.$eval('#calOverlay', e=>!e.classList.contains('hidden'));
  await page.goBack().catch(()=>{});
  await page.waitForTimeout(300);
  const nav = page.url();
  console.log('1) calendar open:', calOpen1, '| after Back, url:', nav, '(left the app =', !/8166/.test(nav), ')');

  await page.goto('http://localhost:8166/index.html',{waitUntil:'networkidle'});
  await page.waitForSelector('.reading');
  await page.evaluate(()=>window.scrollTo(0, 1200));
  await page.click('#next'); await page.waitForTimeout(700);
  console.log('2) scrollY after next-day (was 1200):', await page.evaluate(()=>window.scrollY));

  const src = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  console.log('3) swipe handlers:', /touchstart|pointerdown/.test(src), '| beforeinstallprompt:', /beforeinstallprompt/.test(src), '| history/popstate:', /popstate|pushState/.test(src));

  await page.click('#gearBtn');
  console.log('4) settings text:', await page.$eval('#sheet', e=>e.innerText.replace(/\n+/g,' | ')));
  console.log('5) prev btn size:', await page.$eval('#prev', e=>{const r=e.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);}));
  await browser.close(); server.close();
})().catch(e=>{console.error(e);process.exit(1)});
