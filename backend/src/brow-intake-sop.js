import { BROW_RUNTIME_STEPS } from "./brow-intake-template.js";

var START_INTENT = /霧眉|紋眉|飄眉|粉霧眉|紋繡|改色|調色|舊眉|補色/;
var CONTROL = /^(上一步|修改答案|暫停評估|聯絡老師)$/;
var GENERAL_QUESTION = /[？?]|(?:想問|請問|什麼|怎麼|如何|是否|需不需要|可不可以|能不能|多久|多少|注意事項|準備什麼|費用|價格|地址|時間)/;

var LEGACY_STEPS = {
  service_type: {
    question: "請問您這次想諮詢哪一項服務？",
    options: ["第一次霧眉", "舊眉重新施作", "舊眉改色或調整", "本店補色", "他店補色", "不確定，想請老師評估"]
  },
  old_brow_status: {
    question: "目前眉毛上是否還有以前紋繡留下的顏色或框線？",
    options: ["完全沒有", "有，但已經很淡", "有，而且仍然明顯", "曾經做過，但不確定是否還有底色"]
  },
  last_brow_procedure_date_range: {
    question: "最後一次施作大約是什麼時候？",
    options: ["6個月內", "6個月至1年", "1年至2年", "2年以上", "不記得"]
  },
  brow_removal_history: {
    question: "您是否曾做過雷射洗眉或其他舊眉淡化療程？",
    options: ["沒有", "有，療程已完成", "有，目前仍在療程中", "不確定療程名稱"]
  },
  last_brow_removal_date: {
    question: "最近一次洗眉或淡化療程是什麼時候？",
    options: ["一個月內", "一至三個月", "三個月以上", "不記得"]
  },
  recent_treatments: {
    question: "近期眉毛、額頭或眼周是否做過其他療程？請選最接近的一項。",
    options: ["沒有", "雷射或光療", "酸類換膚", "微針或侵入性保養", "醫美注射", "眉部、眼周或額頭手術", "其他療程", "不確定療程名稱"]
  },
  recent_treatment_date: { question: "最近一次相關療程是什麼時候？請輸入 YYYY-MM-DD；不記得可選擇最接近的時間。", options: ["一個月內", "一至三個月", "三個月以上", "不記得"] },
  current_skin_condition: {
    question: "目前眉毛及周圍皮膚是否有以下情況？請選最需要確認的一項。",
    options: ["沒有，皮膚狀況正常", "傷口或結痂", "紅腫、疼痛或發炎", "濕疹、脫皮、搔癢或過敏", "痘痘、膿包或疑似感染", "剛曬傷", "其他狀況", "不確定，需要老師看照片"]
  },
  health_data_consent: {
    question: "接下來會詢問可能影響施作與恢復的健康資訊，僅供本次評估與服務紀錄使用。是否同意？",
    options: ["我已閱讀並同意", "查看完整個資說明", "暫不同意", "改由老師私下聯絡"]
  },
  health_or_medication_risk: {
    question: "您目前是否有可能影響出血、傷口癒合、感染或過敏的健康狀況，或正在使用相關藥物？",
    options: ["沒有", "有", "不確定", "希望由老師私下詢問"]
  },
  health_risk_categories: {
    question: "請選擇最需要老師確認的健康或用藥類別。",
    options: ["凝血、出血或血液相關問題", "糖尿病或血糖控制問題", "免疫系統相關疾病或治療", "傷口癒合較慢", "蟹足腫或異常疤痕體質", "嚴重過敏病史", "可能影響凝血、免疫或皮膚修復的藥物", "其他", "不確定"]
  },
  pregnancy_breastfeeding_status: {
    question: "您目前是否有以下情況？",
    options: ["無", "懷孕中", "哺乳中", "可能懷孕或不確定", "不方便在線上回答"]
  },
  previous_adverse_reactions: {
    question: "過去接受紋眉、刺青或其他侵入性美容服務後，是否曾出現不良反應？",
    options: ["沒有", "嚴重過敏", "傷口感染", "長時間紅腫或疼痛", "異常凸疤或蟹足腫", "色料相關不良反應", "其他", "不確定"]
  },
  important_event_type: {
    question: "未來一個月內是否有重要行程？",
    options: ["沒有", "婚禮、拍攝或重要聚會", "出國旅行", "游泳、浮潛、泡湯或水上活動", "其他重要行程"]
  },
  important_event_date: {
    question: "這項重要行程是否在 10 天內？",
    options: ["是，10天內", "否，超過10天", "不確定"]
  },
  photos: {
    question: "請準備正面、左側眉、右側眉共3張未畫眉、無濾鏡的清楚照片。照片將交由老師人工查看。",
    options: ["我會準備照片", "改由老師私下聯絡"]
  },
  confirm: { question: "資料已整理完成。", options: ["確認送出", "修改服務", "修改舊眉資料", "修改皮膚或健康資料", "修改重要行程", "重新上傳照片", "暫停評估"] }
};
var STEPS = Object.assign({}, LEGACY_STEPS, BROW_RUNTIME_STEPS);

function nowIso(env) { return env && env.BROW_INTAKE_NOW_ISO || new Date().toISOString(); }
function response(step, extra) {
  return Object.assign({ handled: true, message: STEPS[step].question, options: STEPS[step].options }, extra || {});
}
function isDateAnswer(text) { return /^\d{4}-\d{2}-\d{2}$/.test(text); }
function summary(answers) {
  var health = answers.health_or_medication_risk === "沒有" &&
    answers.pregnancy_breastfeeding_status === "無" && answers.previous_adverse_reactions === "沒有" ? "無" : "已提供老師確認";
  var event = answers.important_event_type === "沒有" ? "無" :
    [answers.important_event_type, answers.important_event_date].filter(Boolean).join("／");
  return "請確認以下資料：\n\n" +
    "諮詢服務：" + (answers.service_type || "尚未填寫") + "\n" +
    "舊眉狀況：" + (answers.old_brow_status || "尚未填寫") + "\n" +
    "近期療程：" + (answers.recent_treatments || "尚未填寫") + "\n" +
    "眉部皮膚狀況：" + (answers.current_skin_condition || "尚未填寫") + "\n" +
    "健康相關資訊：" + health + "\n" +
    "近期重要行程：" + event + "\n" +
    "照片：待依指示完成上傳\n\n資料是否正確？";
}
function submittedSummary(answers) {
  return summary(answers).replace(/\n\n資料是否正確？$/, "");
}
function nextStep(step, answer, answers) {
  if (step === "service_type") return "old_brow_status";
  if (step === "old_brow_status") return answer === "完全沒有" ? "recent_treatments" : "last_brow_procedure_date_range";
  if (step === "last_brow_procedure_date_range") return "brow_removal_history";
  if (step === "brow_removal_history") return answer === "沒有" ? "recent_treatments" : "last_brow_removal_date";
  if (step === "last_brow_removal_date") return "recent_treatments";
  if (step === "recent_treatments") return answer === "沒有" ? "current_skin_condition" : "recent_treatment_date";
  if (step === "recent_treatment_date") return "current_skin_condition";
  if (step === "current_skin_condition") return "health_data_consent";
  if (step === "health_data_consent") return answer === "我已閱讀並同意" ? "health_or_medication_risk" : "health_data_consent";
  if (step === "health_or_medication_risk") return answer === "沒有" ? "pregnancy_breastfeeding_status" : "health_risk_categories";
  if (step === "health_risk_categories") return "pregnancy_breastfeeding_status";
  if (step === "pregnancy_breastfeeding_status") return "previous_adverse_reactions";
  if (step === "previous_adverse_reactions") return "important_event_type";
  if (step === "important_event_type") return answer === "沒有" ? "photos" : "important_event_date";
  if (step === "important_event_date") return "photos";
  if (step === "photos") return "confirm";
  return "confirm";
}

function editTarget(text) {
  if (text === "修改服務") return "service_type";
  if (text === "修改舊眉資料") return "old_brow_status";
  if (text === "修改皮膚或健康資料") return "current_skin_condition";
  if (text === "修改重要行程") return "important_event_type";
  if (text === "重新上傳照片") return "photos";
  return null;
}

function answerInterruption(text) {
  if (/補色/.test(text) && /(什麼時候|何時|多久|幾天|幾個月|何時能|可以補)/.test(text)) {
    return "霧眉後滿1個月可施作補色，預約後由工作室為您確認。";
  }
  return "";
}

function risk(step, answer) {
  if (["last_brow_procedure_date_range", "last_brow_removal_date", "health_risk_categories"].indexOf(step) !== -1) return true;
  if (step === "brow_removal_history") return answer !== "沒有";
  if (step === "recent_treatments") return answer !== "沒有";
  if (step === "current_skin_condition") return answer !== "沒有，皮膚狀況正常";
  if (step === "health_or_medication_risk") return answer !== "沒有";
  if (step === "pregnancy_breastfeeding_status") return answer !== "無";
  if (step === "previous_adverse_reactions") return answer !== "沒有";
  return false;
}
function pausedRoute(step, answer) {
  return step === "current_skin_condition" && /傷口|紅腫|疼痛|膿包|感染/.test(answer) ||
    step === "brow_removal_history" && /仍在療程中/.test(answer);
}

export async function handleBrowIntakeSop(env, lineUserId, message) {
  var userId = String(lineUserId || "").trim();
  var text = String(message || "").trim();
  var row = await env.DB.prepare(
    "SELECT status,current_step,answers_json,manual_review_required,booking_route " +
    "FROM brow_intake_sessions WHERE tenant_id=?1 AND line_user_id=?2"
  ).bind(env.TENANT_ID, userId).first();
  if (!row && (!START_INTENT.test(text) || GENERAL_QUESTION.test(text))) return null;
  // 只要客戶已進入新版通用評估，就不得再由舊霧眉問卷建立或續跑第二份評估。
  // 包含填寫中、已送出待審與已核准；後續一律由新版評估頁與人工審核狀態接手。
  var currentAssessment = await env.DB.prepare(
    "SELECT 1 AS current_assessment WHERE EXISTS (" +
    "SELECT 1 FROM assessment_sessions s WHERE s.tenant_id=?1 " +
    "AND s.line_user_id=?2) OR EXISTS (" +
    "SELECT 1 FROM line_accounts la JOIN bookings b " +
    "ON b.tenant_id=la.tenant_id AND b.customer_id=la.customer_id " +
    "WHERE la.tenant_id=?1 AND la.line_user_id=?2 " +
    "AND b.review_accepted_at IS NOT NULL) LIMIT 1"
  ).bind(env.TENANT_ID, userId).first();
  if (currentAssessment) return null;
  var now = nowIso(env);
  if (!row) {
    var firstStep = /改色|調色|舊眉/.test(text) ? "old_brow_status" : "service_type";
    var initial = /改色|調色/.test(text) ? { service_type: "舊眉改色或調整", _history: ["service_type"] } : { _history: [] };
    await env.DB.prepare(
      "INSERT INTO brow_intake_sessions " +
      "(id,tenant_id,line_user_id,status,current_step,answers_json,created_at,updated_at) " +
      "VALUES (?1,?2,?3,'active',?4,?5,?6,?6)"
    ).bind(crypto.randomUUID(), env.TENANT_ID, userId, firstStep, JSON.stringify(initial), now).run();
    return response(firstStep);
  }
  if (row.current_step === "store_touchup_artist" || row.current_step === "store_touchup_date") {
    row.current_step = "old_brow_status";
    await env.DB.prepare(
      "UPDATE brow_intake_sessions SET current_step=?1,updated_at=?2 WHERE tenant_id=?3 AND line_user_id=?4"
    ).bind(row.current_step, now, env.TENANT_ID, userId).run();
  }
  if (text === "聯絡老師" && ["paused", "need_more_information", "temporarily_unavailable"].includes(row.status)) {
    await env.DB.prepare("UPDATE brow_intake_sessions SET status='contact_manually',updated_at=?1 WHERE tenant_id=?2 AND line_user_id=?3")
      .bind(now, env.TENANT_ID, userId).run();
    return {
      handled: true,
      message: "已通知老師與您確認，請稍後留意工作室訊息。",
      options: [],
      inquiry: {
        question: "聯絡老師",
        answer: "已通知老師與您確認，請稍後留意工作室訊息。",
        ownerSummary: "客戶按下「聯絡老師」，請由工作室主動聯絡並確認後續。",
        needsOwnerFollowUp: true
      }
    };
  }
  if (row.status === "paused" && text !== "繼續評估") {
    return { handled: true, message: "評估目前已暫停。需要繼續時請輸入「繼續評估」，或聯絡老師。", options: ["繼續評估", "聯絡老師"] };
  }
  var storedAnswers = {};
  try { storedAnswers = JSON.parse(row.answers_json || "{}"); } catch (ignoreStored) {}
  if (row.status === "pending_human_review") {
    return {
      handled: true,
      submitted: true,
      options: [],
      message: submittedSummary(storedAnswers) +
        "\n\n資料已送交霧眉師人工評估，請等待老師回覆。審核通過後才會開放預約時段；目前不需要再次填寫。"
    };
  }
  if (row.status === "approved") {
    return { handled: true, options: [],
      message: "霧眉師已完成評估並核准，現在可以查看可預約時段。選定時間後，仍須依指示完成訂金，預約才正式成立。" };
  }
  if (row.status === "need_more_information") {
    return { handled: true, options: ["聯絡老師"],
      message: "霧眉師已查看資料，還需要補充資訊。請等待老師說明需要補充的內容。" };
  }
  if (row.status === "temporarily_unavailable") {
    return { handled: true, options: ["聯絡老師"],
      message: "霧眉師已查看資料，目前暫不安排預約。請依老師提供的說明處理，狀況穩定後可再次評估。" };
  }
  if (row.status === "contact_manually") {
    return { handled: true, options: [],
      message: "此案件需要霧眉師進一步確認，請等待工作室與您聯絡。" };
  }
  if (text === "繼續評估") {
    await env.DB.prepare("UPDATE brow_intake_sessions SET status='active',updated_at=?1 WHERE tenant_id=?2 AND line_user_id=?3")
      .bind(now, env.TENANT_ID, userId).run();
    return response(row.current_step);
  }
  if (CONTROL.test(text) && text !== "上一步" && text !== "修改答案") {
    if (text === "暫停評估") {
      await env.DB.prepare("UPDATE brow_intake_sessions SET status='paused',updated_at=?1 WHERE tenant_id=?2 AND line_user_id=?3")
        .bind(now, env.TENANT_ID, userId).run();
      return { handled: true, message: "評估已暫停，資料已保留。", options: ["繼續評估", "聯絡老師"] };
    }
    if (text === "聯絡老師") {
      await env.DB.prepare("UPDATE brow_intake_sessions SET status='contact_manually',updated_at=?1 WHERE tenant_id=?2 AND line_user_id=?3")
        .bind(now, env.TENANT_ID, userId).run();
      return { handled: true, message: "已轉由老師與您確認，請稍後留意工作室訊息。", options: [] };
    }
  }
  var step = row.current_step;
  var spec = STEPS[step];
  if (!spec) return null;
  var answers = {};
  try { answers = JSON.parse(row.answers_json || "{}"); } catch (ignore) {}
  var target = editTarget(text);
  if (target) {
    await env.DB.prepare("UPDATE brow_intake_sessions SET status='active',current_step=?1,updated_at=?2 WHERE tenant_id=?3 AND line_user_id=?4")
      .bind(target, now, env.TENANT_ID, userId).run();
    return response(target, { message: "請重新填寫這一部分：\n" + STEPS[target].question });
  }
  if (text === "上一步" || text === "修改答案") {
    var history = Array.isArray(answers._history) ? answers._history : [];
    var previous = history.pop() || step;
    while (previous === "store_touchup_artist" || previous === "store_touchup_date") {
      delete answers[previous];
      previous = history.pop() || "old_brow_status";
    }
    delete answers[previous];
    answers._history = history;
    await env.DB.prepare("UPDATE brow_intake_sessions SET current_step=?1,answers_json=?2,updated_at=?3 WHERE tenant_id=?4 AND line_user_id=?5")
      .bind(previous, JSON.stringify(answers), now, env.TENANT_ID, userId).run();
    return response(previous, { message: "已回到上一題：\n" + STEPS[previous].question });
  }
  var interruptionReply = spec.options.indexOf(text) === -1 ? answerInterruption(text) : "";
  if (interruptionReply) {
    var questions = Array.isArray(answers.customer_questions) ? answers.customer_questions : [];
    questions.push("客戶：" + text + "／AI：" + interruptionReply);
    answers.customer_questions = questions.slice(-20);
    await env.DB.prepare(
      "UPDATE brow_intake_sessions SET answers_json=?1,updated_at=?2 " +
      "WHERE tenant_id=?3 AND line_user_id=?4"
    ).bind(JSON.stringify(answers), now, env.TENANT_ID, userId).run();
    return response(step, {
      message: interruptionReply + "\n\n接著繼續剛才的評估：\n" + spec.question,
      inquiry: { question: text, answer: interruptionReply }
    });
  }
  // 評估進行中仍可提出一般問題；不可把問句誤當成目前題目的答案。
  // 回傳 null 交由一般 AI 洽詢流程記錄，原評估進度保持不變。
  if (spec.options.indexOf(text) === -1 && GENERAL_QUESTION.test(text)) {
    return null;
  }
  if (spec.options.length && spec.options.indexOf(text) === -1) {
    if (step === "important_event_date" && isDateAnswer(text)) {
      // 日期欄位接受 YYYY-MM-DD。
    } else {
    return response(step, { message: "請選擇下列其中一項；若不確定，請選擇含「不確定」的選項。\n" + spec.question });
    }
  } else if (!spec.options.length && !isDateAnswer(text)) {
    return response(step, { message: "請使用 YYYY-MM-DD 格式輸入日期。\n" + spec.question });
  }
  answers[step] = text;
  if (step === "health_data_consent" && text !== "我已閱讀並同意") {
    var consentMessage = text === "查看完整個資說明" ?
      "請先查看個資與隱私權說明；閱讀後再選擇是否同意。\n" + STEPS[step].question :
      "您可以不提供健康相關資訊，但老師可能無法在線上完成施作評估。您可改由老師私下確認。";
    await env.DB.prepare("UPDATE brow_intake_sessions SET answers_json=?1,updated_at=?2 WHERE tenant_id=?3 AND line_user_id=?4")
      .bind(JSON.stringify(answers), now, env.TENANT_ID, userId).run();
    return response(step, { message: consentMessage });
  }
  if (step === "confirm" && text === "確認送出") {
    await env.DB.prepare(
      "UPDATE brow_intake_sessions SET status='pending_human_review',answers_json=?1," +
      "submitted_at=?2,updated_at=?2 WHERE tenant_id=?3 AND line_user_id=?4"
    ).bind(JSON.stringify(answers), now, env.TENANT_ID, userId).run();
    return { handled: true, submitted: true, options: [],
      message: submittedSummary(answers) +
        "\n\n您的基本評估資料已送出，請等待霧眉師人工評估與回覆。審核通過後才會開放預約時段；提交資料不代表預約成立。" };
  }
  var next = nextStep(step, text, answers);
  var historyNext = Array.isArray(answers._history) ? answers._history : [];
  historyNext.push(step);
  answers._history = historyNext.slice(-30);
  var manual = Boolean(row.manual_review_required) || risk(step, text);
  var route = pausedRoute(step, text) ? "暫停預約" :
    (manual || row.booking_route === "優先人工審核" ? "優先人工審核" : "一般人工審核");
  var consentAt = step === "health_data_consent" && text === "我已閱讀並同意" ? now : null;
  await env.DB.prepare(
    "UPDATE brow_intake_sessions SET current_step=?1,answers_json=?2," +
    "manual_review_required=?3,booking_route=?4," +
    "health_consent_at=COALESCE(health_consent_at,?5),updated_at=?6 " +
    "WHERE tenant_id=?7 AND line_user_id=?8"
  ).bind(next, JSON.stringify(answers), manual ? 1 : 0, route, consentAt,
    now, env.TENANT_ID, userId).run();
  if (next === "confirm") return response(next, {
    message: summary(answers) + "\n\n確認送出後，請等待霧眉師人工評估與回覆。"
  });
  return response(next, route === "暫停預約" ? {
    message: "目前狀況需要老師先確認，系統暫不開放預約。若紅腫、疼痛或疑似感染持續，建議先尋求合格醫療專業人員評估。\n" + STEPS[next].question
  } : null);
}
