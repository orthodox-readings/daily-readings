  // ---------- Share ----------
  function appURL(){ return location.href.split("#")[0]; }
  function shareDay(){
    var d=(lastRender && lastRender.data)||{};
    var refs=((d.readings)||[]).map(function(r){ return r.display; }).filter(Boolean).join(" · ");
    var ft=el("fastText").textContent;
    var txt="☦ "+el("date").textContent+" (Old Calendar)\n"+
      (el("summary").textContent ? el("summary").textContent+"\n":"")+
      (ft && ft!=="—" ? "Fast: "+ft+"\n" : "")+
      (refs? "Readings: "+refs+"\n" : "")+ appURL();
    shareText(txt, "Daily Orthodox Readings");
  }
  function shareText(txt, title){
    if(navigator.share){
      navigator.share({title:title||"Daily Readings", text:txt}).catch(function(e){
        if(!e || e.name!=="AbortError") copyText(txt, function(){ toast("Copied"); });
      });
    } else copyText(txt, function(){ toast("Copied"); });
  }

  // ---------- Share images (canvas; flat ivory or burgundy, in the app's palette) ----------
  var TILE=1080;
  function tRoundRect(x,a,b,w,h,r){
    x.beginPath();
    x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r);
    x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath();
  }
  function tWrap(x, text, maxW){
    var words=String(text).split(/\s+/), lines=[], cur="";
    words.forEach(function(w){
      var t=cur? cur+" "+w : w;
      if(x.measureText(t).width<=maxW || !cur){ cur=t; } else { lines.push(cur); cur=w; }
    });
    if(cur) lines.push(cur);
    return lines;
  }
  function tFit(x, text, maxW, maxLines, startPx, minPx, font){
    var px=startPx, lines;
    for(;;){
      x.font="italic 0px serif"; // reset quirk guard
      x.font=font.replace("{px}", px);
      lines=tWrap(x, text, maxW);
      if(lines.length<=maxLines || px<=minPx) break;
      px-=2;
    }
    return {px:px, lines:lines};
  }
  function tCross(x, cx, cy, s, colour){            // three-bar cross; the foot-bar is higher on the viewer's left
    x.save(); x.strokeStyle=colour; x.lineWidth=Math.max(2, s*0.07); x.lineCap="round";
    x.beginPath();
    x.moveTo(cx, cy-s/2); x.lineTo(cx, cy+s/2);
    x.moveTo(cx-s*0.14, cy-s*0.31); x.lineTo(cx+s*0.14, cy-s*0.31);
    x.moveTo(cx-s*0.27, cy-s*0.11); x.lineTo(cx+s*0.27, cy-s*0.11);
    x.moveTo(cx-s*0.17, cy+s*0.17); x.lineTo(cx+s*0.17, cy+s*0.33);
    x.stroke(); x.restore();
  }
  var TP = { light:{bg:"#FAF7EF", ink:"#302B25", muted:"#79736A", gold:"#86672C", rule:"rgba(197,164,109,.75)"},
             dark: {bg:"#641E28", ink:"#FAF7EF", muted:"#DCC9A6", gold:"#C5A46D", rule:"rgba(197,164,109,.6)"} };
  var T_SANS="-apple-system, 'Segoe UI', Roboto, sans-serif", T_SERIF='Georgia, "Times New Roman", serif';
  function tBase(x, dark, W, H){
    var p=dark?TP.dark:TP.light;
    x.fillStyle=p.bg; x.fillRect(0,0,W,H);
    x.strokeStyle=p.rule; x.lineWidth=2; tRoundRect(x,36,36,W-72,H-72,18); x.stroke();
    x.textAlign="center"; x.textBaseline="middle";
    return p;
  }
  function tSpaced(x, text, cx, y, px, colour, weight, spacing){
    x.fillStyle=colour;
    try{ x.letterSpacing=spacing+"px"; }catch(e){}
    x.font=(weight||"600")+" "+px+"px "+T_SANS;
    x.fillText(String(text).toUpperCase(), cx, y);
    try{ x.letterSpacing="0px"; }catch(e){}
  }
  function tMonthDay(d){
    var M=["January","February","March","April","May","June","July","August","September","October","November","December"];
    return d.getDate()+" "+M[d.getMonth()];
  }
  function buildTile(kind){
    var c=document.createElement("canvas"); c.width=TILE; c.height=TILE;
    var x=c.getContext("2d"), p;
    if(kind==="wisdom"){
      p=tBase(x,false,TILE,TILE); tCross(x,TILE/2,214,64,"#C5A46D");
      tSpaced(x,"Wisdom of the Fathers",TILE/2,318,25,p.gold,"700",6);
      var q=el("quoteText").textContent||"";
      var by=currentQuote ? currentQuote.by : "";
      var f=tFit(x,q,860,7,58,32,'{px}px '+T_SERIF);
      x.font=f.px+'px '+T_SERIF; x.fillStyle=p.ink;
      var lh=f.px*1.5, block=f.lines.length*lh, y0=570-block/2+lh/2;
      f.lines.forEach(function(L,i){ x.fillText(L, TILE/2, y0+i*lh); });
      x.fillStyle=p.gold; x.font="600 32px "+T_SANS;
      x.fillText(by ? "— "+by : "", TILE/2, y0+f.lines.length*lh+34);
      tSpaced(x,"Daily Readings · Old Calendar",TILE/2,TILE-92,23,p.muted,"500",4);
    } else {
      p=tBase(x,true,TILE,TILE); tCross(x,TILE/2,214,64,p.gold);
      var dateTxt=el("date").textContent||"";
      var df=tFit(x,dateTxt,900,2,74,52,'700 {px}px '+T_SERIF);
      x.font='700 '+df.px+'px '+T_SERIF; x.fillStyle=p.ink;
      var dy=360;
      df.lines.forEach(function(L,i){ x.fillText(L, TILE/2, dy+i*df.px*1.25); });
      dy+= df.lines.length*df.px*1.25 + 8;
      x.fillStyle=p.muted; x.font="30px "+T_SANS;
      x.fillText(tMonthDay(menaionOf(state.date))+" on the Old Calendar", TILE/2, dy);
      var feast=el("summary").textContent||"";
      var ff=tFit(x,feast,880,3,48,32,'600 {px}px '+T_SERIF);
      x.font='600 '+ff.px+'px '+T_SERIF; x.fillStyle=p.ink;
      var flh=ff.px*1.45, fy=dy+92;
      ff.lines.forEach(function(L,i){ x.fillText(L, TILE/2, fy+i*flh); });
      var fastT=el("fastText").textContent||"";
      var exc=(el("fastExc").textContent||"").replace(/^\s*·\s*/,"");
      if(fastT && fastT!=="—"){
        var pill=fastT+(exc? " — "+exc : "");
        x.font="30px "+T_SANS;
        if(x.measureText(pill).width>820){ pill=fastT; }
        var pw=x.measureText(pill).width+80, py=fy+ff.lines.length*flh+50;
        x.strokeStyle=p.rule; x.lineWidth=1.5;
        tRoundRect(x,TILE/2-pw/2,py-34,pw,68,34); x.stroke();
        x.fillStyle=p.ink; x.fillText(pill, TILE/2, py);
      }
      tSpaced(x,"Daily Readings · Old Calendar",TILE/2,TILE-92,23,p.muted,"500",4);
    }
    return c;
  }
  function buildYearTile(){
    var W=1080, H=1920;
    var c=document.createElement("canvas"); c.width=W; c.height=H;
    var x=c.getContext("2d"), p=tBase(x,false,W,H);
    tCross(x,W/2,122,60,"#C5A46D");
    tSpaced(x,"The Church Year",W/2,196,27,p.gold,"700",6);
    x.fillStyle=p.ink; x.font="700 96px "+T_SERIF; x.fillText(String(yearShown), W/2, 284);
    x.fillStyle=p.muted; x.font="26px "+T_SANS; x.fillText("Old Calendar (Julian)", W/2, 346);
    var ev=yearEvents(yearShown), y=424;
    ev.feasts.forEach(function(f){
      x.beginPath(); x.arc(110, y, 9, 0, 7); x.fillStyle=LIT_DOT[f.lit]||"#C5A46D"; x.fill();
      if(f.lit==="white"){ x.strokeStyle="rgba(48,43,37,.35)"; x.lineWidth=1.5; x.stroke(); }
      x.textAlign="left"; x.fillStyle= f.pascha? "#641E28" : p.ink;
      x.font=(f.pascha? "800 ":"600 ")+"31px "+T_SANS;
      var nm=f.name; if(x.measureText(nm).width>640){ nm=nm.split(" — ")[0]; }
      x.fillText(nm, 140, y);
      x.textAlign="right"; x.fillStyle=p.muted; x.font="29px "+T_SANS;
      x.fillText(fmtYD(f.d), W-110, y);
      y+=62;
    });
    y+=30;
    x.textAlign="center"; tSpaced(x,"The Fasting Seasons",W/2,y,25,p.gold,"700",6);
    y+=56;
    ev.fasts.forEach(function(f){
      x.textAlign="left"; x.fillStyle=p.ink; x.font="700 30px "+T_SANS;
      x.fillText(f.name, 110, y);
      x.textAlign="right"; x.fillStyle=p.muted; x.font="28px "+T_SANS;
      x.fillText(fmtYR(f), W-110, y);
      y+=58;
    });
    x.textAlign="center"; tSpaced(x,"Daily Readings",W/2,H-92,24,p.muted,"500",4);
    return c;
  }
  function shareCanvas(c, name){
    try{
      c.toBlob(function(blob){
        if(!blob) return;
        var f=new File([blob], name, {type:"image/png"});
        if(navigator.share && navigator.canShare && navigator.canShare({files:[f]})){
          navigator.share({files:[f], title:"Daily Orthodox Readings"}).catch(function(){});
        } else {
          var a=document.createElement("a");
          a.href=URL.createObjectURL(blob); a.download=f.name;
          document.body.appendChild(a); a.click();
          setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500);
        }
      },"image/png");
    }catch(e){}
  }
  function shareTile(kind){
    try{ shareCanvas(buildTile(kind), "dailyreadings-"+kind+".png"); }catch(e){}
  }

