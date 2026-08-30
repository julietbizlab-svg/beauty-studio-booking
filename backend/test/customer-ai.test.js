import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCustomerAiCapability,
  generateCustomerBookingAdvice,
  submitCustomerQuestion,
  isAddressInquiry
} from "../src/customer-ai.js";

function makeEnv(overrides) {
  return Object.assign({
    DATA_BACKEND: "d1",
    TENANT_ID: "tenant-test",
    LOCATION_ID: "location-test",
    STAFF_ID: "staff-test",
    CUSTOMER_AI_ENABLED: "true",
    AI_RATE_LIMIT_STORE: {},
    DB: {
      prepare: function (sql) {
        return {
          bind: function () {
            return {
              run: async function () {
                assert.match(sql, /INSERT INTO ai_customer_inquiries/);
                return { success: true, meta: { changes: 1 } };
              },
              first: async function () { return null; },
              all: async function () {
                return {
                  results: [{
                    id: "svc-1",
                    name: "保濕護理",
                    duration_minutes: 60,
                    price_amount: 1200,
                    description: "溫和保濕",
                    status: "active",
                    sort_order: 1
                  }]
                };
              }
            };
          }
        };
      }
    },
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return JSON.stringify({
          reply: "可考慮保濕護理，請再從日曆選擇實際空檔。",
          recommendedServiceId: "svc-1"
        });
      }
    }
  }, overrides || {});
}

test("客人 AI 預設關閉，且需同時具備 provider", function () {
  assert.deepEqual(getCustomerAiCapability({}), { ok: true, enabled: false });
  assert.equal(getCustomerAiCapability(makeEnv()).enabled, true);
});

test("客人 AI 只把需求與公開服務資料交給 provider", async function () {
  var received;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function (payload) {
        received = payload;
        return '{"reply":"推薦保濕護理。","recommendedServiceId":"svc-1"}';
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env,
    { message: "皮膚偏乾，想溫和保養" },
    "U-private-user"
  );
  assert.equal(result.recommendedServiceId, "svc-1");
  assert.equal(result.reportedToOwner, true);
  assert.match(result.disclaimer, /已回報工作室/);
  assert.equal(received.message, "皮膚偏乾，想溫和保養");
  assert.deepEqual(Object.keys(received).sort(), ["businessGuidance", "message", "services"]);
  assert.deepEqual(received.businessGuidance, {
    tone: "friendly",
    businessType: "",
    studioIntroduction: "",
    ownerKnowledge: "",
    answerScope: "",
    handoffRule: ""
  });
  assert.equal(JSON.stringify(received).includes("U-private-user"), false);
  assert.equal(JSON.stringify(received).includes("phone"), false);
});

test("AI provider 暫時失敗仍建立洽詢並轉交業主", async function () {
  var result = await submitCustomerQuestion(
    makeEnv({
      CUSTOMER_AI_PROVIDER: {
        recommend: async function () { throw new Error("provider unavailable"); }
      }
    }),
    { message: "第一次做霧眉，需要先準備什麼？" },
    "U-provider-failure"
  );
  assert.equal(result.submitted, true);
  assert.equal(result.reportedToOwner, true);
  assert.equal(result.transferredToOwner, true);
  assert.match(result.message, /工作室確認後回覆/);
});

test("AI provider 超時會在時限內建立洽詢並轉交業主", async function () {
  var startedAt = Date.now();
  var result = await submitCustomerQuestion(
    makeEnv({
      CUSTOMER_AI_TIMEOUT_MS: 5,
      CUSTOMER_AI_PROVIDER: {
        recommend: async function () { return new Promise(function () {}); }
      }
    }),
    { message: "第一次做臉，需要先準備什麼？" },
    "U-provider-timeout"
  );
  assert.equal(result.transferredToOwner, true);
  assert.ok(Date.now() - startedAt < 200, "不應持續等待 AI provider");
});

test("客人詢問地址時不會答成服務問題；知識庫缺漏則明確轉人工", async function () {
  var providerCalls = 0;
  var result = await generateCustomerBookingAdvice(
    makeEnv({
      CUSTOMER_AI_PROVIDER: {
        recommend: async function () {
          providerCalls += 1;
          return '{"reply":"歡迎光臨，想預約什麼服務？","recommendedServiceId":""}';
        }
      }
    }),
    { message: "地址" },
    "U-address"
  );
  assert.equal(providerCalls, 0);
  assert.match(result.reply, /知識庫尚未提供地址/);
  assert.equal(result.needsOwnerFollowUp, true);
});

test("地址意圖涵蓋常見關鍵字與口語問法，但不誤判服務地點問題", function () {
  [
    "地址", "地點", "在哪裡", "住址", "你們店在哪", "工作室在哪邊",
    "怎麼去", "如何前往", "可以導航嗎", "附近有捷運嗎", "停車方便嗎",
    "交通方式", "請問店址"
  ].forEach(function (message) {
    assert.equal(isAddressInquiry(message), true, message + " 應辨識為地址詢問");
  });
  ["哪裡可以做霧眉", "哪裡能做霧唇服務", "想問有哪些服務"].forEach(function (message) {
    assert.equal(isAddressInquiry(message), false, message + " 不應誤判為地址詢問");
  });
});

test("業主可停用客戶 AI，業務指引只作為 provider 的不可信資料", async function () {
  var disabled = makeEnv({
    DB: {
      prepare: function () {
        return { bind: function () {
          return { all: async function () {
            return { results: [{ setting_key: "customer_ai_enabled", setting_value: "false" }] };
          } };
        } };
      }
    }
  });
  await assert.rejects(
    generateCustomerBookingAdvice(disabled, { message: "想預約" }, "U1"),
    /尚未啟用/
  );
});

test("provider 回傳不存在的服務 id 時不允許套用", async function () {
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return '{"reply":"請參考服務列表。","recommendedServiceId":"fake"}';
      }
    }
  });
  var result = await generateCustomerBookingAdvice(env, { message: "想保養" }, "U1");
  assert.equal(result.recommendedServiceId, "");
});

test("直接詢問未公開服務時固定轉人工且不消耗 AI 額度", async function () {
  var providerCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        providerCalls += 1;
        throw new Error("不應呼叫 provider");
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env, { message: "我想詢問霧眉" }, "U-unknown-service"
  );
  assert.equal(providerCalls, 0);
  assert.equal(result.recommendedServiceId, "");
  assert.equal(result.reportedToOwner, true);
  assert.match(result.reply, /找不到「霧眉」/);
  assert.match(result.reply, /不會自行猜測/);
});

test("口語『我想問』未公開服務也固定轉人工，不得套用其他服務", async function () {
  var providerCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () { providerCalls += 1; return ""; }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env, { message: "我想問霧眉" }, "U-unknown-colloquial"
  );
  assert.equal(providerCalls, 0);
  assert.equal(result.recommendedServiceId, "");
  assert.match(result.reply, /找不到「霧眉」/);
  assert.doesNotMatch(result.reply, /基本美容|60|1200/);
});

test("付款與系統建置事項固定轉人工且不套用美容服務", async function () {
  var providerCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        providerCalls += 1;
        throw new Error("不應呼叫 provider");
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env,
    { message: "付款前先確認需求與方案，付款確認後開始建置，完成後交付使用。" },
    "U-system-business"
  );
  assert.equal(providerCalls, 0);
  assert.equal(result.recommendedServiceId, "");
  assert.equal(result.reportedToOwner, true);
  assert.match(result.reply, /不代表款項已確認入帳/);
  assert.doesNotMatch(result.reply, /已收到您的付款/);
  assert.match(result.reply, /不由預約 AI 判斷/);
  assert.match(result.reply, /專人確認/);
  assert.doesNotMatch(result.reply, /全身大保養|基本美容|保濕護理/);
});

test("直接詢問已公開服務時仍交由 AI 提供說明", async function () {
  var providerCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        providerCalls += 1;
        return '{"reply":"這是保濕護理說明。","recommendedServiceId":"svc-1"}';
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env, { message: "我想詢問保濕護理" }, "U-known-service"
  );
  assert.equal(providerCalls, 1);
  assert.equal(result.recommendedServiceId, "svc-1");
});

test("我要改色必須進舊眉評估，不得被模型誤導成查最快時段", async function () {
  var providerCalls = 0;
  var availabilityCalls = 0;
  var env = makeEnv({
    DB: {
      prepare: function (sql) {
        return { bind: function () { return {
          all: async function () { return { results: [{
            id: "brow-1", name: "韓系霧眉", duration_minutes: 120,
            price_amount: 6000, description: "眉型設計與自然霧眉", status: "active", sort_order: 1
          }] }; },
          run: async function () { return { success: true, meta: { changes: 1 } }; }
        }; } };
      }
    },
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        providerCalls += 1;
        return JSON.stringify({
          reply: "最快時段是明天。", recommendedServiceId: "brow-1",
          availabilityRequested: true, serviceMentionedByCustomer: true,
          needsOwnerFollowUp: false
        });
      }
    },
    CUSTOMER_AI_AVAILABILITY_PROVIDER: {
      findEarliest: async function () { availabilityCalls += 1; return { date: "2026-08-10", time: "10:00" }; }
    }
  });
  var result = await generateCustomerBookingAdvice(env, { message: "我要改色" }, "U-color");
  assert.match(result.reply, /舊眉改色/);
  assert.match(result.reply, /是否還有以前紋繡留下的顏色或框線/);
  assert.doesNotMatch(result.reply, /最快|8月10日|10:00/);
  assert.equal(result.recommendedServiceId, "");
  assert.equal(providerCalls, 0);
  assert.equal(availabilityCalls, 0);
});

test("模型自行標記 availabilityRequested 不得觸發時段查詢", async function () {
  var availabilityCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () { return JSON.stringify({
        reply: "已了解您的服務需求。", recommendedServiceId: "svc-1",
        availabilityRequested: true, serviceMentionedByCustomer: true,
        needsOwnerFollowUp: false
      }); }
    },
    CUSTOMER_AI_AVAILABILITY_PROVIDER: {
      findEarliest: async function () { availabilityCalls += 1; return { date: "2026-08-10", time: "10:00" }; }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env, { message: "皮膚偏乾，想做溫和保養" }, "U-no-slot"
  );
  assert.equal(result.reply, "已了解您的服務需求。");
  assert.equal(availabilityCalls, 0);
});

test("接受 markdown 包裝 JSON 與安全純文字，但不憑空套用服務", async function () {
  var markdownEnv = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return '以下是建議：\n```json\n{"reply":"推薦保濕護理。","recommendedServiceId":"svc-1"}\n```';
      }
    }
  });
  var markdownResult = await generateCustomerBookingAdvice(
    markdownEnv, { message: "想保濕" }, "U-markdown"
  );
  assert.equal(markdownResult.recommendedServiceId, "svc-1");

  var textEnv = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () { return "請先參考服務內容，再選擇日曆空檔。"; }
    }
  });
  var textResult = await generateCustomerBookingAdvice(
    textEnv, { message: "不確定選什麼" }, "U-text"
  );
  assert.equal(textResult.reply, "請先參考服務內容，再選擇日曆空檔。");
  assert.equal(textResult.recommendedServiceId, "");
});

test("詢問最快時段但未說服務時先追問，不查日曆、不亂選服務", async function () {
  var availabilityCalls = 0;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return JSON.stringify({
          reply: "我來幫您查。",
          recommendedServiceId: "svc-1",
          availabilityRequested: true,
          serviceMentionedByCustomer: false
        });
      }
    },
    CUSTOMER_AI_AVAILABILITY_PROVIDER: {
      findEarliest: async function () {
        availabilityCalls += 1;
        return { date: "2026-07-30", time: "10:00" };
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env,
    { message: "最快什麼時候可以預約？" },
    "U-earliest-missing-service"
  );
  assert.match(result.reply, /請先告訴我想做哪一項服務/);
  assert.equal(result.recommendedServiceId, "");
  assert.equal(result.earliestSlot, null);
  assert.equal(availabilityCalls, 0);
});

test("客人明確說服務並詢問最快時段時，回覆日曆查得的最早空檔", async function () {
  var requestedService;
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return JSON.stringify({
          reply: "我來幫您查保濕護理。",
          recommendedServiceId: "svc-1",
          availabilityRequested: true,
          serviceMentionedByCustomer: true
        });
      }
    },
    CUSTOMER_AI_AVAILABILITY_PROVIDER: {
      findEarliest: async function (service) {
        requestedService = service;
        return { date: "2026-07-30", time: "10:00" };
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env,
    { message: "保濕護理最快什麼時候可以預約？" },
    "U-earliest-with-service"
  );
  assert.equal(requestedService.id, "svc-1");
  assert.equal(result.recommendedServiceId, "svc-1");
  assert.deepEqual(result.earliestSlot, { date: "2026-07-30", time: "10:00" });
  assert.match(result.reply, /保濕護理/);
  assert.match(result.reply, /7月30日/);
  assert.match(result.reply, /10:00/);
});

test("客戶端已選服務時，單問最快時段也使用該服務查日曆", async function () {
  var env = makeEnv({
    CUSTOMER_AI_PROVIDER: {
      recommend: async function () {
        return JSON.stringify({
          reply: "請告訴我服務。",
          recommendedServiceId: "",
          availabilityRequested: true,
          serviceMentionedByCustomer: false
        });
      }
    },
    CUSTOMER_AI_AVAILABILITY_PROVIDER: {
      findEarliest: async function () {
        return { date: "2026-08-01", time: "14:30" };
      }
    }
  });
  var result = await generateCustomerBookingAdvice(
    env,
    { message: "最快何時有空？", serviceId: "svc-1" },
    "U-earliest-selected-service"
  );
  assert.equal(result.recommendedServiceId, "svc-1");
  assert.deepEqual(result.earliestSlot, { date: "2026-08-01", time: "14:30" });
  assert.match(result.reply, /8月1日/);
  assert.match(result.reply, /14:30/);
});

test("拒絕額外欄位與過長需求", async function () {
  await assert.rejects(
    generateCustomerBookingAdvice(makeEnv(), { message: "想保養", phone: "0912" }, "U1"),
    function (error) { return error.status === 400; }
  );
  await assert.rejects(
    generateCustomerBookingAdvice(makeEnv(), { message: "好".repeat(301) }, "U1"),
    function (error) { return error.status === 400; }
  );
});

test("每位客人每分鐘最多五次", async function () {
  var env = makeEnv();
  for (var i = 0; i < 5; i++) {
    await generateCustomerBookingAdvice(env, { message: "第" + i + "次" }, "U-rate");
  }
  await assert.rejects(
    generateCustomerBookingAdvice(env, { message: "第六次" }, "U-rate"),
    function (error) { return error.status === 429; }
  );
});

test("客人頁顯示安全答案並可把已驗證服務帶入預約流程", async function () {
  var { readFile } = await import("node:fs/promises");
  var html = await readFile(new URL("../../customer-ui/index.html", import.meta.url), "utf8");
  var app = await readFile(new URL("../../customer-ui/js/app.js", import.meta.url), "utf8");
  assert.match(html, /id="ai-assistant"/);
  assert.ok(
    html.indexOf('id="ai-assistant"') > html.indexOf('id="book-btn"'),
    "AI 入口應位於主要預約流程與確認按鈕之後"
  );
  assert.match(html, /AI 預約小幫手/);
  assert.match(html, /<textarea id="ai-message" maxlength="300" rows="3"><\/textarea>/);
  assert.doesNotMatch(html, /id="ai-message"[^>]*placeholder=/);
  assert.doesNotMatch(html, /placeholder="[^"]*什麼時候可以預約/);
  var aiFunction = app.match(/async function askAiAssistant\(\) \{[\s\S]*?\n  \}/);
  assert.ok(aiFunction);
  assert.match(aiFunction[0], /submitCustomerInquiry/);
  assert.match(aiFunction[0], /正在送交工作室/);
  assert.match(aiFunction[0], /ai-history-pending/);
  assert.match(aiFunction[0], /nextAction/);
  assert.match(aiFunction[0], /selectServiceById/);
  assert.doesNotMatch(aiFunction[0], /createBooking/);
  var bootFunction = app.match(/async function boot\(\) \{[\s\S]*?\n  \}/);
  assert.ok(bootFunction);
  assert.doesNotMatch(bootFunction[0], /submitCustomerInquiry|askAiAssistant/);
  assert.match(html, /我的諮詢紀錄/);
  assert.match(html, /js\/api\.js\?v=20260823001/);
  assert.match(html, /js\/app\.js\?v=20260825003/);
  assert.match(html, /只有您本人可以查看自己的問題與工作室回覆/);
  assert.match(html, /window\.location\.protocol === "file:"/);
  assert.match(html, /getElementById\("app-base"\)\.setAttribute\("href", "\.\/"\)/);
  assert.match(app, /getCustomerAiInquiries/);
  assert.match(app, /工作室回覆/);
});

test("客戶 API 只回傳安全答案與可驗證的預約動作，不洩漏模型判讀", async function () {
  var result = await submitCustomerQuestion(
    makeEnv(), { message: "皮膚偏乾，想做溫和保養" }, "U1"
  );
  assert.equal(result.submitted, true);
  assert.match(result.message, /工作室確認後回覆/);
  assert.ok(!("reply" in result));
  assert.ok(!("recommendedServiceId" in result));
  assert.ok(!("earliestSlot" in result));
  assert.ok(!("disclaimer" in result));
  assert.ok(!("nextAction" in result));
});

test("AI 可將公開服務轉成客戶確認後才執行的預約入口", async function () {
  var result = await submitCustomerQuestion(
    makeEnv({
      CUSTOMER_AI_PROVIDER: {
        recommend: async function () {
          return JSON.stringify({
            reply: "建議選擇保濕護理，接著可查看工作室開放時段。",
            recommendedServiceId: "svc-1",
            ownerSummary: "客人想預約保濕護理。",
            needsOwnerFollowUp: false
          });
        }
      }
    }),
    { message: "想預約保濕護理" },
    "U-conversion"
  );
  assert.equal(result.transferredToOwner, false);
  assert.match(result.message, /保濕護理/);
  assert.deepEqual(result.nextAction, {
    type: "start_booking",
    serviceId: "svc-1",
    label: "選擇此服務並開始預約"
  });
  assert.ok(!("recommendedServiceId" in result));
});

test("每日可回答範圍前十二題直接回答，第十三題固定轉人工且不呼叫 provider", async function () {
  var providerCalls = 0;
  var inserts = 0;
  function envWithDailyCount(total) {
    return makeEnv({
      DB: {
        prepare: function (sql) {
          return {
            bind: function () {
              return {
                all: async function () {
                  if (/COUNT\(\*\) AS total/.test(sql)) return { results: [{ total: total }] };
                  return { results: [{
                    id: "svc-1", name: "保濕護理", duration_minutes: 60,
                    price_amount: 1200, description: "溫和保濕", status: "active", sort_order: 1
                  }] };
                },
                first: async function () { return null; },
                run: async function () { inserts += 1; return { success: true, meta: { changes: 1 } }; }
              };
            }
          };
        }
      },
      CUSTOMER_AI_PROVIDER: {
        recommend: async function () {
          providerCalls += 1;
          return JSON.stringify({
            reply: "可以選擇保濕護理。",
            recommendedServiceId: "svc-1",
            ownerSummary: "客戶詢問保濕服務。",
            needsOwnerFollowUp: false
          });
        }
      }
    });
  }
  var twelfth = await submitCustomerQuestion(
    envWithDailyCount(11),
    { message: "皮膚偏乾，想做溫和保養" },
    "U-twelfth"
  );
  assert.equal(twelfth.transferredToOwner, false);
  assert.equal(twelfth.message, "可以選擇保濕護理。");
  assert.equal(providerCalls, 1);

  var thirteenth = await submitCustomerQuestion(
    envWithDailyCount(12), { message: "第十三個問題" }, "U-thirteenth"
  );
  assert.equal(thirteenth.transferredToOwner, true);
  assert.match(thirteenth.message, /專人確認後回覆/);
  assert.equal(providerCalls, 1, "第十三題不得再呼叫 AI provider");
  assert.equal(inserts, 2, "第十二題與第十三題皆應留下洽詢紀錄");
});

test("只有服務指定評估題庫時才在送出預約前填問卷，none 與 Demo v1 直接預約", async function () {
  var { readFile } = await import("node:fs/promises");
  var app = await readFile(new URL("../../customer-ui/js/app.js", import.meta.url), "utf8");
  var html = await readFile(new URL("../../customer-ui/index.html", import.meta.url), "utf8");
  assert.match(
    app,
    /function requiresReviewBeforeBooking\(\)[\s\S]*assessmentTemplateCode[\s\S]*美甲\|美睫\|睫毛[\s\S]*code !== "none"/
  );
  assert.match(app, /assessmentState\.status === "approved"\) return false/);
  assert.match(
    app,
    /els\.bookBtn\.addEventListener\("click"[\s\S]*openNewBookingReview\(\)/
  );
  assert.match(app, /"填寫預約評估資料"/);
  assert.match(app, /"送出評估資料"/);
  assert.doesNotMatch(app, /審核資料/);
  assert.match(html, /review-choice-fieldset" hidden/);
  assert.match(html, /需要服務人員留意的<span class="review-sensitive-term">疤痕/);
  assert.match(app, /function getSurgeryHistoryValue\(\)/);
  assert.match(app, /未另外詢問（請依服務需要確認）/);
  assert.doesNotMatch(app, /!intakePayload\.diseaseHistory/);
  assert.match(html, /review-sensitive-term">疤痕/);
  assert.match(html, /review-sensitive-term">過敏/);
  assert.match(html, /review-sensitive-term">健康狀況/);
  assert.match(html, /補充服務部位照片（選填/);
  assert.match(app, /function photoRequestTextForBooking/);
  assert.match(app, /霧唇\|紋唇\|唇部\|嘴唇[\s\S]*眉毛\|眉部\|霧眉/);
});

test("免評估服務不等待題庫 API 才顯示月曆，預約成功畫面先於背景同步", async () => {
  var { readFile } = await import("node:fs/promises");
  var app = await readFile(new URL("../../customer-ui/js/app.js", import.meta.url), "utf8");
  assert.match(app, /var skipsAssessment =[\s\S]*assessmentTemplateCode === "none"/);
  assert.ok(app.indexOf("updateCalendarVisibility();", app.indexOf("async function selectServiceById")) <
    app.indexOf("await loadAssessmentTemplate(selected);"));
  assert.match(app, /if \(skipsAssessment\)[\s\S]*loadMonthCalendar/);
  assert.ok(app.indexOf("showBookingSuccessModal({") < app.indexOf("Promise.allSettled(["));
});

test("已有其他日期有效預約時，追加預約前必須再次提醒確認", async function () {
  var { readFile } = await import("node:fs/promises");
  var app = await readFile(new URL("../../customer-ui/js/app.js", import.meta.url), "utf8");
  var html = await readFile(new URL("../../customer-ui/index.html", import.meta.url), "utf8");
  var reminder = app.match(
    /function confirmAdditionalBooking\(\) \{[\s\S]*?\n  \}/
  );
  assert.ok(reminder);
  assert.match(reminder[0], /booking\.date !== selectedDate/);
  assert.match(reminder[0], /booking\.date >= today/);
  assert.doesNotMatch(reminder[0], /window\.confirm/);
  assert.match(reminder[0], /additionalBookingModal\.classList\.remove/);
  assert.match(app, /additional-booking-modal/);
  assert.match(html, /新的申請會另外新增，不會取代原本預約/);
  assert.match(html, /仍要追加申請/);
  assert.match(html, /返回查看/);
  assert.match(
    app,
    /els\.bookBtn\.addEventListener\("click"[\s\S]*confirmAdditionalBooking\(\)\.then[\s\S]*openNewBookingReview\(\)/
  );
});
