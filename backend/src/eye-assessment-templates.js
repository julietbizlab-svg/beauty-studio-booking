const q = (safetyKeys, key, type, prompt, options, extra = {}) => ({
  key, type, prompt, options: options || [], required: true,
  systemLocked: safetyKeys.has(key), ...extra
});
const hasAny = (value, choices) => (Array.isArray(value) ? value : [value]).some(item => choices.includes(item));
const nextIn = (questions, key) => {
  const index = questions.findIndex(item => item.key === key);
  return index >= 0 && index + 1 < questions.length ? questions[index + 1].key : null;
};
const summarize = (label, answers, result) => {
  const supplied = Object.entries(answers).filter(([, value]) => value != null && value !== "")
    .slice(0, 5).map(([key, value]) => key + "：" + (Array.isArray(value) ? value.join("、") : value));
  return Array.from(label + "；" + supplied.join("；") + "；標籤：" + result.caseTags.join("、") +
    "；分流：" + result.bookingRoute + "。").slice(0, 180).join("");
};
const validate = (questions, key, value) => {
  const question = questions.find(item => item.key === key);
  if (!question) return { valid: false, reason: "未知題目" };
  if (question.type === "multiple") {
    if (!Array.isArray(value) || !value.length || value.some(item => !question.options.includes(item))) return { valid: false, reason: "請選擇有效選項" };
    if (value.some(item => /^(沒有|沒有，目前正常|沒有特別困擾)$/.test(item)) && value.length > 1) return { valid: false, reason: "沒有不可與其他選項同時選擇" };
  } else if (question.type === "single" && !question.options.includes(value)) return { valid: false, reason: "請選擇有效選項" };
  else if (question.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return { valid: false, reason: "請選擇日期" };
  return { valid: true };
};

const EYELINER_SAFETY = new Set(["current_eye_condition", "recent_eye_procedures", "procedure_timing",
  "procedure_recovery", "eye_treatment", "contact_lenses", "health_data_consent", "health_risk",
  "health_categories", "pregnancy_status", "adverse_reactions", "face_open", "eyes_closed", "eyes_open"]);
const eq = (...args) => q(EYELINER_SAFETY, ...args);
export const EYELINER_INTAKE_INTRO = "為了讓老師了解您的眼周狀況、舊色與需求，接下來會進行眼線／美瞳線新客評估。資料只供人工審核；提交不代表可以施作或預約成立。";
export const EYELINER_INTAKE_QUESTIONS = [
  eq("service_type", "single", "這次想諮詢哪一項眼部服務？", ["隱形美瞳線", "韓系美瞳線", "自然眼線", "眼尾加強", "舊眼線重新施作", "不確定，請老師建議"]),
  eq("previous_eyeliner", "single", "以前是否做過美瞳線、眼線或其他眼部紋繡？", ["從未做過", "做過，目前已經很淡", "做過，目前仍有明顯舊色", "做過，但左右留色不均", "不確定目前舊色狀況"]),
  eq("last_eyeliner_time", "single", "最後一次施作時間大約是？", ["6個月內", "6個月至1年", "1～2年", "2年以上", "不記得"]),
  eq("goals", "multiple", "這次最希望改善哪些狀況？可複選。", ["素顏時眼神更有精神", "加強睫毛根部視覺濃密感", "希望眼型看起來更俐落", "希望效果自然、不明顯", "左右眼線視覺不對稱", "舊眼線退色", "舊眼線顏色不均", "其他", "不確定，希望老師建議"]),
  eq("current_eye_condition", "multiple", "目前眼睛或眼周是否有以下情況？可複選。", ["沒有，目前正常", "眼睛明顯乾澀或不舒服", "眼皮紅腫", "眼皮搔癢或脫皮", "眼周有傷口", "眼睛有異常分泌物", "近期有針眼", "近期有結膜炎或其他眼部發炎", "眼周過敏", "其他", "不確定"]),
  eq("recent_eye_procedures", "multiple", "近期是否做過以下眼部或眼周療程？", ["沒有", "雙眼皮手術", "提眼肌／眼瞼相關手術", "開眼頭／眼尾", "眼袋手術", "眼周雷射", "眼周醫美注射", "其他眼周醫美", "不確定"]),
  eq("procedure_timing", "single", "最近一次療程大約是什麼時候？", ["1個月內", "1～3個月", "3～6個月", "6個月以上", "不記得"]),
  eq("procedure_recovery", "single", "目前是否已完全恢復，沒有傷口、紅腫或疼痛？", ["已完全恢復", "尚未完全恢復", "不確定"]),
  eq("eye_treatment", "single", "目前是否正在接受眼睛相關治療，或近期做過眼科手術？", ["沒有", "有", "不確定", "希望私下告知老師"]),
  eq("contact_lenses", "single", "平常是否配戴隱形眼鏡？", ["不戴", "偶爾配戴", "每天配戴", "配戴後容易乾澀或不舒服"]),
  eq("health_data_consent", "single", "接下來會詢問健康資料，僅供本次諮詢、人工評估及服務紀錄使用。", ["查看完整個資告知", "我已閱讀並同意", "暫不同意", "希望老師私下確認"]),
  eq("health_risk", "single", "目前是否有可能影響出血、傷口恢復、感染或過敏的健康狀況，或正在使用相關藥物？", ["沒有", "有", "不確定", "希望私下告知老師"]),
  eq("health_categories", "multiple", "請選擇需要老師確認的類別。", ["凝血／出血相關", "糖尿病／血糖相關", "免疫相關", "傷口癒合問題", "嚴重過敏史", "正在使用可能影響凝血或傷口修復的藥物", "其他", "不確定"]),
  eq("pregnancy_status", "single", "您目前是否有以下情況？", ["無", "懷孕中", "哺乳中", "可能懷孕", "不確定", "不方便回答"]),
  eq("adverse_reactions", "multiple", "過去接受眼線紋繡、刺青或侵入性美容後，是否曾出現不良反應？", ["沒有", "嚴重過敏", "長時間紅腫", "感染", "傷口癒合異常", "色料相關不良反應", "其他", "不確定"]),
  eq("face_open", "photo", "請上傳正面全臉、自然睜眼照片：素顏眼部、不畫眼線、不貼假睫毛、無濾鏡且光線充足。", []),
  eq("eyes_closed", "photo", "請上傳雙眼閉眼近照。", []),
  eq("eyes_open", "photo", "請上傳自然睜眼近照。", [])
];
export function nextEyelinerQuestion(key, answer) {
  if (key === "previous_eyeliner" && answer === "從未做過") return "goals";
  if (key === "recent_eye_procedures" && hasAny(answer, ["沒有"])) return "eye_treatment";
  if (key === "procedure_recovery") return "eye_treatment";
  if (key === "health_data_consent" && answer !== "我已閱讀並同意") return "face_open";
  if (key === "health_risk" && answer === "沒有") return "pregnancy_status";
  return nextIn(EYELINER_INTAKE_QUESTIONS, key);
}
export function evaluateEyelinerCase(answers = {}, photos = []) {
  const tags = []; let bookingRoute = "一般待審核";
  const priority = tag => { if (!tags.includes(tag)) tags.push(tag); if (bookingRoute === "一般待審核") bookingRoute = "優先待審核"; };
  const pause = tag => { priority(tag); bookingRoute = "暫不開放排程"; };
  if (answers.previous_eyeliner && answers.previous_eyeliner !== "從未做過") priority("舊眼線");
  if (hasAny(answers.current_eye_condition, ["眼皮紅腫", "眼周有傷口", "眼睛有異常分泌物", "近期有針眼", "近期有結膜炎或其他眼部發炎"])) pause("目前眼周狀況待確認");
  else if (answers.current_eye_condition && !hasAny(answers.current_eye_condition, ["沒有，目前正常"])) priority("目前眼周狀況待確認");
  if (answers.recent_eye_procedures && !hasAny(answers.recent_eye_procedures, ["沒有"])) priority("近期眼周療程");
  if (answers.procedure_recovery === "尚未完全恢復") pause("眼周療程尚未恢復");
  if (answers.eye_treatment && answers.eye_treatment !== "沒有") priority("眼睛相關治療待確認");
  if (answers.health_data_consent && answers.health_data_consent !== "我已閱讀並同意") priority("待人工聯絡");
  if (answers.health_risk && answers.health_risk !== "沒有") priority("健康／用藥待確認");
  if (answers.pregnancy_status && answers.pregnancy_status !== "無") priority("特殊狀況待確認");
  if (answers.adverse_reactions && !hasAny(answers.adverse_reactions, ["沒有"])) priority("過往不良反應");
  const missingFields = ["face_open", "eyes_closed", "eyes_open"].filter(kind => !photos.includes(kind));
  if (missingFields.length && bookingRoute !== "暫不開放排程") bookingRoute = "待補資料";
  return { bookingRoute, caseTags: tags, missingFields };
}
export const validateEyelinerAnswer = (key, value) => validate(EYELINER_INTAKE_QUESTIONS, key, value);
export const buildEyelinerOwnerSummary = (answers, photos, result = evaluateEyelinerCase(answers, photos)) => summarize("眼線／美瞳線新客評估", answers, result);

const UNDEREYE_SAFETY = new Set(["current_skin_condition", "recent_procedures", "procedure_recovery",
  "health_data_consent", "safety_check", "face_neutral", "eyes_open", "face_smile"]);
const uq = (...args) => q(UNDEREYE_SAFETY, ...args);
export const UNDEREYE_INTAKE_INTRO = "為了讓老師了解您的眼下狀況與設計偏好，接下來會進行光影臥蠶新客評估。此題庫僅適用微色素定妝類服務，資料最後由老師人工審核。";
export const UNDEREYE_INTAKE_QUESTIONS = [
  uq("previous_service", "single", "第一次接受這類服務嗎？", ["第一次", "曾做過，目前已經很淡", "曾做過，目前仍有明顯留色", "曾在其他工作室施作", "不確定"]),
  uq("goals", "multiple", "這次最希望呈現什麼感覺？可複選。", ["極自然原生感", "韓系輕盈感", "微笑時更立體", "希望眼神較柔和", "改善左右視覺不對稱", "精緻妝感", "舊光影臥蠶調整", "不確定，由老師設計"]),
  uq("current_skin_condition", "multiple", "目前眼下及眼周是否有以下情況？", ["沒有，目前正常", "明顯乾燥", "脫皮", "泛紅", "搔癢", "過敏", "傷口", "腫脹", "疼痛", "發炎", "其他", "不確定"]),
  uq("recent_procedures", "multiple", "近期眼下或眼周是否做過以下療程？", ["沒有", "玻尿酸／填充", "淚溝填充", "肉毒桿菌素注射", "眼周雷射", "電音波／其他能量療程", "眼袋手術", "雙眼皮／其他眼周手術", "其他", "不確定"]),
  uq("procedure_recovery", "single", "目前是否完全恢復？", ["已完全恢復", "還有腫脹", "還有瘀青", "還有疼痛", "還有傷口", "不確定"]),
  uq("health_data_consent", "single", "接下來會詢問健康資料，僅供本次諮詢、人工評估及服務紀錄使用。", ["我已閱讀並同意", "查看完整說明", "暫不同意", "老師私下確認"]),
  uq("safety_check", "multiple", "是否有需要老師另外確認的健康或過往反應？", ["沒有", "健康狀況或相關用藥", "懷孕中、可能懷孕或哺乳中", "曾有嚴重過敏或長時間紅腫", "曾有感染、異常疤痕或恢復問題", "不確定", "希望私下告知老師"]),
  uq("face_neutral", "photo", "請上傳正面全臉自然表情照片：素顏眼周、不畫臥蠶、不使用遮瑕或提亮產品、無濾鏡。", []),
  uq("eyes_open", "photo", "請上傳正面雙眼自然睜眼特寫。", []),
  uq("face_smile", "photo", "請上傳正面自然微笑特寫。", [])
];
export function nextUnderEyeQuestion(key, answer) {
  if (key === "recent_procedures" && hasAny(answer, ["沒有"])) return "health_data_consent";
  if (key === "health_data_consent" && answer !== "我已閱讀並同意") return "face_neutral";
  return nextIn(UNDEREYE_INTAKE_QUESTIONS, key);
}
export function evaluateUnderEyeCase(answers = {}, photos = []) {
  const tags = []; let bookingRoute = "一般待審核";
  const priority = tag => { if (!tags.includes(tag)) tags.push(tag); if (bookingRoute === "一般待審核") bookingRoute = "優先待審核"; };
  const pause = tag => { priority(tag); bookingRoute = "暫不開放排程"; };
  if (answers.previous_service && answers.previous_service !== "第一次") priority("舊色待查看");
  if (hasAny(answers.current_skin_condition, ["傷口", "腫脹", "疼痛", "發炎"])) pause("目前眼下狀況待確認");
  else if (answers.current_skin_condition && !hasAny(answers.current_skin_condition, ["沒有，目前正常"])) priority("目前眼下狀況待確認");
  if (answers.recent_procedures && !hasAny(answers.recent_procedures, ["沒有"])) priority("近期眼周療程");
  if (hasAny(answers.procedure_recovery, ["還有腫脹", "還有瘀青", "還有疼痛", "還有傷口"])) pause("眼周療程尚未恢復");
  if (answers.health_data_consent && answers.health_data_consent !== "我已閱讀並同意") priority("待人工聯絡");
  if (answers.safety_check && !hasAny(answers.safety_check, ["沒有"])) priority(hasAny(answers.safety_check, ["希望私下告知老師"]) ? "待人工聯絡" : "健康／過往反應待確認");
  const missingFields = ["face_neutral", "eyes_open", "face_smile"].filter(kind => !photos.includes(kind));
  if (missingFields.length && bookingRoute !== "暫不開放排程") bookingRoute = "待補資料";
  return { bookingRoute, caseTags: tags, missingFields };
}
export const validateUnderEyeAnswer = (key, value) => validate(UNDEREYE_INTAKE_QUESTIONS, key, value);
export const buildUnderEyeOwnerSummary = (answers, photos, result = evaluateUnderEyeCase(answers, photos)) => summarize("光影臥蠶新客評估", answers, result);
