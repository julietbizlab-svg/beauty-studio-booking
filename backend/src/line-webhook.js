/**
 * LINE OA Messaging API webhook.
 * LINE OA 聊天室只由 LINE Official Account Manager 的關鍵字規則回覆。
 * AI 僅存在於客戶點選圖文選單後進入的系統客戶端，不在 webhook 回話。
 * 此端點只驗證 LINE 簽章並安全接收事件，絕不呼叫 AI 或 reply API。
 */

import { tenantLineWebhookRoute } from "./line-channel-routing.js";

var MAX_WEBHOOK_BYTES = 256 * 1024;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status;
  return error;
}

function decodeBase64(value) {
  try {
    var binary = atob(String(value || ""));
    return Uint8Array.from(binary, function (char) {
      return char.charCodeAt(0);
    });
  } catch (error) {
    return null;
  }
}

async function verifyLineSignature(bodyBytes, signature, secret) {
  var expected = decodeBase64(signature);
  if (!expected || !expected.length || !secret) return false;
  var key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, expected, bodyBytes);
}

async function verifyAndReadWebhook(request, secret) {
  if (!secret) {
    throw makeError("LINE Webhook 尚未設定", 503);
  }

  var contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    throw makeError("請求內容過大", 413);
  }
  var bodyBytes = new Uint8Array(await request.arrayBuffer());
  if (bodyBytes.byteLength > MAX_WEBHOOK_BYTES) {
    throw makeError("請求內容過大", 413);
  }
  var valid = await verifyLineSignature(
    bodyBytes,
    request.headers.get("X-Line-Signature"),
    secret
  );
  if (!valid) {
    throw makeError("LINE 簽章驗證失敗", 401);
  }

  var payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch (error) {
    throw makeError("LINE Webhook 格式錯誤", 400);
  }

  var events = Array.isArray(payload.events) ? payload.events : [];

  return events.length;
}

export async function handleLineWebhook(request, env) {
  var secret = String(env.LINE_CHANNEL_SECRET || "").trim();
  return { ok: true, processed: await verifyAndReadWebhook(request, secret) };
}

export async function handleTenantLineWebhook(request, env, routeKey) {
  var route = tenantLineWebhookRoute(env || {}, routeKey);
  if (!route) {
    throw makeError("LINE Webhook 路由不存在", 404);
  }
  var processed = await verifyAndReadWebhook(request, route.webhookSecret);
  return { ok: true, processed: processed, tenantScoped: true };
}
