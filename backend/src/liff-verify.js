import {
  legacyShowcaseLineRoutesEnabled,
  lineLiffClientIdsForTenant
} from "./line-channel-routing.js";

/**
 * LINE LIFF ID Token 伺服器端驗證
 */

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 401;
  return error;
}

function extractBearerToken(request) {
  var authHeader = request.headers.get("Authorization") || "";
  var match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].trim();
}

export function idTokenAudience(idToken) {
  try {
    var payloadPart = String(idToken || "").split(".")[1];
    if (!payloadPart) return "";
    payloadPart = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (payloadPart.length % 4) payloadPart += "=";
    var payload = JSON.parse(atob(payloadPart));
    return String(payload && payload.aud || "").trim();
  } catch (ignore) {
    return "";
  }
}

export function extractIdTokenFromRequest(request) {
  var token = extractBearerToken(request);
  if (!token) {
    throw makeError("缺少登入憑證", 401);
  }
  return token;
}

export async function verifyLineIdToken(idToken, env) {
  if (!idToken) {
    throw makeError("缺少登入憑證", 401);
  }

  var tenantChannelIds = lineLiffClientIdsForTenant(env || {}, env && env.TENANT_ID);
  var legacyChannelIds = [env.LIFF_CHANNEL_ID];
  if (legacyShowcaseLineRoutesEnabled(env)) {
    legacyChannelIds.push(env.STANDARD_LIFF_CLIENT_ID, env.FLAGSHIP_LIFF_CLIENT_ID);
  }
  legacyChannelIds.push(env.OWNER_LIFF_CLIENT_ID);
  var channelIds = tenantChannelIds.length ? tenantChannelIds : legacyChannelIds;
  channelIds = channelIds.map(function (value) {
    return String(value || "").trim();
  }).filter(function (value, index, values) {
    return value && values.indexOf(value) === index;
  });
  if (!channelIds.length) {
    throw makeError("伺服器缺少 LIFF_CHANNEL_ID 設定", 500);
  }

  var lastBody = null;
  for (var i = 0; i < channelIds.length; i++) {
    var response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "id_token=" + encodeURIComponent(idToken) +
        "&client_id=" + encodeURIComponent(channelIds[i])
    });

    var body = null;
    try {
      body = await response.json();
    } catch (ignore) {
      body = null;
    }
    lastBody = body;

    if (response.ok && body && body.sub) {
      return {
        userId: body.sub,
        name: body.name || "",
        picture: body.picture || ""
      };
    }
  }

  var msg = (lastBody && lastBody.error_description)
    ? lastBody.error_description
    : "登入憑證無效或已過期";
  if (/invalid idtoken audience/i.test(msg)) {
    var tokenAudience = idTokenAudience(idToken);
    msg = !tokenAudience
      ? "LINE_AUDIENCE_DIAGNOSTIC: token_audience_unreadable"
      : (channelIds.indexOf(tokenAudience) === -1
        ? "LINE_AUDIENCE_DIAGNOSTIC: token_channel_not_registered"
        : "LINE_AUDIENCE_DIAGNOSTIC: registered_channel_rejected");
  }
  throw makeError(msg, 401);
}

/**
 * 從 request 驗證客人身分（fail closed）。
 * 真實 userId 一律取自驗證後 token 的 sub，
 * 呼叫端不得再信任 body／query 中的 userId。
 * @returns {Promise<{userId: string, name: string, picture: string}>}
 */
export async function requireCustomerFromRequest(request, env) {
  var idToken = extractIdTokenFromRequest(request);
  return verifyLineIdToken(idToken, env);
}
