import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test_webhook_secret_123456789";

const [{ createApp }, { validateTelegramInitData }] = await Promise.all([
  import("../src/app.js"),
  import("../src/services/telegramAuth.service.js")
]);

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

type JsonResponse = {
  status: number;
  body: unknown;
};

async function request(path: string, init: RequestInit): Promise<JsonResponse> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  return { status: response.status, body: await response.json() };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function signedInitDataWithThirdPartySignature() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "security-smoke-query",
    user: JSON.stringify({ id: 777000123, first_name: "Smoke", language_code: "en" }),
    signature: "third-party-ed25519-signature"
  });
  const dataCheck = Array.from(params.entries())
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

try {
  const parsedInitData = validateTelegramInitData(signedInitDataWithThirdPartySignature());
  assert(parsedInitData.user.id === 777000123, "Expected signed initData with signature field to validate.");

  const extraAuthField = await request("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData: "malformed", injectedRole: "admin" })
  });
  assert(extraAuthField.status === 400, `Expected strict auth body to return 400, got ${extraAuthField.status}`);

  const badWebhookSecret = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong_secret" },
    body: JSON.stringify({})
  });
  assert(badWebhookSecret.status === 401, `Expected bad webhook secret to return 401, got ${badWebhookSecret.status}`);

  const malformedPayment = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET! },
    body: JSON.stringify({
      pre_checkout_query: {
        id: "checkout-test",
        invoice_payload: "payload-test",
        currency: "USD",
        total_amount: 199
      }
    })
  });
  assert(malformedPayment.status === 400, `Expected malformed Telegram payment to return 400, got ${malformedPayment.status}`);

  const ignoredWebhook = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET! },
    body: JSON.stringify({ update_id: 1 })
  });
  assert(ignoredWebhook.status === 200, `Expected harmless Telegram update to return 200, got ${ignoredWebhook.status}`);

  const malformedSuccessfulPayment = await request("/api/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET! },
    body: JSON.stringify({
      message: {
        successful_payment: {
          invoice_payload: "payload-test",
          currency: "XTR",
          total_amount: 199,
          provider_payment_charge_id: ""
        }
      }
    })
  });
  assert(malformedSuccessfulPayment.status === 400, `Expected malformed successful payment to return 400, got ${malformedSuccessfulPayment.status}`);

  console.log("Security smoke checks passed.");
} finally {
  server.close();
}
