  // ---------- ROCOR commemorations the upstream data lacks ----------
  // The day's data comes from orthocal.info, whose Slavic tradition is maintained against the OCA's calendar. Kept here,
  // by Old Style date, are commemorations of the ROCOR calendar that it lacks. "src" says where each one is confirmed:
  //   rocor  — a ROCOR diocesan calendar or ROCOR publication (named in the ROCOR discrepancy report)
  //   parish — the parish supplement prepared for Holy Dormition, Corrimal, to be confirmed by Fr Dionysios
  // If the daily data later gains the commemoration, the keyword match skips ours automatically.
  var SUPPLEMENT=[
    {m:10,d:22,t:"Kazan Icon of the Mother of God",k:"kazan",src:"rocor",feast:true},
    {m:11,d:27,t:"Kursk Root Icon of the Mother of God “of the Sign”, Hodegetria of the Russian Diaspora",k:"kursk",src:"rocor",feast:true},
    {m:11,d:11,t:"Myrrh-streaming “Montreal” Iveron Icon of the Theotokos (1982)",k:"iveron",src:"parish"},
    {m:10,d:20,t:"St Gabriel (Urgebadze), archimandrite, of Mtskheta, Georgia (1995)",k:"urgebadze",src:"parish"},
    {m:5,d:29,t:"New Hiero-confessor Luke (Voino-Yasenetsky), archbishop of Simferopol (1961)",k:"simferopol",src:"parish"},
    {m:6,d:29,t:"St Paisios the Athonite (1994)",k:"paisios",src:"parish"},
    {m:11,d:19,t:"St Porphyrios of Kavsokalyvia (1991)",k:"porphyri",src:"parish"},
    {m:2,d:13,t:"St Seraphim (Sobolev), archbishop of Bogucharsk (1950)",k:"sobolev",src:"parish"}
  ];
  var SUPP_SRC = { rocor:"ROCOR calendar", parish:"parish supplement" };
  // The Synaxis of the New Martyrs and Confessors of the Russian Church: the Sunday closest to 25 January (Old Style),
  // as ROCOR keeps it (25 January itself when it is a Sunday).
  function newMartyrsSunday(y){
    var d=new Date(y, 0, 25+calOffsetDays()), w=d.getDay();
    return new Date(y, 0, 25+calOffsetDays() + (w===0 ? 0 : (w<4 ? -w : 7-w)));
  }
  function supplementFor(civilDate, existing){
    var md=menaionOf(civilDate), mm=md.getMonth()+1, dd=md.getDate();
    var hay=(existing||[]).join(" ").toLowerCase();
    var out=[];
    if(sameDay(newMartyrsSunday(civilDate.getFullYear()), civilDate) && hay.indexOf("new martyrs and confessors")<0)
      out.push({t:"Synaxis of the New Martyrs and Confessors of the Russian Church", src:SUPP_SRC.rocor});
    SUPPLEMENT.forEach(function(s){
      if(s.m===mm && s.d===dd && hay.indexOf(s.k)<0) out.push({t:s.t, src:SUPP_SRC[s.src], feast:!!s.feast});
    });
    return out;
  }

  // ---------- ROCOR corrections to the day's data ----------
  // Each is confirmed against a ROCOR source and listed in the ROCOR discrepancy report. The data itself is not
  // altered: what is moved is labelled, and a note on Today says what was done.
  //   1. ROCOR feasts the data lacks keep their own Epistle and Gospel (ROCOR diocesan calendar, Australia and New
  //      Zealand). On a weekday the feast's readings come first and the weekday's are listed under Other readings.
  //   2. The Sunday "Synaxis of the Holy Unmercenaries" (the Sunday after 1 November) is an OCA transfer; ROCOR keeps
  //      the Unmercenaries on 1 November (Old Style). Its title is not used as the day's headline and its readings are
  //      listed under Other readings.
  var ROCOR_FEAST_READINGS = {
    "1022": {name:"Kazan Icon", kw:"kazan", feast:true, readings:[
      {source:"Matins Gospel", desc:"Kazan Icon", display:"Luke 1:39-49, 56"},
      {source:"Epistle", desc:"Kazan Icon", display:"Philippians 2:5-11"},
      {source:"Gospel", desc:"Kazan Icon", display:"Luke 10:38-42, 11:27-28"}]},
    "1019": {name:"St John of Kronstadt", kw:"kronstadt", feast:false, readings:[
      {source:"Epistle", desc:"St John of Kronstadt", display:"1 John 4:7-11"},
      {source:"Gospel", desc:"St John of Kronstadt", display:"Luke 6:31-36"}]}
  };
  var ROCOR_READ_SRC = "diocesan calendar (Australia and New Zealand)";
  // Memorials of the repose of revered people in the source data (from the Lives it carries) that are not
  // commemorations of glorified saints.
  var MEMORIAL_RX = /^repose of (gerontissa|photios kontoglou|fr\.? |father |hieromonk seraphim \(rose\)|archimandrite )/i;
  function isMemorialOnly(t){ return MEMORIAL_RX.test(String(t||"").trim()); }
  function rocorAdjust(data, civilDate){
    if(!data || typeof data!=="object") return {data:data, notes:[]};
    if(data.__rocor) return {data:data, notes:data.__rocor.notes};
    var md=menaionOf(civilDate), k=mmdd(md), dow=dayOnly(civilDate).getDay(), notes=[];
    var d={}; for(var p in data) d[p]=data[p];
    var rs=(Array.isArray(data.readings) ? data.readings : []).map(function(r){ var o={}; for(var q in r) o[q]=r[q]; return o; });
    // 1. ROCOR feasts with their own readings
    var fr=ROCOR_FEAST_READINGS[k];
    if(fr){
      var has=rs.some(function(r){ return String(r.desc||"").toLowerCase().indexOf(fr.kw)>-1; });
      if(!has){
        var add=fr.readings.map(function(r){ return {source:r.source, desc:r.desc, display:r.display, supp:true, suppSrc:ROCOR_READ_SRC}; });
        if(fr.feast && dow!==0){
          rs.forEach(function(r){ if(/^(epistle|gospel)$/i.test(String(r.source||"").trim()) && !r.desc){ r.demoted=true; r.demotedNote="of the weekday"; } });
          rs = add.concat(rs);
          notes.push("ROCOR keeps the "+fr.name+" with a vigil: the diocesan calendar gives the feast’s Epistle and Gospel, shown first. The weekday’s readings are under Other readings.");
        } else {
          rs = rs.concat(add);
          notes.push("The readings for "+fr.name+" are added from the ROCOR diocesan calendar.");
        }
      }
    }
    // 2. The OCA's Sunday Synaxis of the Unmercenaries
    var rx=/synaxis of the holy unmercenaries/i;
    var titles=Array.isArray(data.titles) ? data.titles.slice() : [], feasts=Array.isArray(data.feasts) ? data.feasts.slice() : [];
    var isFloat = k!=="1101" && (rx.test(d.summary_title||"") || titles.some(function(t){ return rx.test(t); }) || feasts.some(function(f){ return rx.test(typeof f==="string" ? f : (f && (f.title||f.name||f.feast_name))||""); }));
    if(isFloat){
      d.titles = titles.filter(function(t){ return !rx.test(t); });
      d.feasts = feasts.filter(function(f){ return !rx.test(typeof f==="string" ? f : (f && (f.title||f.name||f.feast_name))||""); });
      if(rx.test(d.summary_title||"")){
        var sts=(Array.isArray(data.saints) ? data.saints : []).map(function(x){ return typeof x==="string" ? x : (x && (x.title||x.name))||""; }).filter(Boolean);
        d.summary_title = d.titles[0] || sts[0] || "";
      }
      rs.forEach(function(r){ if(/unmercenaries/i.test(String(r.desc||""))){ r.demoted=true; r.demotedNote="the OCA’s Sunday transfer — not in the ROCOR calendar"; } });
      notes.push("ROCOR keeps the Holy Unmercenaries on 1 November (Old Style). The source calendar’s Sunday “Synaxis of the Holy Unmercenaries” is an OCA transfer, so it is not used as the day’s title and its readings are under Other readings.");
    }
    d.readings = rs;
    d.__rocor = {notes:notes};
    return {data:d, notes:notes};
  }
  // The King James text of a supplementary reading, from the bundled New Testament
  function fillPassageKJV(txt, r, seq){
    var pr=parseRef(r.display);
    txt.innerHTML=""; var wait=mk("div","none","Loading the King James text…"); txt.appendChild(wait);
    if(!pr || pr.book<40){ wait.textContent="Full text not provided — see the reference above."; return; }
    fetchBookFile("kjv", kjvMem, pr.book).then(function(book){
      if(seq!==state.renderSeq) return;
      var passage=[];
      pr.segs.forEach(function(sg){
        var ch=book[String(sg.c)]||{}, last=sg.b<0 ? Object.keys(ch).length : sg.b;
        for(var v=sg.a; v<=last; v++){ if(ch[String(v)]) passage.push({verse:v, content:ch[String(v)]}); }
      });
      r.passage = passage;
      renderPassageKJV(txt, r);
    }).catch(function(){ if(seq===state.renderSeq) wait.textContent="The text could not be loaded — see the reference above."; });
  }

  // ---------- Prologue of Ohrid (Lazarica Press translation, hosted by Holy Myrrh-bearers;
  //            pages are keyed by the OS/menaion date, so the link follows the nominal day in either mode) ----------
  var PRO_MONTHS=["january","february","march","april","may","june","july","august","september","october","november","december"];
  function prologueURL(d){
    var m=menaionOf(d);
    return "https://www.myrrh-bearers.org/prologue/"+PRO_MONTHS[m.getMonth()]+"/"+m.getDate()+".htm";
  }

  function htmURL(d){
    // HTM's calendar is OS-keyed by civil date: on New Calendar, shift so its OS content matches the viewed menaion day
    var h = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (13 - calOffsetDays()));
    return "https://www.holytrinityorthodox.com/calendar/calendar.php?month="+(h.getMonth()+1)+
      "&today="+h.getDate()+"&year="+h.getFullYear()+"&dt=1&header=1&lives=1&trp=1&scripture=1";
  }

  // ---------- Azbyka daily service texts (Church Slavonic; OS civil-date keyed) ----------
  function azbykaURL(d){
    var m=String(d.getMonth()+1); if(m.length<2) m="0"+m;
    var da=String(d.getDate()); if(da.length<2) da="0"+da;
    return "https://azbyka.ru/worships/?date="+d.getFullYear()+"-"+m+"-"+da;
  }
  function renderAzbyka(){
    // Azbyka assembles the whole day (movable + fixed cycles) on the Old Calendar — the calendar this app follows.
    show(el("azbykaCard"), true);
    el("azbykaLink").setAttribute("href", azbykaURL(state.date));
  }

