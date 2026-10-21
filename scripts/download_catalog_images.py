#!/usr/bin/env python3
"""Download the exact catalog images listed by their original Miswag product links."""
import concurrent.futures
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT/"assets"/"catalog"
DEST.mkdir(parents=True,exist_ok=True)
ITEMS=json.loads((ROOT/"catalog-images.json").read_text(encoding="utf-8"))

def fetch(item):
    u=urllib.parse.urlparse(item["url"])
    if u.scheme!="https" or u.netloc!="cdn.miswag.me":
        return (item["filename"],False,"untrusted host")
    filename=pathlib.Path(item["filename"]).name
    file=DEST/filename
    headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36","Referer":"https://miswag.com/","Accept":"image/avif,image/webp,image/*,*/*;q=0.8"}
    for attempt in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(item["url"],headers=headers),timeout=20) as resp:
                data=resp.read(8*1024*1024+1)
            valid=(data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n") or (data.startswith(b"RIFF") and data[8:12]==b"WEBP"))
            if not valid or not 1024<=len(data)<=8*1024*1024:
                raise ValueError("invalid image bytes")
            file.write_bytes(data)
            return (filename,True,f"{len(data)} bytes")
        except Exception as exc:
            reason=str(exc)
            if attempt==0:time.sleep(0.5)
    return (filename,False,reason)

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results=list(pool.map(fetch,ITEMS))
n=sum(ok for _,ok,_ in results)
for name,ok,reason in results:
    print(("OK " if ok else "FAILED ")+name+": "+reason)
print(f"CATALOG PHOTOS: {n}/{len(ITEMS)} downloaded")
if n<3:
    print("Unable to cache most pictures, stopping release",file=sys.stderr)
    sys.exit(2)
