const q = (locked, key, type, prompt, options) => ({
  key, type, prompt, options: options || [], required: true, systemLocked: locked.has(key)
});
const hasAny = (value, choices) => (Array.isArray(value) ? value : [value]).some(item => choices.includes(item));
const nextIn = (questions, key) => {
  const index = questions.findIndex(item => item.key === key);
  return index >= 0 && index + 1 < questions.length ? questions[index + 1].key : null;
};
const validate = (questions, key, value) => {
  const question = questions.find(item => item.key === key);
  if (!question) return { valid: false, reason: "未知題目" };
  if (question.type === "multiple") {
    if (!Array.isArray(value) || !value.length || value.some(item => !question.options.includes(item))) return { valid: false, reason: "請選擇有效選項" };
    if (value.some(item => /^(正常，沒有不舒服|沒有，目前正常|沒有)$/.test(item)) && value.length > 1) return { valid: false, reason: "正常或沒有不可與其他選項同時選擇" };
  } else if (question.type === "single" && !question.options.includes(value)) return { valid: false, reason: "請選擇有效選項" };
  else if (question.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return { valid: false, reason: "請選擇日期" };
  return { valid: true };
};
const result = (answers, photos, requiredPhotos, rules) => {
  const caseTags = []; let bookingRoute = "一般待審核";
  const priority = tag => { if (!caseTags.includes(tag)) caseTags.push(tag); if (bookingRoute === "一般待審核") bookingRoute = "優先待審核"; };
  const pause = tag => { priority(tag); bookingRoute = "暫不開放排程"; };
  rules({ answers, priority, pause });
  const missingFields = requiredPhotos.filter(kind => !photos.includes(kind));
  if (missingFields.length && bookingRoute !== "暫不開放排程") bookingRoute = "待補資料";
  return { bookingRoute, caseTags, missingFields };
};
const summary = (name, answers, evaluation) => Array.from(
  name + "；" + Object.entries(answers).slice(0, 7).map(([key, value]) => key + "：" + (Array.isArray(value) ? value.join("、") : value)).join("；") +
  "；標籤：" + evaluation.caseTags.join("、") + "；分流：" + evaluation.bookingRoute + "。"
).slice(0, 180).join("");

const BROW_LOCKED = new Set(["previous_lightening", "last_lightening_time", "lightening_recovery", "skin_condition", "scar_history", "face_front", "brows_front", "left_brow", "right_brow"]);
const bq = (...args) => q(BROW_LOCKED, ...args);
export const BROW_LIGHTENING_INTRO = "舊色輕色管理的呈現會依原有留色、施作次數及個人狀態而有所不同，實際安排由老師看過資料與照片後評估。";
export const BROW_LIGHTENING_QUESTIONS = [
  bq("old_color_status", "single", "目前眉毛是否還有過去紋繡留下的顏色？", ["顏色很淡", "還有明顯顏色", "顏色深淺不均", "左右眉留色不同", "不確定，想請老師看照片"]),
  bq("last_procedure_time", "single", "最後一次做眉部紋繡大約是什麼時候？", ["6個月內", "6個月至1年", "1～2年", "2～3年", "3年以上", "不記得"]),
  bq("procedure_count", "single", "過去眉部紋繡大約做過幾次？", ["1次", "2次", "3次以上", "次數很多／不記得"]),
  bq("old_color_tone", "single", "您覺得目前舊眉比較接近哪種顏色？", ["淺棕", "深棕", "灰色", "灰藍色", "偏紅", "偏橘", "多種顏色混合", "不確定，請老師看照片"]),
  bq("goals", "multiple", "這次最希望改善什麼？可複選。", ["舊眉顏色太深", "舊眉顏色不均", "舊眉已經變色", "左右眉顏色不同", "不喜歡原本眉型", "想重新設計新眉型", "想更換新的眉色", "希望舊色降低存在感", "其他", "不確定，希望老師建議"]),
  bq("previous_lightening", "single", "以前是否曾經處理過這組舊眉顏色？", ["從未處理", "曾做過1次", "曾做過2～3次", "曾做過多次", "做過，但不記得次數", "不確定"]),
  bq("last_lightening_time", "single", "上一次舊色淡化大約是什麼時候？", ["1個月內", "1～3個月", "3～6個月", "6個月以上", "不記得"]),
  bq("lightening_recovery", "single", "目前眉部是否已完全恢復？", ["是，目前沒有不舒服", "還有泛紅", "還有結痂", "還有傷口", "還有疼痛或不舒服", "不確定"]),
  bq("skin_condition", "multiple", "目前眉毛及周圍皮膚狀況如何？可複選。", ["正常，沒有不舒服", "比較乾燥", "正在脫皮", "泛紅", "搔癢", "有痘痘", "有結痂", "有傷口", "有腫脹", "有疼痛", "其他", "不確定"]),
  bq("scar_history", "single", "過去紋繡或其他皮膚操作後，是否曾出現明顯凸起或異常疤痕？", ["沒有", "有", "不確定", "希望私下告知老師"]),
  bq("expectation", "single", "您希望這次舊眉輕色管理達到什麼效果？", ["降低舊色存在感即可", "希望方便後續重新設計眉型", "希望後續重新做新的眉色", "希望盡可能淡", "不確定，希望老師評估"]),
  bq("face_front", "photo", "請上傳正面全臉照：不畫眉、不遮瑕、無濾鏡美肌且光線清楚。", []),
  bq("brows_front", "photo", "請上傳雙眉正面近照。", []),
  bq("left_brow", "photo", "請上傳客人本人左眉近照（以客人本人方向為準）。", []),
  bq("right_brow", "photo", "請上傳客人本人右眉近照（以客人本人方向為準）。", [])
];
export function nextBrowLighteningQuestion(key, answer) {
  const newFlow = {
    old_color_status: "last_procedure_time",
    last_procedure_time: "goals",
    goals: "previous_lightening",
    lightening_recovery: "skin_condition",
    skin_condition: "scar_history",
    scar_history: "face_front",
    face_front: "brows_front",
    brows_front: null
  };
  if (key === "previous_lightening") return answer === "從未處理" ? "skin_condition" : "lightening_recovery";
  if (Object.hasOwn(newFlow, key)) return newFlow[key];
  // 舊進度相容：已停在精簡題目上的案件仍可繼續完成，不要求重新開始。
  if (key === "procedure_count" || key === "old_color_tone") return "goals";
  if (key === "last_lightening_time") return "lightening_recovery";
  if (key === "expectation") return "face_front";
  if (key === "left_brow") return "right_brow";
  if (key === "right_brow") return null;
  return nextIn(BROW_LIGHTENING_QUESTIONS, key);
}
export const validateBrowLighteningAnswer = (key, value) => validate(BROW_LIGHTENING_QUESTIONS, key, value);
export function evaluateBrowLighteningCase(answers = {}, photos = []) {
  return result(answers, photos, ["face_front", "brows_front"], ({ answers: a, priority, pause }) => {
    if (a.previous_lightening && a.previous_lightening !== "從未處理") priority("曾做舊色淡化");
    if (hasAny(a.lightening_recovery, ["還有結痂", "還有傷口", "還有疼痛或不舒服"])) pause("目前狀態待確認");
    else if (a.lightening_recovery && a.lightening_recovery !== "是，目前沒有不舒服") priority("恢復狀況待確認");
    if (hasAny(a.skin_condition, ["有結痂", "有傷口", "有腫脹", "有疼痛"])) pause("目前眉部狀態待確認");
    else if (a.skin_condition && !hasAny(a.skin_condition, ["正常，沒有不舒服"])) priority("眉部皮膚待確認");
    if (a.scar_history && a.scar_history !== "沒有") priority(/私下/.test(a.scar_history) ? "待人工聯絡" : "疤痕經驗待確認");
  });
}
export const buildBrowLighteningOwnerSummary = (answers, photos, evaluation = evaluateBrowLighteningCase(answers, photos)) => summary("舊眉輕色管理新客評估", answers, evaluation);

const LIP_LOCKED = new Set(["previous_lightening", "last_lightening_time", "lightening_recovery", "lip_condition", "recurrent_blisters", "recent_lip_procedure", "recent_procedure_date", "recent_procedure_recovery", "face_front", "lips_closed", "lips_open", "left_45", "right_45"]);
const lq = (...args) => q(LIP_LOCKED, ...args);
export const LIP_LIGHTENING_INTRO = "舊色輕色管理的呈現會依原有留色、施作次數及個人狀態而有所不同，實際安排由老師看過資料與照片後評估。";
export const LIP_LIGHTENING_QUESTIONS = [
  lq("old_color_status", "single", "目前嘴唇是否還有過去霧唇／紋唇留下的顏色？", ["已經很淡", "還有明顯顏色", "顏色深淺不均", "上下唇顏色不同", "唇框顏色較明顯", "不確定，請老師看照片"]),
  lq("last_procedure_time", "single", "最後一次做霧唇／紋唇大約是什麼時候？", ["6個月內", "6個月至1年", "1～2年", "2～3年", "3年以上", "不記得"]),
  lq("procedure_count", "single", "過去唇部紋繡大約做過幾次？", ["1次", "2次", "3次以上", "次數很多／不記得"]),
  lq("old_color_tone", "single", "您覺得目前殘留的顏色比較接近哪一種？", ["淺粉", "深粉", "紅色", "橘紅", "紫紅", "偏暗", "顏色不均", "多種顏色", "不確定，請老師看照片"]),
  lq("goals", "multiple", "這次最希望改善哪些狀況？可複選。", ["舊色太深", "不喜歡目前顏色", "顏色不均", "上下唇色差", "唇框顏色明顯", "舊色與原生唇色不協調", "希望降低舊色存在感", "想重新選擇新的唇色", "想之後重新做霧唇", "其他", "不確定"]),
  lq("previous_lightening", "single", "以前是否曾經處理過目前的舊唇色？", ["從未處理", "曾做過1次", "曾做過2～3次", "曾做過多次", "做過，但不記得次數", "不確定"]),
  lq("last_lightening_time", "single", "最近一次舊色淡化大約是什麼時候？", ["1個月內", "1～3個月", "3～6個月", "6個月以上", "不記得"]),
  lq("lightening_recovery", "single", "目前嘴唇是否已經完全恢復？", ["是，目前正常", "還在脫皮", "還有結痂", "還有裂傷", "還有紅腫", "還有疼痛", "不確定"]),
  lq("lip_condition", "multiple", "目前嘴唇或嘴角是否有以下情況？", ["沒有，目前正常", "明顯乾燥", "正在脫皮", "有裂傷", "有出血", "有結痂", "有小水泡", "有紅腫", "有疼痛／灼熱", "嘴角破皮", "其他", "不確定"]),
  lq("recurrent_blisters", "single", "過去嘴唇或嘴角是否曾反覆出現小水泡、刺痛、灼熱或結痂？", ["從未", "曾經有過", "曾被醫療專業人員告知為唇皰疹", "最近正在發生", "不確定", "希望私下告知老師"]),
  lq("recent_lip_procedure", "single", "近期是否做過其他唇部美容操作？", ["沒有", "唇部填充", "舊唇色淡化", "其他唇部美容操作", "不確定"]),
  lq("recent_procedure_date", "date", "最近一次唇部美容操作日期是？", []),
  lq("recent_procedure_recovery", "single", "目前唇部是否已完全恢復？", ["是，目前正常", "尚未完全恢復", "不確定"]),
  lq("expectation", "single", "您希望這次舊唇輕色管理達到什麼效果？", ["降低目前舊色存在感", "改善明顯色差", "為後續重新霧唇做準備", "希望重新選擇新的唇色", "希望盡可能淡", "不確定，希望老師評估"]),
  lq("important_event", "multiple", "近期是否有重要行程？", ["沒有", "婚禮／宴會", "拍攝", "出國", "重要工作", "其他"]),
  lq("important_event_date", "date", "重要行程日期是？", []),
  lq("face_front", "photo", "請上傳正面全臉照：不擦口紅或有色護唇膏、不遮瑕、無濾鏡美肌且光線均勻。", []),
  lq("lips_closed", "photo", "請上傳唇部自然閉合正面近照。", []),
  lq("lips_open", "photo", "請上傳唇部自然微張近照。", []),
  lq("left_45", "photo", "請上傳左側 45 度照片。", []),
  lq("right_45", "photo", "請上傳右側 45 度照片。", [])
];
export function nextLipLighteningQuestion(key, answer) {
  if (key === "previous_lightening" && answer === "從未處理") return "lip_condition";
  if (key === "recent_lip_procedure" && answer === "沒有") return "expectation";
  if (key === "important_event" && hasAny(answer, ["沒有"])) return "face_front";
  return nextIn(LIP_LIGHTENING_QUESTIONS, key);
}
export const validateLipLighteningAnswer = (key, value) => validate(LIP_LIGHTENING_QUESTIONS, key, value);
export function evaluateLipLighteningCase(answers = {}, photos = []) {
  return result(answers, photos, ["face_front", "lips_closed", "lips_open", "left_45", "right_45"], ({ answers: a, priority, pause }) => {
    if (a.previous_lightening && a.previous_lightening !== "從未處理") priority("曾做舊色淡化");
    if (hasAny(a.lightening_recovery, ["還有結痂", "還有裂傷", "還有紅腫", "還有疼痛"])) pause("舊色淡化尚未恢復");
    if (hasAny(a.lip_condition, ["有裂傷", "有出血", "有結痂", "有小水泡", "有紅腫", "有疼痛／灼熱", "嘴角破皮"])) pause("目前唇部狀態待確認");
    else if (a.lip_condition && !hasAny(a.lip_condition, ["沒有，目前正常"])) priority("唇部狀態待確認");
    if (a.recurrent_blisters === "最近正在發生") pause("目前反覆水泡狀況待確認");
    else if (a.recurrent_blisters && a.recurrent_blisters !== "從未") priority(/私下/.test(a.recurrent_blisters) ? "待人工聯絡" : "反覆水泡紀錄待確認");
    if (a.recent_lip_procedure && a.recent_lip_procedure !== "沒有") priority("近期唇部操作");
    if (a.recent_procedure_recovery && a.recent_procedure_recovery !== "是，目前正常") pause("近期唇部操作尚未恢復");
  });
}
export const buildLipLighteningOwnerSummary = (answers, photos, evaluation = evaluateLipLighteningCase(answers, photos)) => summary("舊唇輕色管理新客評估", answers, evaluation);
