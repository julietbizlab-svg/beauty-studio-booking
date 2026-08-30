/**
 * 美業工作室 — Cloudflare Workers API
 */
import {
  ensureDataEnv,
  getDataBackendName,
  listServices,
  createService,
  updateService,
  listWeeklySlots,
  replaceWeeklySlots,
  listClosedDates,
  isDateClosed,
  setDateClosed,
  getActiveBookingsByDate,
  getActiveBookingsForMonth,
  getUserBookings,
  upsertCustomer,
  createBooking,
  cancelBooking,
  requestPaidBookingReschedule,
  cancelBookingByOwner,
  getTodayBookingsForOwner,
  getOwnerBookingsForMonth,
  getOwnerCustomersFromBookings,
  getOwnerCustomerBookings,
  getSettings,
  updateSettings,
  getServiceById,
  getServiceDurationMap,
  getCustomerProfileByUserId,
  updateCustomerByOwner,
  getOwnerCustomerById,
  updateCustomerByOwnerById,
  previewCustomerImport,
  commitCustomerImport,
  createCustomerClaimInvite,
  getCustomerClaimInvite,
  revokeCustomerClaimInvite,
  claimCustomerInvite,
  listCustomerPhotoSets,
  listCustomerAlbum,
  getCustomerAlbumPhotoContent,
  createCustomerPhotoSet,
  updateCustomerPhotoSet,
  deleteCustomerPhotoSet,
  uploadCustomerComparisonPhoto,
  getCustomerPhotoContent,
  deleteCustomerComparisonPhoto,
  applyOwnerGeneralBookingStatusTransition,
  expireOverdueDepositBookings,
  expireOverdueDepositBookingsForAllTenants,
  rescheduleBookingByOwner,
  listOwnerRescheduleSlots,
  listCustomerAiInquiries,
  listOwnerAiInquiries,
  updateOwnerAiInquiryStatus,
  sendOwnerAiInquiryReply
  ,getCustomerBookingReview
  ,updateCustomerBookingReview
  ,getOwnerBookingReview
  ,getOwnerAiWorkQueue
  ,exportPaidCustomerData
  ,exportPlatformCustomerData
  ,requestOwnerBookingReviewPhoto
  ,uploadCustomerBookingReviewPhoto
  ,getOwnerBookingReviewPhotoContent
} from "./data-repository.js";
import {
  generateOwnerDailySummaryDraft,
  generateOwnerMessageDraft,
  generateOwnerReviewSummary
} from "./owner-ai.js";
import {
  dispatchQueuedLineNotifications,
  dispatchLineNotificationById,
  enqueueBookingCancelledNotifications,
  enqueueBookingCreatedNotifications,
  enqueueBookingNotification,
  enqueueTomorrowBookingRemindersForAllTenants,
  notifyOwnerDepositTransferReported,
  notifyOwnerPaidBookingReschedule
} from "./d1-notifications.js";
import { updatePigmentFollowUpReminderDates } from "./d1-brow-reminders.js";
import { listOwnerBrowIntakes, reviewOwnerBrowIntake } from "./d1-brow-intakes.js";
import { getCustomerBrowIntake, uploadCustomerBrowIntakePhoto,
  getOwnerBrowIntakePhotoContent } from "./d1-brow-intake-photos.js";
import {
  startCustomerAssessment,
  answerCustomerAssessment,
  uploadCustomerAssessmentPhoto,
  getConfiguredAssessmentTemplate,
  getCustomerConfiguredAssessmentTemplate,
  listOwnerAssessmentTemplates,
  updateOwnerAssessmentQuestion,
  listOwnerAssessments,
  reviewOwnerAssessment,
  getOwnerAssessmentPhotoContent
  ,assertCustomerAssessmentApproved
  ,isReturningCustomer
  ,completeMissingCustomerBirthday
} from "./d1-assessments.js";
import { reportCustomerDepositTransfer } from "./d1-deposit-report.js";
import { getOwnerAiCapability } from "./ai-provider.js";
import { getOwnerSubscriptionStatus } from "./subscription-status.js";
import {
  getCustomerAiCapability,
  submitCustomerQuestion
} from "./customer-ai.js";
import { handleLineWebhook, handleTenantLineWebhook } from "./line-webhook.js";
import { tenantLineChannel } from "./line-channel-routing.js";
import {
  assertPlatformOperator,
  provisionOwnerStudio,
  listPlatformStudios,
  ensurePlatformStudioCustomerEntry,
  getStudioCustomerEntryKey,
  reissuePlatformOwnerInvite,
  updatePlatformStudioIdentity,
  updatePlatformStudioAssessmentTemplate,
  managePlatformStudioSubscription,
  ensurePlatformAcceptanceStudios
} from "./platform-provisioning.js";
import { requireOwnerFromRequest } from "./owner-auth.js";
import {
  claimOwnerAccessInvite,
  resolveOwnerAccessInviteTenant,
  requireOwnerHubSession,
  scopedOwnerEnv,
  assertOwnerSubscriptionWritable
} from "./owner-hub.js";
import { requireCustomerFromRequest } from "./liff-verify.js";
import { scopeCustomerTenantEnv } from "./customer-tenant-context.js";
import { isKnownBookingStatus } from "./booking-state-machine.js";
import {
  weekdayLabelFromIndex,
  buildAllSlotTimesForDay,
  computeDayAvailability,
  buildMonthAvailability,
  filterAvailableSlots,
  filterSlotsByBookingNotice,
  buildBusyIntervalsFromBookings,
  CONSERVATIVE_BUSY_DURATION_MINUTES,
  getNowMinutesInTaipei
} from "./slots.js";
import { parseNoticeDays, DEFAULT_NOTICE_DAYS } from "./booking-notice-policy.js";
import { getTaipeiDateString, getTaipeiWeekdayIndex } from "./owner-auth.js";
import { purgeExpiredCustomerCancelledBookings } from "./booking-retention.js";
import { scopeCustomerShowcaseEnv } from "./showcase-context.js";

var MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

function getMaxBookableMonth(openDay) {
  var today = getTaipeiDateString();
  var parts = today.split("-");
  var current = parts[0] + "-" + parts[1];
  if (Number(parts[2]) < Number(openDay || 15)) return current;
  var next = new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 1));
  return next.getUTCFullYear() + "-" + String(next.getUTCMonth() + 1).padStart(2, "0");
}

function assertBookingWindow(value, settings) {
  var month = String(value || "").slice(0, 7);
  if (month > getMaxBookableMonth(settings.nextMonthBookingOpenDay)) {
    var error = new Error("此月份尚未開放預約");
    error.status = 400;
    throw error;
  }
}

async function dispatchBookingCancellationNotifications(env, bookingId) {
  try {
    var notifications = await enqueueBookingCancelledNotifications(env, bookingId);
    for (var index = 0; index < notifications.notificationIds.length; index += 1) {
      await dispatchLineNotificationById(env, notifications.notificationIds[index]);
    }
  } catch (ignore) {}
}

export default {
  async scheduled(controller, env, ctx) {
    ensureDataEnv(env);
    if (String(env.DATA_BACKEND || "").toLowerCase() !== "d1") return;
    ctx.waitUntil((async function () {
      await expireOverdueDepositBookingsForAllTenants(env, controller.scheduledTime);
      await enqueueTomorrowBookingRemindersForAllTenants(env, controller.scheduledTime);
      await dispatchQueuedLineNotifications(env, 20);
      await purgeExpiredCustomerCancelledBookings(env, controller.scheduledTime);
    })());
  },
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Owner-Tenant-Id, X-Beauty-Showcase, X-Beauty-Studio-Entry"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          studio: env.STUDIO_NAME || "美業工作室",
          notion: Boolean(env.NOTION_TOKEN),
          dataBackend: getDataBackendName(env)
        }, corsHeaders);
      }

      if (url.pathname === "/api/line/webhook" && request.method === "POST") {
        ensureDataEnv(env);
        return jsonResponse(await handleLineWebhook(request, env), corsHeaders);
      }

      var tenantWebhookMatch = url.pathname.match(/^\/api\/line\/webhook\/([A-Za-z0-9_-]{32,128})$/);
      if (tenantWebhookMatch && request.method === "POST") {
        ensureDataEnv(env);
        return jsonResponse(
          await handleTenantLineWebhook(request, env, tenantWebhookMatch[1]),
          corsHeaders
        );
      }

      if (url.pathname === "/api/owner-hub/claim" && request.method === "POST") {
        ensureDataEnv(env);
        var ownerClaimBody = await readJson(request);
        var ownerInviteTenantId = await resolveOwnerAccessInviteTenant(
          env,
          ownerClaimBody.inviteToken
        );
        var ownerInviteChannel = tenantLineChannel(env, ownerInviteTenantId);
        var ownerClaimEnv = Object.assign({}, env, {
          TENANT_ID: ownerInviteTenantId,
          LINE_PROVIDER_ID: ownerInviteChannel && ownerInviteChannel.providerId
            ? ownerInviteChannel.providerId : env.LINE_PROVIDER_ID
        });
        var ownerClaimIdentity = await requireCustomerFromRequest(request, ownerClaimEnv);
        return jsonResponse(await claimOwnerAccessInvite(ownerClaimEnv, {
          inviteToken: ownerClaimBody.inviteToken,
          lineUserId: ownerClaimIdentity.userId,
          studioName: ownerClaimBody.studioName,
          ownerName: ownerClaimBody.ownerName,
          accountBindingAccepted: ownerClaimBody.accountBindingAccepted,
          termsAccepted: ownerClaimBody.termsAccepted,
          termsVersion: ownerClaimBody.termsVersion
        }), corsHeaders);
      }

      if (url.pathname === "/api/platform/capability" &&
          request.method === "GET") {
        ensureDataEnv(env);
        var platformSession = await requireOwnerHubSession(request, env);
        if (platformSession.requiresSelection || !platformSession.selected) {
          var platformSelectionError = new Error("請先選擇平台工作室");
          platformSelectionError.status = 409;
          throw platformSelectionError;
        }
        assertPlatformOperator(env, platformSession.selected);
        return jsonResponse({ ok: true, enabled: true }, corsHeaders);
      }

      if (url.pathname === "/api/platform/studios" && request.method === "POST") {
        ensureDataEnv(env);
        var platformSession = await requireOwnerHubSession(request, env);
        if (platformSession.requiresSelection || !platformSession.selected) {
          var platformSelectionError = new Error("請先選擇平台工作室");
          platformSelectionError.status = 409;
          throw platformSelectionError;
        }
        var platformBody = await readJson(request);
        return jsonResponse(await provisionOwnerStudio(
          env,
          platformSession.selected,
          {
            plan: platformBody.plan,
            assessmentTemplateCode: platformBody.assessmentTemplateCode
          }
        ), corsHeaders);
      }

      if (url.pathname === "/api/platform/studios" && request.method === "GET") {
        ensureDataEnv(env);
        var platformListSession = await requireOwnerHubSession(request, env);
        if (platformListSession.requiresSelection || !platformListSession.selected) {
          var platformListSelectionError = new Error("請先選擇平台工作室");
          platformListSelectionError.status = 409;
          throw platformListSelectionError;
        }
        return jsonResponse(await listPlatformStudios(
          env, platformListSession.selected
        ), corsHeaders);
      }

      if (url.pathname === "/api/platform/acceptance-studios" && request.method === "POST") {
        ensureDataEnv(env);
        var acceptanceSession = await requireOwnerHubSession(request, env);
        if (acceptanceSession.requiresSelection || !acceptanceSession.selected) {
          var acceptanceSelectionError = new Error("請先選擇平台工作室");
          acceptanceSelectionError.status = 409;
          throw acceptanceSelectionError;
        }
        return jsonResponse(await ensurePlatformAcceptanceStudios(
          env, acceptanceSession.selected, acceptanceSession.userId
        ), corsHeaders);
      }

      var platformStudioMatch = url.pathname.match(/^\/api\/platform\/studios\/([^/]+)$/);
      if (platformStudioMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var platformEditSession = await requireOwnerHubSession(request, env);
        if (platformEditSession.requiresSelection || !platformEditSession.selected) {
          var platformEditSelectionError = new Error("請先選擇平台工作室");
          platformEditSelectionError.status = 409;
          throw platformEditSelectionError;
        }
        var platformEditBody = await readJson(request);
        return jsonResponse(await updatePlatformStudioIdentity(
          env,
          platformEditSession.selected,
          decodeURIComponent(platformStudioMatch[1]),
          {
            studioName: platformEditBody.studioName,
            ownerName: platformEditBody.ownerName
          }
        ), corsHeaders);
      }

      var platformOwnerInviteMatch = url.pathname.match(
        /^\/api\/platform\/studios\/([^/]+)\/owner-invite$/
      );
      if (platformOwnerInviteMatch && request.method === "POST") {
        ensureDataEnv(env);
        var platformInviteSession = await requireOwnerHubSession(request, env);
        if (platformInviteSession.requiresSelection || !platformInviteSession.selected) {
          var platformInviteSelectionError = new Error("請先選擇平台工作室");
          platformInviteSelectionError.status = 409;
          throw platformInviteSelectionError;
        }
        return jsonResponse(await reissuePlatformOwnerInvite(
          env,
          platformInviteSession.selected,
          decodeURIComponent(platformOwnerInviteMatch[1])
        ), corsHeaders);
      }

      var platformCustomerEntryMatch = url.pathname.match(
        /^\/api\/platform\/studios\/([^/]+)\/customer-entry$/
      );
      if (platformCustomerEntryMatch && request.method === "POST") {
        ensureDataEnv(env);
        var customerEntrySession = await requireOwnerHubSession(request, env);
        if (customerEntrySession.requiresSelection || !customerEntrySession.selected) {
          var customerEntrySelectionError = new Error("請先選擇平台工作室");
          customerEntrySelectionError.status = 409;
          throw customerEntrySelectionError;
        }
        return jsonResponse(await ensurePlatformStudioCustomerEntry(
          env,
          customerEntrySession.selected,
          decodeURIComponent(platformCustomerEntryMatch[1])
        ), corsHeaders);
      }

      var platformSubscriptionMatch = url.pathname.match(
        /^\/api\/platform\/studios\/([^/]+)\/subscription$/
      );

      var platformCustomerExportMatch = url.pathname.match(
        /^\/api\/platform\/studios\/([^/]+)\/customers\.csv$/
      );
      if (platformCustomerExportMatch && request.method === "GET") {
        ensureDataEnv(env);
        var platformExportSession = await requireOwnerHubSession(request, env);
        if (platformExportSession.requiresSelection || !platformExportSession.selected) {
          var platformExportSelectionError = new Error("請先選擇平台工作室");
          platformExportSelectionError.status = 409;
          throw platformExportSelectionError;
        }
        assertPlatformOperator(env, platformExportSession.selected);
        var platformCustomerCsv = await exportPlatformCustomerData(
          env, decodeURIComponent(platformCustomerExportMatch[1])
        );
        return new Response(platformCustomerCsv, {
          status: 200,
          headers: Object.assign({}, corsHeaders, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="studio-customers.csv"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          })
        });
      }

      var platformAssessmentTemplateMatch = url.pathname.match(
        /^\/api\/platform\/studios\/([^/]+)\/assessment-template$/
      );
      if (platformAssessmentTemplateMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var platformAssessmentSession = await requireOwnerHubSession(request, env);
        if (platformAssessmentSession.requiresSelection || !platformAssessmentSession.selected) {
          var platformAssessmentSelectionError = new Error("請先選擇平台工作室");
          platformAssessmentSelectionError.status = 409; throw platformAssessmentSelectionError;
        }
        var platformAssessmentBody = await readJson(request);
        return jsonResponse(await updatePlatformStudioAssessmentTemplate(
          env, platformAssessmentSession.selected,
          decodeURIComponent(platformAssessmentTemplateMatch[1]), platformAssessmentBody
        ), corsHeaders);
      }
      if (platformSubscriptionMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var platformSubscriptionSession = await requireOwnerHubSession(request, env);
        if (platformSubscriptionSession.requiresSelection || !platformSubscriptionSession.selected) {
          var platformSubscriptionSelectionError = new Error("請先選擇平台工作室");
          platformSubscriptionSelectionError.status = 409;
          throw platformSubscriptionSelectionError;
        }
        var platformSubscriptionBody = await readJson(request);
        return jsonResponse(await managePlatformStudioSubscription(
          env, platformSubscriptionSession.selected,
          decodeURIComponent(platformSubscriptionMatch[1]), platformSubscriptionBody
        ), corsHeaders);
      }

      env = scopeCustomerShowcaseEnv(request, env);
      env = await scopeCustomerTenantEnv(request, env);

      if (getDataBackendName(env) === "d1" &&
          /^\/api\/owner\//.test(url.pathname) &&
          url.pathname !== "/api/owner/hub/session") {
        ensureDataEnv(env);
        var ownerHubContext = await requireOwnerHubSession(request, env);
        if (ownerHubContext.requiresSelection || !ownerHubContext.selected) {
          var selectionRequired = new Error("請先選擇工作室");
          selectionRequired.status = 409;
          throw selectionRequired;
        }
        env = Object.assign(
          scopedOwnerEnv(env, ownerHubContext.selected),
          { VERIFIED_OWNER_USER_ID: ownerHubContext.userId }
        );
        assertOwnerSubscriptionWritable(env, request.method);
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        ensureDataEnv(env);
        var settings = await getSettings(env);
        return jsonResponse(settings, corsHeaders);
      }

      if (url.pathname === "/api/services" && request.method === "GET") {
        ensureDataEnv(env);
        var services = await listServices(env, true);
        return jsonResponse(services, corsHeaders);
      }

      if (url.pathname === "/api/customer/ai/capability" && request.method === "GET") {
        ensureDataEnv(env);
        await requireCustomerFromRequest(request, env);
        var customerAiSettings = await getSettings(env);
        return jsonResponse(getCustomerAiCapability(env, customerAiSettings), corsHeaders);
      }

      if (url.pathname === "/api/customer/assessment-template" && request.method === "GET") {
        ensureDataEnv(env);
        var assessmentTemplateCustomer = await requireCustomerFromRequest(request, env);
        return jsonResponse(await getCustomerConfiguredAssessmentTemplate(
          env, assessmentTemplateCustomer.userId, url.searchParams.get("serviceId") || ""
        ), corsHeaders);
      }

      if (url.pathname === "/api/customer/ai/recommend" && request.method === "POST") {
        ensureDataEnv(env);
        var aiCustomer = await requireCustomerFromRequest(request, env);
        var aiBody = await readJson(request);
        var aiAdvice = await submitCustomerQuestion(
          env,
          aiBody,
          aiCustomer.userId
        );
        return jsonResponse(aiAdvice, corsHeaders);
      }

      if (url.pathname === "/api/customer/ai/inquiries" && request.method === "GET") {
        ensureDataEnv(env);
        var inquiryCustomer = await requireCustomerFromRequest(request, env);
        if (!getCustomerAiCapability(env).enabled) {
          return jsonResponse({ ok: false, message: "AI 預約助手尚未啟用" }, corsHeaders, 503);
        }
        return jsonResponse(await listCustomerAiInquiries(
          env, inquiryCustomer.userId
        ), corsHeaders);
      }

      var customerAssessmentStartMatch = url.pathname.match(
        /^\/api\/customer\/assessments\/(brow_new_client|lip_blush_new_client|eyeliner_new_client|under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\/start$/
      );
      if (customerAssessmentStartMatch && request.method === "POST") {
        ensureDataEnv(env);
        var assessmentStartCustomer = await requireCustomerFromRequest(request, env);
        var assessmentStartBody = await readJson(request);
        return jsonResponse(await startCustomerAssessment(
          env, assessmentStartCustomer.userId, customerAssessmentStartMatch[1],
          assessmentStartBody.serviceId
        ), corsHeaders);
      }

      var customerAssessmentAnswerMatch = url.pathname.match(
        /^\/api\/customer\/assessments\/(brow_new_client|lip_blush_new_client|eyeliner_new_client|under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\/answers$/
      );
      if (customerAssessmentAnswerMatch && request.method === "POST") {
        ensureDataEnv(env);
        var assessmentAnswerCustomer = await requireCustomerFromRequest(request, env);
        var assessmentAnswerBody = await readJson(request);
        return jsonResponse(await answerCustomerAssessment(
          env, assessmentAnswerCustomer.userId, customerAssessmentAnswerMatch[1],
          assessmentAnswerBody, assessmentAnswerBody.serviceId
        ), corsHeaders);
      }

      var customerAssessmentPhotoMatch = url.pathname.match(
        /^\/api\/customer\/assessments\/(brow_new_client|lip_blush_new_client|eyeliner_new_client|under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\/photos\/([^/]+)$/
      );
      if (customerAssessmentPhotoMatch && request.method === "PUT") {
        ensureDataEnv(env);
        var assessmentPhotoCustomer = await requireCustomerFromRequest(request, env);
        var assessmentPhotoBytes = await readBinaryWithLimit(request, MAX_PHOTO_UPLOAD_BYTES,
          "圖片超過 5 MB 上限，請重新壓縮後上傳");
        return jsonResponse(await uploadCustomerAssessmentPhoto(
          env, assessmentPhotoCustomer.userId, customerAssessmentPhotoMatch[1],
          decodeURIComponent(customerAssessmentPhotoMatch[2]), assessmentPhotoBytes,
          request.headers.get("Content-Type") || "", url.searchParams.get("serviceId") || ""
        ), corsHeaders);
      }

      if (url.pathname === "/api/customer/brow-intake" && request.method === "GET") {
        ensureDataEnv(env);
        var browIntakeCustomer = await requireCustomerFromRequest(request, env);
        return jsonResponse(await getCustomerBrowIntake(env, browIntakeCustomer.userId), corsHeaders);
      }

      var customerBrowPhotoMatch = url.pathname.match(/^\/api\/customer\/brow-intake\/photos\/(front|left|right)$/);
      if (customerBrowPhotoMatch && request.method === "PUT") {
        ensureDataEnv(env);
        var browPhotoCustomer = await requireCustomerFromRequest(request, env);
        var browPhotoBytes = await readBinaryWithLimit(request, MAX_PHOTO_UPLOAD_BYTES,
          "圖片超過 5 MB 上限，請重新壓縮後上傳");
        return jsonResponse(await uploadCustomerBrowIntakePhoto(env, browPhotoCustomer.userId,
          customerBrowPhotoMatch[1], browPhotoBytes, request.headers.get("Content-Type") || ""), corsHeaders);
      }

      var customerReviewMatch = url.pathname.match(
        /^\/api\/bookings\/([^/]+)\/review-intake$/
      );
      if (customerReviewMatch && request.method === "GET") {
        ensureDataEnv(env);
        var reviewCustomer = await requireCustomerFromRequest(request, env);
        return jsonResponse(await getCustomerBookingReview(
          env,
          decodeURIComponent(customerReviewMatch[1]),
          reviewCustomer.userId
        ), corsHeaders);
      }
      if (customerReviewMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var reviewPatchCustomer = await requireCustomerFromRequest(request, env);
        var reviewPatchBody = await readJson(request);
        return jsonResponse(await updateCustomerBookingReview(
          env,
          decodeURIComponent(customerReviewMatch[1]),
          reviewPatchCustomer.userId,
          reviewPatchBody
        ), corsHeaders);
      }

      var customerDepositReportMatch = url.pathname.match(
        /^\/api\/bookings\/([^/]+)\/deposit-report$/
      );
      if (customerDepositReportMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var depositReportCustomer = await requireCustomerFromRequest(request, env);
        var depositReportBody = await readJson(request);
        var depositReportResult = await reportCustomerDepositTransfer(
          env,
          decodeURIComponent(customerDepositReportMatch[1]),
          depositReportCustomer.userId,
          depositReportBody
        );
        var notifyDepositOwner = notifyOwnerDepositTransferReported(
          env,
          decodeURIComponent(customerDepositReportMatch[1])
        );
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyDepositOwner);
        else await notifyDepositOwner;
        return jsonResponse(depositReportResult, corsHeaders);
      }

      var customerReviewPhotoMatch = url.pathname.match(
        /^\/api\/bookings\/([^/]+)\/review-photos$/
      );
      if (customerReviewPhotoMatch && request.method === "PUT") {
        ensureDataEnv(env);
        var reviewPhotoCustomer = await requireCustomerFromRequest(request, env);
        var reviewPhotoBytes = await readBinaryWithLimit(
          request,
          MAX_PHOTO_UPLOAD_BYTES,
          "圖片超過 5 MB 上限，請重新壓縮後上傳"
        );
        return jsonResponse(await uploadCustomerBookingReviewPhoto(
          env,
          decodeURIComponent(customerReviewPhotoMatch[1]),
          reviewPhotoCustomer.userId,
          reviewPhotoBytes,
          request.headers.get("Content-Type") || ""
        ), corsHeaders);
      }

      if (url.pathname === "/api/slots/month" && request.method === "GET") {
        ensureDataEnv(env);
        var monthParam = url.searchParams.get("month");
        var monthServiceId = url.searchParams.get("serviceId");

        if (!monthParam) {
          return jsonResponse({ ok: false, message: "缺少 month 參數（YYYY-MM）" }, corsHeaders, 400);
        }
        if (!monthServiceId) {
          return jsonResponse({ ok: false, message: "缺少 serviceId 參數" }, corsHeaders, 400);
        }

        var monthInputs = await Promise.all([
          getServiceById(env, monthServiceId),
          getSettings(env),
          listWeeklySlots(env),
          getActiveBookingsForMonth(env, monthParam),
          listClosedDates(env, monthParam)
        ]);
        var monthService = monthInputs[0];
        if (monthService.status !== "上架") {
          return jsonResponse({ ok: false, message: "服務不存在或已下架" }, corsHeaders, 404);
        }

        var monthSettings = monthInputs[1];
        assertBookingWindow(monthParam, monthSettings);
        var monthWeeklySlots = monthInputs[2];
        var monthBookingsResult = monthInputs[3];
        var bookingsByDate = {};
        monthBookingsResult.bookings.forEach(function (b) {
          if (!bookingsByDate[b.date]) {
            bookingsByDate[b.date] = [];
          }
          bookingsByDate[b.date].push(b);
        });

        var monthDurationMap = await getServiceDurationMap(
          env,
          monthBookingsResult.bookings.map(function (b) { return b.serviceId; })
        );
        var monthFallbackBusy = Math.max(
          Number(monthService.durationMinutes) || 60,
          CONSERVATIVE_BUSY_DURATION_MINUTES
        );

        var monthTodayStr = getTaipeiDateString();
        var monthNowMinutes = getNowMinutesInTaipei();
        var monthNowUtc = new Date();
        var monthMinNoticeDays = parseNoticeDays(
          monthSettings.bookingMinNoticeDays,
          DEFAULT_NOTICE_DAYS
        );
        var monthDays = buildMonthAvailability(
          monthParam,
          monthWeeklySlots,
          monthService.durationMinutes,
          bookingsByDate,
          monthTodayStr,
          monthNowMinutes,
          function (d) { return weekdayLabelFromIndex(getTaipeiWeekdayIndex(d)); },
          monthDurationMap,
          monthFallbackBusy,
          monthMinNoticeDays,
          monthNowUtc
        );
        var closedDates = monthInputs[4];
        closedDates.forEach(function (closedDate) {
          monthDays[closedDate] = { bookable: false, slotCount: 0, reason: "date_closed" };
        });

        return jsonResponse({
          ok: true,
          month: monthBookingsResult.range.month,
          serviceId: monthServiceId,
          durationMinutes: monthService.durationMinutes,
          bookingMinNoticeDays: monthMinNoticeDays,
          days: monthDays
        }, corsHeaders);
      }

      if (url.pathname === "/api/slots" && request.method === "GET") {
        ensureDataEnv(env);
        var date = url.searchParams.get("date");
        var serviceId = url.searchParams.get("serviceId");

        if (!date) {
          return jsonResponse({ ok: false, message: "缺少 date 參數（YYYY-MM-DD）" }, corsHeaders, 400);
        }
        if (!serviceId) {
          return jsonResponse({ ok: false, message: "缺少 serviceId 參數" }, corsHeaders, 400);
        }
        if (await isDateClosed(env, date)) {
          return jsonResponse({ date: date, slots: [], message: "本工作室此日休假，不開放預約" }, corsHeaders);
        }

        var service = await getServiceById(env, serviceId);
        var weekdayIndex = getTaipeiWeekdayIndex(date);
        var weekdayLabel = weekdayLabelFromIndex(weekdayIndex);
        var weeklySlots = await listWeeklySlots(env);
        var daySlots = weeklySlots.filter(function (s) { return s.weekday === weekdayLabel; });

        var bookings = await getActiveBookingsByDate(env, date);
        var durationMap = await getServiceDurationMap(
          env,
          bookings.map(function (b) { return b.serviceId; })
        );
        var fallbackBusy = Math.max(
          Number(service.durationMinutes) || 60,
          CONSERVATIVE_BUSY_DURATION_MINUTES
        );
        var busyIntervals = buildBusyIntervalsFromBookings(
          bookings,
          durationMap,
          fallbackBusy
        );

        var todayStr = getTaipeiDateString();
        var nowMinutes = getNowMinutesInTaipei();
        var nowUtc = new Date();
        var slotSettings = await getSettings(env);
        assertBookingWindow(date, slotSettings);
        var minNoticeDays = parseNoticeDays(
          slotSettings.bookingMinNoticeDays,
          DEFAULT_NOTICE_DAYS
        );
        var daySummary = computeDayAvailability({
          date: date,
          todayStr: todayStr,
          nowMinutes: nowMinutes,
          daySlots: daySlots,
          durationMinutes: service.durationMinutes,
          busyIntervals: busyIntervals,
          minNoticeDays: minNoticeDays,
          nowUtc: nowUtc
        });

        if (!daySlots.length) {
          return jsonResponse({ date: date, slots: [], message: "此日期未開放預約" }, corsHeaders);
        }

        var allTimes = buildAllSlotTimesForDay(daySlots, service.durationMinutes);
        var afterNotice = filterSlotsByBookingNotice(allTimes, date, minNoticeDays, nowUtc);
        var available = filterAvailableSlots(
          afterNotice,
          service.durationMinutes,
          busyIntervals,
          date === todayStr ? todayStr : null,
          date === todayStr ? nowMinutes : null
        );

        return jsonResponse({
          date: date,
          serviceId: serviceId,
          durationMinutes: service.durationMinutes,
          bookingMinNoticeDays: minNoticeDays,
          slots: available,
          bookable: daySummary.bookable,
          reason: daySummary.reason
        }, corsHeaders);
      }

      // 客人 API：一律以驗證後 token 的 sub 為 userId，
      // body／query 中的 userId 一律忽略，不能覆蓋已驗證身分。
      if (url.pathname === "/api/bookings" && request.method === "POST") {
        ensureDataEnv(env);
        var bookCustomer = await requireCustomerFromRequest(request, env);
        var bookBody = await readJson(request);
        if (getDataBackendName(env) === "d1" &&
            String(env.BOOKING_REQUIRES_OWNER_CONFIRMATION || "").toLowerCase() === "true") {
          await assertCustomerAssessmentApproved(env, bookCustomer.userId, bookBody.serviceId);
        }
        // LINE 身分與 LINE profile metadata（暱稱、頭像）一律以
        // requireCustomerFromRequest 驗證結果為唯一可信來源；
        // client body 的同名欄位不可優先、不可進入 SQL bind。
        var bookResult = await createBooking(
          env,
          Object.assign({}, bookBody, {
            userId: bookCustomer.userId,
            displayName: bookCustomer.name,
            lineDisplayName: bookCustomer.name,
            lineNickname: bookCustomer.name,
            picture: bookCustomer.picture,
            pictureUrl: bookCustomer.picture
          })
        );
        var notifyBookingCreated = (async function () {
          try {
            var createdNotifications = await enqueueBookingCreatedNotifications(
              env, bookResult.booking.id
            );
            for (var notificationIndex = 0;
              notificationIndex < createdNotifications.notificationIds.length;
              notificationIndex += 1) {
              await dispatchLineNotificationById(
                env, createdNotifications.notificationIds[notificationIndex]
              );
            }
          } catch (ignore) {}
        })();
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyBookingCreated);
        else await notifyBookingCreated;
        if (bookResult && bookResult.booking &&
            bookResult.booking.internalStatus === "pending_customer_confirmation") {
          var notifyDeposit = (async function () {
            var notification = await enqueueBookingNotification(
              env, bookResult.booking.id, "deposit_payment_requested"
            );
            await dispatchLineNotificationById(env, notification.notificationId);
          })();
          if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyDeposit);
          else await notifyDeposit;
        }
        return jsonResponse(bookResult, corsHeaders);
      }

      if (url.pathname === "/api/bookings/me" && request.method === "GET") {
        ensureDataEnv(env);
        var meCustomer = await requireCustomerFromRequest(request, env);
        var myBookings = await getUserBookings(env, meCustomer.userId);
        return jsonResponse(myBookings, corsHeaders);
      }

      if (url.pathname === "/api/bookings/cancel" && request.method === "POST") {
        ensureDataEnv(env);
        var cancelCustomer = await requireCustomerFromRequest(request, env);
        var cancelBody = await readJson(request);
        var cancelResult = await cancelBooking(env, cancelCustomer.userId, cancelBody.bookingId);
        var notifyCustomerCancellation = dispatchBookingCancellationNotifications(
          env, cancelBody.bookingId
        );
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyCustomerCancellation);
        else await notifyCustomerCancellation;
        return jsonResponse(cancelResult, corsHeaders);
      }

      var paidRescheduleMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/reschedule-request$/);
      if (paidRescheduleMatch && request.method === "POST") {
        ensureDataEnv(env);
        var rescheduleCustomer = await requireCustomerFromRequest(request, env);
        var rescheduleBody = await readJson(request);
        var rescheduleRequest = await requestPaidBookingReschedule(
          env, rescheduleCustomer.userId, decodeURIComponent(paidRescheduleMatch[1]), rescheduleBody
        );
        var ownerNotice = notifyOwnerPaidBookingReschedule(env, rescheduleRequest);
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(ownerNotice);
        else await ownerNotice;
        return jsonResponse({ ok: true, message: "變更時間需求已送出，原預約仍保留，請等待工作室聯絡" }, corsHeaders);
      }

      // 客戶一次性認領邀請：身分一律以驗證後 token 的 sub 為準，
      // body 內任何 userId／lineUserId 一律忽略；原始 token 不落 log
      if (url.pathname === "/api/customer/claim-invite" && request.method === "POST") {
        ensureDataEnv(env);
        var claimVerified = await requireCustomerFromRequest(request, env);
        var claimBody = await readJson(request);
        var claimResult = await claimCustomerInvite(env, {
          claimToken: claimBody.claimToken,
          lineUserId: claimVerified.userId,
          displayName: claimVerified.name,
          pictureUrl: claimVerified.picture
        });
        return jsonResponse(claimResult, corsHeaders);
      }

      if (url.pathname === "/api/customer/me" && request.method === "GET") {
        ensureDataEnv(env);
        var profileCustomer = await requireCustomerFromRequest(request, env);
        var profile = await getCustomerProfileByUserId(env, profileCustomer.userId);
        var returningCustomer = getDataBackendName(env) === "d1" && profile.exists
          ? await isReturningCustomer(env, profileCustomer.userId)
          : false;
        return jsonResponse({
          ok: true,
          exists: profile.exists,
          customer: profile.customer,
          requiresAssessment: String(env.BOOKING_REQUIRES_OWNER_CONFIRMATION || "").toLowerCase() === "true" &&
            !returningCustomer
        }, corsHeaders);
      }

      if (url.pathname === "/api/customer/me" && request.method === "PATCH") {
        ensureDataEnv(env);
        var saveProfileCustomer = await requireCustomerFromRequest(request, env);
        var saveProfileBody = await readJson(request);
        if (!String(saveProfileBody.birthday || "").trim()) {
          var missingBirthdayError = new Error("請填寫生日");
          missingBirthdayError.status = 400;
          throw missingBirthdayError;
        }
        var savedProfile = await upsertCustomer(env, {
          userId: saveProfileCustomer.userId,
          name: saveProfileBody.customerName,
          phone: saveProfileBody.phone,
          birthday: saveProfileBody.birthday,
          lineNickname: saveProfileCustomer.name
        });
        if (!savedProfile.birthday) {
          savedProfile.birthday = await completeMissingCustomerBirthday(
            env, saveProfileCustomer.userId, saveProfileBody.birthday
          );
        }
        return jsonResponse({ ok: true, customer: {
          customerName: savedProfile.name,
          phone: savedProfile.phone,
          birthday: savedProfile.birthday
        }, requiresAssessment: String(env.BOOKING_REQUIRES_OWNER_CONFIRMATION || "").toLowerCase() === "true" &&
          !(await isReturningCustomer(env, saveProfileCustomer.userId)) }, corsHeaders);
      }

      if (url.pathname === "/api/owner/bookings/cancel" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerCancelBody = await readJson(request);
        var ownerCancelResult = await cancelBookingByOwner(
          env,
          ownerCancelBody.bookingId,
          ownerCancelBody.reason || ownerCancelBody.cancelReason
        );
        var notifyOwnerCancellation = dispatchBookingCancellationNotifications(
          env, ownerCancelBody.bookingId
        );
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyOwnerCancellation);
        else await notifyOwnerCancellation;
        return jsonResponse(ownerCancelResult, corsHeaders);
      }

      var ownerBookingStatusMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/status$/
      );
      if (ownerBookingStatusMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        if (!env.STAFF_ID) {
          throw Object.assign(new Error("缺少 STAFF_ID 設定"), { status: 500 });
        }
        var ownerStatusBookingId = decodeURIComponent(ownerBookingStatusMatch[1]);
        var ownerStatusBody = await readJson(request);
        var ownerToStatus = ownerStatusBody.toStatus;
        if (!ownerToStatus) {
          return jsonResponse({ ok: false, message: "缺少 toStatus" }, corsHeaders, 400);
        }
        if (!isKnownBookingStatus(ownerToStatus)) {
          return jsonResponse({ ok: false, message: "未知的目標狀態" }, corsHeaders, 400);
        }
        var ownerTransitionResult = await applyOwnerGeneralBookingStatusTransition(env, {
          bookingId: ownerStatusBookingId,
          toStatus: ownerToStatus,
          actorId: env.STAFF_ID,
          reasonCode: ownerStatusBody.reasonCode != null
            ? String(ownerStatusBody.reasonCode)
            : "",
          note: ownerStatusBody.note != null ? String(ownerStatusBody.note) : ""
        });
        return jsonResponse(Object.assign({ ok: true }, ownerTransitionResult), corsHeaders);
      }

      var ownerPigmentReminderMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/(?:pigment|brow)-reminders$/
      );
      if (ownerPigmentReminderMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await updatePigmentFollowUpReminderDates(
          env,
          decodeURIComponent(ownerPigmentReminderMatch[1]),
          await readJson(request)
        ), corsHeaders);
      }

      var ownerReviewMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/review-intake$/
      );
      if (ownerReviewMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await getOwnerBookingReview(
          env,
          decodeURIComponent(ownerReviewMatch[1])
        ), corsHeaders);
      }
      if (ownerReviewMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerReviewBody = await readJson(request);
        return jsonResponse(await requestOwnerBookingReviewPhoto(
          env,
          decodeURIComponent(ownerReviewMatch[1]),
          ownerReviewBody
        ), corsHeaders);
      }

      var ownerReviewPhotoMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/review-photos\/([^/]+)\/content$/
      );
      if (ownerReviewPhotoMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var reviewPhotoContent = await getOwnerBookingReviewPhotoContent(
          env,
          decodeURIComponent(ownerReviewPhotoMatch[1]),
          decodeURIComponent(ownerReviewPhotoMatch[2])
        );
        return new Response(reviewPhotoContent.body, {
          status: 200,
          headers: Object.assign({}, corsHeaders, {
            "Content-Type": reviewPhotoContent.mimeType,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          })
        });
      }

      var ownerBookingRescheduleMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/reschedule$/
      );
      if (ownerBookingRescheduleMatch && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerRescheduleBookingId = decodeURIComponent(ownerBookingRescheduleMatch[1]);
        var ownerRescheduleBody = await readJson(request);
        // 合法 JSON null／array／primitive 不得讀 .date 造成 TypeError／500
        if (
          ownerRescheduleBody === null ||
          typeof ownerRescheduleBody !== "object" ||
          Array.isArray(ownerRescheduleBody)
        ) {
          return jsonResponse(
            { ok: false, message: "請求格式錯誤，需為 JSON 物件" },
            corsHeaders,
            400
          );
        }
        var ownerRescheduleResult = await rescheduleBookingByOwner(
          env,
          ownerRescheduleBookingId,
          {
            date: ownerRescheduleBody.date,
            time: ownerRescheduleBody.time
          }
        );
        var notifyCustomerReschedule = (async function () {
          var notification = await enqueueBookingNotification(
            env, ownerRescheduleResult.newBookingId, "booking_rescheduled"
          );
          await dispatchLineNotificationById(env, notification.notificationId);
        })();
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyCustomerReschedule);
        else await notifyCustomerReschedule;
        return jsonResponse(ownerRescheduleResult, corsHeaders);
      }

      var ownerRescheduleSlotsMatch = url.pathname.match(
        /^\/api\/owner\/bookings\/([^/]+)\/reschedule-slots$/
      );
      if (ownerRescheduleSlotsMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerSlotsBookingId = decodeURIComponent(ownerRescheduleSlotsMatch[1]);
        var ownerSlotsDate = url.searchParams.get("date");
        var ownerSlotsResult = await listOwnerRescheduleSlots(
          env,
          ownerSlotsBookingId,
          ownerSlotsDate
        );
        return jsonResponse(ownerSlotsResult, corsHeaders);
      }

      if (url.pathname === "/api/owner/bookings/month" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);

        var month = url.searchParams.get("month");
        if (!month) {
          return jsonResponse({ ok: false, message: "缺少 month 參數（YYYY-MM）" }, corsHeaders, 400);
        }
        var monthBookings = await getOwnerBookingsForMonth(env, month);
        return jsonResponse(monthBookings, corsHeaders);
      }

      if (url.pathname === "/api/owner/today" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);

        var targetDate = url.searchParams.get("date") || getTaipeiDateString();
        var todayList = await getTodayBookingsForOwner(env, targetDate);
        return jsonResponse({
          date: targetDate,
          bookings: todayList
        }, corsHeaders);
      }

      if (url.pathname === "/api/owner/subscription-status" && request.method === "GET") {
        await requireOwnerFromRequest(request, env);
        return jsonResponse(getOwnerSubscriptionStatus(env, getTaipeiDateString()), corsHeaders);
      }

      if (url.pathname === "/api/owner/hub/session" && request.method === "GET") {
        ensureDataEnv(env);
        var hubSession = await requireOwnerHubSession(request, env);
        return jsonResponse({
          ok: true,
          requiresSelection: hubSession.requiresSelection,
          selected: hubSession.selected,
          memberships: hubSession.memberships
        }, corsHeaders);
      }

      // Owner AI：能力查詢（唯讀、不呼叫 provider）／摘要／草稿（零寫入）
      if (url.pathname === "/api/owner/ai/capability" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(getOwnerAiCapability(env), corsHeaders);
      }

      if (url.pathname === "/api/owner/ai/work-queue" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        if (!getOwnerAiCapability(env).enabled) {
          return jsonResponse({ ok: false, message: "AI 功能尚未啟用" }, corsHeaders, 503);
        }
        return jsonResponse(await getOwnerAiWorkQueue(env), corsHeaders);
      }

      if (url.pathname === "/api/owner/brow-intakes" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await listOwnerBrowIntakes(env), corsHeaders);
      }

      if (url.pathname === "/api/owner/assessment-templates" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await listOwnerAssessmentTemplates(env), corsHeaders);
      }

      if (url.pathname === "/api/owner/assessments" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await listOwnerAssessments(env), corsHeaders);
      }

      var ownerAssessmentReviewMatch = url.pathname.match(/^\/api\/owner\/assessments\/([^/]+)\/status$/);
      if (ownerAssessmentReviewMatch && request.method === "PATCH") {
        ensureDataEnv(env); await requireOwnerFromRequest(request, env);
        var ownerAssessmentReviewBody = await readJson(request);
        return jsonResponse(await reviewOwnerAssessment(env,
          decodeURIComponent(ownerAssessmentReviewMatch[1]), ownerAssessmentReviewBody), corsHeaders);
      }

      var ownerAssessmentPhotoMatch = url.pathname.match(/^\/api\/owner\/assessments\/([^/]+)\/photos\/([^/]+)\/content$/);
      if (ownerAssessmentPhotoMatch && request.method === "GET") {
        ensureDataEnv(env); await requireOwnerFromRequest(request, env);
        var ownerAssessmentPhoto = await getOwnerAssessmentPhotoContent(env,
          decodeURIComponent(ownerAssessmentPhotoMatch[1]), decodeURIComponent(ownerAssessmentPhotoMatch[2]));
        return new Response(ownerAssessmentPhoto.body, { status: 200, headers: Object.assign({}, corsHeaders, {
          "Content-Type": ownerAssessmentPhoto.mimeType, "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        })});
      }

      var ownerAssessmentQuestionMatch = url.pathname.match(
        /^\/api\/owner\/assessment-templates\/(brow_new_client|lip_blush_new_client|eyeliner_new_client|under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\/questions\/([^/]+)$/
      );
      if (ownerAssessmentQuestionMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var assessmentQuestionBody = await readJson(request);
        return jsonResponse(await updateOwnerAssessmentQuestion(
          env, ownerAssessmentQuestionMatch[1],
          decodeURIComponent(ownerAssessmentQuestionMatch[2]), assessmentQuestionBody
        ), corsHeaders);
      }

      var browIntakeReviewMatch = url.pathname.match(/^\/api\/owner\/brow-intakes\/([^/]+)\/status$/);
      if (browIntakeReviewMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var browReviewBody = await readJson(request);
        return jsonResponse(await reviewOwnerBrowIntake(
          env, decodeURIComponent(browIntakeReviewMatch[1]), browReviewBody
        ), corsHeaders);
      }

      var ownerBrowPhotoMatch = url.pathname.match(/^\/api\/owner\/brow-intakes\/([^/]+)\/photos\/([^/]+)\/content$/);
      if (ownerBrowPhotoMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var browPhotoContent = await getOwnerBrowIntakePhotoContent(env,
          decodeURIComponent(ownerBrowPhotoMatch[1]), decodeURIComponent(ownerBrowPhotoMatch[2]));
        return new Response(browPhotoContent.body, { status: 200, headers: Object.assign({}, corsHeaders, {
          "Content-Type": browPhotoContent.mimeType, "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        })});
      }

      if (url.pathname === "/api/owner/ai/inquiries" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        if (!getOwnerAiCapability(env).enabled) {
          return jsonResponse({ ok: false, message: "AI 功能尚未啟用" }, corsHeaders, 503);
        }
        return jsonResponse(await listOwnerAiInquiries(env), corsHeaders);
      }

      var aiInquiryStatusMatch = url.pathname.match(
        /^\/api\/owner\/ai\/inquiries\/([^/]+)$/
      );
      if (aiInquiryStatusMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        if (!getOwnerAiCapability(env).enabled) {
          return jsonResponse({ ok: false, message: "AI 功能尚未啟用" }, corsHeaders, 503);
        }
        var inquiryStatusBody = await readJson(request);
        var inquiryKeys = Object.keys(inquiryStatusBody || {});
        if (inquiryKeys.length !== 1 || inquiryKeys[0] !== "status") {
          return jsonResponse({ ok: false, message: "請求格式錯誤" }, corsHeaders, 400);
        }
        return jsonResponse(await updateOwnerAiInquiryStatus(
          env,
          decodeURIComponent(aiInquiryStatusMatch[1]),
          inquiryStatusBody.status
        ), corsHeaders);
      }

      var aiInquiryReplyMatch = url.pathname.match(
        /^\/api\/owner\/ai\/inquiries\/([^/]+)\/replies$/
      );
      if (aiInquiryReplyMatch && request.method === "POST") {
        ensureDataEnv(env);
        var inquiryReplyOwnerId = await requireOwnerFromRequest(request, env);
        if (!getOwnerAiCapability(env).enabled) {
          return jsonResponse({ ok: false, message: "AI 功能尚未啟用" }, corsHeaders, 503);
        }
        var inquiryReplyBody = await readJson(request);
        var inquiryReplyKeys = Object.keys(inquiryReplyBody || {}).sort();
        if (inquiryReplyKeys.join(",") !== "message,requestId") {
          return jsonResponse({ ok: false, message: "請求格式錯誤" }, corsHeaders, 400);
        }
        return jsonResponse(await sendOwnerAiInquiryReply(
          env,
          decodeURIComponent(aiInquiryReplyMatch[1]),
          inquiryReplyOwnerId,
          inquiryReplyBody
        ), corsHeaders);
      }

      if (url.pathname === "/api/owner/ai/daily-summary" && request.method === "POST") {
        ensureDataEnv(env);
        var summaryOwnerId = await requireOwnerFromRequest(request, env);
        var summaryBody = await readJson(request);
        var summaryResult = await generateOwnerDailySummaryDraft(
          env,
          summaryBody,
          summaryOwnerId
        );
        return jsonResponse(summaryResult, corsHeaders);
      }

      if (url.pathname === "/api/owner/ai/review-summary" && request.method === "POST") {
        ensureDataEnv(env);
        var reviewSummaryOwnerId = await requireOwnerFromRequest(request, env);
        var reviewSummaryBody = await readJson(request);
        return jsonResponse(await generateOwnerReviewSummary(
          env, reviewSummaryBody, reviewSummaryOwnerId
        ), corsHeaders);
      }

      if (url.pathname === "/api/owner/ai/message-draft" && request.method === "POST") {
        ensureDataEnv(env);
        var draftOwnerId = await requireOwnerFromRequest(request, env);
        var draftBody = await readJson(request);
        var draftResult = await generateOwnerMessageDraft(
          env,
          draftBody,
          draftOwnerId
        );
        return jsonResponse(draftResult, corsHeaders);
      }

      if (url.pathname === "/api/owner/services" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var allServices = await listServices(env, false);
        return jsonResponse(allServices, corsHeaders);
      }

      // 不提供前端入口；僅在人工確認加購後由營運端短暫開啟環境能力。
      if (url.pathname === "/api/owner/data-export/customers.csv" &&
          request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerCsv = await exportPaidCustomerData(env);
        return new Response(customerCsv, {
          status: 200,
          headers: Object.assign({}, corsHeaders, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="customer-data.csv"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          })
        });
      }

      if (url.pathname === "/api/owner/services" && request.method === "POST") {
        ensureDataEnv(env);
        var ownerCreateBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var newService = await createService(env, ownerCreateBody);
        return jsonResponse({ ok: true, service: newService }, corsHeaders);
      }

      var servicePatchMatch = url.pathname.match(/^\/api\/owner\/services\/([^/]+)$/);
      if (servicePatchMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var ownerPatchBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var patched = await updateService(env, servicePatchMatch[1], ownerPatchBody);
        return jsonResponse({ ok: true, service: patched }, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var currentSlots = await listWeeklySlots(env);
        return jsonResponse(currentSlots, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "POST") {
        ensureDataEnv(env);
        var slotsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var savedSlots = await replaceWeeklySlots(env, slotsBody.slots || []);
        return jsonResponse({ ok: true, slots: savedSlots }, corsHeaders);
      }

      if (url.pathname === "/api/owner/closed-dates" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var closureMonth = url.searchParams.get("month");
        return jsonResponse({ ok: true, month: closureMonth, dates: await listClosedDates(env, closureMonth) }, corsHeaders);
      }

      if (url.pathname === "/api/owner/closed-dates" && request.method === "PUT") {
        ensureDataEnv(env);
        var closureBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var closure = await setDateClosed(env, closureBody.date, closureBody.closed);
        return jsonResponse({ ok: true, closure: closure }, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerSettings = await getSettings(env);
        ownerSettings.customerEntryKey = await getStudioCustomerEntryKey(env);
        return jsonResponse(ownerSettings, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "PATCH") {
        ensureDataEnv(env);
        var settingsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var updatedSettings = await updateSettings(env, settingsBody);
        return jsonResponse({ ok: true, settings: updatedSettings }, corsHeaders);
      }

      if (url.pathname === "/api/owner/customers" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerQuery = url.searchParams.get("q") || "";
        var customerList = await getOwnerCustomersFromBookings(env, customerQuery);
        return jsonResponse(customerList, corsHeaders);
      }

      // 客戶 CSV 匯入：不 log CSV、canonicalString 或完整電話；
      // 回應中的電話只出現在 maskedPreview 遮罩值
      if (url.pathname === "/api/owner/customers/import/preview" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var importPreviewBody = await readJson(request);
        var importPreview = await previewCustomerImport(env, importPreviewBody);
        return jsonResponse(importPreview, corsHeaders);
      }

      if (url.pathname === "/api/owner/customers/import/commit" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var importCommitBody = await readJson(request);
        var importCommit = await commitCustomerImport(env, importCommitBody);
        return jsonResponse(importCommit, corsHeaders);
      }

      // 業主一次性認領邀請：POST 建立（僅該次回應含原始 token）、
      // GET 查狀態（永不回 token）、DELETE 撤銷
      var ownerClaimInviteMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/claim-invite$/
      );
      if (ownerClaimInviteMatch && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var createdInvite = await createCustomerClaimInvite(
          env,
          decodeURIComponent(ownerClaimInviteMatch[1])
        );
        return jsonResponse(createdInvite, corsHeaders);
      }
      if (ownerClaimInviteMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var inviteStatus = await getCustomerClaimInvite(
          env,
          decodeURIComponent(ownerClaimInviteMatch[1])
        );
        return jsonResponse(inviteStatus, corsHeaders);
      }
      if (ownerClaimInviteMatch && request.method === "DELETE") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var revokedInvite = await revokeCustomerClaimInvite(
          env,
          decodeURIComponent(ownerClaimInviteMatch[1])
        );
        return jsonResponse(revokedInvite, corsHeaders);
      }

      // 前後對比照片（owner-only、D1-only）：
      // 圖片 binary 走私有 R2，僅經 Worker 串流，不回公開 URL 或 object key
      var ownerPhotoSetsMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/photo-sets$/
      );
      var ownerCustomerAlbumMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/album$/
      );
      if (ownerCustomerAlbumMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        return jsonResponse(await listCustomerAlbum(
          env, decodeURIComponent(ownerCustomerAlbumMatch[1])
        ), corsHeaders);
      }
      var ownerCustomerAlbumPhotoMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/album\/([^/]+)\/([^/]+)\/content$/
      );
      if (ownerCustomerAlbumPhotoMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var albumPhoto = await getCustomerAlbumPhotoContent(
          env,
          decodeURIComponent(ownerCustomerAlbumPhotoMatch[1]),
          decodeURIComponent(ownerCustomerAlbumPhotoMatch[2]),
          decodeURIComponent(ownerCustomerAlbumPhotoMatch[3])
        );
        return new Response(albumPhoto.body, { status: 200, headers: Object.assign({}, corsHeaders, {
          "Content-Type": albumPhoto.mimeType, "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        }) });
      }
      if (ownerPhotoSetsMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var photoSetList = await listCustomerPhotoSets(
          env,
          decodeURIComponent(ownerPhotoSetsMatch[1])
        );
        return jsonResponse(photoSetList, corsHeaders);
      }
      if (ownerPhotoSetsMatch && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var createSetBody = await readJson(request);
        var createdSet = await createCustomerPhotoSet(
          env,
          decodeURIComponent(ownerPhotoSetsMatch[1]),
          createSetBody
        );
        return jsonResponse(createdSet, corsHeaders);
      }

      var ownerPhotoSetMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/photo-sets\/([^/]+)$/
      );
      if (ownerPhotoSetMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var patchSetBody = await readJson(request);
        var patchedSet = await updateCustomerPhotoSet(
          env,
          decodeURIComponent(ownerPhotoSetMatch[1]),
          decodeURIComponent(ownerPhotoSetMatch[2]),
          patchSetBody
        );
        return jsonResponse(patchedSet, corsHeaders);
      }
      if (ownerPhotoSetMatch && request.method === "DELETE") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var deletedSet = await deleteCustomerPhotoSet(
          env,
          decodeURIComponent(ownerPhotoSetMatch[1]),
          decodeURIComponent(ownerPhotoSetMatch[2])
        );
        return jsonResponse(deletedSet, corsHeaders);
      }

      var ownerPhotoUploadMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/photo-sets\/([^/]+)\/photos\/([^/]+)$/
      );
      if (ownerPhotoUploadMatch && request.method === "PUT") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        // binary body：不經 JSON 解析；格式與大小由 repository 以
        // magic bytes 獨立驗證，不信任 Content-Type
        var uploadBytes = await readBinaryWithLimit(
          request,
          MAX_PHOTO_UPLOAD_BYTES,
          "圖片超過 5 MB 上限，請重新壓縮後上傳"
        );
        var uploadedPhoto = await uploadCustomerComparisonPhoto(
          env,
          decodeURIComponent(ownerPhotoUploadMatch[1]),
          decodeURIComponent(ownerPhotoUploadMatch[2]),
          {
            kind: decodeURIComponent(ownerPhotoUploadMatch[3]),
            bytes: uploadBytes,
            contentType: request.headers.get("Content-Type") || "",
            width: url.searchParams.get("width"),
            height: url.searchParams.get("height")
          }
        );
        return jsonResponse(uploadedPhoto, corsHeaders);
      }

      var ownerPhotoContentMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/photos\/([^/]+)\/content$/
      );
      if (ownerPhotoContentMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var photoContent = await getCustomerPhotoContent(
          env,
          decodeURIComponent(ownerPhotoContentMatch[1]),
          decodeURIComponent(ownerPhotoContentMatch[2])
        );
        return new Response(photoContent.body, {
          status: 200,
          headers: Object.assign({}, corsHeaders, {
            "Content-Type": photoContent.mimeType,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store"
          })
        });
      }

      var ownerPhotoMatch = url.pathname.match(
        /^\/api\/owner\/customers\/by-id\/([^/]+)\/photos\/([^/]+)$/
      );
      if (ownerPhotoMatch && request.method === "DELETE") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var deletedPhoto = await deleteCustomerComparisonPhoto(
          env,
          decodeURIComponent(ownerPhotoMatch[1]),
          decodeURIComponent(ownerPhotoMatch[2])
        );
        return jsonResponse(deletedPhoto, corsHeaders);
      }

      // customerId 版客戶詳情／更新：必須先於舊的 /:userId 動態比對，
      // 支援未綁 LINE／無預約的匯入客戶
      var ownerCustomerByIdMatch = url.pathname.match(/^\/api\/owner\/customers\/by-id\/([^/]+)$/);
      if (ownerCustomerByIdMatch && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerByIdDetail = await getOwnerCustomerById(
          env,
          decodeURIComponent(ownerCustomerByIdMatch[1])
        );
        return jsonResponse(customerByIdDetail, corsHeaders);
      }

      if (ownerCustomerByIdMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerByIdBody = await readJson(request);
        var customerByIdUpdated = await updateCustomerByOwnerById(
          env,
          decodeURIComponent(ownerCustomerByIdMatch[1]),
          customerByIdBody
        );
        return jsonResponse(customerByIdUpdated, corsHeaders);
      }

      var ownerCustomerPatchMatch = url.pathname.match(/^\/api\/owner\/customers\/([^/]+)$/);
      if (ownerCustomerPatchMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerCustomerBody = await readJson(request);
        var updatedCustomer = await updateCustomerByOwner(
          env,
          decodeURIComponent(ownerCustomerPatchMatch[1]),
          ownerCustomerBody
        );
        return jsonResponse(updatedCustomer, corsHeaders);
      }

      if (url.pathname === "/api/owner/customer-bookings" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerUserId = url.searchParams.get("userId");
        if (!customerUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }
        var customerBookings = await getOwnerCustomerBookings(env, customerUserId);
        return jsonResponse(customerBookings, corsHeaders);
      }

      return jsonResponse({ ok: false, message: "找不到此 API 路徑" }, corsHeaders, 404);
    } catch (error) {
      var status = error.status || 500;
      var message = error.message || "伺服器發生錯誤";
      return jsonResponse(
        { ok: false, message: message },
        corsHeaders,
        status,
        error.headers || null
      );
    }
  }
};

async function readJson(request) {
  try {
    return await request.json();
  } catch (ignore) {
    throw Object.assign(new Error("請求格式錯誤，需為 JSON"), { status: 400 });
  }
}

async function readBinaryWithLimit(request, maxBytes, tooLargeMessage) {
  var contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error(tooLargeMessage), { status: 413 });
  }

  if (!request.body || typeof request.body.getReader !== "function") {
    var fallbackBytes = new Uint8Array(await request.arrayBuffer());
    if (fallbackBytes.length > maxBytes) {
      throw Object.assign(new Error(tooLargeMessage), { status: 413 });
    }
    return fallbackBytes;
  }

  var reader = request.body.getReader();
  var chunks = [];
  var totalBytes = 0;

  while (true) {
    var result = await reader.read();
    if (result.done) {
      break;
    }
    var chunk = result.value instanceof Uint8Array
      ? result.value
      : new Uint8Array(result.value || []);
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel();
      } catch (ignore) {
        // 已超限；取消串流失敗不改變 413 結果。
      }
      throw Object.assign(new Error(tooLargeMessage), { status: 413 });
    }
    chunks.push(chunk);
  }

  var bytes = new Uint8Array(totalBytes);
  var offset = 0;
  chunks.forEach(function (chunk) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

function jsonResponse(data, corsHeaders, status, extraHeaders) {
  var headers = Object.assign({ "Content-Type": "application/json" }, corsHeaders);
  if (extraHeaders && typeof extraHeaders === "object") {
    Object.keys(extraHeaders).forEach(function (key) {
      headers[key] = extraHeaders[key];
    });
  }
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers
  });
}
