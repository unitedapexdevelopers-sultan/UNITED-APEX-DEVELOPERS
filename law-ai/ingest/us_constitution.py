"""Import the U.S. Constitution and its amendments from the official GPO edition
(House Document 110-50, govinfo.gov). Footnotes and the unratified amendments
are left out.

    python3 ingest/us_constitution.py
"""
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import Writer, fetch  # noqa: E402

URL = "https://www.govinfo.gov/content/pkg/CDOC-110hdoc50/html/CDOC-110hdoc50.htm"
HEADING = re.compile(r"^ {6,}Article \[?([IVXL]+)\.?\]?")


def main():
    raw = html.unescape(re.sub(r"<[^>]+>", "", fetch(URL).decode("utf-8", "replace")))
    start = raw.index("We the People")
    end = raw.index("``Article the first")
    lines = raw[start:end].split("\n")

    # Drop footnote blocks: they start at a rule of dashes and run until the
    # next indented paragraph or heading of the main text.
    kept, in_note = [], False
    for line in lines:
        if re.match(r"^-{20,}", line.strip()):
            in_note = True
            continue
        if in_note and (re.match(r"^ {4}\S", line) or HEADING.match(line)):
            in_note = False
        if not in_note:
            kept.append(line)
    text = re.sub(r"\\\d+\\", "", "\n".join(kept))

    # Split into the Preamble, Articles and Amendments.
    units, cur_label, buf, articles_done = [], "Preamble", [], False
    for line in text.split("\n"):
        m = HEADING.match(line)
        if m:
            units.append((cur_label, "\n".join(buf)))
            roman = m.group(1)
            if roman == "I" and cur_label.startswith("Art. VII"):
                articles_done = True
            cur_label = f"Amend. {roman}" if articles_done else f"Art. {roman}"
            buf = []
        else:
            buf.append(line)
    units.append((cur_label, "\n".join(buf)))

    out = Writer("us", "constitution", "The Constitution of the United States (GPO, H. Doc. 110-50, govinfo.gov)")
    for label, body in units:
        body = re.sub(r"\n(?! {4}\S)", " ", body)            # unwrap lines inside paragraphs
        body = re.sub(r"\*\s*\*\s*\*.*", "", body)
        body = re.split(r"Proposal and Ratification|\[Editorial note|ARTICLES IN ADDITION", body)[0]  # drop GPO notes
        body = re.sub(r"[ \t]+", " ", body).strip()
        if label.startswith("Art.") and "Section" in body:
            for sec in re.split(r"(?=Section \d+\.)", body):
                m = re.match(r"Section (\d+)\.", sec)
                if sec.strip():
                    section = f"{label}, § {m.group(1)}" if m else label
                    out.add(region="Federal", law="U.S. Constitution", section=section, heading="", text=sec, url=URL)
        else:
            out.add(region="Federal", law="U.S. Constitution", section=label, heading="", text=body, url=URL)
    out.close()


if __name__ == "__main__":
    main()
