// The legal library: official texts imported by the scripts in ingest/,
// indexed with SQLite full-text search (built into Node, no extra services).
//
// data/<jurisdiction>/*.jsonl.gz  ->  data/library.db  (rebuilt when the data changes)

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const DB_PATH = path.join(DATA, "library.db");
const SCHEMA_VERSION = 1;

function dataFiles() {
  if (!fs.existsSync(DATA)) return [];
  return fs
    .readdirSync(DATA, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      fs
        .readdirSync(path.join(DATA, d.name))
        .filter((f) => f.endsWith(".jsonl.gz"))
        .map((f) => path.join(DATA, d.name, f)),
    )
    .sort();
}

// A fingerprint of the data files, so the index is rebuilt when they change.
function fingerprint(files) {
  return JSON.stringify([SCHEMA_VERSION, ...files.map((f) => [path.relative(DATA, f), fs.statSync(f).size])]);
}

async function build(db, files) {
  db.exec(`
    DROP TABLE IF EXISTS fts;
    DROP TABLE IF EXISTS docs;
    DROP TABLE IF EXISTS meta;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE docs (
      rowid INTEGER PRIMARY KEY, id TEXT UNIQUE, jurisdiction TEXT, region TEXT, law TEXT,
      section TEXT, heading TEXT, text TEXT, url TEXT, source TEXT
    );
    CREATE VIRTUAL TABLE fts USING fts5(
      law, section, heading, text, content='docs', content_rowid='rowid', tokenize='porter unicode61'
    );
  `);
  const insert = db.prepare(
    "INSERT INTO docs (id, jurisdiction, region, law, section, heading, text, url, source) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const file of files) {
    const t0 = Date.now();
    let n = 0;
    db.exec("BEGIN");
    const lines = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()) });
    for await (const line of lines) {
      if (!line) continue;
      const r = JSON.parse(line);
      insert.run(r.id, r.jurisdiction, r.region, r.law, r.section, r.heading, r.text, r.url, r.source);
      n++;
    }
    db.exec("COMMIT");
    console.log(`  indexed ${n} provisions from ${path.relative(DATA, file)} (${Date.now() - t0} ms)`);
  }
  db.exec("INSERT INTO fts(fts) VALUES ('rebuild')");
  db.exec("CREATE INDEX docs_law ON docs (jurisdiction, law)");
}

export async function openLibrary() {
  const files = dataFiles();
  const fp = fingerprint(files);
  const db = new DatabaseSync(DB_PATH);
  let current = null;
  try {
    current = db.prepare("SELECT value FROM meta WHERE key = 'fingerprint'").get()?.value;
  } catch {
    // no index yet
  }
  if (current !== fp) {
    console.log("Building legal library index (first run or data changed)...");
    await build(db, files);
    db.prepare("INSERT OR REPLACE INTO meta VALUES ('fingerprint', ?)").run(fp);
  }
  return new Library(db);
}

// Turn free text into a safe FTS5 query: every word becomes a quoted term,
// joined with OR so partial matches still rank (bm25 puts the best first).
function toFtsQuery(text) {
  const words = String(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!words) return null;
  const stop = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "be", "by", "with", "under", "what", "which"]);
  const terms = [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 24);
  return terms.length ? terms.map((w) => `"${w}"`).join(" OR ") : null;
}

class Library {
  constructor(db) {
    this.db = db;
    this.searchStmt = db.prepare(`
      SELECT d.id, d.law, d.section, d.heading, d.url, d.text,
             bm25(fts, 6.0, 4.0, 5.0, 1.0) AS score
      FROM fts JOIN docs d ON d.rowid = fts.rowid
      WHERE fts MATCH ? AND d.jurisdiction = ? AND (? IS NULL OR d.law LIKE ?)
      ORDER BY score LIMIT ?`);
    this.getStmt = db.prepare("SELECT rowid, * FROM docs WHERE id = ?");
    this.byRowStmt = db.prepare("SELECT id, law, section FROM docs WHERE rowid = ?");
    this.lawsStmt = db.prepare(`
      SELECT law, COUNT(*) AS provisions FROM docs
      WHERE jurisdiction = ? AND law LIKE ? GROUP BY law ORDER BY law LIMIT 40`);
    this.sectionStmt = db.prepare(`
      SELECT id, law, section, heading, url, text FROM docs
      WHERE jurisdiction = ? AND law LIKE ?
        AND (REPLACE(section, '-', '') = ? OR REPLACE(section, '-', '') LIKE ? OR REPLACE(section, '-', '') LIKE ?)
      ORDER BY rowid LIMIT 6`);
  }

  stats() {
    const rows = this.db
      .prepare("SELECT jurisdiction, COUNT(DISTINCT law) AS laws, COUNT(*) AS provisions FROM docs GROUP BY jurisdiction")
      .all();
    return Object.fromEntries(rows.map((r) => [r.jurisdiction, { laws: r.laws, provisions: r.provisions }]));
  }

  search(jurisdiction, query, { law, limit = 8 } = {}) {
    const fts = toFtsQuery(query);
    if (!fts) return [];
    const lawLike = law ? `%${law}%` : null;
    return this.searchStmt.all(fts, jurisdiction, lawLike, lawLike, limit).map((r) => ({
      id: r.id,
      law: r.law,
      section: r.section,
      heading: r.heading,
      url: r.url,
      excerpt: r.text.length > 900 ? r.text.slice(0, 900) + " …" : r.text,
    }));
  }

  // Exact lookup of a provision by law name and section label, e.g. ("Penal Code", "302").
  section(jurisdiction, law, section) {
    // Hyphens are ignored so "489-F" finds "s. 489F".
    const s = String(section).trim().replace(/-/g, "");
    const num = s.replace(/^(s|ss|art|section|article|rule|r|§)\.?\s*/i, "");
    // Matches "s. 302", "Art. 199", "18 U.S.C. § 1111", "Fed. R. Civ. P. 56" and their "(part n)" pieces.
    return this.sectionStmt.all(jurisdiction, `%${law}%`, s, `% ${num}`, `% ${num} (part %`);
  }

  laws(jurisdiction, name) {
    return this.lawsStmt.all(jurisdiction, `%${name}%`);
  }

  read(id) {
    const r = this.getStmt.get(id);
    if (!r) return null;
    const near = (rowid) => {
      const n = this.byRowStmt.get(rowid);
      return n && n.law === r.law ? `${n.id} (${n.section})` : null;
    };
    return {
      id: r.id,
      law: r.law,
      section: r.section,
      heading: r.heading,
      source: r.source,
      url: r.url,
      text: r.text,
      previous: near(r.rowid - 1),
      next: near(r.rowid + 1),
    };
  }
}
