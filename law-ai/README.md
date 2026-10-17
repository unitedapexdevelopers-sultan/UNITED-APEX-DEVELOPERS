# Apex Counsel AI

A voice-enabled legal AI assistant for law students and lawyers, built by United Apex Developers.
It covers **UK, US and Pakistani law** and runs on Claude (`claude-opus-5-5`).

Its legal knowledge comes **only from its own library of official legal texts**, which is downloaded from government sources and stored in `data/`.
The assistant has tools to search and read this library, and its instructions require it to:
- cite every legal point to a provision in the library, with a link to the official source;
- say *"This isn't in the official-source library"* when the library doesn't cover something, instead of answering from memory.

## What's in the library

| Jurisdiction | Source | Contents |
|---|---|---|
| 🇵🇰 Pakistan | [pakistancode.gov.pk](https://pakistancode.gov.pk) (Ministry of Law and Justice) | All federal laws on the Pakistan Code (~900), including the Constitution, PPC, CrPC, CPC, Qanun-e-Shahadat, Contract Act, family laws |
| 🇬🇧 UK | [legislation.gov.uk](https://www.legislation.gov.uk) (The National Archives) | ~160 core Acts (criminal, contract, tort, land, trusts, family, employment, public law, IP, immigration), current revised text |
| 🇺🇸 US | [uscode.house.gov](https://uscode.house.gov) (Office of the Law Revision Counsel), [govinfo.gov](https://www.govinfo.gov) | The entire United States Code (all titles), the Federal Rules of Civil, Criminal and Appellate Procedure and Evidence, and the U.S. Constitution |

The library holds **legislation only**: no case law, and no state or provincial statutes yet.
BAILII and the UK's Find Case Law are not bulk-downloaded, because their terms don't allow it without a licence.

## Features

- **Jurisdictions:** UK, US or Pakistan, each with its own citation style.
- **Modes:** Case analysis, Legal research, Drafting, Study & exams.
- **Voice:**
  - 🎤 Speak your question (English UK/US/Pakistan, or Urdu).
  - 🔊 Have answers read aloud.
  - Hands-free conversation mode.
- **PDF upload:** attach judgments, contracts or pleadings for review.
- **Sources:** every answer lists and links the provisions it used.

Voice uses the browser's built-in speech features, so it costs nothing extra. It works best in Chrome or Edge.
The page must be opened on `localhost` or over HTTPS for microphone access.

## Run it

Requirements: Node 22.13+ (for its built-in SQLite) and an Anthropic API key.

```bash
cd law-ai
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://localhost:3000
```

On Windows PowerShell:

```powershell
$env:ANTHROPIC_API_KEY="sk-ant-..."; npm start
```

The first start builds the search index (`data/library.db`) from the files in `data/`, which takes about a minute. Later starts reuse it.

## Updating the library

The import scripts need Python 3 and, for Pakistan, `pdftotext` (poppler-utils). Downloads are cached in `.cache/`, so a stopped import can be resumed.

```bash
npm run ingest:pk   # Pakistan Code federal laws (about 1–2 hours, rate-limited to be polite to the server)
npm run ingest:uk   # UK Acts listed in ingest/uk.py (edit ACTS to add more)
npm run ingest:us   # US Code + Constitution (update RELEASE in ingest/us.py for newer releases)
```

Restart the server after an import and the index rebuilds automatically.

## Files

| Path | Purpose |
|---|---|
| `server.js` | Express server. Runs the Claude tool loop (library search/read) and streams answers to the browser. |
| `library.js` | Builds and queries the SQLite full-text index over `data/`. |
| `prompts.js` | Jurisdiction and mode definitions plus the system prompt (source rules). |
| `ingest/` | Import scripts that download and split the official texts. |
| `data/` | The imported library (`*.jsonl.gz`, one provision per line). |
| `public/index.html` | Chat UI with voice input/output, PDF attach and settings. |

## Deploying

The app is a standard Node app, so it runs on Render, Railway, a VPS and similar hosts. Set `ANTHROPIC_API_KEY` (and optionally `PORT`) as environment variables.
**Before going public, add login and rate limiting**, because every message costs API credits.

## Licences

- UK legislation: contains public sector information licensed under the Open Government Licence v3.0.
- US Code and Constitution: U.S. government works, public domain.
- Pakistan Code: published by the Ministry of Law and Justice. Its texts are marked "under review", so confirm against the Gazette where precision matters.
