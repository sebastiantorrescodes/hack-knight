import { useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { getVoiceSession } from "../api";

/**
 * A live speech-to-speech call with the plant's ElevenLabs agent. Must be inside a ConversationProvider.
 * Transcribed turns and tool calls arrive through onTurn:
 *   { kind: "text", role: "user" | "agent", text }  or  { kind: "tool", name, failed }
 */
export function useVoiceCall({ plantId, onTurn }) {
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const conversation = useConversation({
    onMessage: ({ message, role }) => message && onTurn({ kind: "text", role, text: message }),
    onAgentToolResponse: (r) => r?.tool_name && onTurn({ kind: "tool", name: r.tool_name, failed: !!r.is_error }),
    onError: (message) => setError(typeof message === "string" ? message : "Something went wrong with the call"),
  });

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      // Ask for the mic up front so a blocked permission gets a clear message
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => t.stop());
      const session = await getVoiceSession(plantId);
      conversation.startSession({
        conversationToken: session.conversation_token,
        connectionType: "webrtc",
        dynamicVariables: session.dynamic_variables,
      });
    } catch (e) {
      setError(
        e.name === "NotAllowedError" ? "Microphone access is blocked. Allow it in your browser to talk." : e.message
      );
    } finally {
      setStarting(false);
    }
  };

  const { status } = conversation;
  return {
    start,
    end: conversation.endSession,
    sendText: conversation.sendUserMessage,
    connecting: starting || status === "connecting",
    active: starting || status === "connecting" || status === "connected",
    connected: status === "connected",
    speaking: conversation.isSpeaking,
    muted: conversation.isMuted,
    setMuted: conversation.setMuted,
    error,
  };
}
