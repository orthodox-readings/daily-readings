const { chromium } = require('playwright');
const fs=require('fs'), http=require('http'), path=require('path');
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const MOCK={ pascha_distance:104, summary_title:"Ss. Cyrus and John", titles:[],
  fast_level_desc:"Apostles Fast", fast_exception_desc:"Wine and Oil are Allowed", feasts:[],saints:[],service_notes:[],stories:[],
  readings:[{source:"Epistle",display:"Romans 9:1-5",passage:[{verse:1,content:"x"}]}]};
(async()=>{
  const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(__dirname,p),(e,b)=>{if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'text/plain'});res.end(b);});});
  await new Promise(r=>server.listen(8189,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page=await (await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
  await page.route('**orthocal.info/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}));
  await page.route('**bolls.life/**', r=>r.fulfill({status:404,body:''}));
  await page.goto('http://localhost:8189/index.html',{waitUntil:'networkidle'});
  await page.waitForSelector('.reading');
  await page.click('#supportLink');
  await page.waitForTimeout(250);
  await page.screenshot({path:'v24-support.png'});
  await browser.close(); server.close(); console.log('done');
})().catch(e=>{console.error(e);process.exit(1)});
