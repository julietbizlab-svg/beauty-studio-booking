/**
 * 客人端 AI 預約助手。
 * Provider 只接收需求文字與公開服務資訊；不接收姓名、電話、生日或 LINE 身分。
 * 完成回答後，將安全截斷的洽詢、回答與業主摘要寫入 tenant-scoped D1，
 * 供 AI 店務秘書回報；LINE userId 不會送給 provider 或回傳前端。
 */
import {
  listServices,
  createCustomerAiInquiry,
  countDailyCustomerAiInquiries,
  listWeeklySlots,
  getActiveBookingsForMonth,
  getServiceDurationMap,
  getSettings
} from "./data-repository.js";
import {
  weekdayLabelFromIndex,
  buildAllSlotTimesForDay,
  filterAvailableSlots,
  filterSlotsByBookingNotice,
  buildBusyIntervalsFromBookings,
  CONSERVATIVE_BUSY_DURATION_MINUTES,
  getNowMinutesInTaipei
} from "./slots.js";
import { parseNoticeDays, DEFAULT_NOTICE_DAYS } from "./booking-notice-policy.js";
import { getTaipeiDateString, getTaipeiWeekdayIndex } from "./owner-auth.js";
import { getBrowIntakePolicy } from "./brow-intake-policy.js";
import { handleBrowIntakeSop } from "./brow-intake-sop.js";

var MAX_MESSAGE_CODE_POINTS = 300;
var MAX_REPLY_CODE_POINTS = 500;
var MAX_OWNER_SUMMARY_CODE_POINTS = 240;
var RATE_LIMIT = 5;
var RATE_WINDOW_MS = 60 * 1000;
var rateStore = Object.create(null);
var CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
var AVAILABILITY_INTENT =
  /最快|最早|什麼時候|何時|何時能|可以約|可預約|能預約|有空|空檔|時段/;
var DIRECT_SERVICE_INQUIRY =
  /^(?:我)?想(?:要)?(?:問|詢問|了解)(?:一下)?([^？?。！!\n]{1,24})[？?。！!]*$/;
var SYSTEM_BUSINESS_INTENT =
  /建置系統|系統建置|交付使用|交付系統|系統方案|方案確認|購買系統|訂閱系統|後台設定/;
var ADDRESS_KEYWORD_INTENT =
  /地址|住址|店址|地點|位置|導航|交通|路線|捷運|公車|停車|怎麼去|怎麼到|如何前往|如何到達|如何去|如何到/;
var ADDRESS_WHERE_INTENT = /在哪(?:裡|里|邊|边|兒|儿)?/;
var BROW_SERVICE_INTENT = /霧眉|紋眉|飄眉|粉霧眉|紋繡|眉毛/;
var BROW_COLOR_CHANGE_INTENT = /改色|調色|舊眉.*(?:調整|修改|重做)|眉.*(?:改色|調色)/;
var GENERIC_INQUIRY_TERMS = [
  "服務", "項目", "美容", "保養", "預約", "價格", "價錢", "費用", "時段", "問題"
];
var DEFAULT_PROVIDER_TIMEOUT_MS = 6000;

function makeError(message, status, headers) {
  var error = new Error(message);
  error.status = status;
  if (headers) error.headers = headers;
  return error;
}

function codePoints(value) {
  return Array.from(String(value || ""));
}

function normalizeServiceText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

export function isAddressInquiry(message) {
  var text = String(message || "").replace(/[\s？?。！!，,、]/g, "");
  if (!text) return false;
  if (ADDRESS_KEYWORD_INTENT.test(text)) return true;
  if (!ADDRESS_WHERE_INTENT.test(text)) return false;
  // 「哪裡可以做霧眉」是在問服務，不應誤判成工作室地址。
  if (/哪(?:裡|里|邊|边|兒|儿)?.*(?:可以|能|適合)?(?:做|施作|服務|項目)/.test(text)) {
    return false;
  }
  return text.length <= 12 || /你們|妳們|工作室|店家|店裡|門市|這邊|那邊/.test(text);
}

function getUnknownDirectService(message, services) {
  var matched = String(message || "").match(DIRECT_SERVICE_INQUIRY);
  if (!matched) return "";
  var candidate = normalizeServiceText(matched[1]);
  if (!candidate || GENERIC_INQUIRY_TERMS.indexOf(candidate) !== -1) return "";
  var isKnown = services.some(function (service) {
    var name = normalizeServiceText(service.name);
    return name === candidate || name.includes(candidate) || candidate.includes(name);
  });
  return isKnown ? "" : matched[1].trim();
}

function configuredAddressReply(settings) {
  var knowledge = [
    settings && settings.customerAiStudioIntro,
    settings && settings.customerAiKnowledge
  ].filter(Boolean).join("\n");
  var line = knowledge.split(/[\n。；;]/).map(function (item) {
    return item.trim();
  }).find(function (item) {
    return item.length > 2 && /地址|位於|地點|位置/.test(item);
  });
  return line ? "工作室地址資訊：" + line + "。" : "";
}

function enabled(env) {
  var flag = env && env.CUSTOMER_AI_ENABLED;
  return flag === true || flag === "true" || flag === "1";
}

function providerTimeoutMs(env) {
  var configured = Number(env && env.CUSTOMER_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 15000) : DEFAULT_PROVIDER_TIMEOUT_MS;
}

async function recommendWithTimeout(provider, payload, env) {
  var timer;
  try {
    return await Promise.race([
      provider.recommend(payload),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(makeError("AI 回覆逾時", 504));
        }, providerTimeoutMs(env));
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getProvider(env) {
  if (env && env.CUSTOMER_AI_PROVIDER &&
      typeof env.CUSTOMER_AI_PROVIDER.recommend === "function") {
    return env.CUSTOMER_AI_PROVIDER;
  }
  if (!env || !env.AI || typeof env.AI.run !== "function") return null;
  var model = String(env.CUSTOMER_AI_MODEL || "").trim();
  if (!model) return null;
  return {
    recommend: async function (payload) {
      var specialistPolicy = getBrowIntakePolicy(
        payload && payload.businessGuidance && payload.businessGuidance.businessType
      );
      var result = await env.AI.run(model, {
        messages: [
          {
            role: "system",
            content:
              "你是該工作室由業主設定的 AI 預約秘書。只使用提供的服務資料與業主知識，以繁體中文簡短回答。" +
              "你的首要目標是協助客人完成下一步：需求明確時推薦一項最符合的已公開服務，" +
              "並清楚引導客人查看可預約時間；需求不明確時只問一個最關鍵的確認問題。" +
              "不要一次堆疊多個入口、長篇介紹或空泛客套；先回答當下問題，再給一個明確下一步。" +
              "不得假設工作室是美容、美甲、霧眉或任何特定業種；專業類型以業主設定為準。" +
              "客人語音輸入可能有同音錯字，請依店內服務名稱與說明判斷最可能的服務，" +
              "但不確定時必須反問，不能自行選擇。" +
              "若客人詢問最快、最早或可預約時段，availabilityRequested 必須為 true；" +
              "只有客人文字明確提及某服務時 serviceMentionedByCustomer 才能為 true。" +
              "不得捏造療效、價格、政策、日期或可用時段；日期時段由系統另行查詢。" +
              "只有能由公開服務資料支持時才能填 recommendedServiceId；不確定就留空並反問。" +
              "不得聲稱已完成預約。" +
              "只輸出 JSON，格式為 " +
              "{\"reply\":\"給客人的回答\",\"recommendedServiceId\":\"服務 id 或空字串\"," +
              "\"ownerSummary\":\"給業主看的洽詢重點\",\"needsOwnerFollowUp\":true或false," +
              "\"availabilityRequested\":true或false," +
              "\"serviceMentionedByCustomer\":true或false}。" +
              "若客人詢問即時空檔、特殊需求、價格確認或需要店家決定的事項，" +
              "needsOwnerFollowUp 必須為 true。" +
              (specialistPolicy
                ? "\n【霧眉新客評估強制規範】\n" + specialistPolicy +
                  "\n【強制規範結束】"
                : "")
          },
          {
            role: "user",
            content:
              "【客人需求與公開服務資料開始】\n" +
              JSON.stringify(payload) +
              "\n【客人需求與公開服務資料結束】"
          }
        ]
      });
      if (typeof result === "string") return result;
      var content = result && (result.response != null ? result.response : result.text);
      if (content && typeof content === "object") {
        return JSON.stringify(content);
      }
      return String(content || "");
    }
  };
}

export function getCustomerAiCapability(env, settings) {
  var ownerEnabled = !settings || settings.customerAiEnabled !== false;
  return { ok: true, enabled: ownerEnabled && enabled(env) && Boolean(getProvider(env)) };
}

function assertRateLimit(env, userId) {
  var now = env && Number.isFinite(env.AI_RATE_LIMIT_NOW_MS)
    ? env.AI_RATE_LIMIT_NOW_MS : Date.now();
  var store = env && env.AI_RATE_LIMIT_STORE ? env.AI_RATE_LIMIT_STORE : rateStore;
  var key = "customer-ai:" + String(userId || "");
  var hits = Array.isArray(store[key]) ? store[key] : [];
  hits = hits.filter(function (time) { return now - time < RATE_WINDOW_MS; });
  if (hits.length >= RATE_LIMIT) {
    throw makeError("操作過於頻繁，請稍後再試", 429, { "Retry-After": "60" });
  }
  hits.push(now);
  store[key] = hits;
}

function parseProviderResult(raw, serviceIds, originalMessage) {
  var text = String(raw || "").trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (ignore) {
    var jsonStart = text.indexOf("{");
    var jsonEnd = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch (nestedIgnore) {}
    }
    // 模型若只回純文字，仍可安全顯示說明，但不允許自動套用服務。
    if (!parsed && text && !CONTROL_CHARS.test(text)) {
      parsed = {
        reply: text,
        recommendedServiceId: "",
        ownerSummary: originalMessage,
        needsOwnerFollowUp: true
      };
    }
    if (!parsed) {
      throw makeError("AI 暫時無法提供建議，請稍後再試", 502);
    }
  }
  var reply = String(parsed && parsed.reply || "").replace(CONTROL_CHARS, "").trim();
  if (!reply) throw makeError("AI 暫時無法提供建議，請稍後再試", 502);
  reply = codePoints(reply).slice(0, MAX_REPLY_CODE_POINTS).join("");
  var recommendedServiceId = String(parsed.recommendedServiceId || "");
  if (serviceIds.indexOf(recommendedServiceId) === -1) recommendedServiceId = "";
  var ownerSummary = String(parsed.ownerSummary || originalMessage || "")
    .replace(CONTROL_CHARS, "").trim();
  ownerSummary = codePoints(ownerSummary).slice(0, MAX_OWNER_SUMMARY_CODE_POINTS).join("");
  if (!ownerSummary) ownerSummary = codePoints(originalMessage).slice(
    0, MAX_OWNER_SUMMARY_CODE_POINTS
  ).join("");
  return {
    reply: reply,
    recommendedServiceId: recommendedServiceId,
    ownerSummary: ownerSummary,
    needsOwnerFollowUp: parsed.needsOwnerFollowUp !== false,
    availabilityRequested: parsed.availabilityRequested === true,
    serviceMentionedByCustomer: parsed.serviceMentionedByCustomer === true
  };
}

function addMonths(month, delta) {
  var parts = String(month).split("-");
  var date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + delta, 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}

function formatEarliestSlot(date, time) {
  var parts = String(date).split("-");
  var weekday = ["日", "一", "二", "三", "四", "五", "六"][
    getTaipeiWeekdayIndex(date)
  ];
  return Number(parts[1]) + "月" + Number(parts[2]) + "日（週" + weekday + "）" +
    " " + time;
}

/**
 * 只使用確定性的營業時間與預約資料計算，不讓模型自行生成日期。
 * 最多向後查三個月；通常在第一個月找到後就停止。
 */
export async function findEarliestAvailableSlot(env, service, nowInput) {
  if (env && env.CUSTOMER_AI_AVAILABILITY_PROVIDER &&
      typeof env.CUSTOMER_AI_AVAILABILITY_PROVIDER.findEarliest === "function") {
    return env.CUSTOMER_AI_AVAILABILITY_PROVIDER.findEarliest(service, nowInput);
  }

  var nowUtc = nowInput instanceof Date ? nowInput : new Date(nowInput || Date.now());
  var today = getTaipeiDateString(nowUtc);
  var firstMonth = today.slice(0, 7);
  var weeklySlots = await listWeeklySlots(env);
  var settings = await getSettings(env);
  var minNoticeDays = parseNoticeDays(
    settings.bookingMinNoticeDays,
    DEFAULT_NOTICE_DAYS
  );

  for (var offset = 0; offset < 3; offset++) {
    var month = addMonths(firstMonth, offset);
    var monthResult = await getActiveBookingsForMonth(env, month);
    var bookings = monthResult.bookings || [];
    var durationMap = await getServiceDurationMap(
      env,
      bookings.map(function (booking) { return booking.serviceId; })
    );
    var bookingsByDate = {};
    bookings.forEach(function (booking) {
      if (!bookingsByDate[booking.date]) bookingsByDate[booking.date] = [];
      bookingsByDate[booking.date].push(booking);
    });
    var monthParts = month.split("-");
    var daysInMonth = new Date(
      Number(monthParts[0]),
      Number(monthParts[1]),
      0
    ).getDate();

    for (var day = 1; day <= daysInMonth; day++) {
      var date = month + "-" + String(day).padStart(2, "0");
      if (date < today) continue;
      var weekday = weekdayLabelFromIndex(getTaipeiWeekdayIndex(date));
      var daySlots = weeklySlots.filter(function (slot) {
        return slot.weekday === weekday;
      });
      if (!daySlots.length) continue;
      var busyIntervals = buildBusyIntervalsFromBookings(
        bookingsByDate[date] || [],
        durationMap,
        Math.max(
          Number(service.durationMinutes) || 60,
          CONSERVATIVE_BUSY_DURATION_MINUTES
        )
      );
      var allTimes = buildAllSlotTimesForDay(daySlots, service.durationMinutes);
      var afterNotice = filterSlotsByBookingNotice(
        allTimes,
        date,
        minNoticeDays,
        nowUtc
      );
      var available = filterAvailableSlots(
        afterNotice,
        service.durationMinutes,
        busyIntervals,
        date === today ? today : null,
        date === today ? getNowMinutesInTaipei(nowUtc) : null
      );
      if (available.length) {
        return { date: date, time: available[0] };
      }
    }
  }
  return null;
}

export async function generateCustomerBookingAdvice(env, body, userId) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(function (key) {
        return key !== "message" && key !== "serviceId";
      })) {
    throw makeError("請求格式錯誤", 400);
  }
  var message = String(body.message || "").replace(CONTROL_CHARS, "").trim();
  if (!message || codePoints(message).length > MAX_MESSAGE_CODE_POINTS) {
    throw makeError("請輸入 1～300 字的需求", 400);
  }
  var aiSettings = await getSettings(env);
  if (!getCustomerAiCapability(env, aiSettings).enabled) {
    throw makeError("AI 預約助手尚未啟用", 503);
  }
  assertRateLimit(env, userId);

  var services = await listServices(env, true);
  var publicServices = services.map(function (service) {
    return {
      id: String(service.id),
      name: String(service.name || "").slice(0, 80),
      description: String(service.description || "").slice(0, 240),
      durationMinutes: Number(service.durationMinutes) || 0,
      price: Number(service.price) || 0
    };
  });
  var unknownService = getUnknownDirectService(message, publicServices);
  var hasBrowService = publicServices.some(function (service) {
    return BROW_SERVICE_INTENT.test(service.name + " " + service.description);
  });
  var result;
  if (isAddressInquiry(message)) {
    var addressReply = configuredAddressReply(aiSettings);
    result = {
      reply: addressReply ||
        "目前工作室知識庫尚未提供地址，我不會自行猜測；已轉由工作室確認後回覆。",
      recommendedServiceId: "",
      ownerSummary: addressReply
        ? "客人詢問地址；系統已依工作室知識庫回答。"
        : "客人詢問地址，但工作室知識庫尚未提供，需要業主回覆。",
      needsOwnerFollowUp: !addressReply,
      availabilityRequested: false,
      serviceMentionedByCustomer: false
    };
  } else if (SYSTEM_BUSINESS_INTENT.test(message)) {
    result = {
      reply:
        "已收到您關於付款、方案或系統建置的訊息。這不代表款項已確認入帳；" +
        "這類事項不由預約 AI 判斷，" +
        "已轉由專人確認後回覆。",
      recommendedServiceId: "",
      ownerSummary:
        "客人提出付款、方案或系統建置相關事項，需要業主親自確認。",
      needsOwnerFollowUp: true,
      availabilityRequested: false,
      serviceMentionedByCustomer: false
    };
  } else if (hasBrowService && BROW_COLOR_CHANGE_INTENT.test(message)) {
    result = {
      reply:
        "了解，您想諮詢舊眉改色。請問目前眉毛上是否還有以前紋繡留下的顏色或框線？" +
        "可回答：已很淡／仍明顯／不確定。老師會再依照片評估，現在不會直接開放預約。",
      recommendedServiceId: "",
      ownerSummary: "客人想諮詢舊眉改色；已先詢問目前舊眉底色狀況，需老師依照片人工評估。",
      needsOwnerFollowUp: false,
      availabilityRequested: false,
      serviceMentionedByCustomer: true
    };
  } else if (unknownService) {
    result = {
      reply:
        "目前公開服務列表中找不到「" + unknownService +
        "」。我不會自行猜測或套用其他服務，已將您的需求回報工作室協助確認。",
      recommendedServiceId: "",
      ownerSummary:
        "客人詢問目前公開服務列表未列出的「" + unknownService +
        "」，需要業主確認是否提供。",
      needsOwnerFollowUp: true,
      availabilityRequested: false,
      serviceMentionedByCustomer: true
    };
  } else {
    var provider = getProvider(env);
    var raw;
    try {
      raw = await recommendWithTimeout(provider, {
        message: message,
        services: publicServices,
        businessGuidance: {
          tone: aiSettings.customerAiTone || "friendly",
          businessType: aiSettings.customerAiBusinessType || "",
          studioIntroduction: aiSettings.customerAiStudioIntro || "",
          ownerKnowledge: aiSettings.customerAiKnowledge || "",
          answerScope: aiSettings.customerAiAnswerScope || "",
          handoffRule: aiSettings.customerAiHandoffRule || ""
        }
      }, env);
    } catch (error) {
      if (error && error.status && Number(error.status) < 500) throw error;
      result = {
        reply: "問題已送出，將由工作室確認後回覆。",
        recommendedServiceId: "",
        ownerSummary: "AI 暫時無法完成即時回答，客戶問題已轉交業主，請親自回覆。",
        needsOwnerFollowUp: true,
        availabilityRequested: false,
        serviceMentionedByCustomer: false
      };
    }
    if (!result) {
      result = parseProviderResult(
        raw,
        publicServices.map(function (s) { return s.id; }),
        message
      );
    }
  }
  // 是否查詢時段只信任客人原文；模型不得自行把服務需求升級成查時段。
  var availabilityRequested = AVAILABILITY_INTENT.test(message);
  var selectedServiceId = String(body.serviceId || "");
  var selectedService = publicServices.find(function (service) {
    return service.id === selectedServiceId;
  });
  var recommendedService = publicServices.find(function (service) {
    return service.id === result.recommendedServiceId;
  });
  var availabilityService = selectedService ||
    (result.serviceMentionedByCustomer ? recommendedService : null);
  var earliestSlot = null;

  if (availabilityRequested && !availabilityService) {
    result.recommendedServiceId = "";
    result.reply =
      "可以幫您查最快可預約時間。請先告訴我想做哪一項服務，" +
      "例如「霧眉最快什麼時候可以預約？」";
    result.ownerSummary = "客人詢問最快可預約時段，但尚未確認服務項目。";
    result.needsOwnerFollowUp = false;
  } else if (availabilityRequested) {
    earliestSlot = await findEarliestAvailableSlot(
      env,
      availabilityService,
      env && env.CUSTOMER_AI_NOW
    );
    result.recommendedServiceId = availabilityService.id;
    if (earliestSlot) {
      result.reply =
        "「" + availabilityService.name + "」目前最快可預約時間是 " +
        formatEarliestSlot(earliestSlot.date, earliestSlot.time) +
        "。請在下方日曆確認並送出預約。";
      result.ownerSummary =
        "客人詢問「" + availabilityService.name + "」最快時段；系統查得 " +
        earliestSlot.date + " " + earliestSlot.time + "。";
      result.needsOwnerFollowUp = false;
    } else {
      result.reply =
        "目前三個月內查不到「" + availabilityService.name +
        "」可預約時段，我已將需求回報工作室協助確認。";
      result.ownerSummary =
        "客人詢問「" + availabilityService.name +
        "」最快時段，但系統三個月內查無空檔，需要業主跟進。";
      result.needsOwnerFollowUp = true;
    }
  }
  var report = await createCustomerAiInquiry(env, {
    lineUserId: userId,
    customerMessage: message,
    aiReply: result.reply,
    ownerSummary: result.ownerSummary,
    needsOwnerFollowUp: result.needsOwnerFollowUp,
    recommendedServiceId: result.recommendedServiceId
  });
  return {
    ok: true,
    reply: result.reply,
    recommendedServiceId: result.recommendedServiceId,
    earliestSlot: earliestSlot,
    reportedToOwner: report.reportedToOwner === true,
    needsOwnerFollowUp: result.needsOwnerFollowUp === true,
    disclaimer:
      "AI 僅提供服務建議；日期與時段以頁面即時顯示為準，預約仍須由您確認送出。" +
      "本次洽詢重點已回報工作室，最多保留 90 天。"
  };
}

export async function submitCustomerQuestion(env, body, userId) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(function (key) {
        return key !== "message" && key !== "serviceId";
      })) {
    throw makeError("請求格式錯誤", 400);
  }
  var sop = await handleBrowIntakeSop(env, userId, body.message);
  if (sop && sop.handled) {
    var sopInquiryReport = null;
    if (sop.inquiry && sop.inquiry.question && sop.inquiry.answer) {
      sopInquiryReport = await createCustomerAiInquiry(env, {
        lineUserId: userId,
        customerMessage: sop.inquiry.question,
        aiReply: sop.inquiry.answer,
        ownerSummary: sop.inquiry.ownerSummary ||
          "客戶在霧眉評估中詢問補色時間，系統已依工作室規則回答。",
        needsOwnerFollowUp: sop.inquiry.needsOwnerFollowUp === true,
        recommendedServiceId: ""
      });
    }
    if (sop.submitted === true && !sopInquiryReport) {
      sopInquiryReport = await createCustomerAiInquiry(env, {
        lineUserId: userId,
        customerMessage: "已完成霧眉新客評估",
        aiReply: "資料已送交霧眉師人工評估，請等待工作室回覆。",
        ownerSummary: "客戶已完成霧眉新客評估，請查看逐題回答並進行人工審核。",
        needsOwnerFollowUp: true,
        recommendedServiceId: ""
      });
    }
    return {
      ok: true,
      submitted: true,
      reportedToOwner: sop.submitted === true || Boolean(sopInquiryReport),
      transferredToOwner: sop.submitted === true || Boolean(
        sopInquiryReport && sop.inquiry && sop.inquiry.needsOwnerFollowUp === true
      ),
      message: sop.message,
      options: sop.options || []
    };
  }
  var dailyQuestionCount = await countDailyCustomerAiInquiries(env, userId);
  if (dailyQuestionCount >= 12) {
    var message = String(body && body.message || "").replace(CONTROL_CHARS, "").trim();
    if (!message || codePoints(message).length > MAX_MESSAGE_CODE_POINTS) {
      throw makeError("請輸入 1～300 字的需求", 400);
    }
    var aiSettings = await getSettings(env);
    if (!getCustomerAiCapability(env, aiSettings).enabled) {
      throw makeError("AI 預約助手尚未啟用", 503);
    }
    assertRateLimit(env, userId);
    var report = await createCustomerAiInquiry(env, {
      lineUserId: userId,
      customerMessage: message,
      aiReply: "此客戶今天已提出十二個問題，第十三個問題起固定轉由業主親自回覆。",
      ownerSummary: "同一客戶今天已提出第十三個問題，系統已停止自動回答，務必由業主接手。",
      needsOwnerFollowUp: true,
      recommendedServiceId: ""
    });
    return {
      ok: true,
      submitted: true,
      reportedToOwner: report.reportedToOwner === true,
      transferredToOwner: true,
      message: "您的問題已轉交工作室，將由專人確認後回覆。"
    };
  }
  var result = await generateCustomerBookingAdvice(env, body, userId);
  if (!result.needsOwnerFollowUp) {
    var nextAction = null;
    if (result.recommendedServiceId) {
      nextAction = {
        type: "start_booking",
        serviceId: result.recommendedServiceId,
        label: result.earliestSlot
          ? "選擇此服務與可預約時間"
          : "選擇此服務並開始預約"
      };
      if (result.earliestSlot) {
        nextAction.date = result.earliestSlot.date;
        nextAction.time = result.earliestSlot.time;
      }
    }
    return {
      ok: true,
      submitted: true,
      reportedToOwner: result.reportedToOwner === true,
      transferredToOwner: false,
      message: result.reply,
      nextAction: nextAction
    };
  }
  return {
    ok: true,
    submitted: true,
    reportedToOwner: result.reportedToOwner === true,
    transferredToOwner: true,
    message: "問題已送出，將由工作室確認後回覆。"
  };
}
