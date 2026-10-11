import { postLines } from "../api";

const HISTORY_TURNS = 20;

const textOf = (message) =>
  message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");

/**
 * A Vercel AI SDK ChatTransport for our FastAPI backend.
 *
 * /agent/chat/stream runs the Gemini tool loop on the server and streams one JSON event per line as it goes
 * (text deltas, tool calls and their results; see agent.run_stream). This turns those into the UI message
 * chunks useChat expects: a dynamic tool part per tool call, and text parts for what the plant says.
 */
export class PlantChatTransport {
  constructor(plantId) {
    this.plantId = plantId;
  }

  async sendMessages({ messages, abortSignal }) {
    const last = messages[messages.length - 1];
    const history = messages
      .slice(0, -1)
      .filter((m) => !m.metadata?.checkIn) // check-ins weren't part of the conversation
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role === "user" ? "user" : "model", text: textOf(m) }))
      .filter((m) => m.text);

    const events = postLines(
      "/agent/chat/stream",
      { plant_id: this.plantId, message: textOf(last), history },
      abortSignal,
    );
    const runId = crypto.randomUUID();

    return new ReadableStream({
      async start(controller) {
        const send = (chunk) => controller.enqueue(chunk);
        let textId = null; // the text part being streamed into, if any
        let texts = 0;

        // Text before and after a tool call goes in separate parts, so the tool chip sits between them
        const endText = () => {
          if (!textId) return;
          send({ type: "text-end", id: textId });
          send({ type: "finish-step" });
          textId = null;
        };

        send({ type: "start" });
        try {
          for await (const event of events) {
            if (event.type === "text") {
              if (!textId) {
                textId = `${runId}-text-${texts++}`;
                send({ type: "start-step" });
                send({ type: "text-start", id: textId });
              }
              send({ type: "text-delta", id: textId, delta: event.delta });
            } else if (event.type === "tool_call") {
              endText();
              const toolCallId = `${runId}-${event.id}`;
              send({ type: "start-step" });
              send({ type: "tool-input-available", toolCallId, toolName: event.tool, input: event.args, dynamic: true });
            } else if (event.type === "tool_result") {
              send({ type: "tool-output-available", toolCallId: `${runId}-${event.id}`, output: event.result, dynamic: true });
              send({ type: "finish-step" });
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
          endText();
          send({ type: "finish" });
        } catch (err) {
          if (!abortSignal?.aborted) send({ type: "error", errorText: err.message });
        }
        controller.close();
      },
    });
  }

  async reconnectToStream() {
    return null; // replies aren't resumable
  }
}
