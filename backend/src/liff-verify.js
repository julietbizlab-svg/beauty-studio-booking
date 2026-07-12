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

  var channelId = env.LIFF_CHANNEL_ID;
  if (!channelId) {
    throw makeError("伺服器缺少 LIFF_CHANNEL_ID 設定", 500);
  }

  var response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "id_token=" + encodeURIComponent(idToken) +
      "&client_id=" + encodeURIComponent(channelId)
  });

  var body = null;
  try {
    body = await response.json();
  } catch (ignore) {
    body = null;
  }

  if (!response.ok) {
    var msg = (body && body.error_description)
      ? body.error_description
      : "登入憑證無效或已過期";
    throw makeError(msg, 401);
  }

  if (!body || !body.sub) {
    throw makeError("登入憑證無效或已過期", 401);
  }

  return {
    userId: body.sub,
    name: body.name || "",
    picture: body.picture || ""
  };
}
