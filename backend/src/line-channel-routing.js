/**
 * Tenant-specific LINE channel registry.
 *
 * LINE_TENANT_CHANNELS_JSON is a Worker secret containing an object keyed by
 * tenant id. Values may contain providerId, messagingAccessToken,
 * liffClientIds, customerLiffId and webhookSecret. This module never logs or returns the
 * registry wholesale.
 */

function clean(value) {
  return String(value || "").trim();
}

function registry(env) {
  var raw = clean(env && env.LINE_TENANT_CHANNELS_JSON);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed : {};
  } catch (ignore) {
    return {};
  }
}

export function legacyShowcaseLineRoutesEnabled(env) {
  return clean(env && env.LINE_LEGACY_SHOWCASE_ROUTES_ENABLED).toLowerCase() !== "false";
}

export function sharedShowcaseLineRouteEnabled(env) {
  return clean(env && env.LINE_SHOWCASE_SHARED_OA_ENABLED).toLowerCase() === "true";
}

export function tenantLineChannel(env, tenantId) {
  var id = clean(tenantId);
  if (!id) return null;
  var value = registry(env)[id];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  var liffClientIds = Array.isArray(value.liffClientIds)
    ? value.liffClientIds.map(clean).filter(function (item, index, values) {
      return item && values.indexOf(item) === index;
    })
    : [];
  return {
    providerId: clean(value.providerId),
    messagingAccessToken: clean(value.messagingAccessToken),
    liffClientIds: liffClientIds,
    customerLiffId: clean(value.customerLiffId),
    webhookSecret: clean(value.webhookSecret),
    webhookRouteKey: clean(value.webhookRouteKey)
  };
}

export function tenantLineWebhookRoute(env, routeKey) {
  var key = clean(routeKey);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return null;
  var entries = registry(env);
  var tenantIds = Object.keys(entries);
  for (var i = 0; i < tenantIds.length; i++) {
    var tenantId = tenantIds[i];
    var channel = tenantLineChannel(env, tenantId);
    if (channel && channel.webhookRouteKey === key && channel.webhookSecret) {
      return { tenantId: tenantId, webhookSecret: channel.webhookSecret };
    }
  }
  return null;
}

export function lineMessagingTokenForTenant(env, tenantId) {
  var configured = tenantLineChannel(env, tenantId);
  if (configured && configured.messagingAccessToken) {
    return configured.messagingAccessToken;
  }
  if (legacyShowcaseLineRoutesEnabled(env) &&
      clean(tenantId) === clean(env && env.STANDARD_SHOWCASE_TENANT_ID)) {
    return clean(env && env.STANDARD_LINE_CHANNEL_ACCESS_TOKEN);
  }
  if (legacyShowcaseLineRoutesEnabled(env) &&
      clean(tenantId) === clean(env && env.FLAGSHIP_SHOWCASE_TENANT_ID)) {
    return clean(env && env.FLAGSHIP_LINE_CHANNEL_ACCESS_TOKEN);
  }
  if (!legacyShowcaseLineRoutesEnabled(env) && sharedShowcaseLineRouteEnabled(env) &&
      (clean(tenantId) === clean(env && env.STANDARD_SHOWCASE_TENANT_ID) ||
       clean(tenantId) === clean(env && env.FLAGSHIP_SHOWCASE_TENANT_ID))) {
    return clean(env && env.LINE_CHANNEL_ACCESS_TOKEN);
  }
  if (clean(tenantId) === clean(env && env.DEFAULT_LINE_TENANT_ID)) {
    return clean(env && env.LINE_CHANNEL_ACCESS_TOKEN);
  }
  return "";
}

export function lineLiffClientIdsForTenant(env, tenantId) {
  var configured = tenantLineChannel(env, tenantId);
  if (!configured) return [];
  var clientIds = configured.liffClientIds.slice();
  var customerLiffClientId = configured.customerLiffId.split("-")[0];
  if (/^\d+$/.test(customerLiffClientId) &&
      clientIds.indexOf(customerLiffClientId) === -1) {
    clientIds.push(customerLiffClientId);
  }
  return clientIds;
}

export function tenantIdForLiffClientId(env, clientId) {
  var target = clean(clientId);
  if (!target) return "";
  var entries = registry(env);
  var tenantIds = Object.keys(entries);
  var matchedTenantId = "";
  for (var i = 0; i < tenantIds.length; i++) {
    var tenantId = tenantIds[i];
    if (lineLiffClientIdsForTenant(env, tenantId).indexOf(target) === -1) continue;
    if (matchedTenantId && matchedTenantId !== tenantId) return "";
    matchedTenantId = tenantId;
  }
  return matchedTenantId;
}

/** Public LIFF app id used to build this tenant's customer entry URL. */
export function lineCustomerLiffIdForTenant(env, tenantId) {
  var configured = tenantLineChannel(env, tenantId);
  return configured ? configured.customerLiffId : "";
}

export function tenantLineChannelReadiness(env, tenantId) {
  var channel = tenantLineChannel(env, tenantId);
  if (!channel) {
    return { configured: false, ready: false, missing: ["registry"] };
  }
  var missing = [];
  if (!channel.providerId) missing.push("providerId");
  if (!channel.messagingAccessToken) missing.push("messagingAccessToken");
  if (!channel.liffClientIds.length) missing.push("liffClientIds");
  if (!/^\d+-[A-Za-z0-9_-]+$/.test(channel.customerLiffId)) {
    missing.push("customerLiffId");
  }
  if (!channel.webhookSecret) missing.push("webhookSecret");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(channel.webhookRouteKey)) {
    missing.push("webhookRouteKey");
  }
  return { configured: true, ready: missing.length === 0, missing: missing };
}
