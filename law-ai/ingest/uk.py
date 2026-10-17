"""Import key UK Acts of Parliament from legislation.gov.uk (The National Archives).

Each Act is resolved by title and year through the site's search feed, then its
current (revised) text is downloaded as Crown Legislation Markup XML.
Contains public sector information licensed under the Open Government Licence v3.0.

    python3 ingest/uk.py
"""
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from common import Writer, fetch  # noqa: E402

NS = {"l": "http://www.legislation.gov.uk/namespaces/legislation",
      "dc": "http://purl.org/dc/elements/1.1/",
      "a": "http://www.w3.org/2005/Atom"}

# Core statutes taught on UK law degrees and used in practice, grouped by area.
ACTS = {
    "Constitutional & public law": [
        "Human Rights Act 1998", "Constitutional Reform Act 2005", "Constitutional Reform and Governance Act 2010",
        "European Union (Withdrawal) Act 2018", "Parliament Act 1911", "Parliament Act 1949", "Scotland Act 1998",
        "Government of Wales Act 2006", "Northern Ireland Act 1998", "Interpretation Act 1978",
        "Senior Courts Act 1981", "Tribunals, Courts and Enforcement Act 2007", "Judicial Review and Courts Act 2022",
        "Inquiries Act 2005", "Freedom of Information Act 2000", "Data Protection Act 2018", "Equality Act 2010",
        "Local Government Act 1972", "Town and Country Planning Act 1990", "Online Safety Act 2023",
        "Investigatory Powers Act 2016", "Regulation of Investigatory Powers Act 2000",
    ],
    "Criminal law & procedure": [
        "Theft Act 1968", "Theft Act 1978", "Offences against the Person Act 1861", "Sexual Offences Act 2003",
        "Criminal Damage Act 1971", "Fraud Act 2006", "Homicide Act 1957", "Coroners and Justice Act 2009",
        "Criminal Attempts Act 1981", "Serious Crime Act 2007", "Criminal Law Act 1967", "Criminal Law Act 1977",
        "Misuse of Drugs Act 1971", "Public Order Act 1986", "Police and Criminal Evidence Act 1984",
        "Criminal Justice Act 2003", "Sentencing Act 2020", "Bail Act 1976",
        "Criminal Procedure and Investigations Act 1996", "Protection from Harassment Act 1997",
        "Computer Misuse Act 1990", "Bribery Act 2010", "Proceeds of Crime Act 2002", "Terrorism Act 2000",
        "Road Traffic Act 1988", "Domestic Abuse Act 2021", "Modern Slavery Act 2015", "Prevention of Crime Act 1953",
        "Firearms Act 1968", "Criminal Justice and Public Order Act 1994", "Youth Justice and Criminal Evidence Act 1999",
        "Magistrates' Courts Act 1980", "Contempt of Court Act 1981", "Criminal Appeal Act 1968",
        "Criminal Appeal Act 1995", "Juries Act 1974", "Crime and Disorder Act 1998", "Rehabilitation of Offenders Act 1974",
        "Anti-social Behaviour, Crime and Policing Act 2014", "Police, Crime, Sentencing and Courts Act 2022",
        "Children and Young Persons Act 1933", "Economic Crime and Corporate Transparency Act 2023",
    ],
    "Contract & commercial": [
        "Sale of Goods Act 1979", "Consumer Rights Act 2015", "Unfair Contract Terms Act 1977", "Misrepresentation Act 1967",
        "Contracts (Rights of Third Parties) Act 1999", "Law Reform (Frustrated Contracts) Act 1943",
        "Supply of Goods and Services Act 1982", "Late Payment of Commercial Debts (Interest) Act 1998",
        "Bills of Exchange Act 1882", "Arbitration Act 1996", "Companies Act 2006", "Insolvency Act 1986",
        "Partnership Act 1890", "Limited Liability Partnerships Act 2000", "Company Directors Disqualification Act 1986",
        "Competition Act 1998", "Enterprise Act 2002", "Financial Services and Markets Act 2000",
        "Electronic Communications Act 2000", "Minors' Contracts Act 1987",
    ],
    "Tort": [
        "Occupiers' Liability Act 1957", "Occupiers' Liability Act 1984", "Law Reform (Contributory Negligence) Act 1945",
        "Consumer Protection Act 1987", "Defamation Act 2013", "Defamation Act 1996", "Fatal Accidents Act 1976",
        "Law Reform (Miscellaneous Provisions) Act 1934", "Civil Liability (Contribution) Act 1978", "Compensation Act 2006",
        "Animals Act 1971", "Social Action, Responsibility and Heroism Act 2015",
        "Congenital Disabilities (Civil Liability) Act 1976", "Damages Act 1996", "Limitation Act 1980",
        "Employers' Liability (Compulsory Insurance) Act 1969",
    ],
    "Land, property & housing": [
        "Law of Property Act 1925", "Land Registration Act 2002", "Trusts of Land and Appointment of Trustees Act 1996",
        "Landlord and Tenant Act 1954", "Landlord and Tenant Act 1985", "Housing Act 1988", "Housing Act 2004",
        "Law of Property (Miscellaneous Provisions) Act 1989", "Commonhold and Leasehold Reform Act 2002",
        "Leasehold Reform Act 1967", "Land Charges Act 1972", "Access to Neighbouring Land Act 1992",
        "Party Wall etc. Act 1996", "Prescription Act 1832", "Protection from Eviction Act 1977",
    ],
    "Equity, trusts & succession": [
        "Trustee Act 1925", "Trustee Act 2000", "Variation of Trusts Act 1958", "Recognition of Trusts Act 1987",
        "Perpetuities and Accumulations Act 2009", "Charities Act 2011", "Wills Act 1837",
        "Administration of Estates Act 1925", "Inheritance (Provision for Family and Dependants) Act 1975",
        "Inheritance and Trustees' Powers Act 2014", "Mental Capacity Act 2005",
    ],
    "Family": [
        "Matrimonial Causes Act 1973", "Children Act 1989", "Children and Families Act 2014", "Family Law Act 1996",
        "Marriage Act 1949", "Civil Partnership Act 2004", "Divorce, Dissolution and Separation Act 2020",
        "Adoption and Children Act 2002", "Child Support Act 1991", "Marriage (Same Sex Couples) Act 2013",
        "Forced Marriage (Civil Protection) Act 2007",
    ],
    "Employment": [
        "Employment Rights Act 1996", "Trade Union and Labour Relations (Consolidation) Act 1992",
        "National Minimum Wage Act 1998", "Employment Tribunals Act 1996", "Health and Safety at Work etc. Act 1974",
        "Employment Relations Act 1999", "Public Interest Disclosure Act 1998",
    ],
    "Courts, evidence & legal services": [
        "Civil Evidence Act 1995", "Civil Evidence Act 1968", "Courts and Legal Services Act 1990",
        "Legal Services Act 2007", "County Courts Act 1984", "Civil Procedure Act 1997",
        "Legal Aid, Sentencing and Punishment of Offenders Act 2012", "Crime and Courts Act 2013", "Courts Act 2003",
        "Oaths Act 1978", "Mental Health Act 1983",
    ],
    "Intellectual property": [
        "Copyright, Designs and Patents Act 1988", "Patents Act 1977", "Trade Marks Act 1994", "Registered Designs Act 1949",
    ],
    "Immigration & nationality": [
        "Immigration Act 1971", "British Nationality Act 1981", "Nationality, Immigration and Asylum Act 2002",
        "Nationality and Borders Act 2022",
    ],
    "Environment": ["Environmental Protection Act 1990"],
}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "and"))


def resolve(title):
    """Find the legislation.gov.uk URI for an Act from its title, e.g. 'Theft Act 1968'."""
    year = re.search(r"(\d{4})$", title).group(1)
    q = urllib.parse.quote(re.sub(r"\s*\d{4}$", "", title))
    for kind in ("ukpga", "aep", "apgb"):
        feed = ET.fromstring(fetch(f"https://www.legislation.gov.uk/{kind}/{year}/data.feed?title={q}"))
        for entry in feed.findall("a:entry", NS):
            if norm(entry.findtext("a:title", "", NS)) == norm(title):
                return entry.findtext("a:id", "", NS).replace("/id/", "/")
    return None


def text_of(el, skip=("Title", "Commentary")):
    parts = []

    def walk(e, depth=0):
        name = e.tag.rsplit("}", 1)[-1]
        if name in skip and depth:
            if e.tail:
                parts.append(e.tail)
            return
        if name == "Pnumber" and depth == 1:
            pass  # the P1's own number is already in the label
        elif name == "Pnumber":
            parts.append(f"\n({''.join(e.itertext()).strip()}) ")
        else:
            if name in ("Text", "P2", "P3", "P4", "ListItem", "tr", "Para"):
                parts.append("\n")
            if e.text:
                parts.append(e.text)
            for c in e:
                walk(c, depth + 1)
        if e.tail and depth:
            parts.append(e.tail)

    walk(el)
    text = re.sub(r"\n\s*\n+", "\n", "".join(parts)).strip()
    return re.sub(r"\(([0-9A-Za-z]{1,6})\) *\n", r"(\1) ", text)


def import_act(title, area, out):
    uri = resolve(title)
    if not uri:
        print(f"  !! could not resolve {title}", flush=True)
        return 0
    root = ET.fromstring(fetch(uri + "/data.xml", timeout=300))
    official = root.findtext(".//dc:title", title, NS)
    parent = {c: p for p in root.iter() for c in p}
    n = 0
    for p1 in root.iter(f"{{{NS['l']}}}P1"):
        doc_uri = p1.get("DocumentURI", "")
        m = re.search(r"/(section|schedule)/([^/]+)(?:/paragraph/([^/]+))?$", doc_uri)
        if not m:
            continue
        kind, num, para = m.groups()
        label = f"s. {num}" if kind == "section" else f"Sch. {num}" + (f" para. {para}" if para else "")
        group = parent.get(p1)
        heading = ""
        if group is not None and group.tag.endswith("P1group"):
            heading = " ".join("".join(group.find("l:Title", NS).itertext()).split()) if group.find("l:Title", NS) is not None else ""
        body = text_of(p1)
        if len(re.sub(r"[\s.…()\d]", "", body)) < 20:  # repealed provisions are just dots
            continue
        out.add(region=area, law=official, section=label, heading=heading,
                text=f"{label} {heading}\n{body}" if heading else body, url=doc_uri.replace("http://", "https://"))
        n += 1
    return n


def main():
    out = Writer("uk", "acts", "legislation.gov.uk (The National Archives), Open Government Licence v3.0")
    total = sum(len(v) for v in ACTS.values())
    i = 0
    for area, titles in ACTS.items():
        for title in titles:
            i += 1
            try:
                n = import_act(title, area, out)
                print(f"[{i}/{total}] {title}: {n} provisions", flush=True)
            except Exception as e:
                print(f"[{i}/{total}] FAILED {title}: {e}", flush=True)
    out.close()


if __name__ == "__main__":
    main()
