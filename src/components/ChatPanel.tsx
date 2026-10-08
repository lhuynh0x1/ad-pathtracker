import { useState } from "react";
import { MessageSquare, Send, Settings, X } from "lucide-react";
import { useGraphStore } from "../store/useGraphStore";
import { askClaude, CLAUDE_MODELS, getApiKey, getModel, setApiKey, setModel } from "../lib/claudeClient";

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey());
  const [modelInput, setModelInput] = useState(getModel());

  const messages = useGraphStore((s) => s.chatMessages);
  const addChatMessage = useGraphStore((s) => s.addChatMessage);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    addChatMessage({ role: "user", content: text });
    setLoading(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const reply = await askClaude({ userMessage: text, history, nodes, edges });
      addChatMessage({ role: "assistant", content: reply });
    } catch (err) {
      addChatMessage({
        role: "assistant",
        content: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = () => {
    setApiKey(apiKeyInput.trim());
    setModel(modelInput);
    setShowSettings(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
      >
        <MessageSquare size={18} /> Ask Claude
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#11141c] shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-800 bg-[#1a1e29] px-3 py-2">
        <span className="text-sm font-semibold text-gray-200">Attack Path Advisor</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings((v) => !v)} className="text-gray-400 hover:text-gray-200">
            <Settings size={16} />
          </button>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
      </div>

      {showSettings ? (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          <label className="text-xs text-gray-400">
            <span className="mb-1 block font-medium">Anthropic API Key</span>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-sm text-gray-100 outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-xs text-gray-400">
            <span className="mb-1 block font-medium">Model</span>
            <select
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="w-full rounded border border-gray-700 bg-[#1a1e29] px-2 py-1 text-sm text-gray-100 outline-none focus:border-blue-500"
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-gray-500">
            Your key is stored only in this browser's local storage and is sent directly to
            Anthropic's API — never to any third party.
          </p>
          <button
            onClick={saveSettings}
            className="rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-500">
                Ask what to do next based on everything you've mapped out so far — e.g. "what's
                my best path to domain admin right now?"
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded px-2.5 py-1.5 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "self-end bg-blue-600 text-white"
                    : "self-start bg-[#1a1e29] text-gray-100"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && <div className="self-start text-xs text-gray-500">Thinking…</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-gray-800 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask for the next attack vector…"
              className="flex-1 rounded border border-gray-700 bg-[#1a1e29] px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="rounded bg-blue-600 p-1.5 text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
