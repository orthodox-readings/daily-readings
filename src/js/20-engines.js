  // ---------- Paschalion + feast & fast tracker (Old Calendar, civil dates, valid 1900–2099) ----------
  function paschaCivil(y){
    var a=y%4, b=y%7, c=y%19;
    var d=(19*c+15)%30, e=(2*a+4*b-d+34)%7;
    var mo=Math.floor((d+e+114)/31), da=((d+e+114)%31)+1;   // Julian-calendar date
    return new Date(y, mo-1, da+13);                        // +13 days → civil date
  }
  // Calendar reckoning: nominal (menaion) church dates + offset. Old Calendar: +13 days; New: 0.
  function calOffsetDays(){ return 13; } // Old Calendar only (civil = nominal + 13 through 2099)
  function menaionOf(d){ var o=calOffsetDays(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()-o); }
  // Fixed Great Feasts by NOMINAL (menaion) date [month, day, name]
  var FIXED_FEASTS = [
    [9,8,"Nativity of the Theotokos"],[9,14,"Exaltation of the Cross"],[11,21,"Entry of the Theotokos"],
    [12,25,"Nativity of Christ"],[1,6,"Theophany"],[2,2,"Meeting of the Lord"],[3,25,"Annunciation"],
    [6,29,"Ss Peter & Paul"],[8,6,"Transfiguration"],[8,15,"Dormition"]
  ];
  function feastsFor(y){
    var P=paschaCivil(y), off=calOffsetDays(), out=[];
    FIXED_FEASTS.forEach(function(fx){ out.push({n:fx[2], d:new Date(y, fx[0]-1, fx[1]+off)}); });
    [["Palm Sunday",-7],["Pascha",0],["Ascension",39],["Pentecost",49]].forEach(function(pf){
      out.push({n:pf[0], d:new Date(P.getFullYear(),P.getMonth(),P.getDate()+pf[1])});
    });
    return out;
  }
  function feastOn(d){
    var y=d.getFullYear(), hit=null;
    [y-1,y,y+1].forEach(function(yy){
      feastsFor(yy).forEach(function(fx){
        if(fx.d.getFullYear()===d.getFullYear() && fx.d.getMonth()===d.getMonth() && fx.d.getDate()===d.getDate()) hit=fx.n;
      });
    });
    return hit;
  }
  function seasonInfo(t, fdesc){
    var s=(fdesc||"").toLowerCase(), y=t.getFullYear();
    function dayN(start){ return Math.round((t-start)/86400000)+1; }
    if(s.indexOf("lent")>-1){
      var P=paschaCivil(y); if(P<t) P=paschaCivil(y+1);
      var st=new Date(P.getFullYear(),P.getMonth(),P.getDate()-48);
      return (t>=st) ? {name:"Great Lent", day:dayN(st)} : null;
    }
    if(s.indexOf("apostles")>-1){
      var Pp=paschaCivil(y); if(Pp>t) Pp=paschaCivil(y-1);
      var st2=new Date(Pp.getFullYear(),Pp.getMonth(),Pp.getDate()+57); // Monday after All Saints
      return (t>=st2) ? {name:"Apostles’ Fast", day:dayN(st2)} : null;
    }
    if(s.indexOf("dormition")>-1){
      var st3=new Date(y,7,1+calOffsetDays()); if(t<st3) st3=new Date(y-1,7,1+calOffsetDays());
      return {name:"Dormition Fast", day:dayN(st3)};
    }
    if(s.indexOf("nativity")>-1){
      var st4=new Date(y,10,15+calOffsetDays()); if(t<st4) st4=new Date(y-1,10,15+calOffsetDays());
      return {name:"Nativity Fast", day:dayN(st4)};
    }
    return null;
  }
  function renderTracker(fdesc){
    var t=dayOnly(state.date);
    var wrap=el("tracker"); wrap.innerHTML="";
    function chip(html, isToday){
      var c=mk("span","chip"+(isToday?" today":"")); c.innerHTML=html; wrap.appendChild(c);
    }
    var all=feastsFor(t.getFullYear()-1).concat(feastsFor(t.getFullYear()), feastsFor(t.getFullYear()+1));
    var today=null, next=null;
    all.forEach(function(fx){
      var diff=Math.round((fx.d-t)/86400000);
      if(diff===0) today=fx;
      if(diff>0 && (!next || fx.d<next.d)) next=fx;
    });
    if(today) chip("<b>"+today.n+"</b> — today", true);
    if(next){
      var nd=Math.round((next.d-t)/86400000);
      chip("Next feast: <b>"+next.n+"</b> in "+nd+(nd===1?" day":" days"));
    }
    var P=paschaCivil(t.getFullYear()); if(P<=t) P=paschaCivil(t.getFullYear()+1);
    var pd=Math.round((P-t)/86400000);
    if(pd>0) chip("Pascha in <b>"+pd+"</b> "+(pd===1?"day":"days"));
  }

  // ---------- Liturgical colour of the day (Russian/ROCOR practice; adjust the table freely) ----------
  // Colours: burgundy (no specific colour determined) · blue Theotokos · red martyrs & Paschaltide
  //          green prophets/venerables/Pentecost · violet Cross & Lent · white Lord's great feasts · gold apostles & hierarchs
  var LIT_BARS = { burgundy:"#5c161c", blue:"#1e3357", red:"#7d1518", green:"#1e4d2b",
                   violet:"#46246b", white:"#9a8a5c", gold:"#8a6a14" };
  // Fixed-feast colours by NOMINAL (menaion) date — correct on either calendar reckoning
  var LIT_FIXED = {
    blue:   [[9,8],[11,21],[3,25],[8,15],[2,2],[10,1]],          // Nat. Theotokos, Entry, Annunc., Dormition, Meeting, Protection
    white:  [[12,25],[1,6],[8,6]],                                // Nativity, Theophany, Transfiguration
    violet: [[9,14],[8,1]],                                       // Exaltation, Procession of the Cross
    red:    [[8,29]],                                             // Beheading of St John the Baptist
    gold:   [[6,29]]                                              // Ss Peter & Paul
  };
  function liturgicalKey(d, data, fdesc){
    var t=new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var P=paschaCivil(t.getFullYear());
    var diff=Math.round((t-P)/86400000);
    if(diff===-7) return "green";                                  // Palm Sunday
    if(diff>=0 && diff<39) return "red";                           // Pascha to Ascension eve (Russian: red)
    if(diff===39) return "white";                                  // Ascension
    if(diff>=49 && diff<=55) return "green";                       // Pentecost + week
    var md=menaionOf(t), mm=md.getMonth()+1, mday=md.getDate();
    for(var k in LIT_FIXED){ for(var i=0;i<LIT_FIXED[k].length;i++){
      if(mm===LIT_FIXED[k][i][0] && mday===LIT_FIXED[k][i][1]) return k; } }
    if(/lent/i.test(fdesc||"")) return "violet";                   // Lenten weekdays keep the dark colour, whoever is commemorated
    var head=String((data && (data.summary_title || (data.titles&&data.titles[0]))) || "");
    if(/theotokos|mother of god|most holy lady/i.test(head)) return "blue";
    if(/\bcross\b/i.test(head)) return "violet";
    if(/martyr/i.test(head)) return "red";
    if(/prophet/i.test(head)) return "green";
    if(/\bven\.|venerable|abbots? of|ascetic|recluse/i.test(head)) return "green";
    if(/apostle|equal-to-the-apostles/i.test(head)) return "gold";
    if(/hierarch|archbishop|metropolitan of|bishop of|wonderworker/i.test(head)) return "gold";
    return "burgundy";
  }
  function applyLit(key){
    document.documentElement.setAttribute("data-lit", key);
    // The colour is named only when the day's feast or saint determines it; otherwise the row is left out.
    var named = !!LIT_NAME[key];
    show(el("litRow"), named);
    if(named){ el("litText").textContent = LIT_NAME[key]; el("litDot").style.background = LIT_DOT[key]; }
  }

  // ---------- Fasting rule of the day (offline; the general rule — open a day for the precise fast) ----------
  // Returns {f:0|1|2, fish:bool, feast:string|null} — 0 no fast, 1 fast, 2 strict fast season/day.
  function fastRule(d){
    var y=d.getFullYear(), P=paschaCivil(y), diff=Math.round((d-P)/86400000);
    var dow=d.getDay(); // 0=Sun — weekdays are the same on either reckoning
    var md=menaionOf(d), mm=md.getMonth()+1, mday=md.getDate(); // nominal (menaion) date
    var feast=feastOn(d);
    var x=mm*100+mday;
    function mbtw(m1,d1,m2,d2){ var a=m1*100+d1, b=m2*100+d2; return (a<=b) ? (x>=a&&x<=b) : (x>=a||x<=b); }
    var weekend=(dow===0||dow===6);
    // Fast-free weeks (movable + Svyatki)
    if(diff>=0&&diff<=6)     return {f:0,fish:false,feast:feast};    // Bright Week
    if(diff>=50&&diff<=55)   return {f:0,fish:false,feast:feast};    // Trinity week
    if(diff>=-69&&diff<=-63) return {f:0,fish:false,feast:feast};    // week after Publican & Pharisee
    if(mbtw(12,25,1,4))      return {f:0,fish:false,feast:feast};    // Nativity to Theophany eve (Svyatki)
    // Cheesefare week (no meat; dairy, eggs and fish allowed)
    if(diff>=-55&&diff<=-49) return {f:1,fish:true,feast:feast};
    // Great Lent + Holy Week (strict; fish on Annunciation & Palm Sunday; wine & oil weekends & Lazarus Saturday)
    if(diff>=-48&&diff<=-1){
      var fishL=(mm===3&&mday===25)||(diff===-7);
      return {f:2,fish:fishL,wineOil:(weekend||diff===-8)&&!fishL,feast:feast};
    }
    // Dormition Fast: 1–14 August nominal (fish on Transfiguration; wine & oil weekends)
    if(mbtw(8,1,8,14)){
      var fishD=(mm===8&&mday===6);
      return {f:2,fish:fishD,wineOil:weekend&&!fishD,feast:feast};
    }
    // Apostles' Fast: Monday after All Saints (P+57) to 28 June nominal
    // (common Slavic rule: fish Tue/Thu/Sat/Sun; wine & oil Monday; Wed/Fri stricter;
    //  fish on the Nativity of the Forerunner, 24 June, whatever the weekday)
    var ap=new Date(P.getFullYear(),P.getMonth(),P.getDate()+57);
    if(d>=ap && x<=628 && mm>=5){
      var fishA=(dow===0||dow===2||dow===4||dow===6)||(mm===6&&mday===24);
      return {f:1,fish:fishA,wineOil:(dow===1)&&!fishA,feast:feast};
    }
    // Nativity Fast: 15 Nov – 24 Dec nominal (same weekday rule until 19 Dec; strict final days;
    //  fish on the Entry of the Theotokos, 21 November, whatever the weekday)
    if(mbtw(11,15,12,19)){
      var fishN=(dow===0||dow===2||dow===4||dow===6)||(mm===11&&mday===21);
      return {f:1,fish:fishN,wineOil:(dow===1)&&!fishN,feast:feast};
    }
    if(mbtw(12,20,12,24)) return {f:2,fish:false,wineOil:weekend,feast:feast};
    // One-day strict fasts
    if(mm===1&&mday===5)  return {f:2,fish:false,feast:feast};       // Eve of Theophany
    if(mm===8&&mday===29) return {f:2,fish:false,feast:"Beheading of St John the Baptist"};
    if(mm===9&&mday===14) return {f:2,fish:false,feast:feast};       // Exaltation of the Cross
    // Ordinary Wednesdays and Fridays
    if(dow===3||dow===5) return {f:1,fish:false,feast:feast};
    return {f:0,fish:false,feast:feast};
  }
  // The general rule as a colour category and a plain sentence (wraps fastRule; the rule itself is unchanged).
  function dayRule(d){
    var t=dayOnly(d), r=fastRule(t), P=paschaCivil(t.getFullYear()), diff=Math.round((t-P)/86400000), dow=t.getDay();
    var cat, label;
    if(r.f===0){ cat="free"; label=(dow===3||dow===5) ? "Fast-free" : "No fast"; }
    else if(diff>=-55 && diff<=-49){ cat="fish"; label="Cheesefare week — no meat; dairy, eggs and fish"; }
    else if(r.fish){ cat="fish"; label="Fast — fish, wine and oil allowed"; }
    else if(r.wineOil){ cat="wine"; label="Fast — wine and oil allowed"; }
    else if(r.f===2){ cat="strict"; label="Strict fast"; }
    else { cat="fast"; label="Fast day"; }
    return {r:r, cat:cat, label:label, feast:r.feast};
  }
  // The fasting season containing a civil date: {name, day, len, s, e} or null.
  function seasonOf(d){
    var t=dayOnly(d), out=null;
    yearEvents(t.getFullYear()).fasts.forEach(function(r){
      if(t>=r.s && t<=r.e) out={name:r.name, day:Math.round((t-r.s)/86400000)+1, len:Math.round((r.e-r.s)/86400000)+1, s:r.s, e:r.e};
    });
    return out;
  }


  // ---------- Liturgical season of a day (Old Calendar) ----------
  // The movable cycle follows the Paschalion; the fixed fasts, Christmastide and Theophany follow the Old Style
  // date. Week names follow the calendar's own usage (orthocal.info: "Wednesday of the Third Week of Lent",
  // "Wednesday of the 2nd Sunday of Pascha", "Wednesday of Meatfare", "Wednesday of the 26th week after Pentecost").
  // Returns {name, detail, fast, day, len}: name is the season (with "Day N of M" in a fasting season), detail the
  // week or day within it. Informational only — never a measure of keeping the fast.
  function ordinal(n){ var s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
  var WEEKDAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var PASCHA_SUNDAYS={7:"Thomas Sunday — 2nd Sunday of Pascha", 14:"3rd Sunday of Pascha — the Myrrh-bearing Women",
    21:"4th Sunday of Pascha — the Paralytic", 28:"5th Sunday of Pascha — the Samaritan Woman",
    35:"6th Sunday of Pascha — the Blind Man", 42:"7th Sunday of Pascha — the Holy Fathers of the First Council"};
  // The Sundays of Great Lent and whom they commemorate
  var LENT_SUNDAYS = {1:"the Triumph of Orthodoxy", 2:"St Gregory Palamas", 3:"the Veneration of the Cross", 4:"St John of the Ladder", 5:"St Mary of Egypt"};
  function movableWeek(t){
    var y=t.getFullYear(), P=paschaCivil(y), diff=Math.round((t-P)/86400000), dow=t.getDay();
    if(diff < -70){ P=paschaCivil(y-1); diff=Math.round((t-P)/86400000); }   // still in last year's weeks after Pentecost
    var r={diff:diff, season:"", label:"", fast:false};
    if(diff>=-70 && diff<=-49){
      r.season="Pre-Lenten weeks (Triodion)";
      if(diff===-70) r.label="Sunday of the Publican and the Pharisee";
      else if(diff<-63) r.label="Week of the Publican and the Pharisee — fast-free";
      else if(diff===-63) r.label="Sunday of the Prodigal Son";
      else if(diff===-57) r.label="Meatfare Saturday — Saturday of the Departed";
      else if(diff<-56) r.label="Meatfare week";
      else if(diff===-56) r.label="Meatfare Sunday — the Last Judgement";
      else if(diff<-49) r.label="Cheesefare week";
      else r.label="Forgiveness Sunday (Cheesefare Sunday)";
    } else if(diff>=-48 && diff<=-9){
      var wk=Math.floor((diff+48)/7)+1;
      r.season="Great Lent"; r.fast=true; r.day=diff+49; r.len=40;
      r.label = dow===0 ? ordinal(wk)+" Sunday of Great Lent"+(LENT_SUNDAYS[wk] ? " — "+LENT_SUNDAYS[wk] : "") : ordinal(wk)+" week of Great Lent";
    } else if(diff===-8){ r.season="Lazarus Saturday"; r.fast=true; r.label="The eve of Palm Sunday";
    } else if(diff===-7){ r.season="Palm Sunday"; r.fast=true; r.label="The Entry of the Lord into Jerusalem";
    } else if(diff>=-6 && diff<=-1){ r.season="Holy Week"; r.fast=true; r.label="Great and Holy "+WEEKDAYS[dow];
    } else if(diff===0){ r.season="Pascha"; r.label="The Resurrection of Christ";
    } else if(diff>=1 && diff<=6){ r.season="Bright Week"; r.label="Bright "+WEEKDAYS[dow]+" — fast-free";
    } else if(diff>=7 && diff<=48){
      r.season="Paschal season";
      if(PASCHA_SUNDAYS[diff]) r.label=PASCHA_SUNDAYS[diff];
      else if(diff===24) r.label="Mid-Pentecost";
      else if(diff===39) r.label="The Ascension of the Lord";
      else if(diff===48) r.label="Saturday of the Departed (Trinity Saturday)";
      else r.label=ordinal(Math.floor(diff/7)+1)+" week of Pascha";
    } else if(diff===49){ r.season="Pentecost"; r.label="The Holy Trinity";
    } else if(diff>=50){
      if(diff===50) r.label="Monday of the Holy Spirit";
      else if(diff===56) r.label="1st Sunday after Pentecost — All Saints";
      else if(diff===63) r.label="2nd Sunday after Pentecost — All Saints of Russia";
      else if(dow===0) r.label=ordinal((diff-49)/7)+" Sunday after Pentecost";
      else r.label=ordinal(Math.floor((diff-50)/7)+1)+" week after Pentecost";
      if(diff>=50 && diff<=55) r.label += " — fast-free week";
    }
    return r;
  }
  function liturgicalSeason(d){
    var t=dayOnly(d), mv=movableWeek(t), md=menaionOf(t), x=(md.getMonth()+1)*100+md.getDate();
    var out={name:"", detail:"", fast:false};
    function fastSeason(name){
      var so=seasonOf(t);                                   // the fasting seasons as listed in the Year view
      out.fast=true;
      if(so){ out.day=so.day; out.len=so.len; out.name=name+" — Day "+so.day+" of "+so.len; }
      else out.name=name;
    }
    // Fixed seasons first (they fall in the weeks after Pentecost, whose week becomes the detail)
    if(x>=1115 && x<=1224){ fastSeason("Nativity Fast"); out.detail = x===1224 ? "Eve of the Nativity of Christ" : mv.label; return out; }
    if(x===1225){ out.name="The Nativity of Christ"; out.detail="Christmastide — fast-free until the Eve of Theophany"; return out; }
    if(x>=1226 || x<=104){ out.name="Christmastide"; out.detail="Fast-free until the Eve of Theophany"; return out; }
    if(x===105){ out.name="Eve of Theophany"; out.detail=mv.label; out.fast=true; return out; }
    if(x===106){ out.name="The Theophany of the Lord"; out.detail=""; return out; }
    if(x>=107 && x<=114){ out.name="Afterfeast of Theophany"; out.detail=mv.label; return out; }
    if(x>=801 && x<=814){ fastSeason("Dormition Fast"); out.detail=mv.label; return out; }
    if(x===815){ out.name="The Dormition of the Theotokos"; out.detail=mv.label; return out; }
    // Apostles' Fast: from the Monday after All Saints to 28 June Old Style (it can be short, or absent)
    var y=t.getFullYear(), P=paschaCivil(y), ap=new Date(P.getFullYear(),P.getMonth(),P.getDate()+57);
    if(t>=ap && x<=628 && x>=500){ fastSeason("Apostles’ Fast"); out.detail=mv.label; return out; }
    // Movable seasons
    if(mv.season==="Great Lent"){ out.fast=true; out.day=mv.day; out.len=mv.len; out.name="Great Lent — Day "+mv.day+" of "+mv.len; out.detail=mv.label; return out; }
    if(mv.season){ out.name=mv.season; out.detail=mv.label; out.fast=mv.fast; return out; }
    out.name=mv.label; out.detail="";                     // the weeks after Pentecost
    return out;
  }
