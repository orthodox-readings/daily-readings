"""Verification tool (not part of the app). A port of orthocal-python's Slavic fasting decision
(calendarium/fasting.py and SlavicDay; github.com/brianglass/orthocal-python, MIT licence, Brian Glass),
fed with that project's own fixture rows, so that the app's ROCOR rule can be compared with orthocal.info
day by day. Floats are ignored (none carries a fasting claim in the Slavic data).
It reproduced all 62 orthocal.info day pages read on 28 Nov 2026 (orthocal_live_2026-11-28.json).

  1. From a checkout of orthocal-python, export fixtures/calendarium.json into two files:
     orthocal_fixed.json   {"M/D": [feast_level, fast, fast_exception, fast_cap_exempt]}  (common + slavic rows merged)
     orthocal_movable.json {"pdist": [feast_level, fast, fast_exception, fast_cap_exempt, title]}
  2. python3 orthocal_port.py orthocal_fixed.json orthocal_movable.json 2026 2027 out.json
Output: JSON {iso: [rung, exc_index, fast_level]}; rungs 0 strict, 1 wine, 2 oil, 3 caviar, 4 fish, 5 meat, 6 free."""
import json, sys, datetime as dt
FIX = json.load(open(sys.argv[1]))      # orthocal_fixed.json   "m/d": [lvl, fast, exc, capx]
MOV = json.load(open(sys.argv[2]))      # orthocal_movable.json "pdist": [lvl, fast, exc, capx, title]
STRICT, WINE, OIL, CAVIAR, FISH, MEAT, FREE = range(7)
RUNG = {0:STRICT,1:OIL,2:FISH,3:OIL,4:FISH,5:WINE,6:CAVIAR,7:MEAT,8:OIL,9:STRICT,10:STRICT,11:FREE}
CANON = {STRICT:0, WINE:5, OIL:1, CAVIAR:6, FISH:2, MEAT:7, FREE:11}
CAP_IDX=(5,9,10); CLAIMLESS=(0,9,10)
SUN,MON,TUE,WED,THU,FRI,SAT = range(7)
class Season:
    def __init__(s, floor=None, default_floor=STRICT, cap=None, default_cap=FREE, cap_exempt_rank=99, nfbn=False):
        s.floor=floor or {}; s.df=default_floor; s.cap=cap or {}; s.dc=default_cap; s.cxr=cap_exempt_rank; s.nfbn=nfbn
    def floor_for(s,w): return s.floor.get(w,s.df)
    def cap_for(s,w,lvl): return FREE if lvl>=s.cxr else s.cap.get(w,s.dc)
ORD = Season(floor={SAT:OIL,SUN:OIL})
NOF = Season()
LENT = Season(default_cap=OIL, cap_exempt_rank=7)
DORM = Season(floor={SAT:OIL,SUN:OIL}, default_cap=STRICT, cap_exempt_rank=7)
F33 = {MON:STRICT,TUE:OIL,WED:STRICT,THU:OIL,FRI:STRICT,SAT:FISH,SUN:FISH}
C33 = {WED:OIL,FRI:OIL,SAT:FISH,SUN:FISH}
APO = Season(floor=F33, cap=C33, cap_exempt_rank=4)
NAT = Season(floor=F33, cap=C33, cap_exempt_rank=4, nfbn=True)
BY = {0:NOF,1:ORD,2:LENT,3:APO,4:DORM,5:NAT}

def pascha_civil(y):
    a=y%4; b=y%7; c=y%19; d=(19*c+15)%30; e=(2*a+4*b-d+34)%7
    mo=(d+e+114)//31; da=((d+e+114)%31)+1
    return dt.date(y,mo,da)+dt.timedelta(days=13)
def julian_md(g):  # 1900-2099: Julian = civil - 13 days
    j=g-dt.timedelta(days=13); return j.month, j.day, j.year
def pdist_of(g):
    jm,jd,jy=julian_md(g); y=jy
    d=(g-pascha_civil(y)).days
    if d<-77: y-=1; d=(g-pascha_civil(y)).days
    return d,y
def jul_to_civil(y,m,d): return dt.date(y,m,d)+dt.timedelta(days=13)
def day(g):
    pdist,py=pdist_of(g); jm,jd,_=julian_md(g)
    P=pascha_civil(py)
    nativity=(jul_to_civil(py,12,25)-P).days
    theophany=(jul_to_civil(py+1,1,6)-P).days
    pp=(jul_to_civil(py,6,29)-P).days
    rows=[]  # (lvl, fast, exc, capx, festal)
    if str(pdist) in MOV: r=MOV[str(pdist)]; rows.append((r[0],r[1],r[2],r[3],False))
    k=f"{jm}/{jd}"
    if k in FIX: r=FIX[k]; rows.append((r[0],r[1],r[2],r[3],True))
    if not rows: rows=[(0,0,0,0,False)]
    lvl=max(r[0] for r in rows)
    excs=[r[2] for r in rows]
    # fast level
    if 11 in excs: fl=0
    elif 56<pdist<pp: fl=3
    else: fl=max(r[1] for r in rows)
    if 11 in excs: return FREE, 11, fl
    season=BY.get(fl)
    w=pdist%7
    no_fish = season.nfbn and (nativity-6 < pdist < nativity-1)
    eve = pdist in (nativity-1, theophany-1)
    festal={}
    for r in rows: festal[r[2]]=r[4]
    capx=any(r[3] for r in rows)
    claims=[(i,RUNG[i]) for i in excs if i not in CLAIMLESS]
    caps=[(i,RUNG[i]) for i in excs if i in CAP_IDX]
    for i,c in claims:
        if c==FREE: return FREE,i,fl
    allow=season.floor_for(w); winner=None
    scap=season.cap_for(w,lvl)
    for i,c in claims:
        exempt = capx or not festal.get(i,True)
        cap = FREE if exempt else scap
        cl = c if (c==CAVIAR and cap>=OIL) else min(c,cap)
        if cl>allow: allow,winner=cl,(i if cl==c else None)
    for i,c in caps:
        if c<allow: allow,winner=c,i
        elif c==allow and winner is None: winner=i
    if no_fish: allow=min(allow,OIL); winner=None
    if eve and w in (SAT,SUN) and allow<OIL: allow=OIL; winner=None
    return allow, (winner if winner is not None else CANON[allow]), fl
out={}
g=dt.date(int(sys.argv[3]),1,1); end=dt.date(int(sys.argv[4]),12,31)
while g<=end:
    out[g.isoformat()]=list(day(g)); g+=dt.timedelta(days=1)
json.dump(out, open(sys.argv[5],'w'))
print(len(out),"days")
