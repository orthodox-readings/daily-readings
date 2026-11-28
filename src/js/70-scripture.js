  // ---------- St Theophan: link to the official English reflection for the day ----------
  // OrthoChristian publishes the official English "Thoughts for Each Day"; the reflection follows
  // the movable cycle, which is shared by Old- and New-Calendar parishes, so "today" is correct.
  // OrthoChristian calendar pages are keyed by the OLD-CALENDAR (Julian) date: /calendar/YYYYMMDD.html
  // Julian date = civil date − 13 days (valid 1900–2100). St Theophan's reflection is on each page.
  function orthoChristianURL(civilDate){
    // OrthoChristian pages are keyed by the menaion (OS) date — subtract the active reckoning's offset
    var j = menaionOf(civilDate);
    var mm = ("0"+(j.getMonth()+1)).slice(-2), dd = ("0"+j.getDate()).slice(-2);
    return "https://orthochristian.com/calendar/" + j.getFullYear() + mm + dd + ".html";
  }
  function findGospelRef(readings){
    // St Theophan's reflections follow the day's LITURGY Gospel. On Sundays the
    // Matins (resurrectional) Gospel comes first in the list — it must be skipped,
    // as must feast-specific extra Gospels (e.g. "Gospel — Prophet Elijah").
    var plain=null, qualified=null, loose=null;
    (readings||[]).forEach(function(r){
      var src = (r.source||"").toLowerCase();
      var disp = r.display || r.short_display || "";
      if(!disp) return;
      var isMatins = /matins/.test(src) || /matins/i.test(r.desc||"");
      var bookish = disp.replace(/^\s*(i{1,3}|1|2|3)\s+/i,"");
      var looksGospel = /gospel/.test(src) || /^(matthew|mark|luke|john|matt|mk|lk|jn)\b/i.test(bookish);
      if(!looksGospel || isMatins) return;
      if(src==="gospel" && !r.desc){ if(!plain) plain = disp; }
      else if(src==="gospel"){ if(!qualified) qualified = disp; }
      else { if(!loose) loose = disp; }
    });
    return plain || qualified || loose;
  }
  function renderTheophan(readings){
    var g = findGospelRef(readings);
    var sub = el("theophanSub");
    sub.textContent = "";
    if(g){
      sub.appendChild(document.createTextNode("On the day’s Gospel, "));
      var b = document.createElement("b"); b.textContent = g; sub.appendChild(b);
    } else {
      sub.textContent = "On the day’s Gospel and Epistle";
    }
    el("theophanLink").setAttribute("href", orthoChristianURL(state.date));
  }

  // ---------- Bible text: KJV (bundled in the calendar data) / NKJV (fetched per chapter) ----------
  function renderPassageKJV(body, r){
    body.innerHTML="";
    var passage = r.passage || r.verses || [];
    if(passage && passage.length){
      passage.forEach(function(v){
        var p=document.createElement("p"); p.className="v";
        var num=(v.verse!=null)?v.verse:(v.number!=null?v.number:"");
        if(num!==""){ var sup=document.createElement("sup"); sup.textContent=num; p.appendChild(sup); }
        p.appendChild(document.createTextNode((v.content!=null?v.content:(v.text||"")).trim()));
        body.appendChild(p);
      });
    } else {
      var n=document.createElement("div"); n.className="none";
      n.textContent="Full text not provided — see the reference above.";
      body.appendChild(n);
    }
  }

  var BOOKS = {gen:1,genesis:1,ex:2,exod:2,exodus:2,lev:3,leviticus:3,num:4,numbers:4,deut:5,deuteronomy:5,
    josh:6,joshua:6,judg:7,judges:7,ruth:8,"1sam":9,"1samuel":9,"2sam":10,"2samuel":10,
    "1kgs":11,"1kings":11,"2kgs":12,"2kings":12,"1chr":13,"1chron":13,"1chronicles":13,"2chr":14,"2chron":14,"2chronicles":14,
    ezra:15,neh:16,nehemiah:16,esth:17,esther:17,job:18,ps:19,psalm:19,psalms:19,prov:20,proverbs:20,
    eccl:21,ecclesiastes:21,song:22,songofsolomon:22,songofsongs:22,isa:23,isaiah:23,jer:24,jeremiah:24,
    lam:25,lamentations:25,ezek:26,ezekiel:26,dan:27,daniel:27,hos:28,hosea:28,joel:29,amos:30,
    obad:31,obadiah:31,jonah:32,mic:33,micah:33,nah:34,nahum:34,hab:35,habakkuk:35,zeph:36,zephaniah:36,
    hag:37,haggai:37,zech:38,zechariah:38,mal:39,malachi:39,
    matt:40,matthew:40,mt:40,mark:41,mk:41,luke:42,lk:42,john:43,jn:43,acts:44,
    rom:45,romans:45,"1cor":46,"1corinthians":46,"2cor":47,"2corinthians":47,gal:48,galatians:48,
    eph:49,ephesians:49,phil:50,philippians:50,php:50,col:51,colossians:51,
    "1thess":52,"1thessalonians":52,"1th":52,"2thess":53,"2thessalonians":53,"2th":53,
    "1tim":54,"1timothy":54,"2tim":55,"2timothy":55,titus:56,tit:56,phlm:57,philem:57,philemon:57,
    heb:58,hebrews:58,jas:59,james:59,"1pet":60,"1peter":60,"2pet":61,"2peter":61,
    "1john":62,"1jn":62,"2john":63,"2jn":63,"3john":64,"3jn":64,jude:65,rev:66,revelation:66};

  function bookNum(s){
    s = String(s).toLowerCase().replace(/\./g,"").replace(/\s+/g," ").trim();
    s = s.replace(/^iii\b/,"3").replace(/^ii\b/,"2").replace(/^i\b/,"1");
    return BOOKS[s.replace(/\s+/g,"")] || null;
  }

  // Parses "Romans 9:1-5", "1 Corinthians 7.12-24", "Matthew 14:35-15:11", "Luke 1:39-49, 56",
  // "John 7:37-52, 8:12" → {book, segs:[{c,a,b}]} (b=-1 means "to end of chapter"). Null if unparseable.
  function parseRef(display){
    if(!display) return null;
    var str = String(display).replace(/[–—−]/g,"-").trim();
    var m = str.match(/^((?:[123]|I{1,3})?\s*[A-Za-z][A-Za-z .]*?)\s+(\d[\d:.,;\s-]*)$/);
    if(!m) return null;
    var book = bookNum(m[1]); if(!book) return null;
    var parts = m[2].replace(/\s+/g,"").split(/[,;]/);
    var segs=[], ch=null;
    for(var i=0;i<parts.length;i++){
      var p = parts[i]; if(!p) continue;
      p = p.replace(/\./g,":");
      var a = p.split("-"); if(a.length>2) return null;
      var c1,v1, s1=a[0], s2=(a.length===2)?a[1]:null;
      if(s1.indexOf(":")>-1){ var x=s1.split(":"); c1=parseInt(x[0],10); v1=parseInt(x[1],10); ch=c1; }
      else { if(ch==null) return null; c1=ch; v1=parseInt(s1,10); }
      if(!c1||!v1) return null;
      if(s2==null){ segs.push({c:c1,a:v1,b:v1}); continue; }
      if(s2.indexOf(":")>-1){
        var y=s2.split(":"); var c2=parseInt(y[0],10), v2=parseInt(y[1],10);
        if(!c2||!v2) return null;
        if(c2===c1){ segs.push({c:c1,a:v1,b:v2}); }
        else{
          segs.push({c:c1,a:v1,b:-1});
          for(var cc=c1+1;cc<c2;cc++) segs.push({c:cc,a:1,b:-1});
          segs.push({c:c2,a:1,b:v2}); ch=c2;
        }
      } else {
        var v2b=parseInt(s2,10); if(!v2b) return null;
        segs.push({c:c1,a:v1,b:v2b});
      }
    }
    return segs.length ? {book:book, segs:segs} : null;
  }

  var NKJV_API = "https://bolls.life/get-text/NKJV/"; // + book/chapter/
  function fetchNKJVChapter(book, ch){
    var key = "nkjv:"+book+":"+ch;
    try{ var raw=store.getItem(key); if(raw) return Promise.resolve(JSON.parse(raw)); }catch(e){}
    var url = NKJV_API + book + "/" + ch + "/";
    return fetchJSON(url).catch(function(){ return fetchJSON(PROXY+encodeURIComponent(url)); })
      .then(function(arr){
        if(!Array.isArray(arr) || !arr.length) throw new Error("empty chapter");
        var slim = arr.map(function(v){ return {verse:v.verse, text:v.text}; });
        try{ store.setItem(key, JSON.stringify(slim)); }catch(e){}
        return slim;
      });
  }

  function buildNKJVFragment(parsed, chaptersMap){
    var frag = document.createDocumentFragment();
    parsed.segs.forEach(function(sg){
      var arr = chaptersMap[sg.c] || [];
      var end = (sg.b===-1) ? (arr.length ? arr[arr.length-1].verse : 0) : sg.b;
      arr.forEach(function(v){
        if(v.verse < sg.a || v.verse > end) return;
        var p=document.createElement("p"); p.className="v";
        var sup=document.createElement("sup"); sup.textContent=v.verse; p.appendChild(sup);
        var txt=String(v.text||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
        p.appendChild(document.createTextNode(txt));
        frag.appendChild(p);
      });
    });
    return frag;
  }

  function applyNKJV(bodyEl, badgeEl, display, seq){
    var parsed = parseRef(display);
    if(!parsed) return; // unparseable (e.g. composite/apocryphal reading) — KJV stays
    var chs=[]; parsed.segs.forEach(function(s){ if(chs.indexOf(s.c)<0) chs.push(s.c); });
    Promise.all(chs.map(function(c){
      return fetchNKJVChapter(parsed.book, c).then(function(a){ return [c,a]; });
    })).then(function(pairs){
      if(seq!==state.renderSeq || state.txt!=="nkjv") return; // day changed or toggled meanwhile
      var map={}; pairs.forEach(function(p){ map[p[0]]=p[1]; });
      var frag = buildNKJVFragment(parsed, map);
      if(!frag.childNodes.length) return; // verses not found — keep KJV
      bodyEl.innerHTML=""; bodyEl.appendChild(frag);
      badgeEl.textContent="NKJV";
      if(state.lang!=="en") applyGreek(bodyEl, display, seq);
    }).catch(function(){ /* fetch failed — KJV stays, badge already says so */ });
  }

  // ---------- Greek New Testament: two separate editions, never mixed ----------
  //   rp  Byzantine Textform, Robinson–Pierpont 2018 (public domain) — greek/{book}/{chapter}.json = {verse: text}
  //   pt  Patriarchal Text, Antoniades 1904/1912, transcribed by Robinson & Ala-Konni (public domain; unaccented)
  //       — greek-pt/{book}.json = {chapter: {verse: text}}
  // New Testament only (books 40–66).
  var GK_ED = {
    rp:{ name:"Byzantine Textform", cite:"Byzantine Textform (Robinson–Pierpont, 2018)" },
    pt:{ name:"Patriarchal Text",   cite:"Patriarchal Text (Antoniades, 1904/1912; unaccented transcription)" }
  };
  var greekMem = {}, ptMem = {}, kjvMem = {};
  function fetchBookFile(dir, mem, book){
    if(mem[book]) return Promise.resolve(mem[book]);
    return fetchJSONWithRepair(dir+"/"+book+".json").then(function(obj){ mem[book]=obj; return obj; });
  }
  function fetchGreekChapter(book, ch){
    if(state.gkEd==="pt"){
      return fetchBookFile("greek-pt", ptMem, book).then(function(o){
        var c=o[String(ch)]; if(!c) throw new Error("no chapter"); return c;
      });
    }
    var key = book+"/"+ch;
    if(greekMem[key]) return Promise.resolve(greekMem[key]);
    return fetchJSONWithRepair("greek/"+key+".json").then(function(obj){ greekMem[key]=obj; return obj; });
  }
  function gkPara(n, text){
    var gp=mk("p","gk"); gp.setAttribute("lang","grc");
    gp.appendChild(mk("sup","",String(n))); gp.appendChild(document.createTextNode(text));
    return gp;
  }
  function clearGreek(bodyEl){
    bodyEl.classList.remove("has-gk");
    Array.prototype.forEach.call(bodyEl.querySelectorAll(".gk,.gknote"), function(n){ n.remove(); });
    Array.prototype.forEach.call(bodyEl.querySelectorAll(".haspair"), function(n){ n.classList.remove("haspair"); });
  }
  function greekNote(bodyEl, text){ bodyEl.appendChild(mk("p","gknote",text)); }
  function applyGreek(bodyEl, display, seq){
    clearGreek(bodyEl);
    var parsed = parseRef(display);
    if(!parsed || parsed.book < 40){
      if(bodyEl.querySelector(".v")) greekNote(bodyEl, "The Greek text is shown for New Testament readings.");
      return;
    }
    var ed=state.gkEd;
    var chs=[]; parsed.segs.forEach(function(s){ if(chs.indexOf(s.c)<0) chs.push(s.c); });
    Promise.all(chs.map(function(c){
      return fetchGreekChapter(parsed.book, c).then(function(o){ return [c,o]; });
    })).then(function(pairs){
      if(seq!==state.renderSeq || state.lang==="en" || ed!==state.gkEd) return;   // day, language or edition changed meanwhile
      var map={}; pairs.forEach(function(p){ map[p[0]]=p[1]; });
      // The reading's verses in order, as (chapter, verse)
      var refs=[];
      parsed.segs.forEach(function(sg){
        var ch=map[sg.c]||{}, last=0;
        Object.keys(ch).forEach(function(k){ var n=parseInt(k,10); if(n>last) last=n; });
        var end=(sg.b===-1)? last : sg.b;
        for(var v=sg.a; v<=end; v++) refs.push({c:sg.c, v:v});
      });
      clearGreek(bodyEl);
      // Walk the English verses and pair each with its Greek by verse number, keeping reading order
      var ptr=0;
      Array.prototype.forEach.call(bodyEl.querySelectorAll("p.v"), function(p){
        var sup=p.querySelector("sup"); if(!sup) return;
        var n=parseInt(sup.textContent,10); if(!n) return;
        for(var i=ptr;i<refs.length;i++){
          if(refs[i].v===n){
            ptr=i+1;
            var g=(map[refs[i].c]||{})[String(n)];
            if(g){
              p.parentNode.insertBefore(gkPara(n, g), p.nextSibling);
              p.classList.add("haspair");     // in Greek-only view the English of a paired verse is hidden
            }
            break;
          }
        }
      });
      if(bodyEl.querySelector(".gk")) bodyEl.classList.add("has-gk");
    }).catch(function(){
      if(seq===state.renderSeq && state.lang!=="en" && !bodyEl.querySelector(".gknote"))
        greekNote(bodyEl, "The Greek text could not be loaded — it needs a connection the first time.");
    });
  }

  // ---------- reading preferences (shared by the daily readings, the reader and Settings) ----------
  function paintPrefs(){
    document.body.classList.toggle("par", state.lang==="par");
    each("#langSeg button, #rdLangSeg button, #setLangSeg button", function(b){ b.classList.toggle("active", b.getAttribute("data-lang")===state.lang); });
    each("#txtSeg button, #setTxtSeg button", function(b){ b.classList.toggle("active", b.getAttribute("data-txt")===state.txt); });
    each("#gkEdOpts .opt", function(b){ b.classList.toggle("active", b.getAttribute("data-ed")===state.gkEd); });
    show(el("nkjvNote"), state.txt==="nkjv");
  }
  function refreshTexts(){
    if(lastRender) render(lastRender.data, lastRender.opts);
    if(rd.inited) renderReader(false);
  }
  function setLang(l){
    state.lang=l; store.setItem("pref:lang", l);
    store.setItem("pref:greek", l==="en" ? "0" : "1");     // kept in step for earlier versions of the app
    paintPrefs(); refreshTexts();
  }
  function setTxt(t){
    state.txt = t; store.setItem("pref:txt", t);
    paintPrefs();
    if(lastRender) render(lastRender.data, lastRender.opts);
  }
  function setGkEd(e){
    state.gkEd = (e==="pt") ? "pt" : "rp"; store.setItem("pref:gkEd", state.gkEd);
    paintPrefs(); refreshTexts();
  }
  each("#langSeg button, #rdLangSeg button, #setLangSeg button", function(b){ b.addEventListener("click", function(){ setLang(b.getAttribute("data-lang")); }); });
  each("#txtSeg button, #setTxtSeg button", function(b){ b.addEventListener("click", function(){ setTxt(b.getAttribute("data-txt")); }); });
  each("#gkEdOpts .opt", function(b){ b.addEventListener("click", function(){ setGkEd(b.getAttribute("data-ed")); }); });

  // ---------- Scripture reader: the New Testament by book and chapter ----------
  // English: King James Version, bundled per book (kjv/{book}.json, public domain). The NKJV is not offered
  // here: its publisher's terms do not allow whole books to be reproduced without a licence.
  var NT=[[40,"Matthew",28],[41,"Mark",16],[42,"Luke",24],[43,"John",21],[44,"Acts",28],[45,"Romans",16],
    [46,"1 Corinthians",16],[47,"2 Corinthians",13],[48,"Galatians",6],[49,"Ephesians",6],[50,"Philippians",4],
    [51,"Colossians",4],[52,"1 Thessalonians",5],[53,"2 Thessalonians",3],[54,"1 Timothy",6],[55,"2 Timothy",4],
    [56,"Titus",3],[57,"Philemon",1],[58,"Hebrews",13],[59,"James",5],[60,"1 Peter",5],[61,"2 Peter",3],
    [62,"1 John",5],[63,"2 John",1],[64,"3 John",1],[65,"Jude",1],[66,"Revelation",22]];
  var NT_GROUPS=[["The Holy Gospels",40,43],["Acts of the Apostles",44,44],["Epistles of St Paul",45,58],["General Epistles",59,65],["Revelation",66,66]];
  function ntInfo(b){ return NT[b-40] || NT[0]; }
  var rd={ b:40, c:1, v:1, inited:false, seq:0, en:null, gk:null };
  function ensureReader(){
    if(rd.inited) return;
    var p=jget("reader:pos", null);
    if(p && p.b>=40 && p.b<=66 && p.c>=1 && p.c<=ntInfo(p.b)[2]){ rd.b=p.b; rd.c=p.c; rd.v=p.v||1; }
    rd.inited=true; renderReader(true);
  }
  function saveRdPos(){ jset("reader:pos", {b:rd.b, c:rd.c, v:rd.v}); }
  function openReader(b, c, v, flash){
    rd.b=b; rd.c=c; rd.v=v||1; rd.inited=true; saveRdPos();
    showTab("scripture");
    renderReader(true, flash);
  }
  function rdRef(v){ return ntInfo(rd.b)[1]+" "+rd.c+(v ? ":"+v : ""); }
  function renderReader(scrollToVerse, flash){
    var info=ntInfo(rd.b), seq=++rd.seq, lang=state.lang, ed=state.gkEd, b=rd.b, c=rd.c;
    el("rdPickTxt").textContent = info[1]+" "+c;
    el("rdTitle").textContent = info[1];
    el("rdSub").textContent = (info[2]>1 ? "Chapter "+c : "") ;
    show(el("rdSub"), info[2]>1);
    var pv=rdStepTarget(-1), nx=rdStepTarget(1);
    el("rdPrev").disabled=!pv; el("rdPrev").textContent = pv ? "‹ "+ntInfo(pv.b)[1]+" "+pv.c : "‹";
    el("rdNext").disabled=!nx; el("rdNext").textContent = nx ? ntInfo(nx.b)[1]+" "+nx.c+" ›" : "›";
    el("rdEdition").textContent = (lang!=="grc" ? "English: King James Version. " : "") + (lang!=="en" ? "Greek: "+GK_ED[ed].cite+"." : "");
    var body=el("rdBody"), want=b+":"+c;
    if(body.getAttribute("data-ch")!==want){        // another chapter: clear the old text while this one opens
      body.removeAttribute("data-ch"); body.removeAttribute("data-mode");
      body.innerHTML='<div class="loading"><div class="spin"></div>Opening…</div>';
    }
    var pEn = fetchBookFile("kjv", kjvMem, b).then(function(o){ return o[String(c)] || null; }).catch(function(){ return null; });
    var pGk = (lang==="en") ? Promise.resolve(null) : fetchGreekChapter(b, c).catch(function(){ return null; });
    Promise.all([pEn, pGk]).then(function(res){
      if(seq!==rd.seq) return;
      var en=res[0], gk=res[1], gkNote="", moved={};
      if(gk && b===45 && c===16 && gk["25"]){
        // Both Greek editions print the closing doxology at Romans 14:24–26; the data repeats it at 16:25–27
        // only so the daily readings (cited by KJV numbers) find it. The reader shows each edition as printed.
        gk=JSON.parse(JSON.stringify(gk)); delete gk["25"]; delete gk["26"]; delete gk["27"]; moved={"25":1,"26":1,"27":1};
        gkNote="In the Greek text the closing doxology (verses 25–27) stands at Romans 14:24–26.";
      }
      rd.en=en; rd.gk=gk;
      body.innerHTML=""; body.className="lang-"+lang;
      body.setAttribute("data-ch", want); body.setAttribute("data-mode", lang+":"+ed);
      if(!en && !gk){
        body.appendChild(mk("p","none","This chapter could not be loaded — it needs a connection the first time it is opened."));
        return;
      }
      var nums={};
      Object.keys(en||{}).forEach(function(k){ nums[k]=1; });
      Object.keys(gk||{}).forEach(function(k){ nums[k]=1; });
      var list=Object.keys(nums).map(function(k){ return parseInt(k,10); }).filter(Boolean).sort(function(a,b2){ return a-b2; });
      var bms=savedSet("user:bookmarks"), hls=savedSet("user:highlights");
      list.forEach(function(n){
        var e=en && en[String(n)], g=gk && gk[String(n)], key=b+":"+c+":"+n;
        var showEn = !!e && (lang==="en" || lang==="par");
        var showGk = !!g && lang!=="en";
        var lacking = lang==="grc" && !!gk && !g && !!e && !moved[String(n)];   // the verse is not in this Greek edition
        if(!showEn && !showGk && !lacking) return;
        var vs=mk("div","vs"+(showEn&&showGk?" pair":"")+(bms[key]?" bm":"")+(hls[key]?" hl":"")); vs.setAttribute("data-v", String(n));
        if(showEn){ var p=mk("p","v"); p.appendChild(mk("sup","",String(n))); p.appendChild(document.createTextNode(e)); vs.appendChild(p); }
        if(showGk) vs.appendChild(gkPara(n, g));
        if(lacking) vs.appendChild(mk("p","gknote","Verse "+n+" is not in the "+GK_ED[ed].name+"."));
        if(!showGk && lang==="par" && gk && !g && !moved[String(n)]) vs.appendChild(mk("p","gknote","Not in the "+GK_ED[ed].name+"."));
        vs.addEventListener("click", function(){ openVerse(n); });
        body.appendChild(vs);
      });
      if(lang!=="en" && !gk) body.appendChild(mk("p","gknote","The Greek text could not be loaded — it needs a connection the first time."));
      if(lang!=="en" && gkNote) body.appendChild(mk("p","gknote",gkNote));
      if(scrollToVerse && state.tab==="scripture"){
        var target = rd.v>1 ? body.querySelector('.vs[data-v="'+rd.v+'"]') : null;
        if(target){
          var top=target.getBoundingClientRect().top + (window.pageYOffset||0) - 16;   // matches the position check below
          window.scrollTo(0, Math.max(0, top));
          if(flash){ target.classList.add("flash"); }
        } else window.scrollTo(0,0);
      }
    });
  }
  function rdStepTarget(dir){
    var c=rd.c+dir, b=rd.b;
    if(c<1){ b--; if(b<40) return null; c=ntInfo(b)[2]; }
    else if(c>ntInfo(b)[2]){ b++; if(b>66) return null; c=1; }
    return {b:b, c:c};
  }
  function rdStep(dir){
    var t=rdStepTarget(dir); if(!t) return;
    rd.b=t.b; rd.c=t.c; rd.v=1; saveRdPos(); renderReader(true);
  }
  el("rdPrev").addEventListener("click", function(){ rdStep(-1); });
  el("rdNext").addEventListener("click", function(){ rdStep(1); });

  // remember how far down the chapter the reader is
  var rdScrollT=null;
  window.addEventListener("scroll", function(){
    if(state.tab!=="scripture" || !rd.inited) return;
    clearTimeout(rdScrollT);
    rdScrollT=setTimeout(function(){
      var vsl=el("rdBody").querySelectorAll(".vs"), v=1;
      for(var i=0;i<vsl.length;i++){ if(vsl[i].getBoundingClientRect().bottom>20){ v=parseInt(vsl[i].getAttribute("data-v"),10)||1; break; } }
      if(v!==rd.v){ rd.v=v; saveRdPos(); }
    }, 350);
  }, {passive:true});

  // book and chapter picker
  function openPicker(){ pickBooks(); openSheet("pickSheet"); }
  function pickBooks(){
    el("pickTitle").textContent="New Testament"; show(el("pickBack"), false);
    var body=el("pickBody"); body.innerHTML="";
    NT_GROUPS.forEach(function(g){
      body.appendChild(mk("p","bkgrp",g[0]));
      var list=mk("div","bklist");
      NT.forEach(function(bk){
        if(bk[0]<g[1] || bk[0]>g[2]) return;
        var btn=mk("button", bk[0]===rd.b ? "cur" : "", bk[1]);
        btn.addEventListener("click", function(){ if(bk[2]===1) pickGo(bk[0],1); else pickChapters(bk); });
        list.appendChild(btn);
      });
      body.appendChild(list);
    });
  }
  function pickChapters(bk){
    el("pickTitle").textContent=bk[1]; show(el("pickBack"), true);
    var body=el("pickBody"); body.innerHTML="";
    var grid=mk("div","chgrid");
    for(var c=1;c<=bk[2];c++){ (function(cc){
      var btn=mk("button", (bk[0]===rd.b && cc===rd.c) ? "cur" : "", String(cc));
      btn.setAttribute("aria-label", bk[1]+" chapter "+cc);
      btn.addEventListener("click", function(){ pickGo(bk[0], cc); });
      grid.appendChild(btn);
    })(c); }
    body.appendChild(grid);
  }
  function pickGo(b, c){ closeLayer(); rd.b=b; rd.c=c; rd.v=1; saveRdPos(); renderReader(true); }
  el("rdPick").addEventListener("click", openPicker);
  el("pickBack").addEventListener("click", pickBooks);

  // bookmarks and highlights: arrays of {b,c,v,s,t} (book, chapter, verse, snippet, time)
  function savedList(key){ var a=jget(key, []); return Array.isArray(a) ? a : []; }
  function savedSet(key){ var o={}; savedList(key).forEach(function(x){ o[x.b+":"+x.c+":"+x.v]=1; }); return o; }
  function toggleSaved(key, v){
    var a=savedList(key), i=-1;
    a.forEach(function(x,ix){ if(x.b===rd.b && x.c===rd.c && x.v===v) i=ix; });
    if(i>-1){ a.splice(i,1); jset(key,a); return false; }
    var s=(rd.en && rd.en[String(v)]) || (rd.gk && rd.gk[String(v)]) || "";
    a.push({b:rd.b, c:rd.c, v:v, s:s.slice(0,110), t:Date.now()}); jset(key,a); return true;
  }
  var vsCur=0;
  function verseText(v){
    var e=rd.en && rd.en[String(v)], g=rd.gk && rd.gk[String(v)], lang=state.lang, parts=[], src=[];
    if(e && (lang!=="grc" || !g)){ parts.push(e); src.push("KJV"); }                 // same order as on the page
    if(g && lang!=="en"){ parts.push(g); src.push(GK_ED[state.gkEd].name); }
    return { body:parts.join("\n"), cite:rdRef(v)+" ("+src.join(" · ")+")" };
  }
  function openVerse(v){
    vsCur=v;
    var t=verseText(v), key=rd.b+":"+rd.c+":"+v;
    el("vsRef").textContent=rdRef(v);
    el("vsText").textContent=t.body;
    el("vsMarkTxt").textContent = savedSet("user:bookmarks")[key] ? "Remove bookmark" : "Bookmark";
    el("vsHlTxt").textContent = savedSet("user:highlights")[key] ? "Remove highlight" : "Highlight";
    openSheet("verseSheet");
  }
  function vsNode(){ return el("rdBody").querySelector('.vs[data-v="'+vsCur+'"]'); }
  el("vsCopy").addEventListener("click", function(){
    var t=verseText(vsCur); copyText(t.body+"\n— "+t.cite, function(){ toast("Copied"); }); closeLayer();
  });
  el("vsShare").addEventListener("click", function(){
    var t=verseText(vsCur); closeLayer(); shareText(t.body+"\n— "+t.cite, rdRef(vsCur));
  });
  el("vsMark").addEventListener("click", function(){
    var on=toggleSaved("user:bookmarks", vsCur), n=vsNode(); if(n) n.classList.toggle("bm", on);
    closeLayer(); toast(on ? "Bookmarked" : "Bookmark removed");
  });
  el("vsHl").addEventListener("click", function(){
    var on=toggleSaved("user:highlights", vsCur), n=vsNode(); if(n) n.classList.toggle("hl", on);
    closeLayer(); toast(on ? "Highlighted" : "Highlight removed");
  });
  function renderSaved(){
    var body=el("savedBody"); body.innerHTML="";
    [["user:bookmarks","Bookmarks","No bookmarks yet. Tap any verse to add one."],
     ["user:highlights","Highlights","No highlights yet. Tap any verse to highlight it."]].forEach(function(g){
      body.appendChild(mk("p","bkgrp",g[1]));
      var a=savedList(g[0]).slice().sort(function(p,q){ return (p.b-q.b)||(p.c-q.c)||(p.v-q.v); });
      if(!a.length){ body.appendChild(mk("p","empty",g[2])); return; }
      a.forEach(function(x){
        var row=mk("div","svrow"), go=mk("button","go");
        go.appendChild(mk("b","",ntInfo(x.b)[1]+" "+x.c+":"+x.v)); go.appendChild(mk("span","",x.s||""));
        go.addEventListener("click", function(){ closeLayer(); rd.b=x.b; rd.c=x.c; rd.v=x.v; saveRdPos(); renderReader(true, true); });
        var rm=mk("button","rm","Remove");
        rm.addEventListener("click", function(){
          jset(g[0], savedList(g[0]).filter(function(y){ return !(y.b===x.b && y.c===x.c && y.v===x.v); }));
          renderSaved(); if(rd.inited) renderReader(false);
        });
        row.appendChild(go); row.appendChild(rm); body.appendChild(row);
      });
    });
  }
  el("rdSaved").addEventListener("click", function(){ renderSaved(); openSheet("savedSheet"); });

  // distraction-free reading: only the text; Back or the ✕ returns
  el("rdFocus").addEventListener("click", function(){
    document.documentElement.classList.add("focus");
    pushLayer(function(){ document.documentElement.classList.remove("focus"); }, "focus");
  });
  el("focusExit").addEventListener("click", function(){ if(topKind()==="focus") closeLayer(); else document.documentElement.classList.remove("focus"); });

  // Saving the New Testament for reading offline is now in Settings → Offline reading (85-offline.js).

