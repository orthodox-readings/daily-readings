# Builds greek-pt/{book}.json ({chapter:{verse:text}}) from the Antoniades 1904/1912 Patriarchal
# Edition as transcribed by Maurice A. Robinson & Jussi Ala-Konni (github.com/byztxt/greektext-antoniades,
# public domain). The source is unaccented lower-case Greek with punctuation; small-type passages are
# in [brackets], 1 Jn 5:7b-8a in [[double brackets]]. Nothing is altered.
import re, json, sys, os, unicodedata
src, rpdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
F=["MT","MR","LU","JOH","AC","RO","1CO","2CO","GA","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JO","2JO","3JO","JUDE","RE"]
os.makedirs(out,exist_ok=True)
tot=0; only_pt=[]; only_rp=[]
for i,f in enumerate(F):
    n=40+i; book={}
    for line in open(os.path.join(src,f+".txt"),encoding="utf-8"):
        line=line.strip()
        if not line: continue
        if re.match(r"^\d+:\d+$",line): continue          # verse lacking in this edition (Mk 7:16)
        # one source line can carry a second verse marker inline (Jn 4:1/4:2) - split on it
        parts=re.split(r"(\d+:\d+)",line)
        if parts[0].strip(): print("UNPARSED",f,line[:60]); continue
        for j in range(1,len(parts),2):
            c,v=parts[j].split(":")
            t=unicodedata.normalize("NFC",re.sub(r"\s+"," ",parts[j+1]).strip())
            if not t: continue
            if v in book.setdefault(c,{}): print("DUP",f,c,v)
            book[c][v]=t; tot+=1
    if n==45:   # Romans: the doxology stands at 14:24-26 in this edition; repeat it at 16:25-27 so
                # readings cited by the KJV numbering find it (same treatment as the R-P files)
        for a,b in (("24","25"),("25","26"),("26","27")): book["16"][b]=book["14"][a]
    json.dump(book,open(os.path.join(out,"%d.json"%n),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
    rpch=sorted(int(x[:-5]) for x in os.listdir(os.path.join(rpdir,str(n))))
    if rpch!=sorted(int(c) for c in book): print("CHAPTERS DIFFER",f,len(rpch),len(book))
    for c in rpch:
        rp=json.load(open(os.path.join(rpdir,str(n),"%d.json"%c)))
        pt=book.get(str(c),{})
        for v in pt:
            if v not in rp: only_pt.append("%s %d:%s"%(f,c,v))
        for v in rp:
            if v not in pt: only_rp.append("%s %d:%s"%(f,c,v))
print("verses",tot); print("only in Patriarchal:",only_pt); print("only in R-P:",only_rp)
