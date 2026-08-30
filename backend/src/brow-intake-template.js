export const BROW_INTAKE_INTRO = "為了讓老師先了解您的舊眉、眉部狀況及需求，接下來會進行簡短的霧眉新客評估。\n\n系統會一次詢問一個問題。完成資料及照片後，由老師本人進行最後人工審核。\n\n提交評估不代表預約已成立，審核通過後才會開放可預約時段。";

const BROW_SAFETY_KEYS = new Set([
  "brow_removal_history", "last_brow_removal_date", "recent_treatments",
  "recent_treatment_date", "current_skin_condition", "health_data_consent",
  "health_or_medication_risk", "health_risk_categories", "pregnancy_breastfeeding_status",
  "previous_adverse_reactions", "full_face_front", "brow_left", "brow_right"
]);
const q = (key, type, prompt, options, extra = {}) => ({
  key, type, prompt, options: options || [], required: true,
  systemLocked: BROW_SAFETY_KEYS.has(key), ...extra
});

export const BROW_INTAKE_QUESTIONS = [
  q("service_type", "single", "請問您這次想諮詢哪一項服務？", ["第一次霧眉", "舊眉重新施作", "舊眉改色或調整", "本店補色", "他店補色", "不確定，想請老師評估"]),
  q("old_brow_status", "single", "目前眉毛上是否還有以前紋繡留下的顏色或框線？", ["完全沒有", "有，但已經很淡", "有，而且仍然明顯", "曾經做過，但不確定是否還有底色"]),
  q("last_brow_procedure_date_range", "single", "最後一次施作大約是什麼時候？", ["6個月內", "6個月至1年", "1年至2年", "2年以上", "不記得"]),
  q("brow_removal_history", "single", "您是否曾做過雷射洗眉或其他舊眉淡化療程？", ["沒有", "有，療程已完成", "有，目前仍在療程中", "不確定療程名稱"]),
  q("last_brow_removal_date", "single", "最近一次洗眉或淡化療程是什麼時候？", ["一個月內", "一至三個月", "三個月以上", "不記得"]),
  q("recent_treatments", "single", "近期眉毛、額頭或眼周是否做過其他療程？", ["沒有", "雷射或光療", "酸類換膚", "微針或侵入性保養", "醫美注射", "眉部、眼周或額頭手術", "其他療程", "不確定療程名稱"]),
  q("recent_treatment_date", "single", "最近一次相關療程是什麼時候？", ["一個月內", "一至三個月", "三個月以上", "不記得"]),
  q("current_skin_condition", "single", "目前眉毛及周圍皮膚是否有以下情況？", ["沒有，皮膚狀況正常", "傷口或結痂", "紅腫、疼痛或發炎", "濕疹、脫皮、搔癢或過敏", "痘痘、膿包或疑似感染", "剛曬傷", "其他狀況", "不確定，需要老師看照片"]),
  q("health_data_consent", "single", "接下來會詢問可能影響施作、傷口恢復及過敏反應的健康相關資訊，僅供本次諮詢、評估及服務紀錄使用。", ["查看完整個資告知", "我已閱讀並同意", "暫不同意", "希望改由老師私下詢問"]),
  q("health_or_medication_risk", "single", "目前是否有可能影響出血、傷口恢復、感染或過敏的健康狀況，或正在使用相關藥物？", ["沒有", "有", "不確定", "希望私下告知老師"]),
  q("health_risk_categories", "multiple", "請選擇需要老師確認的健康或用藥類別。", ["凝血、出血或血液相關問題", "糖尿病或血糖控制問題", "免疫系統相關疾病或治療", "傷口癒合較慢", "蟹足腫或異常疤痕體質", "嚴重過敏病史", "可能影響凝血、免疫或皮膚修復的藥物", "其他", "不確定"]),
  q("pregnancy_breastfeeding_status", "single", "您目前是否有以下情況？", ["無", "懷孕中", "哺乳中", "可能懷孕", "不確定", "不方便回答"]),
  q("previous_adverse_reactions", "multiple", "過去接受霧眉、刺青或其他侵入性美容服務後，是否曾出現以下情況？", ["沒有", "嚴重過敏", "傷口感染", "長時間紅腫", "長時間疼痛", "異常凸疤或蟹足腫", "色料相關不良反應", "其他", "不確定"]),
  q("important_event_type", "multiple", "近期是否有重要行程？", ["沒有", "婚禮", "拍攝", "重要聚會", "出國", "工作活動", "水上活動", "其他"]),
  q("important_event_date", "single", "這項重要行程是否在 10 天內？", ["是，10天內", "否，超過10天", "不確定"]),
  q("full_face_front", "photo", "請上傳正面全臉照：未畫眉、無濾鏡美肌且光線明亮。", []),
  q("brow_left", "photo", "請上傳客人本人左眉的清楚照片（以客人本人方向為準，不依畫面左右判斷）。", []),
  q("brow_right", "photo", "請上傳客人本人右眉的清楚照片（以客人本人方向為準，不依畫面左右判斷）。", []),
  q("confirm", "single", "資料已整理完成。", ["確認送出", "修改服務", "修改舊眉資料", "修改皮膚或健康資料", "修改重要行程", "重新上傳照片", "暫停評估"])
];

export const BROW_RUNTIME_STEPS = Object.fromEntries(BROW_INTAKE_QUESTIONS.map(item => [item.key, {
  question: item.prompt,
  options: item.options,
  type: item.type,
  required: item.required,
  systemLocked: item.systemLocked
}]));

// 現行上傳 UI 以一個入口收齊三張照片，保留此虛擬步驟直到通用照片 UI 接管。
BROW_RUNTIME_STEPS.photos = {
  question: "請準備正面、左側眉、右側眉共3張未畫眉、無濾鏡的清楚照片。照片將交由老師人工查看。",
  options: ["我會準備照片", "改由老師私下聯絡"],
  type: "photo",
  required: true,
  systemLocked: true
};

const hasAny = (value, choices) => (Array.isArray(value) ? value : [value]).some(item => choices.includes(item));

export function nextBrowQuestion(key, answer) {
  if (key === "service_type") return "old_brow_status";
  if (key === "old_brow_status") return answer === "完全沒有" ? "recent_treatments" : "last_brow_procedure_date_range";
  if (key === "last_brow_procedure_date_range") return "brow_removal_history";
  if (key === "brow_removal_history") return answer === "沒有" ? "recent_treatments" : "last_brow_removal_date";
  if (key === "last_brow_removal_date") return "recent_treatments";
  if (key === "recent_treatments") return answer === "沒有" ? "current_skin_condition" : "recent_treatment_date";
  if (key === "recent_treatment_date") return "current_skin_condition";
  if (key === "current_skin_condition") return "health_data_consent";
  if (key === "health_data_consent") return answer === "我已閱讀並同意" ? "health_or_medication_risk" : "full_face_front";
  if (key === "health_or_medication_risk") return answer === "沒有" ? "pregnancy_breastfeeding_status" : "health_risk_categories";
  if (key === "health_risk_categories") return "pregnancy_breastfeeding_status";
  if (key === "pregnancy_breastfeeding_status") return "previous_adverse_reactions";
  if (key === "previous_adverse_reactions") return "important_event_type";
  if (key === "important_event_type") return hasAny(answer, ["沒有"]) ? "full_face_front" : "important_event_date";
  if (key === "important_event_date") return "full_face_front";
  if (key === "full_face_front") return "brow_left";
  if (key === "brow_left") return "brow_right";
  if (key === "brow_right") return null;
  return null;
}

export function evaluateBrowCase(answers = {}, photoKinds = []) {
  const caseTags = [];
  let bookingRoute = "一般待審核";
  const priority = tag => { if (!caseTags.includes(tag)) caseTags.push(tag); if (bookingRoute === "一般待審核") bookingRoute = "優先待審核"; };
  const pause = tag => { priority(tag); bookingRoute = "暫不開放排程"; };
  if (answers.old_brow_status && answers.old_brow_status !== "完全沒有") priority("舊眉案件");
  if (answers.brow_removal_history && answers.brow_removal_history !== "沒有") priority("洗眉／淡化療程");
  if (answers.brow_removal_history === "有，目前仍在療程中") pause("療程尚未完成");
  if (answers.recent_treatments && answers.recent_treatments !== "沒有") priority("近期眉周療程");
  if (answers.current_skin_condition && answers.current_skin_condition !== "沒有，皮膚狀況正常") priority("眉部皮膚待確認");
  if (/傷口|結痂|紅腫|疼痛|發炎|膿包|感染/.test(answers.current_skin_condition || "")) pause("目前眉部異常");
  if (answers.health_data_consent && answers.health_data_consent !== "我已閱讀並同意") priority("健康資料待人工聯絡");
  if (answers.health_or_medication_risk && answers.health_or_medication_risk !== "沒有") priority("健康資料待老師確認");
  if (answers.pregnancy_breastfeeding_status && answers.pregnancy_breastfeeding_status !== "無") priority("特殊狀況待確認");
  if (answers.previous_adverse_reactions && !hasAny(answers.previous_adverse_reactions, ["沒有"])) priority("過往不良反應");
  if (answers.important_event_type && !hasAny(answers.important_event_type, ["沒有"])) caseTags.push("近期重要行程");
  const requiredPhotos = ["full_face_front", "brow_left", "brow_right"];
  const missingFields = requiredPhotos.filter(kind => !photoKinds.includes(kind));
  if (missingFields.length && bookingRoute !== "暫不開放排程") bookingRoute = "待補資料";
  return { bookingRoute, caseTags, missingFields };
}

export function buildBrowOwnerSummary(answers = {}, photoKinds = [], result = evaluateBrowCase(answers, photoKinds)) {
  const parts = [];
  const add = (label, value) => {
    if (Array.isArray(value) && value.length) parts.push(label + value.join("、"));
    else if (value !== undefined && value !== null && value !== "") parts.push(label + value);
  };
  add("諮詢", answers.service_type);
  add("舊眉", [answers.old_brow_status, answers.last_brow_procedure_date_range].filter(Boolean).join("／"));
  add("洗眉", [answers.brow_removal_history, answers.last_brow_removal_date].filter(Boolean).join("／"));
  add("近期療程", [answers.recent_treatments, answers.recent_treatment_date].filter(Boolean).join("／"));
  add("眉部狀況", answers.current_skin_condition);
  add("健康／用藥", [answers.health_or_medication_risk, ...(answers.health_risk_categories || []), answers.pregnancy_breastfeeding_status].filter(Boolean));
  add("不良反應", answers.previous_adverse_reactions);
  add("行程", [answers.important_event_type, answers.important_event_date].flat().filter(Boolean));
  parts.push("照片" + (result.missingFields.length ? "缺" + result.missingFields.join("、") : "完整"));
  parts.push("分流" + result.bookingRoute);
  const text = parts.join("；") + "。";
  return Array.from(text).slice(0, 180).join("");
}
