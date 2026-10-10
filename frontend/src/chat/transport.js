import { post } from "../api";

const HISTORY_TURNS = 20;
const WORD_DELAY_MS = 18; // the reply is typed out word by word

const textOf = (message) =>
  message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(id), resolve()), { once: true });
  });

/**
 * A Vercel AI SDK ChatTransport for our FastAPI backend.
 *
 * /agent/chat runs the whole Gemini tool loop on the server and returns
 * { reply, actions: [{ tool, args, result }] } as JSON. This turns that into the UI message chunks useChat
 * expects: one dynamic tool part per action the agent took, then the reply text.
 */
export class PlantChatTransport {
  constructor(plantId) {
    this.plantId = plantId;
  }

  async sendMessages({ messages, abortSignal }) {
    const last = messages[messages.length - 1];
    const history = messages
      .slice(0, -1)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role === "user" ? "user" : "model", text: textOf(m) }))
      .filter((m) => m.text);

    const run = await post("/agent/chat", { plant_id: this.plantId, message: textOf(last), history }, abortSignal);

    return new ReadableStream({
      async start(controller) {
        const send = (chunk) => controller.enqueue(chunk);
        send({ type: "start" });

        (run.actions || []).forEach((action, i) => {
          const toolCallId = `${run.id}-${i}`;
          send({ type: "start-step" });
          send({ type: "tool-input-available", toolCallId, toolName: action.tool, input: action.args, dynamic: true });
          send({ type: "tool-output-available", toolCallId, output: action.result, dynamic: true });
          send({ type: "finish-step" });
        });

        const id = `${run.id}-text`;
        send({ type: "start-step" });
        send({ type: "text-start", id });
        for (const word of (run.reply || "").split(/(?<=\s)/)) {
          if (abortSignal?.aborted) break;
          send({ type: "text-delta", id, delta: word });
          await sleep(WORD_DELAY_MS, abortSignal);
        }
        send({ type: "text-end", id });
        send({ type: "finish-step" });
        send({ type: "finish" });
        controller.close();
      },
    });
  }

  async reconnectToStream() {
    return null; // replies aren't resumable; each request returns the whole answer
  }
}
