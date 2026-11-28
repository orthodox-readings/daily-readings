  // ---------- Parish supplement: ROCOR commemorations the upstream data lacks ----------
  // Every entry is verified against OrthoChristian (the Russian-calendar reference) before
  // inclusion, keyed by the OS/menaion date, and marked ✦ in the list. If the upstream
  // source later gains the commemoration, the keyword match skips ours automatically.
  var SUPPLEMENT=[
    {m:11,d:11,t:"Myrrh-streaming “Montreal” Iveron Icon of the Theotokos (1982)",k:"iveron"},
    {m:10,d:20,t:"St Gabriel (Urgebadze), archimandrite, of Mtskheta, Georgia (1995)",k:"urgebadze"},
    {m:5,d:29,t:"New Hiero-confessor Luke (Voino-Yasenetsky), archbishop of Simferopol (1961)",k:"simferopol"},
    {m:6,d:29,t:"St Paisios the Athonite (1994)",k:"paisios"},
    {m:11,d:19,t:"St Porphyrios of Kavsokalyvia (1991)",k:"porphyri"},
    {m:2,d:13,t:"St Seraphim (Sobolev), archbishop of Bogucharsk (1950)",k:"sobolev"}
  ];
  function supplementFor(civilDate, existing){
    var md=menaionOf(civilDate), mm=md.getMonth()+1, dd=md.getDate();
    var hay=(existing||[]).join(" ").toLowerCase();
    var out=[];
    SUPPLEMENT.forEach(function(s){
      if(s.m===mm && s.d===dd && hay.indexOf(s.k)<0) out.push(s.t);
    });
    return out;
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

