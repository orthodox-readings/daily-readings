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

  // ---------- Liturgical colour of the day — ROCOR practice ----------
  // Follows the "Liturgical Handbook of the Russian Orthodox Church Abroad" (Diocese of Great Britain and Western Europe,
  // ROCOR) — the only ROCOR colour guide found. The handbook itself notes "certain limited variations on these colours
  // even within the Church Abroad", so a parish may differ. Gold is the colour of ordinary days outside a fast.
  // Returns {key, basis}: basis "feast" (a feast or holy day), "season" (Lent, Pascha, a fasting season),
  // "saint" (from the day's headline commemoration) or "ordinary" (gold).
  // Fixed-date colours by Old Style date, [from MMDD, to MMDD, colour] — the first match wins.
  var LIT_FIXED = [
    [1226,1226,"blue"],                       // Synaxis of the Theotokos (handbook: Synaxis — blue)
    [1224,1231,"white"],                      // Nativity of Christ, from the Eve to the leavetaking
    [101,101,"white"],                        // Circumcision
    [105,114,"white"],                        // Theophany, from the Eve to the leavetaking
    [201,209,"blue"],                         // Meeting of the Lord, forefeast to leavetaking
    [324,326,"blue"],                         // Annunciation, forefeast to afterfeast
    [801,801,"red"],                          // Procession of the Cross
    [805,813,"white"],                        // Transfiguration, from the Eve to the leavetaking
    [814,823,"blue"],                         // Dormition, forefeast to leavetaking
    [907,912,"blue"],                         // Nativity of the Theotokos, forefeast to leavetaking
    [913,921,"red"],                          // Exaltation of the Cross, forefeast to leavetaking
    [1001,1001,"blue"],                       // Protection of the Theotokos
    [1022,1022,"blue"],                       // Kazan Icon of the Mother of God
    [1120,1125,"blue"],                       // Entry of the Theotokos, forefeast to leavetaking
    [1127,1127,"blue"],                       // Kursk Root Icon of the Mother of God
    [624,624,"red"], [829,829,"red"], [923,923,"red"], [224,224,"red"], [525,525,"red"],   // the Forerunner
    [1108,1108,"red"], [906,906,"red"], [713,713,"red"],                                   // the Archangels
    [629,630,"gold"]                                                                         // the Apostles
  ];
  // Colour from the day's headline commemoration (when the day's data names a saint or feast)
  function saintColour(head){
    head=String(head||"");
    if(!head) return null;
    var named=/\b(st|sts|saint|ven|venerable|martyr|hieromartyr|greatmartyr|apostle|prophet|icon|theotokos|mother of god|righteous|blessed|archangel|forerunner|baptist|cross|confessor|hierarch|wonderworker|equal)/i.test(head);
    if(!named) return null;                                   // "Tuesday of the 27th week after Pentecost" and the like
    if(/theotokos|mother of god|most holy lady|\bicon\b/i.test(head)) return "blue";
    if(/\bcross\b|forerunner|baptist|archangel|bodiless|martyr|passion-?bearer/i.test(head)) return "red";
    if(/\bven\b|\bven\.|venerable|abbot|abbess|hermit|ascetic|recluse|stylite|fool[- ]for[- ]christ/i.test(head)) return "green";
    return "gold";                                            // apostles, prophets, hierarchs, the righteous
  }
  function litInfo(d, data){
    var t=dayOnly(d), y=t.getFullYear(), P=paschaCivil(y), diff=Math.round((t-P)/86400000), dow=t.getDay();
    var md=menaionOf(t), x=(md.getMonth()+1)*100+md.getDate();
    var head=(data && (data.summary_title || (data.titles&&data.titles[0]))) || "";
    function r(k,b){ return {key:k, basis:b}; }
    // Holy Week, Lazarus Saturday and Palm Sunday
    if(diff===-8 || diff===-7) return r("green","feast");
    if(diff>=-6 && diff<=-1){
      if(x===325) return r("blue","feast");                  // the Annunciation in Holy Week: the feast day itself
      if(diff===-3) return r("red","feast");                 // Great Thursday: red at the Liturgy
      return r("black","season");                            // Great Saturday: black until the Apostle, then white
    }
    // Pascha to the leavetaking; Ascension to the leavetaking; Pentecost to the leavetaking
    if(diff>=0 && diff<=38) return r("white","season");
    if(diff>=39 && diff<=47) return r("white","feast");
    if(diff>=49 && diff<=55) return r("green","feast");
    // Great Lent: black on weekdays, purple at weekends and on polyeleos feasts
    if(diff>=-48 && diff<=-9){
      if(x>=324 && x<=326) return r("blue","feast");
      if(diff===-42 || diff===-28) return r("red","feast");  // Triumph of Orthodoxy; Sunday of the Cross
      if(diff===-15) return r("blue","feast");               // Saturday of the Akathist
      if(dow===0 || dow===6) return r("purple","season");
      if(LENT_CLAIM[mmdd(md)]) return r("purple","feast");               // the named polyeleos feasts of Lent
      return r("black","season");
    }
    for(var i=0;i<LIT_FIXED.length;i++){ if(x>=LIT_FIXED[i][0] && x<=LIT_FIXED[i][1]) return r(LIT_FIXED[i][2],"feast"); }
    var sc=saintColour(head);
    // The fasting seasons: red (the Apostles' Fast keeps gold at weekends; the Dormition Fast until the Eve of the Transfiguration)
    if(x>=1115 && x<=1223) return sc ? r(sc,"saint") : r("red","season");
    if(x>=801 && x<=804) return sc ? r(sc,"saint") : r("red","season");
    if(inApostlesFast(t)) return sc ? r(sc,"saint") : ((dow===0||dow===6) ? r("gold","season") : r("red","season"));
    if(sc) return r(sc,"saint");
    return r("gold","ordinary");
  }
  function liturgicalKey(d, data){ return litInfo(d, data).key; }
  function applyLit(info){
    var key=info.key;
    document.documentElement.setAttribute("data-lit", key);
    show(el("litRow"), !!LIT_NAME[key]);
    if(!LIT_NAME[key]) return;
    var t0=dayOnly(state.date), diff=Math.round((t0-paschaCivil(t0.getFullYear()))/86400000);
    el("litText").textContent = LIT_NAME[key] + (diff===-1 ? " — white from the Liturgy" : (diff===-3 ? " at the Liturgy" : ""));
    var dot=el("litDot"); dot.style.background = LIT_DOT[key]; dot.classList.toggle("blk", key==="black");
  }

  // ---------- Fasting: the rule of the day — ROCOR ----------
  // The Typikon (chapters 32–33) as kept in the Russian Orthodox Church Outside of Russia. Where the sources this was
  // checked against differ, the choice made here and the reason are recorded in the ROCOR discrepancy report.
  //   Levels, strictest first: strict (no wine or oil — xerophagy or food without oil, as the day requires) · wine (wine,
  //   no oil: Great Saturday) · oil (wine and oil) · caviar (wine, oil and caviar: Lazarus Saturday) · fish (fish, wine and
  //   oil) · meat (meat excluded: Cheesefare week) · free (no fast).
  // It is the Church's general norm. It does not apply in the same way to everyone, and a parish or monastery may keep a
  // feast with greater solemnity; personal fasting should be guided by one's spiritual father.
  var FAST_LV = {strict:0, wine:1, oil:2, caviar:3, fish:4, meat:5, free:6};
  function mmdd(md){ return ("0"+(md.getMonth()+1)).slice(-2)+("0"+md.getDate()).slice(-2); }
  // Feasts that lift an ordinary Wednesday or Friday (and the fasts' own named days), by Old Style date.
  // "f" fish, wine and oil · "o" wine and oil. Great feasts and vigil-rank saints take fish; polyeleos-rank saints wine
  // and oil (Holy Trinity calendar shown by Jordanville, as sampled; see the report). Checked against orthocal.info's
  // Slavic data, whose OCA-only allowances (27 Feb, 31 Mar, 7 Apr, 7 May, 26 Jul, 9 Aug, 24 Sep, 9 Oct) are not used.
  var CLAIM = {
    "0107":"f Synaxis of St John the Baptist", "0114":"f Leavetaking of Theophany · St Sava of Serbia",
    "0117":"f St Anthony the Great", "0120":"f St Euthymius the Great", "0130":"f the Three Holy Hierarchs",
    "0202":"f the Meeting of the Lord", "0224":"o the Finding of the Head of St John the Baptist",
    "0309":"o the Forty Martyrs of Sebaste", "0324":"o the Forefeast of the Annunciation", "0325":"f the Annunciation",
    "0326":"o the Synaxis of the Archangel Gabriel", "0423":"o the Great Martyr George", "0425":"o the Apostle Mark",
    "0508":"f the Apostle John the Theologian", "0511":"f Sts Cyril and Methodius", "0624":"f the Nativity of St John the Baptist",
    "0629":"f the Apostles Peter and Paul", "0705":"f the Finding of the Relics of St Sergius of Radonezh",
    "0715":"f St Vladimir, Equal-to-the-Apostles", "0720":"f the Prophet Elijah", "0806":"f the Transfiguration",
    "0815":"f the Dormition of the Theotokos", "0816":"o the Image of Christ Not Made by Hands", "0828":"o St Job of Pochaev",
    "0901":"o the Church New Year", "0908":"f the Nativity of the Theotokos", "0912":"o the Leavetaking of the Nativity of the Theotokos",
    "0913":"o the Forefeast of the Exaltation", "0923":"o the Conception of St John the Baptist", "0925":"f St Sergius of Radonezh",
    "0926":"f the Apostle John the Theologian", "0928":"o St Chariton the Confessor", "1001":"f the Protection of the Theotokos",
    "1006":"f the Apostle Thomas", "1022":"f the Kazan Icon of the Mother of God (ROCOR: kept with a vigil)",
    "1026":"f the Great Martyr Demetrius", "1108":"f the Synaxis of the Archangel Michael", "1113":"f St John Chrysostom",
    "1114":"o the Apostle Philip"
  };
  // Polyeleos-rank commemorations (Old Style): wine and oil when they fall on an ordinary Wednesday or Friday, or on
  // a Wednesday or Friday of the Apostles' Fast (Typikon ch. 33).
  var POLY = {};
  ("0109 0110 0111 0124 0125 0127 0209 0212 0214 0217 0304 0406 0430 0502 0503 0509 0510 0519 0521 0525 0610 0611 " +
   "0615 0616 0619 0626 0630 0703 0710 0717 0719 0724 0826 0830 0911 0921 1018 1205 1220").split(" ").forEach(function(k){ POLY[k]=1; });
  // Great Lent: the named weekday allowances (wine and oil; the Annunciation fish). Holy Week and the first week keep
  // no allowance but the Annunciation's on Great Thursday.
  var LENT_CLAIM = { "0224":"o", "0309":"o", "0324":"o", "0326":"o", "0423":"o", "0425":"o" };
  // The Nativity Fast's ranked days (Typikon ch. 33 and its instruction under 14 November, as applied in a ROCOR parish's
  // published day-by-day table): "v" fish on any day · "d" fish on Tuesday, Thursday and at the weekend, wine and oil on
  // Monday, Wednesday and Friday. From 20 December (Old Style) no fish, even at the weekend.
  var NAT_RANK = {
    "1116":"d the Apostle Matthew", "1121":"v the Entry of the Theotokos into the Temple", "1124":"d the Great Martyr Catherine",
    "1125":"d the Leavetaking of the Entry", "1127":"v the Kursk Root Icon of the Mother of God (ROCOR)",
    "1130":"d the Apostle Andrew the First-called", "1204":"d the Great Martyr Barbara", "1205":"d St Sabbas the Sanctified",
    "1206":"v St Nicholas the Wonderworker", "1209":"d the Conception of the Theotokos by St Anna", "1212":"d St Spyridon",
    "1213":"v St Herman of Alaska", "1217":"d the Prophet Daniel and the Three Holy Youths",
    "1220":"d St Ignatius the God-bearer · St John of Kronstadt"
  };
  function inApostlesFast(t){
    var P=paschaCivil(t.getFullYear()), ap=new Date(P.getFullYear(),P.getMonth(),P.getDate()+57);
    var md=menaionOf(t), x=(md.getMonth()+1)*100+md.getDate();
    return t>=ap && x>=500 && x<=628;
  }
  var WEEKDAY_OF = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  function fastRule(d){
    var t=dayOnly(d), y=t.getFullYear(), P=paschaCivil(y), diff=Math.round((t-P)/86400000), dow=t.getDay();
    var md=menaionOf(t), x=(md.getMonth()+1)*100+md.getDate(), k=mmdd(md);
    var weekend=(dow===0||dow===6), wedfri=(dow===3||dow===5);
    var feast=feastOn(t);
    function res(lv, season, name, why, f){
      return {lv:lv, f:f, fish:(lv==="fish"||lv==="meat"), wineOil:(lv==="oil"||lv==="caviar"), season:season, name:name,
              why:why||"", feast:feast};
    }
    function claimOf(table){ var c=table[k]; return c ? {lv:(c.charAt(0)==="f"?"fish":"oil"), why:c.slice(2)} : null; }
    // 1. The fast-free periods
    if(diff>=0 && diff<=6)     return res("free","free","Bright Week","",0);
    if(diff>=50 && diff<=55)   return res("free","free","Trinity Week","",0);
    if(diff>=-69 && diff<=-64) return res("free","free","Week of the Publican and the Pharisee","",0);
    if(x>=1225 || x<=104)      return res("free","free","Christmastide","",0);
    if(x===106)                return res("free","free","Theophany","",0);
    // 2. Cheesefare week: meat only is given up, every day
    if(diff>=-55 && diff<=-49) return res("meat","cheesefare","Cheesefare Week","",1);
    // 3. Great Lent and Holy Week
    if(diff>=-48 && diff<=-1){
      var nm = diff>=-6 ? "Holy Week" : (diff===-8 ? "Lazarus Saturday" : (diff===-7 ? "Palm Sunday" : "Great Lent"));
      var lv = weekend ? "oil" : "strict", why = weekend ? (dow===6 ? "Saturday" : "Sunday") : "";
      if(diff===-17){ lv="oil"; why="Thursday of the Great Canon"; }
      if(diff===-8){ lv="caviar"; why="Lazarus Saturday"; }
      if(diff===-7){ lv="fish"; why="Palm Sunday"; }
      if(diff===-3){ lv="oil"; why="Great Thursday"; }
      var noOverrides = (diff>=-48 && diff<=-44) || (diff>=-6 && diff<=-4) || diff===-2;
      if(!noOverrides && diff!==-1){
        if(x===325 && FAST_LV.fish>FAST_LV[lv]){ lv="fish"; why="the Annunciation"; }
        else if(LENT_CLAIM[k] && FAST_LV.oil>FAST_LV[lv]){ lv="oil"; why=CLAIM[k].slice(2); }
      }
      if(noOverrides) lv="strict";
      if(diff===-1){ lv="wine"; why="Great Saturday — wine, but not oil"; }
      return res(lv, "lent", nm, why, 2);
    }
    // 4. The Apostles' Fast: from the Monday after All Saints to 28 June (Old Style)
    if(inApostlesFast(t)){
      var lvA = weekend ? "fish" : ((dow===2||dow===4) ? "oil" : "strict"), whyA = weekend ? (dow===6?"Saturday":"Sunday") : "";
      if(k==="0624"){ lvA="fish"; whyA=CLAIM[k].slice(2); }
      else if(wedfri && POLY[k]){ lvA="oil"; whyA="a saint with a polyeleos"; }
      return res(lvA, "apostles", "Apostles’ Fast", whyA, 1);
    }
    // 5. The Dormition Fast: 1–14 August (Old Style); only the Transfiguration lifts it
    if(x>=801 && x<=814){
      var lvD = weekend ? "oil" : "strict", whyD = weekend ? (dow===6?"Saturday":"Sunday") : "";
      if(x===806){ lvD="fish"; whyD="the Transfiguration"; }
      return res(lvD, "dormition", "Dormition Fast", whyD, 2);
    }
    // 6. The Nativity Fast: 15 November – 24 December (Old Style)
    if(x>=1115 && x<=1224){
      if(x===1224) return res(weekend ? "oil" : "strict", "nativity", "Eve of the Nativity of Christ", weekend ? "the Eve falls on a "+WEEKDAY_OF[dow] : "", 2);
      var late = x>=1220;                                     // from 20 December: no fish, even at the weekend
      var lvN = weekend ? (late ? "oil" : "fish") : ((dow===2||dow===4) ? "oil" : "strict");
      var whyN = weekend ? (late ? "no fish from 20 December (Old Style)" : (dow===6?"Saturday":"Sunday")) : "";
      var rk = NAT_RANK[k];
      if(rk){
        var kind=rk.charAt(0), who=rk.slice(2);
        if(kind==="v" || weekend || dow===2 || dow===4){ lvN = late ? "oil" : "fish"; }
        else lvN = "oil";
        whyN = who;
      }
      return res(lvN, "nativity", "Nativity Fast", whyN, late ? 2 : 1);
    }
    // 7. Single fast days
    if(x===105) return res(weekend ? "oil" : "strict", "eve", "Eve of Theophany", weekend ? "the Eve falls on a "+WEEKDAY_OF[dow] : "", 2);
    if(x===829) return res("oil", "fastday", "Beheading of St John the Baptist", "a fast day, with wine and oil", 2);
    if(x===914) return res("oil", "fastday", "Exaltation of the Cross", "a fast day, with wine and oil", 2);
    // 8. Wednesdays and Fridays
    if(wedfri){
      if(diff>=7 && diff<=48) return res("fish", "paschal", "Fast day", "Paschal season", 1);
      var c=claimOf(CLAIM);
      if(c) return res(c.lv, "wedfri", "Fast day", c.why, 1);
      if(POLY[k]) return res("oil", "wedfri", "Fast day", "a saint with a polyeleos", 1);
      return res("strict", "wedfri", "Fast day", "", 1);
    }
    return res("free", "none", "No fast", "", 0);
  }
  // What each level allows, in words
  var LV_WORDS = { strict:"no wine or oil", wine:"wine allowed, no oil", oil:"wine and oil allowed",
                   caviar:"wine, oil and caviar allowed", fish:"fish, wine and oil allowed",
                   meat:"meat excluded — dairy, eggs and fish allowed", free:"" };
  // The rule as a colour category (the Calendar's key) and a plain sentence.
  function dayRule(d){
    var t=dayOnly(d), r=fastRule(t), dow=t.getDay(), cat, label;
    switch(r.lv){
      case "free":   cat="free";  label = (r.season==="free" && (dow===3||dow===5)) ? "Fast-free" : "No fast"; break;
      case "meat":   cat="fish";  label="Cheesefare week — meat excluded; dairy, eggs and fish allowed"; break;
      case "fish":   cat="fish";  label="Fast — fish, wine and oil allowed"; break;
      case "caviar": cat="wine";  label="Fast — wine, oil and caviar allowed"; break;
      case "oil":    cat="wine";  label="Fast — wine and oil allowed"; break;
      case "wine":   cat="strict"; label="Strict fast — wine allowed, no oil"; break;
      default:
        if(r.season==="wedfri"){ cat="fast"; label="Fast day — no wine or oil"; }
        else { cat="strict"; label="Strict fast — no wine or oil"; }
    }
    return {r:r, cat:cat, label:label, feast:r.feast, lv:r.lv, why:r.why, name:r.name};
  }
  // The day's fast as orthocal.info gives it (Slavic tradition, maintained against the OCA's calendar), as a level
  function sourceFast(data){
    if(!data) return null;
    var fd=String(data.fast_level_desc||data.fast_level_description||""), fx=String(data.fast_exception_desc||"");
    if(!fd && !fx) return null;
    var lv;
    if(/no fast/i.test(fd) || /fast[\s-]?free/i.test(fx)) lv="free";
    else if(/meat fast/i.test(fx)) lv="meat";
    else if(/fish/i.test(fx)) lv="fish";
    else if(/caviar/i.test(fx)) lv="caviar";
    else if(/wine and oil/i.test(fx)) lv="oil";
    else if(/wine is allowed/i.test(fx)) lv="wine";
    else lv="strict";
    var words = lv==="free" ? "no fast" : LV_WORDS[lv];
    return {lv:lv, text:(fd||"Fast")+(lv==="free" ? "" : " — "+words)};
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
  // The Saturdays of Great Lent: the 2nd, 3rd and 4th are Saturdays of the Departed (memorial Saturdays)
  var LENT_SATURDAYS = {1:"St Theodore the Recruit", 2:"Saturday of the Departed", 3:"Saturday of the Departed", 4:"Saturday of the Departed", 5:"the Saturday of the Akathist"};
  // Demetrius Saturday: the Saturday before the feast of St Demetrius (26 October, Old Style)
  function isDemetriusSaturday(t){
    var d26=new Date(t.getFullYear(), 9, 26+calOffsetDays());           // 26 October OS as a civil date
    var back=(d26.getDay()+1)%7; if(back===0) back=7;                      // days back to the Saturday before
    var sat=new Date(d26.getFullYear(), d26.getMonth(), d26.getDate()-back);
    return sameDay(sat, t);
  }
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
      r.label = dow===0 ? ordinal(wk)+" Sunday of Great Lent"+(LENT_SUNDAYS[wk] ? " — "+LENT_SUNDAYS[wk] : "")
              : (dow===6 && LENT_SATURDAYS[wk]) ? ordinal(wk)+" Saturday of Great Lent — "+LENT_SATURDAYS[wk]
              : ordinal(wk)+" week of Great Lent";
    } else if(diff===-8){ r.season="Lazarus Saturday"; r.fast=true; r.label="The eve of Palm Sunday";
    } else if(diff===-7){ r.season="Palm Sunday"; r.fast=true; r.label="The Entry of the Lord into Jerusalem";
    } else if(diff>=-6 && diff<=-1){ r.season="Holy Week"; r.fast=true; r.label="Great and Holy "+WEEKDAYS[dow];
    } else if(diff===0){ r.season="Pascha"; r.label="The Resurrection of Christ";
    } else if(diff>=1 && diff<=6){ r.season="Bright Week"; r.label="Bright "+WEEKDAYS[dow]+" — fast-free";
    } else if(diff>=7 && diff<=48){
      r.season="Paschal season";
      if(PASCHA_SUNDAYS[diff]) r.label=PASCHA_SUNDAYS[diff];
      else if(diff===9) r.label="Radonitsa — the Paschal commemoration of the departed";
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
      if(dow===6 && isDemetriusSaturday(t)) r.label += " — Demetrius Saturday, the Saturday of the Departed";
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
