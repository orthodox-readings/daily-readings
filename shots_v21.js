const { chromium } = require('playwright');
const fs=require('fs'), http=require('http'), path=require('path');
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const MOCK={ pascha_distance:104, summary_title:"Ss. Cyrus and John; Ss. Sergius and Herman of Valaam",
  titles:["Ss. Sergius and Herman, abbots of Valaam (1353)"],
  fast_level_desc:"Apostles Fast", fast_exception_desc:"Wine and Oil are Allowed", feasts:[],saints:[],service_notes:[],
  stories:[{title:"Ss. Sergius and Herman of Valaam",story:"The holy founders of Valaam monastery laboured in asceticism.\n\nTheir relics remain at the monastery."}],
  readings:[{source:"Epistle",display:"Romans 9:1-5",passage:[{verse:1,content:"I say the truth in Christ, I lie not."}]},
            {source:"Gospel",display:"Matthew 9:18-26",passage:[{verse:18,content:"There came a certain ruler and worshipped him."}]}]};
(async()=>{
  const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(__dirname,p),(e,b)=>{if(e){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'text/plain'});res.end(b);});});
  await new Promise(r=>server.listen(8177,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  for(const scheme of ['light','dark']){
    const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:scheme});
    const page=await ctx.newPage();
    await page.route('**orthocal.info/api/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK)}));
    await page.route('**bolls.life/**', r=>r.fulfill({status:404,body:''}));
    await page.goto('http://localhost:8177/index.html',{waitUntil:'networkidle'});
    await page.waitForSelector('.reading');
    if(scheme==='light'){
      await page.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>Promise.resolve(); e.userChoice=Promise.resolve({}); window.dispatchEvent(e); });
      await page.waitForTimeout(200);
    }
    await page.screenshot({path:'v21-'+scheme+'.png', fullPage: scheme==='light'});
    if(scheme==='light'){
      await page.click('#gearBtn');
      await page.screenshot({path:'v21-settings.png'});
    }
    await ctx.close();
  }
  await browser.close(); server.close(); console.log('done');
})().catch(e=>{console.error(e);process.exit(1)});
