function safeDate(value) {
  var text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  var date = new Date(text + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
    ? text : null;
}

export function getOwnerSubscriptionStatus(env, todayInput) {
  var today = safeDate(todayInput) || new Date().toISOString().slice(0, 10);
  var trialEndsOn = safeDate(env && env.OWNER_TRIAL_END_DATE);
  var subscriptionEndsOn = safeDate(env && env.OWNER_SUBSCRIPTION_END_DATE);
  var status = "unconfigured";
  var statusLabel = "租用期限尚未設定";
  if (subscriptionEndsOn && subscriptionEndsOn >= today) {
    status = "active";
    statusLabel = "正式租用中";
  } else if (trialEndsOn && trialEndsOn >= today) {
    status = "trial";
    statusLabel = "試用中";
  } else if (trialEndsOn || subscriptionEndsOn) {
    status = "expired";
    statusLabel = "租用已到期";
  }
  return {
    ok: true,
    status: status,
    statusLabel: statusLabel,
    trialEndsOn: trialEndsOn,
    subscriptionEndsOn: subscriptionEndsOn
  };
}
