process.env.NODE_ENV = "test";
process.env.BACKEND_PORT = "0";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN = "123456:test_bot_token";
process.env.BOT_USERNAME = "petcare_test_bot";
process.env.OPENROUTER_STT_PARSER = "test_openrouter_key";
process.env.OPENROUTER_STT_MODEL_PARSER = "google/gemini-3.1-flash-lite";
process.env.OPENROUTER_STT_MODEL_PARSER_FALLBACK = "minimax/minimax-m3";
delete process.env.MINIMAX_API_KEY;

const { parseVoiceCommandWithMinimax } = await import("../src/services/minimaxVoiceCommandParser.service.js");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const requestedModels: string[] = [];
globalThis.fetch = async (input, init) => {
  assert(String(input) === "https://openrouter.ai/api/v1/chat/completions", "Expected OpenRouter parser endpoint.");
  assert(typeof init?.body === "string", "Expected JSON request body.");

  const body = JSON.parse(init.body) as Record<string, unknown>;
  assert(typeof body.model === "string", "Expected explicit model selection for application-level fallback.");
  requestedModels.push(body.model);
  assert(body.temperature === 0, "Expected deterministic parser temperature.");
  assert(body.max_tokens === 550, "Expected compact parser output limit with truncation headroom.");

  const responseFormat = body.response_format as Record<string, unknown>;
  const jsonSchema = responseFormat?.json_schema as Record<string, unknown>;
  assert(responseFormat?.type === "json_schema", "Expected strict JSON schema response format.");
  assert(jsonSchema?.strict === true, "Expected strict structured output.");

  if (requestedModels.length === 1) {
    return new Response(JSON.stringify({ choices: [{ message: { content: "{broken-json" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          intent: "create_weight_entry",
          target: "diary",
          confidence: 0.98,
          draft: {
            weightKg: 4.2,
            localDate: null,
            localTime: null,
            hasExplicitDate: false,
            hasExplicitTime: false
          },
          warnings: []
        })
      }
    }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

const parsed = await parseVoiceCommandWithMinimax({
  transcript: "вес 4.2 кг",
  clientNow: "2026-07-17T12:00:00.000Z",
  timezone: "Europe/Moscow",
  locale: "ru"
});

assert(parsed.intent === "create_weight_entry", "Expected parsed weight entry.");
assert(parsed.draft.weightKg === 4.2, "Expected parsed weight value.");
assert(
  JSON.stringify(requestedModels) === JSON.stringify(["google/gemini-3.1-flash-lite", "minimax/minimax-m3"]),
  "Expected invalid primary JSON to trigger the MiniMax fallback."
);

console.log("Voice parser OpenRouter provider smoke checks passed.");
