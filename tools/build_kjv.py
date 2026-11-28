# Builds kjv/{book}.json ({chapter:{verse:text}}) for the New Testament from the eBible.org
# KJV USFX file (the same file orthocal.info serves its KJV readings from). Public domain.
import re, json, sys, os
src, kjvjson_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
IDS=["MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"]
NAMES=["Matthew","Mark","Luke","John","Acts","Romans","1Corinthians","2Corinthians","Galatians","Ephesians","Philippians","Colossians","1Thessalonians","2Thessalonians","1Timothy","2Timothy","Titus","Philemon","Hebrews","James","1Peter","2Peter","1John","2John","3John","Jude","Revelation"]
x=open(src,encoding="utf-8").read()
os.makedirs(out,exist_ok=True)
def norm(s): return re.sub(r"[^a-z]","",s.lower())
tot=0; diffs=[]
for i,bid in enumerate(IDS):
    m=re.search(r'<book id="%s">(.*?)</book>'%bid, x, re.S)
    b=m.group(1)
    b=re.sub(r"<f\b.*?</f>","",b,flags=re.S)      # footnotes
    b=re.sub(r"<x\b.*?</x>","",b,flags=re.S)      # cross references
    b=re.sub(r"<(h|toc|id|s|d|r|mt|ms)\b[^>]*>.*?</\1>","",b,flags=re.S)  # headings
    book={}
    for cm in re.finditer(r'<c id="(\d+)"\s*/>(.*?)(?=<c id=|\Z)', b, re.S):
        ch=cm.group(1); verses={}
        for vm in re.finditer(r'<v id="(\d+)"[^>]*/>(.*?)<ve\s*/>', cm.group(2), re.S):
            t=re.sub(r"<[^>]+>","",vm.group(2))
            t=t.replace("&amp;","&").replace("&lt;","<").replace("&gt;",">").replace("¶","")
            t=re.sub(r"\s+"," ",t).strip()
            verses[vm.group(1)]=t
        book[ch]=verses; tot+=len(verses)
    json.dump(book,open(os.path.join(out,"%d.json"%(40+i)),"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
    # cross-check against an independent KJV transcription
    ref=json.load(open(os.path.join(kjvjson_dir,NAMES[i]+".json")))
    for c in ref["chapters"]:
        for v in c["verses"]:
            mine=book.get(c["chapter"],{}).get(v["verse"])
            if mine is None: diffs.append((bid,c["chapter"],v["verse"],"MISSING")); continue
            if norm(mine)!=norm(v["text"]): diffs.append((bid,c["chapter"],v["verse"],mine[:70],v["text"][:70]))
    nref=sum(len(c["verses"]) for c in ref["chapters"])
    nm=sum(len(v) for v in book.values())
    if nref!=nm: print("COUNT", bid, nm, nref)
print("verses",tot,"diffs",len(diffs))
for d in diffs[:25]: print(d)
