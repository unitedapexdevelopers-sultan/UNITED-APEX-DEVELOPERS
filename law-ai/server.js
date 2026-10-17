import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt, JURISDICTIONS, MODES } from "./prompts.js";
import { openLibrary } from "./library.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const MAX_STEPS = 12; // library lookups per answer

const client = new Anthropic();
const library = await openLibrary();
const app = express();

app.use(express.json({ limit: "25mb" })); // PDFs are sent base64-encoded
app.use(express.static(path.join(here, "public")));

app.get("/api/config", (_req, res) => {
  res.json({ jurisdictions: JURISDICTIONS, modes: MODES, library: library.stats() });
});

// ---------- Library tools the model can call ----------

const TOOLS = [
  {
    name: "search_library",
    description:
      "Full-text search of the official legal library for the selected jurisdiction. Returns the best-matching provisions with an id, law, section, heading, source URL and an excerpt. Use specific legal words (e.g. 'bail non-bailable offence', 'unfair dismissal qualifying period'). Optionally restrict to one law by part of its title.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search words." },
        law: { type: "string", description: "Optional: part of a law's title to search within, e.g. 'Criminal Procedure'." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_section",
    description:
      "Look up a specific provision by law and section number, e.g. law 'Penal Code' + section '302', law 'Constitution' + section '199', law 'Theft Act 1968' + section '1', law '18 U.S.C.' + section '1111'. Returns full text.",
    input_schema: {
      type: "object",
      properties: {
        law: { type: "string", description: "Part of the law's title." },
        section: { type: "string", description: "Section, article or rule number, e.g. '302', '199', 'Art. 10A', '56'." },
      },
      required: ["law", "section"],
      additionalProperties: false,
    },
  },
  {
    name: "read_provision",
    description:
      "Read the full text of a provision by its id (from search results). The result also gives the ids of the previous and next provisions so you can read surrounding sections.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "find_laws",
    description: "List laws in the library whose title contains the given words, with how many provisions each has.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
].map((t) => ({ ...t, strict: true, eager_input_streaming: true }));

const isStr = (v) => typeof v === "string" && v.trim().length > 0;

// Runs one tool call. Returns { content, sources, status } or throws for bad input.
function runTool(jurisdiction, name, input) {
  switch (name) {
    case "search_library": {
      if (!isStr(input.query)) throw new Error("query is required");
      const hits = library.search(jurisdiction, input.query, { law: isStr(input.law) ? input.law : undefined });
      return {
        status: `Searching the library: “${input.query}”${input.law ? ` in ${input.law}` : ""}`,
        content: hits.length ? JSON.stringify(hits) : "No matching provisions in the library. Try other words, or find_laws to check the law's exact title.",
        sources: [],
      };
    }
    case "get_section": {
      if (!isStr(input.law) || !isStr(input.section)) throw new Error("law and section are required");
      const rows = library.section(jurisdiction, input.law, input.section);
      return {
        status: `Reading ${input.law}, ${input.section}`,
        content: rows.length ? JSON.stringify(rows) : "That provision was not found in the library. Use find_laws to check the law's title, or search_library.",
        sources: rows.map((r) => ({ title: `${r.law}, ${r.section}`, url: r.url })),
      };
    }
    case "read_provision": {
      if (!isStr(input.id)) throw new Error("id is required");
      const r = library.read(input.id);
      return {
        status: r ? `Reading ${r.law}, ${r.section}` : "Reading provision",
        content: r ? JSON.stringify(r) : "No provision with that id.",
        sources: r ? [{ title: `${r.law}, ${r.section}`, url: r.url }] : [],
      };
    }
    case "find_laws": {
      if (!isStr(input.name)) throw new Error("name is required");
      const rows = library.laws(jurisdiction, input.name);
      return {
        status: `Looking up laws: “${input.name}”`,
        content: rows.length ? JSON.stringify(rows) : "No law with that title in the library.",
        sources: [],
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// Only accept the content shapes the UI produces, so the browser can't
// smuggle arbitrary API parameters through the history.
function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) return null;
    const blocks = [];
    for (const b of m.content) {
      if (b?.type === "text" && typeof b.text === "string") {
        blocks.push({ type: "text", text: b.text });
      } else if (
        m.role === "user" &&
        b?.type === "document" &&
        b.source?.type === "base64" &&
        b.source.media_type === "application/pdf" &&
        typeof b.source.data === "string"
      ) {
        blocks.push({
          type: "document",
          title: typeof b.title === "string" ? b.title.slice(0, 200) : undefined,
          source: { type: "base64", media_type: "application/pdf", data: b.source.data },
        });
      } else {
        return null;
      }
    }
    out.push({ role: m.role, content: blocks });
  }
  if (out[0].role !== "user" || out.at(-1).role !== "user") return null;
  return out;
}

app.post("/api/chat", async (req, res) => {
  const { jurisdiction, subJurisdiction, mode } = req.body ?? {};
  if (!JURISDICTIONS[jurisdiction] || !MODES[mode]) {
    return res.status(400).json({ error: "Unknown jurisdiction or mode." });
  }
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages) return res.status(400).json({ error: "Invalid message history." });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  let aborted = false;
  let stream;
  res.on("close", () => {
    aborted = true;
    stream?.abort();
  });

  const system = buildSystemPrompt({ jurisdiction, subJurisdiction, mode, stats: library.stats()[jurisdiction] });

  try {
    for (let step = 0; step < MAX_STEPS && !aborted; step++) {
      stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        output_config: { effort: MODES[mode].effort },
        system,
        tools: TOOLS,
        messages,
      });

      let wrote = false;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send({ type: "text", text: event.delta.text });
          wrote = true;
        }
      }
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        send({ type: "error", text: "The model declined this request. Try rephrasing it as a legal research question." });
        break;
      }
      if (message.stop_reason === "max_tokens") {
        send({ type: "notice", text: "Response reached the length limit — ask it to continue." });
        break;
      }
      if (message.stop_reason !== "tool_use") break;

      // Run the library lookups and hand the results back to the model.
      messages.push({ role: "assistant", content: message.content });
      const results = [];
      for (const block of message.content) {
        if (block.type !== "tool_use") continue;
        try {
          const out = runTool(jurisdiction, block.name, block.input ?? {});
          send({ type: "status", text: out.status });
          if (out.sources.length) send({ type: "sources", sources: out.sources });
          results.push({ type: "tool_result", tool_use_id: block.id, content: out.content });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: block.id, content: `Invalid input: ${err.message}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      if (wrote) send({ type: "text", text: "\n\n" });
    }
    send({ type: "done" });
  } catch (err) {
    if (aborted) return;
    console.error(err);
    let text = "Something went wrong talking to the AI service.";
    if (err instanceof Anthropic.AuthenticationError) {
      text = "The server's Anthropic API key is missing or invalid. Set ANTHROPIC_API_KEY and restart.";
    } else if (err instanceof Anthropic.RateLimitError) {
      text = "Rate limited — please wait a moment and try again.";
    } else if (err instanceof Anthropic.BadRequestError) {
      text = `Request rejected: ${err.message}`;
    } else if (err instanceof Anthropic.APIConnectionError) {
      text = "Could not reach the AI service. Check the server's network connection.";
    }
    send({ type: "error", text });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Apex Counsel AI running at http://localhost:${PORT}`);
});
