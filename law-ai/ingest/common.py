"""Shared helpers for the ingestion scripts.

Every script writes records to data/<jurisdiction>/<name>.jsonl.gz, one JSON
object per line:
  {id, jurisdiction, region, law, section, heading, text, url, source}
library.js builds the searchable SQLite index from these files.
"""
import gzip
import json
import os
import re
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = "ApexCounselAI-ingest/0.1 (+https://unitedapexdevelopers.com; legal research library)"

CACHE = os.environ.get("INGEST_CACHE", os.path.join(ROOT, ".cache"))

TARGET_CHARS = 2200   # preferred chunk size
MAX_CHARS = 3500      # split anything longer than this


def fetch(url, retries=3, delay=1.0, timeout=120):
    """GET a URL politely (fixed delay between requests, simple retries)."""
    last = None
    for attempt in range(retries):
        try:
            time.sleep(delay)
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network errors, 5xx
            last = e
            time.sleep(delay * (attempt + 2) * 2)
    raise last


def clean(text):
    text = text.replace(" ", " ").replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_long(text, limit=MAX_CHARS, target=TARGET_CHARS):
    """Split text into pieces of about `target` chars at paragraph/sentence breaks."""
    if len(text) <= limit:
        return [text]
    pieces, buf = [], ""
    for para in re.split(r"(?<=\n)|(?<=[.;:]) ", text):
        if len(buf) + len(para) > target and buf:
            pieces.append(buf.strip())
            buf = ""
        buf += para if para.endswith("\n") else para + " "
    if buf.strip():
        pieces.append(buf.strip())
    # Hard-split anything still too long (e.g. tables without punctuation).
    out = []
    for p in pieces:
        while len(p) > limit:
            out.append(p[:target])
            p = p[target:]
        out.append(p)
    return out


class Writer:
    def __init__(self, jurisdiction, name, source):
        self.jurisdiction = jurisdiction
        self.source = source
        self.name = name
        os.makedirs(os.path.join(DATA, jurisdiction), exist_ok=True)
        self.path = os.path.join(DATA, jurisdiction, f"{name}.jsonl.gz")
        self.tmp = self.path + ".tmp"
        self.f = gzip.open(self.tmp, "wt", encoding="utf-8")
        self.count = 0

    def add(self, *, region, law, section, heading, text, url):
        text = clean(text)
        if len(text) < 30:
            return
        for i, part in enumerate(split_long(text)):
            self.count += 1
            rec = {
                "id": f"{self.jurisdiction}-{self.name}-{self.count}",
                "jurisdiction": self.jurisdiction,
                "region": region,
                "law": law,
                "section": section + (f" (part {i + 1})" if i else ""),
                "heading": heading,
                "text": part,
                "url": url,
                "source": self.source,
            }
            self.f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def close(self):
        self.f.close()
        os.replace(self.tmp, self.path)
        print(f"wrote {self.count} chunks -> {os.path.relpath(self.path, ROOT)}")
