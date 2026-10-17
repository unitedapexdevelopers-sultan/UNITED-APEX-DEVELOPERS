"""Import the United States Code from the Office of the Law Revision Counsel.

Downloads the official USLM XML release (uscode.house.gov) and stores the text
of every current section (editorial and statutory notes are left out).
Appendix titles (e.g. 28a: Federal Rules of Civil Procedure and Evidence,
18a: Federal Rules of Criminal Procedure) are included.

    python3 ingest/us.py                     # whole Code
    python3 ingest/us.py --titles 18 28 28a  # selected titles
"""
import argparse
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.dirname(__file__))
from common import CACHE, Writer, fetch  # noqa: E402

RELEASE = "119/120"  # Public Law 119-120; update for newer release points
ZIP_URL = f"https://uscode.house.gov/download/releasepoints/us/pl/{RELEASE}/xml_uscAll@{RELEASE.replace('/', '-')}.zip"
CACHE_DIR = os.path.join(CACHE, "us")

SKIP = {"notes", "note", "sourceCredit", "toc", "layout"}
BLOCK = {"subsection", "paragraph", "subparagraph", "clause", "subclause", "item", "subitem",
         "p", "chapeau", "continuation", "content", "table", "tr", "rule"}
DEAD = {"repealed", "transferred", "omitted", "renumbered", "reserved"}
SECTION_ID = re.compile(r"^/us/usc/t([0-9]+[A-Za-z]?)/s([^/]+)$")
RULE_ID = re.compile(r"^/us/usc/t([0-9]+[A-Za-z]?)/courtRules/([^/]+)/rule([^/]+)$")
RULE_CITES = {
    "Civil": "Fed. R. Civ. P.",
    "Evid": "Fed. R. Evid.",
    "App": "Fed. R. App. P.",
    "Crim": "Fed. R. Crim. P.",
}


SMALL = {"and", "or", "of", "the", "in", "for", "to", "on", "by", "a", "an", "under"}


def titlecase(s):
    words = s.lower().split()
    return " ".join(w if i and w in SMALL else w[:1].upper() + w[1:] for i, w in enumerate(words))


def local(tag):
    return tag.rsplit("}", 1)[-1]


def text_of(el):
    parts = []

    def walk(e):
        name = local(e.tag)
        if name in SKIP:
            if e.tail:
                parts.append(e.tail)
            return
        if name in BLOCK:
            parts.append("\n")
        if e.text:
            parts.append(e.text)
        for child in e:
            walk(child)
        if e.tail:
            parts.append(e.tail)

    walk(el)
    text = re.sub(r"[ \t]+\n", "\n", re.sub(r"\n\s*\n+", "\n", "".join(parts))).strip()
    return re.sub(r"(\([0-9A-Za-z]{1,6}\))\n\s*", r"\1 ", text)  # keep "(a)" on the same line as its text


def import_title(xml_file, out):
    stack, title_heading, chapter_heading, n = [], "", "", 0
    for event, el in ET.iterparse(xml_file, events=("start", "end")):
        name = local(el.tag)
        if event == "start":
            stack.append(name)
            continue
        stack.pop()
        if name == "heading" and stack:
            heading = " ".join("".join(el.itertext()).split())
            if stack[-1] == "title" and not title_heading:  # the first <title> is the Code title itself
                title_heading = heading
            elif stack[-1] in ("chapter", "part", "article"):
                chapter_heading = heading
        elif name == "section" and "note" not in stack and "notes" not in stack and "quotedContent" not in stack:
            m = SECTION_ID.match(el.get("identifier", ""))
            if m and el.get("status") not in DEAD:
                title_no, sec = m.groups()
                heading_el = next((c for c in el if local(c.tag) == "heading"), None)
                heading = " ".join("".join(heading_el.itertext()).split()) if heading_el is not None else ""
                body = text_of(el)
                if heading and not heading.lower().startswith(("repealed", "transferred", "omitted")):
                    out.add(
                        region="Federal",
                        law=f"{title_no} U.S.C. — {titlecase(title_heading)}",
                        section=f"{title_no} U.S.C. § {sec}",
                        heading=" — ".join(x for x in (titlecase(chapter_heading), heading) if x),
                        text=body,
                        url=f"https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title{title_no}-section{sec}&num=0&edition=prelim",
                    )
                    n += 1
            el.clear()
        elif name == "courtRule":
            m = RULE_ID.match(el.get("identifier", ""))
            if m and el.get("status") not in DEAD:
                title_no, group, rule = m.groups()
                heading_el = next((c for c in el if local(c.tag) == "heading"), None)
                heading = " ".join("".join(heading_el.itertext()).split()) if heading_el is not None else ""
                cite = RULE_CITES.get(group, f"{group} Rules,")
                out.add(
                    region="Federal",
                    law=f"{cite.rstrip(',')} — Federal Rules ({title_no.upper()} U.S.C. Appendix)",
                    section=f"{cite} {rule}",
                    heading=heading,
                    text=text_of(el),
                    url=f"https://uscode.house.gov/view.xhtml?path=/prelim@title{title_no[:-1]}/title{title_no}",
                )
                n += 1
            el.clear()
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--titles", nargs="*", help="e.g. 18 28 28a (default: all)")
    args = ap.parse_args()
    os.makedirs(CACHE_DIR, exist_ok=True)
    zip_path = os.path.join(CACHE_DIR, "uscAll.zip")
    if not os.path.exists(zip_path):
        print("Downloading", ZIP_URL, flush=True)
        with open(zip_path, "wb") as f:
            f.write(fetch(ZIP_URL, timeout=900))

    out = Writer("us", "uscode", f"United States Code (uscode.house.gov), current through Pub. L. {RELEASE.replace('/', '-')}")
    with zipfile.ZipFile(zip_path) as z:
        names = sorted(n for n in z.namelist() if re.fullmatch(r"usc\w+\.xml", n))
        if args.titles:
            wanted = {f"usc{t.zfill(2) if t[:-1].isdigit() or t.isdigit() else t}.xml".lower() for t in args.titles}
            names = [n for n in names if n.lower() in wanted]
        for name in names:
            with z.open(name) as f:
                n = import_title(f, out)
            print(f"{name}: {n} sections", flush=True)
    out.close()


if __name__ == "__main__":
    main()
