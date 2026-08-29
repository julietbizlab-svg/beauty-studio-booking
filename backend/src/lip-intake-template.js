export const LIP_INTAKE_INTRO = "為了讓老師先了解您的原生唇色、舊唇色、唇部狀況及需求，接下來會進行簡短的霧唇新客評估。\n\n系統會一次詢問一個問題。完成資料及照片後，由老師本人進行最後人工審核。\n\n提交評估不代表預約已成立，審核通過後才會開放可預約時段。";

const LIP_SAFETY_KEYS = new Set([
  "herpes_or_cold_sore_history", "last_cold_sore_episode", "current_lip_or_oral_condition",
  "recent_lip_procedures", "last_lip_procedure_date", "procedure_recovery_status",
  "recent_dental_procedures", "last_dental_procedure_date", "dental_recovery_status",
  "health_data_consent", "health_or_medication_risk", "health_risk_categories",
  "medication_status", "medication_categories", "pregnancy_breastfeeding_status",
  "previous_adverse_reactions", "full_face_front", "lip_closeup_relaxed",
  "lip_closeup_slightly_open", "left_45", "right_45"
]);
const q = (key, type, prompt, options, extra = {}) => ({
  key, type, prompt, options: options || [], required: true,
  systemLocked: LIP_SAFETY_KEYS.has(key), ...extra
});

export const LIP_INTAKE_QUESTIONS = [
  q("service_type", "single", "請先選擇您這次想諮詢的服務。", ["第一次霧唇", "曾做過霧唇，想重新施作", "深唇／暗沉唇調色", "本店補色", "他店補色", "不確定，想請老師評估"]),
  q("store_touchup_range", "single", "上一次在本店施作大約是什麼時候？", ["3個月內", "3～6個月", "6個月以上", "不記得"]),
  q("previous_lip_tattoo", "single", "以前是否做過霧唇／紋唇？", ["從未做過", "做過，目前幾乎看不到", "做過，目前仍有明顯顏色", "做過，目前顏色不均", "做過，但不確定目前狀況"]),
  q("last_lip_tattoo_date_range", "single", "最後一次施作大約是什麼時候？", ["6個月內", "6個月至1年", "1～2年", "2年以上", "不記得"]),
  q("residual_pigment_status", "single", "目前舊唇色比較接近哪一種？", ["很淡", "仍然明顯", "深淺不均", "唇框較深", "上下唇顏色不同", "顏色偏灰／暗／其他", "不確定，請老師看照片"]),
  q("treatment_goals", "multiple", "這次最想改善什麼？", ["素顏看起來比較有氣色", "唇色暗沉", "上下唇色差", "唇框較深", "唇色不均", "舊色不漂亮", "希望唇色較自然", "希望唇色較有妝感", "希望改善視覺上的唇形不對稱", "不確定，希望老師建議"]),
  q("herpes_or_cold_sore_history", "single", "您過去嘴唇或嘴角是否曾出現反覆小水泡、刺痛、灼熱、搔癢或結痂？", ["從未發生", "曾發生過", "曾被醫師告知是唇皰疹", "最近正在發生", "不確定", "不方便在線上回答"]),
  q("last_cold_sore_episode", "single", "最近一次大約是什麼時候？", ["1個月內", "1～3個月", "3～6個月", "6個月以上", "不記得"]),
  q("current_lip_or_oral_condition", "multiple", "目前唇部狀況為何？", ["目前正常", "明顯乾燥", "正在脫皮", "有裂傷", "有出血", "有嘴破／口腔潰瘍", "有小水泡", "有結痂", "有明顯紅腫", "有疼痛或灼熱", "嘴角有破皮", "有滲液或其他異常", "不確定"]),
  q("recent_lip_procedures", "multiple", "近期是否做過唇部醫美？", ["沒有", "玻尿酸豐唇", "其他唇部填充", "填充物溶解", "唇周雷射", "唇周換膚", "唇部或唇周手術", "其他醫美", "不確定名稱"]),
  q("last_lip_procedure_date", "single", "最近一次療程日期？", ["2週內", "2週～1個月", "1～3個月", "3個月以上", "不記得"]),
  q("procedure_recovery_status", "single", "目前療程部位是否已經完全恢復？", ["已完全恢復", "還有腫脹", "還有疼痛", "還有傷口", "不確定"]),
  q("recent_dental_procedures", "multiple", "近期是否有牙科或口腔治療？", ["沒有", "洗牙", "拔牙", "植牙", "根管治療", "牙周治療", "口腔手術", "其他", "不確定"]),
  q("last_dental_procedure_date", "single", "最近一次治療大約是什麼時候？", ["1週內", "1～2週", "2週～1個月", "1個月以上", "不記得"]),
  q("dental_recovery_status", "single", "目前是否還有疼痛、傷口、腫脹或其他不舒服？", ["沒有", "有", "不確定"]),
  q("health_data_consent", "single", "接下來會詢問可能影響施作、傷口恢復及過敏反應的健康相關資訊，僅供本次諮詢、評估及服務紀錄使用。", ["查看完整個資告知", "我已閱讀並同意", "暫不同意", "希望改由老師私下詢問"]),
  q("health_or_medication_risk", "single", "目前是否有可能影響出血、傷口恢復、感染或過敏的健康狀況？", ["沒有", "有", "不確定", "希望私下告知老師"]),
  q("health_risk_categories", "multiple", "請選擇需要老師確認的健康狀況。", ["凝血或出血相關問題", "糖尿病／血糖問題", "免疫相關疾病或治療", "傷口較難癒合", "蟹足腫／異常疤痕", "嚴重過敏史", "其他", "不確定"]),
  q("medication_status", "single", "目前是否使用相關藥物？", ["沒有", "有", "不確定", "不方便在線上回答"]),
  q("medication_categories", "multiple", "是否屬於以下類型？", ["可能影響凝血的藥物", "免疫相關藥物", "類固醇相關藥物", "皮膚治療相關藥物", "其他", "不確定"]),
  q("pregnancy_breastfeeding_status", "single", "您目前是否有以下情況？", ["無", "懷孕中", "哺乳中", "可能懷孕", "不確定", "不方便回答"]),
  q("previous_adverse_reactions", "multiple", "過去做霧唇、刺青或其他侵入性美容後，是否曾有以下情況？", ["沒有", "嚴重過敏", "傷口感染", "長時間紅腫", "長時間疼痛", "反覆水泡", "異常凸疤", "色料相關不良反應", "其他", "不確定"]),
  q("important_event_type", "multiple", "近期是否有重要行程？", ["沒有", "婚禮", "拍攝", "重要聚會", "出國", "工作活動", "牙科療程", "其他"]),
  q("important_event_date", "date", "重要行程日期是？", []),
  q("full_face_front", "photo", "請上傳正面全臉照：自然表情、嘴唇自然閉合、無濾鏡美肌或唇彩，且光線明亮。", []),
  q("lip_closeup_relaxed", "photo", "請上傳嘴唇正面近照，嘴唇自然閉合。", []),
  q("lip_closeup_slightly_open", "photo", "請上傳嘴唇正面近照，嘴唇自然微張。", []),
  q("left_45", "photo", "請上傳左側 45 度嘴唇照片。", [], { required: false }),
  q("right_45", "photo", "請上傳右側 45 度嘴唇照片。", [], { required: false })
];

const byKey = Object.fromEntries(LIP_INTAKE_QUESTIONS.map(item => [item.key, item]));
const hasAny = (value, choices) => (Array.isArray(value) ? value : [value]).some(item => choices.includes(item));

export function nextLipQuestion(key, answer) {
  if (key === "service_type") return answer === "本店補色" ? "store_touchup_range" : "previous_lip_tattoo";
  if (key === "store_touchup_range") return "previous_lip_tattoo";
  if (key === "previous_lip_tattoo") return answer === "從未做過" ? "treatment_goals" : "last_lip_tattoo_date_range";
  if (key === "last_lip_tattoo_date_range") return "residual_pigment_status";
  if (key === "residual_pigment_status") return "treatment_goals";
  if (key === "treatment_goals") return "herpes_or_cold_sore_history";
  if (key === "herpes_or_cold_sore_history") return hasAny(answer, ["曾發生過", "曾被醫師告知是唇皰疹", "最近正在發生"]) ? "last_cold_sore_episode" : "current_lip_or_oral_condition";
  if (key === "last_cold_sore_episode") return "current_lip_or_oral_condition";
  if (key === "current_lip_or_oral_condition") return "recent_lip_procedures";
  if (key === "recent_lip_procedures") return hasAny(answer, ["沒有"]) ? "recent_dental_procedures" : "last_lip_procedure_date";
  if (key === "last_lip_procedure_date") return "procedure_recovery_status";
  if (key === "procedure_recovery_status") return "recent_dental_procedures";
  if (key === "recent_dental_procedures") return hasAny(answer, ["沒有"]) ? "health_data_consent" : "last_dental_procedure_date";
  if (key === "last_dental_procedure_date") return "dental_recovery_status";
  if (key === "dental_recovery_status") return "health_data_consent";
  if (key === "health_data_consent") return answer === "我已閱讀並同意" ? "health_or_medication_risk" : "full_face_front";
  if (key === "health_or_medication_risk") return answer === "沒有" ? "medication_status" : "health_risk_categories";
  if (key === "health_risk_categories") return "medication_status";
  if (key === "medication_status") return answer === "沒有" ? "pregnancy_breastfeeding_status" : "medication_categories";
  if (key === "medication_categories") return "pregnancy_breastfeeding_status";
  if (key === "pregnancy_breastfeeding_status") return "previous_adverse_reactions";
  if (key === "previous_adverse_reactions") return "important_event_type";
  if (key === "important_event_type") return hasAny(answer, ["沒有"]) ? "full_face_front" : "important_event_date";
  if (key === "important_event_date") return "full_face_front";
  if (key === "full_face_front") return "lip_closeup_relaxed";
  if (key === "lip_closeup_relaxed") return "lip_closeup_slightly_open";
  if (key === "lip_closeup_slightly_open") return null;
  return null;
}

export function evaluateLipCase(answers = {}, photoKinds = []) {
  const tags = [];
  let bookingRoute = "一般待審核";
  const priority = tag => { if (!tags.includes(tag)) tags.push(tag); if (bookingRoute === "一般待審核") bookingRoute = "優先待審核"; };
  const pause = tag => { priority(tag); bookingRoute = "暫不開放排程"; };
  if (answers.previous_lip_tattoo && answers.previous_lip_tattoo !== "從未做過") priority("舊唇色案件");
  if (hasAny(answers.herpes_or_cold_sore_history, ["曾發生過", "曾被醫師告知是唇皰疹"])) priority("曾有水泡／皰疹相關紀錄");
  if (answers.herpes_or_cold_sore_history === "最近正在發生") pause("目前唇部異常");
  if (hasAny(answers.current_lip_or_oral_condition, ["明顯乾燥", "正在脫皮"])) priority("唇部狀態待確認");
  if (hasAny(answers.current_lip_or_oral_condition, ["有裂傷", "有出血", "有嘴破／口腔潰瘍", "有小水泡", "有結痂", "有明顯紅腫", "有疼痛或灼熱", "嘴角有破皮", "有滲液或其他異常"])) pause("目前唇部異常");
  if (hasAny(answers.current_lip_or_oral_condition, ["不確定"])) priority("需照片確認");
  if (answers.recent_lip_procedures && !hasAny(answers.recent_lip_procedures, ["沒有"])) priority("近期唇部療程");
  if (hasAny(answers.procedure_recovery_status, ["還有腫脹", "還有疼痛", "還有傷口"])) pause("近期唇部療程");
  if (answers.recent_dental_procedures && !hasAny(answers.recent_dental_procedures, ["沒有"])) priority("近期牙科治療");
  if (answers.dental_recovery_status === "有") pause("近期牙科治療");
  if (answers.health_data_consent && answers.health_data_consent !== "我已閱讀並同意") priority("健康資料待人工聯絡");
  if (answers.health_or_medication_risk && answers.health_or_medication_risk !== "沒有") priority("健康資料待老師確認");
  if (answers.medication_status && answers.medication_status !== "沒有") priority("用藥待確認");
  if (answers.pregnancy_breastfeeding_status && answers.pregnancy_breastfeeding_status !== "無") priority("特殊狀況待確認");
  if (answers.previous_adverse_reactions && !hasAny(answers.previous_adverse_reactions, ["沒有"])) priority("過往不良反應");
  if (answers.important_event_type && !hasAny(answers.important_event_type, ["沒有"])) tags.push("近期重要行程");
  const requiredPhotos = ["full_face_front", "lip_closeup_relaxed", "lip_closeup_slightly_open"];
  const missingFields = requiredPhotos.filter(kind => !photoKinds.includes(kind));
  if (missingFields.length && bookingRoute !== "暫不開放排程") bookingRoute = "待補資料";
  return { bookingRoute, caseTags: tags, missingFields };
}

export function validateLipAnswer(key, value) {
  const question = byKey[key];
  if (!question) return { valid: false, reason: "未知題目" };
  if (question.type === "multiple") {
    if (!Array.isArray(value) || !value.length || value.some(item => !question.options.includes(item))) return { valid: false, reason: "請選擇有效選項" };
    if (value.includes("目前正常") && value.length > 1) return { valid: false, reason: "目前正常不可與其他唇部狀況同時選擇" };
    if (value.includes("沒有") && value.length > 1) return { valid: false, reason: "沒有不可與其他選項同時選擇" };
    return { valid: true };
  }
  if (question.type === "single" && !question.options.includes(value)) return { valid: false, reason: "請選擇有效選項" };
  if (question.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return { valid: false, reason: "請選擇日期" };
  return { valid: true };
}

export function buildLipOwnerSummary(answers = {}, photoKinds = [], caseResult = evaluateLipCase(answers, photoKinds)) {
  const parts = [];
  const add = (label, value) => {
    if (Array.isArray(value) && value.length) parts.push(label + value.join("、"));
    else if (value !== undefined && value !== null && value !== "") parts.push(label + value);
  };
  add("諮詢", answers.service_type);
  add("需求", answers.treatment_goals);
  if (answers.previous_lip_tattoo) {
    add("舊色", [answers.previous_lip_tattoo, answers.last_lip_tattoo_date_range, answers.residual_pigment_status].filter(Boolean).join("／"));
  }
  add("水泡紀錄", [answers.herpes_or_cold_sore_history, answers.last_cold_sore_episode].filter(Boolean).join("／"));
  add("目前唇況", answers.current_lip_or_oral_condition);
  const procedures = [answers.recent_lip_procedures, answers.last_lip_procedure_date, answers.procedure_recovery_status,
    answers.recent_dental_procedures, answers.last_dental_procedure_date, answers.dental_recovery_status]
    .flat().filter(Boolean);
  add("近期療程", procedures);
  const health = [answers.health_or_medication_risk, answers.health_risk_categories, answers.medication_status,
    answers.medication_categories, answers.pregnancy_breastfeeding_status].flat().filter(Boolean);
  add("健康／用藥", health);
  add("不良反應", answers.previous_adverse_reactions);
  const event = [answers.important_event_type, answers.important_event_date].flat().filter(Boolean);
  add("行程", event);
  parts.push("照片" + (caseResult.missingFields.length ? "缺" + caseResult.missingFields.join("、") : "完整"));
  parts.push("分流" + caseResult.bookingRoute);
  if (caseResult.missingFields.length) parts.push("尚缺" + caseResult.missingFields.join("、"));
  const text = parts.join("；") + "。";
  return Array.from(text).slice(0, 180).join("");
}
