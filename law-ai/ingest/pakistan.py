"""Download federal laws from The Pakistan Code (pakistancode.gov.pk).

Walks the alphabetical index, downloads each law's official PDF, extracts the
text with `pdftotext` (poppler-utils) and splits it into section-sized chunks.
Downloads are cached in .cache/pk so the script can be stopped and resumed.

    python3 ingest/pakistan.py            # all laws
    python3 ingest/pakistan.py --limit 20 # quick test
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import html
import os
import re
import string
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import CACHE, Writer, fetch  # noqa: E402

BASE = "https://pakistancode.gov.pk/english/"
CACHE_DIR = os.path.join(CACHE, "pk")

# "302. Punishment of qatl-i-amd. Whoever..." -- amended sections carry footnote
# markers such as "3[2[375. Rape.__ ...".
# Some PDFs misprint section 1 as "l." (lowercase L); it is read as "1".
SECTION_RE = re.compile(r"^\s{0,20}(?:\d{0,2}\[)*(\d{1,4}[A-Z]{0,3}(?:-[A-Z]{1,2})?|l)\s?\.\s+(\S.{1,180})$")
# Occasionally the number sits alone on the line after its heading: "4[489F."
BARE_NUMBER_RE = re.compile(r"^\s{0,20}(?:\d{0,2}\[)*(\d{1,4}[A-Z]{0,3}(?:-[A-Z]{1,2})?)\s?\.\s*$")
ORDINALS = r"(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)"
HEADING_RE = re.compile(
    r"^\s*(?:\d*\[)?((?:PART|CHAPTER|ORDER)\s+[IVXLC\d]+[A-Z]?\b.{0,80}"
    rf"|(?:THE\s+)?{ORDINALS}?\s*SCHEDULE\b.{{0,60}})\s*$"
)


def list_laws():
    laws = {}
    for letter in string.ascii_uppercase:
        page = fetch(f"{BASE}LGu0xAD?alp={letter}&page=1&action=inactive").decode("utf-8", "replace")
        for href, label in re.findall(r'<a[^>]+href="(UY2[^"]+)"[^>]*>(.*?)</a>', page, re.S):
            title = html.unescape(re.sub(r"<[^>]+>|\s+", " ", label)).strip()
            if title and "repeal" not in title.lower():
                laws.setdefault(title, BASE + href)
        print(f"  {letter}: {len(laws)} laws so far", flush=True)
    return laws


def pdf_url_for(page_url):
    page = fetch(page_url).decode("utf-8", "replace")
    m = re.search(r'https://pakistancode\.gov\.pk/pdffiles/[^"\']+?\.pdf', page)
    return m.group(0) if m else None


def law_text(title, page_url):
    """Return (pdf_url, pages[]) for a law, using the on-disk cache when possible."""
    key = hashlib.sha1(page_url.encode()).hexdigest()[:16]
    txt_path = os.path.join(CACHE_DIR, key + ".txt")
    url_path = os.path.join(CACHE_DIR, key + ".url")
    if os.path.exists(txt_path) and os.path.exists(url_path):
        with open(url_path) as f:
            pdf_url = f.read().strip()
        with open(txt_path, encoding="utf-8") as f:
            return pdf_url, f.read().split("\f")
    pdf_url = pdf_url_for(page_url)
    if not pdf_url:
        return None, []
    pdf_path = os.path.join(CACHE_DIR, key + ".pdf")
    with open(pdf_path, "wb") as f:
        f.write(fetch(pdf_url, timeout=300))
    subprocess.run(["pdftotext", "-layout", pdf_path, txt_path], check=True)
    os.remove(pdf_path)  # keep only the text
    with open(url_path, "w") as f:
        f.write(pdf_url)
    with open(txt_path, encoding="utf-8") as f:
        return pdf_url, f.read().split("\f")


def reads_as_text(rest):
    """True for "Short title. This Act may be called..." but not for a contents
    line such as "Short title. Local extent. Commencement." """
    parts = re.split(r"\.\s+|\.__|\.—|:-", rest, maxsplit=1)
    if len(parts) < 2:
        return False
    words = parts[1].split()
    return len(words) >= 3 and sum(w[:1].islower() for w in words) >= 2


def sections(title, pages):
    """Yield (label, heading, context, page_no, text) units from a law's pages."""
    lines = []
    for page_no, page in enumerate(pages, 1):
        for line in page.split("\n"):
            if not re.match(r"^\s*Page \d+ of \d+\s*$", line):
                lines.append((page_no, line))

    # Most PDFs open with a table of contents whose entries look like section
    # headings ("1.  Short title"). The body starts at the "1." that repeats the
    # first contents entry's heading ("1. Short title. This Act may be called...");
    # without a repeat, at the first "1." that reads as text or has a substantial
    # block under it. Headings before the last contents entry are ignored.
    starts = [i for i, (_, line) in enumerate(lines) if SECTION_RE.match(line)]
    ones = [k for k, i in enumerate(starts) if SECTION_RE.match(lines[i][1]).group(1) in ("1", "l")]

    def first_words(k):
        return re.findall(r"[a-z]+", SECTION_RE.match(lines[starts[k]][1]).group(2).lower())[:2]

    def unit_text(k):
        nxt = starts[k + 1] if k + 1 < len(starts) else len(lines)
        return " ".join(line.strip() for _, line in lines[starts[k]:nxt])

    body_k = None
    if ones and not reads_as_text(SECTION_RE.match(lines[starts[ones[0]]][1]).group(2)):
        body_k = next((k for k in ones[1:] if first_words(k) == first_words(ones[0])), None)
    if body_k is None:
        body_k = next((k for k in ones if len(unit_text(k)) >= 80
                       or reads_as_text(SECTION_RE.match(lines[starts[k]][1]).group(2))), None)
    body_from = starts[body_k - 1] + 1 if body_k else 0

    unit_word = "Art." if "constitution" in title.lower() else "s."
    context, schedule, cur = "", "", None
    for page_no, line in lines[body_from:]:
        h = HEADING_RE.match(line)
        if h:
            context = re.sub(r"\s+", " ", h.group(1)).strip(" ._")
            if "SCHEDULE" in context:
                schedule = re.sub(r"[.\[].*$", "", context).strip(" ._")
            continue
        m = SECTION_RE.match(line)
        bare = None if m else BARE_NUMBER_RE.match(line)
        if bare and cur:
            # Move the heading line (the last line of the previous unit) into the new one.
            prev_lines = cur[4].rstrip("\n").split("\n")
            heading_line = prev_lines.pop() if prev_lines else ""
            if not re.search(r"\.__|\.—|\.\s", heading_line):
                bare = None  # not a heading after all (e.g. a numbered list item)
            else:
                cur[4] = "\n".join(prev_lines) + "\n"
                line = f"{bare.group(1)}. {heading_line.strip()}"
                m = SECTION_RE.match(line)
        if m:
            if cur:
                yield cur
            elif schedule:
                # Schedule headings listed at the end of the contents, not the body.
                context = "" if "SCHEDULE" in context else context
                schedule = ""
            num, rest = m.group(1).replace("l", "1"), m.group(2)
            heading = re.split(r"\.\s|\.__|\.—|\.-|:-", rest, maxsplit=1)[0].strip(" .")
            if context.startswith("ORDER"):
                order = re.match(r"ORDER\s+([IVXLC\d]+[A-Z]?)", context).group(1)
                label = f"Order {order}, r. {num}"
            elif schedule:
                part = f", {context.title()}" if context.startswith("PART") else ""
                label = f"{schedule.title()}{part}, para. {num}"
            else:
                label = f"{unit_word} {num}"
            cur = [label, heading[:160], context, page_no, line.strip() + "\n"]
        elif cur:
            cur[4] += line.strip() + "\n"
    if cur:
        yield cur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads (keep this small)")
    args = ap.parse_args()
    os.makedirs(CACHE_DIR, exist_ok=True)

    print("Listing laws...", flush=True)
    laws = sorted(list_laws().items())
    if args.limit:
        laws = laws[: args.limit]
    out = Writer("pk", "federal", "The Pakistan Code (pakistancode.gov.pk), Ministry of Law and Justice")
    failed = []

    def download(item):
        try:
            return law_text(*item), None
        except Exception as e:
            return (None, []), e

    with ThreadPoolExecutor(args.workers) as pool:
        results = pool.map(download, laws)  # yields in order, downloads run ahead
        for i, ((title, _), ((pdf_url, pages), err)) in enumerate(zip(laws, results), 1):
            if err:
                failed.append(title)
                print(f"[{i}/{len(laws)}] FAILED {title}: {err}", flush=True)
                continue
            write_law(out, i, len(laws), title, pdf_url, pages, failed)
    out.close()
    if failed:
        print(f"{len(failed)} laws failed: {failed[:20]}")


def write_law(out, i, total, title, pdf_url, pages, failed):
    if not pdf_url:
        failed.append(title)
        return
    n = 0
    for label, heading, context, page_no, text in sections(title, pages):
        # Stray contents entries have a heading but no body text.
        if len(text) < 40:
            continue
        out.add(
            region="Federal",
            law=title,
            section=label,
            heading=" — ".join(x for x in (context, heading) if x),
            text=text,
            url=f"{pdf_url}#page={page_no}",
        )
        n += 1
    print(f"[{i}/{total}] {title}: {n} sections", flush=True)


if __name__ == "__main__":
    main()
