import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt, JURISDICTIONS, MODES } from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-opus-5-5";
const MAX_CONTINUATIONS = 4; // server tools (web search) can return pause_turn

const client = new Anthropic();
const app = express();

app.use(express.json({ limit: "25mb" })); // PDFs are sent base64-encoded
app.use(express.static(path.join(here, "public")));

app.get("/api/config", (_req, res) => {
  res.json({ jurisdictions: JURISDICTIONS, modes: MODES });
});

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
  const { jurisdiction, subJurisdiction, mode, webSearch } = req.body ?? {};
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

  const tools = webSearch
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]
    : undefined;

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS && !aborted; turn++) {
      stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        cache_control: { type: "ephemeral" },
        output_config: { effort: MODES[mode].effort },
        system: buildSystemPrompt({ jurisdiction, subJurisdiction, mode }),
        messages,
        ...(tools && { tools }),
      });

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use" && block.name === "web_search") {
            send({ type: "status", text: "Searching the web for authorities..." });
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            send({
              type: "sources",
              sources: block.content
                .filter((r) => r.type === "web_search_result")
                .map((r) => ({ title: r.title, url: r.url })),
            });
          }
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send({ type: "text", text: event.delta.text });
        }
      }

      const message = await stream.finalMessage();
      if (message.stop_reason === "pause_turn") {
        // Resume the server-tool turn by sending the partial assistant turn back.
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      if (message.stop_reason === "refusal") {
        send({
          type: "error",
          text: "The model declined this request. Try rephrasing it as a legal research or analysis question.",
        });
      } else if (message.stop_reason === "max_tokens") {
        send({ type: "status", text: "Response reached the length limit — ask it to continue." });
      }
      break;
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
