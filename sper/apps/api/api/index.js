var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config/env.ts
import { z } from "zod";
function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    console.error(`
[env] Invalid environment configuration:
${issues}
`);
    process.exit(1);
  }
  return parsed.data;
}
var EnvSchema, env, isProd, isTest;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    EnvSchema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      PORT: z.coerce.number().int().positive().default(3e3),
      // Database
      DATABASE_URL: z.string().url(),
      // Redis (BullMQ)
      REDIS_URL: z.string().url(),
      // Auth
      JWT_ACCESS_SECRET: z.string().min(32),
      JWT_REFRESH_SECRET: z.string().min(32),
      JWT_ACCESS_TTL: z.string().default("15m"),
      JWT_REFRESH_TTL: z.string().default("30d"),
      MAGIC_LINK_TTL: z.string().default("15m"),
      // Invites
      INVITE_CODE_TTL_HOURS: z.coerce.number().int().positive().default(72),
      APP_DEEPLINK_BASE: z.string().url().default("https://sper.app/invite"),
      // Push providers (optional in dev; delivery layer degrades to log-only)
      // --- APNs (iOS) token-based auth ---
      APNS_KEY_ID: z.string().optional(),
      APNS_TEAM_ID: z.string().optional(),
      APNS_BUNDLE_ID: z.string().optional(),
      APNS_PRIVATE_KEY: z.string().optional(),
      // PEM contents of the .p8 key
      APNS_PRODUCTION: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
      // --- FCM (Android) service account ---
      FCM_PROJECT_ID: z.string().optional(),
      FCM_CLIENT_EMAIL: z.string().optional(),
      FCM_PRIVATE_KEY: z.string().optional(),
      // service-account private key PEM
      // Email fallback (SMTP; e.g. SES SMTP interface, Postmark, Resend SMTP)
      EMAIL_FROM: z.string().email().default("care@sper.app"),
      SMTP_HOST: z.string().optional(),
      SMTP_PORT: z.coerce.number().int().positive().optional(),
      SMTP_USER: z.string().optional(),
      SMTP_PASS: z.string().optional(),
      SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true")
    });
    env = loadEnv();
    isProd = env.NODE_ENV === "production";
    isTest = env.NODE_ENV === "test";
  }
});

// src/delivery/apns.provider.ts
var apns_provider_exports = {};
__export(apns_provider_exports, {
  ApnsPushProvider: () => ApnsPushProvider
});
var ApnsPushProvider;
var init_apns_provider = __esm({
  "src/delivery/apns.provider.ts"() {
    "use strict";
    init_env();
    ApnsPushProvider = class {
      provider = null;
      initPromise = null;
      static isConfigured() {
        return Boolean(
          env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID && env.APNS_PRIVATE_KEY
        );
      }
      async ensureInit() {
        if (this.provider) return;
        if (!this.initPromise) {
          this.initPromise = (async () => {
            const apnModule = await import("@parse/node-apn");
            const apn = apnModule.default ?? apnModule;
            this.provider = new apn.Provider({
              token: {
                key: Buffer.from(env.APNS_PRIVATE_KEY.replace(/\\n/g, "\n")),
                keyId: env.APNS_KEY_ID,
                teamId: env.APNS_TEAM_ID
              },
              production: env.APNS_PRODUCTION
            });
          })();
        }
        await this.initPromise;
      }
      async send(message) {
        try {
          await this.ensureInit();
          const apnModule = await import("@parse/node-apn");
          const apn = apnModule.default ?? apnModule;
          const note = new apn.Notification();
          note.topic = env.APNS_BUNDLE_ID;
          note.alert = { title: message.title, body: message.body };
          note.sound = "default";
          note.payload = message.data ?? {};
          const result = await this.provider.send(note, message.token);
          if (result.sent.length > 0) {
            return { token: message.token, ok: true };
          }
          const failure = result.failed[0];
          const status = failure?.status;
          const reason = failure?.response?.reason ?? "";
          const invalidToken = status === 410 || String(status) === "410" || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic";
          return {
            token: message.token,
            ok: false,
            ...invalidToken ? { invalidToken: true } : {},
            error: reason || `apns failed (status ${status ?? "unknown"})`
          };
        } catch (err) {
          return {
            token: message.token,
            ok: false,
            error: err instanceof Error ? err.message : "apns send failed"
          };
        }
      }
    };
  }
});

// src/delivery/fcm.provider.ts
var fcm_provider_exports = {};
__export(fcm_provider_exports, {
  FcmPushProvider: () => FcmPushProvider
});
var FcmPushProvider;
var init_fcm_provider = __esm({
  "src/delivery/fcm.provider.ts"() {
    "use strict";
    init_env();
    FcmPushProvider = class {
      messaging = null;
      initPromise = null;
      static isConfigured() {
        return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
      }
      async ensureInit() {
        if (this.messaging) return;
        if (!this.initPromise) {
          this.initPromise = (async () => {
            const { initializeApp, getApps, cert } = await import("firebase-admin/app");
            const { getMessaging } = await import("firebase-admin/messaging");
            const app = getApps().find((a) => a.name === "sper-fcm") ?? initializeApp(
              {
                credential: cert({
                  projectId: env.FCM_PROJECT_ID,
                  clientEmail: env.FCM_CLIENT_EMAIL,
                  // Support "\n"-escaped keys from env files.
                  privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n")
                })
              },
              "sper-fcm"
            );
            this.messaging = getMessaging(app);
          })();
        }
        await this.initPromise;
      }
      async send(message) {
        try {
          await this.ensureInit();
          await this.messaging.send({
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
            android: { priority: "high" }
          });
          return { token: message.token, ok: true };
        } catch (err) {
          const code = err.code ?? "";
          const invalidToken = code.includes("registration-token-not-registered") || code.includes("invalid-argument") || code.includes("invalid-registration-token");
          return {
            token: message.token,
            ok: false,
            ...invalidToken ? { invalidToken: true } : {},
            error: err instanceof Error ? err.message : "fcm send failed"
          };
        }
      }
    };
  }
});

// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";

// src/shared/middleware/error-handler.ts
import { ZodError } from "zod";

// src/shared/errors.ts
var DomainError = class extends Error {
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== void 0) this.details = details;
  }
};
var NotFoundError = class extends DomainError {
  constructor(message = "Resource not found", details) {
    super("NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
};
var ForbiddenError = class extends DomainError {
  constructor(message = "Not permitted", details) {
    super("FORBIDDEN", message, details);
    this.name = "ForbiddenError";
  }
};
var ConflictError = class extends DomainError {
  constructor(message = "Conflict", details) {
    super("CONFLICT", message, details);
    this.name = "ConflictError";
  }
};
var ValidationError = class extends DomainError {
  constructor(message = "Invalid input", details) {
    super("VALIDATION", message, details);
    this.name = "ValidationError";
  }
};
var UnauthorizedError = class extends DomainError {
  constructor(message = "Not authenticated", details) {
    super("UNAUTHORIZED", message, details);
    this.name = "UnauthorizedError";
  }
};

// src/shared/middleware/error-handler.ts
var STATUS_BY_CODE = {
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409
};
function errorHandler(error, request, reply) {
  if (error instanceof DomainError) {
    reply.code(STATUS_BY_CODE[error.code]).send({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    reply.code(422).send({
      error: {
        code: "VALIDATION",
        message: "Request validation failed",
        details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      }
    });
    return;
  }
  const status = error.statusCode;
  if (status && status >= 400 && status < 500) {
    reply.code(status).send({ error: { code: "VALIDATION", message: error.message } });
    return;
  }
  request.log.error(error);
  reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
}

// src/modules/notifications/circle-notification.repo.ts
import { and, eq, ne } from "drizzle-orm";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  careGratitudes: () => careGratitudes,
  checkinFrequency: () => checkinFrequency,
  checkins: () => checkins,
  circleMemberships: () => circleMemberships,
  circleNotifications: () => circleNotifications,
  circles: () => circles,
  devicePlatform: () => devicePlatform,
  deviceTokens: () => deviceTokens,
  idempotencyKeys: () => idempotencyKeys,
  invites: () => invites,
  stateLevel: () => stateLevel,
  touchpointLogs: () => touchpointLogs,
  touchpointType: () => touchpointType,
  users: () => users
});
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  char,
  boolean,
  timestamp,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ../../packages/shared-types/src/states.ts
var STATE_LEVELS = ["Thriving", "Steady", "Heavy", "In the Pit"];
var TOUCHPOINT_TYPES = ["VoiceNoteSent", "TextSent", "CallMade", "PrayedFor"];
var DEVICE_PLATFORMS = ["ios", "android"];
var CHECKIN_FREQUENCIES = ["once", "twice", "thrice"];
function isDistress(level) {
  return level === "Heavy" || level === "In the Pit";
}
function isTouchpointType(v) {
  return typeof v === "string" && TOUCHPOINT_TYPES.includes(v);
}

// src/db/schema.ts
var stateLevel = pgEnum("state_level", STATE_LEVELS);
var touchpointType = pgEnum(
  "touchpoint_type",
  TOUCHPOINT_TYPES
);
var devicePlatform = pgEnum(
  "device_platform",
  DEVICE_PLATFORMS
);
var checkinFrequency = pgEnum(
  "checkin_frequency",
  CHECKIN_FREQUENCIES
);
var users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  // nullable: magic-link-only accounts
  timezone: text("timezone").notNull().default("UTC"),
  avatarUrl: text("avatar_url"),
  notificationsPaused: boolean("notifications_paused").notNull().default(false),
  checkinFrequency: checkinFrequency("checkin_frequency").notNull().default("twice"),
  lastCheckinAt: timestamp("last_checkin_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: devicePlatform("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqToken: uniqueIndex("uniq_device_token").on(t.token),
    byUser: index("idx_device_tokens_user").on(t.userId)
  })
);
var circles = pgTable("circles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var circleMemberships = pgTable(
  "circle_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    covenantAgreed: boolean("covenant_agreed").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqMember: uniqueIndex("uniq_circle_member").on(t.circleId, t.userId),
    byUser: index("idx_memberships_user").on(t.userId)
  })
);
var invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  code: char("code", { length: 6 }).unique(),
  email: text("email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedBy: uuid("redeemed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    spiritualState: stateLevel("spiritual_state").notNull(),
    physicalState: stateLevel("physical_state").notNull(),
    emotionalState: stateLevel("emotional_state").notNull(),
    vocationalState: stateLevel("vocational_state").notNull(),
    relationalState: stateLevel("relational_state").notNull(),
    optionalNote: varchar("optional_note", { length: 140 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '14 days'`)
  },
  (t) => ({
    byCircle: index("idx_checkins_circle").on(t.circleId, t.createdAt)
  })
);
var circleNotifications = pgTable(
  "circle_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkinId: uuid("checkin_id").notNull().references(() => checkins.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").notNull().references(() => users.id),
    circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
    verse: text("verse"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byCircle: index("idx_notifications_circle").on(t.circleId, t.createdAt)
  })
);
var touchpointLogs = pgTable(
  "touchpoint_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkinId: uuid("checkin_id").notNull().references(() => checkins.id, { onDelete: "cascade" }),
    responderId: uuid("responder_id").notNull().references(() => users.id),
    type: touchpointType("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byCheckin: index("idx_touchpoints_checkin").on(t.checkinId)
  })
);
var careGratitudes = pgTable(
  "care_gratitudes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkinId: uuid("checkin_id").notNull().references(() => checkins.id, { onDelete: "cascade" }),
    responderId: uuid("responder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true })
  },
  (t) => ({
    uniqPerResponder: uniqueIndex("uniq_gratitude_responder").on(t.checkinId, t.responderId),
    byCheckin: index("idx_gratitudes_checkin").on(t.checkinId)
  })
);
var idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkinId: uuid("checkin_id").notNull().references(() => checkins.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqSend: uniqueIndex("uniq_idempotency_send").on(t.checkinId, t.recipientId)
  })
);

// src/modules/notifications/circle-notification.repo.ts
var CircleNotificationRepo = class {
  async create(exec, input) {
    const [row] = await exec.insert(circleNotifications).values({
      checkinId: input.checkinId,
      targetUserId: input.targetUserId,
      circleId: input.circleId,
      verse: input.verse
    }).returning();
    return row;
  }
  /**
   * Every *other* member of the circle — the recipients of a distress alert.
   * No assignment; the whole circle is notified.
   */
  async recipientIds(exec, circleId, excludeUserId) {
    const rows = await exec.select({ userId: circleMemberships.userId }).from(circleMemberships).where(
      and(
        eq(circleMemberships.circleId, circleId),
        ne(circleMemberships.userId, excludeUserId)
      )
    );
    return rows.map((r) => r.userId);
  }
  async findById(exec, id) {
    const [row] = await exec.select().from(circleNotifications).where(eq(circleNotifications.id, id)).limit(1);
    return row ?? null;
  }
};
var circleNotificationRepo = new CircleNotificationRepo();

// src/modules/notifications/verses.ts
var VERSES = [
  "Cast all your anxiety on him because he cares for you. \u2014 1 Peter 5:7",
  "The Lord is close to the brokenhearted. \u2014 Psalm 34:18",
  "Come to me, all who are weary, and I will give you rest. \u2014 Matthew 11:28",
  "He heals the brokenhearted and binds up their wounds. \u2014 Psalm 147:3",
  "I am with you always. \u2014 Matthew 28:20",
  "Weeping may stay for the night, but joy comes in the morning. \u2014 Psalm 30:5",
  "Be strong and courageous. Do not be afraid; the Lord your God goes with you. \u2014 Deuteronomy 31:6",
  "When you pass through the waters, I will be with you. \u2014 Isaiah 43:2",
  "Carry each other\u2019s burdens. \u2014 Galatians 6:2",
  "My grace is sufficient for you, for my power is made perfect in weakness. \u2014 2 Corinthians 12:9"
];
function pickVerse(seed) {
  if (VERSES.length === 0) return "";
  if (!seed) {
    return VERSES[Math.floor(Math.random() * VERSES.length)];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = hash * 31 + seed.charCodeAt(i) | 0;
  }
  const idx = Math.abs(hash) % VERSES.length;
  return VERSES[idx];
}

// src/modules/notifications/circle-notification.service.ts
var noopDispatcher = {
  async dispatchDistress() {
  }
};
var CircleNotificationService = class {
  constructor(repo = circleNotificationRepo, dispatcher = noopDispatcher) {
    this.repo = repo;
    this.dispatcher = dispatcher;
  }
  repo;
  dispatcher;
  /** Phase 2 injects the real dispatcher at composition time. */
  setDispatcher(dispatcher) {
    this.dispatcher = dispatcher;
  }
  /**
   * Persist the distress notification record INSIDE the caller's transaction.
   * Returns the record + resolved recipients; the caller triggers physical
   * delivery AFTER the transaction commits.
   */
  async createDistressNotification(exec, args) {
    const verse = pickVerse(args.checkinId);
    const notification = await this.repo.create(exec, {
      checkinId: args.checkinId,
      targetUserId: args.targetUserId,
      circleId: args.circleId,
      verse
    });
    const recipientIds = await this.repo.recipientIds(
      exec,
      args.circleId,
      args.targetUserId
    );
    return { notification, recipientIds };
  }
  /** Called post-commit to physically deliver. Safe to fail without rollback. */
  async deliver(result) {
    await this.dispatcher.dispatchDistress({
      notification: result.notification,
      recipientIds: result.recipientIds
    });
  }
};
var circleNotificationService = new CircleNotificationService();

// src/config/db.ts
init_env();
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
var isServerless = Boolean(process.env.VERCEL);
var pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isServerless ? 3 : isProd ? 20 : 5,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 5e3
});
var db = drizzle(pool, { schema: schema_exports });

// src/modules/touchpoints/touchpoints.repo.ts
import { and as and2, asc, eq as eq2 } from "drizzle-orm";
var TouchpointRepo = class {
  async insert(exec, values) {
    const [row] = await exec.insert(touchpointLogs).values(values).returning();
    return row;
  }
  /** Resolve the circle + target (author) of a check-in. */
  async checkinContext(exec, checkinId) {
    const [row] = await exec.select({ circleId: checkins.circleId, targetUserId: checkins.userId }).from(checkins).where(eq2(checkins.id, checkinId)).limit(1);
    return row ?? null;
  }
  async isMember(exec, circleId, userId) {
    const [row] = await exec.select({ id: circleMemberships.id }).from(circleMemberships).where(
      and2(
        eq2(circleMemberships.circleId, circleId),
        eq2(circleMemberships.userId, userId)
      )
    ).limit(1);
    return !!row;
  }
  /** All outreach logged for a check-in, oldest first, with responder names. */
  async listByCheckin(exec, checkinId) {
    const rows = await exec.select({
      id: touchpointLogs.id,
      checkinId: touchpointLogs.checkinId,
      responderId: touchpointLogs.responderId,
      type: touchpointLogs.type,
      createdAt: touchpointLogs.createdAt,
      responderName: users.name
    }).from(touchpointLogs).innerJoin(users, eq2(users.id, touchpointLogs.responderId)).where(eq2(touchpointLogs.checkinId, checkinId)).orderBy(asc(touchpointLogs.createdAt));
    return rows;
  }
};
var touchpointRepo = new TouchpointRepo();

// src/shared/mappers.ts
var iso = (d) => d.toISOString();
function toCheckInDTO(row) {
  return {
    id: row.id,
    user_id: row.userId,
    circle_id: row.circleId,
    spiritual_state: row.spiritualState,
    physical_state: row.physicalState,
    emotional_state: row.emotionalState,
    vocational_state: row.vocationalState,
    relational_state: row.relationalState,
    optional_note: row.optionalNote ?? null,
    created_at: iso(row.createdAt),
    expires_at: iso(row.expiresAt)
  };
}
function toCircleNotificationDTO(row) {
  return {
    id: row.id,
    checkin_id: row.checkinId,
    target_user_id: row.targetUserId,
    circle_id: row.circleId,
    verse: row.verse ?? null,
    created_at: iso(row.createdAt)
  };
}
function toTouchpointDTO(row, responderName) {
  return {
    id: row.id,
    checkin_id: row.checkinId,
    responder_id: row.responderId,
    responder_name: responderName,
    type: row.type,
    created_at: iso(row.createdAt)
  };
}

// src/modules/touchpoints/touchpoints.service.ts
var noopAck = {
  async ackTarget() {
  }
};
var TouchpointService = class {
  constructor(repo = touchpointRepo, ack = noopAck, database = db) {
    this.repo = repo;
    this.ack = ack;
    this.database = database;
  }
  repo;
  ack;
  database;
  setAckDispatcher(dispatcher) {
    this.ack = dispatcher;
  }
  /**
   * Any circle member may log outreach; multiple members may respond to the
   * same check-in (no assignment, no dedupe). Writes a TouchpointLog and
   * quietly acknowledges the target post-commit.
   */
  async log(input) {
    if (!isTouchpointType(input.type)) {
      throw new NotFoundError("Unknown touchpoint type");
    }
    const row = await this.database.transaction(async (tx) => {
      const ctx = await this.repo.checkinContext(tx, input.checkinId);
      if (!ctx) throw new NotFoundError("Check-in not found");
      const isMember = await this.repo.isMember(tx, ctx.circleId, input.responderId);
      if (!isMember) throw new ForbiddenError("Not a member of this circle");
      const inserted = await this.repo.insert(tx, {
        checkinId: input.checkinId,
        responderId: input.responderId,
        type: input.type
      });
      return { inserted, targetUserId: ctx.targetUserId };
    });
    if (row.targetUserId !== input.responderId) {
      await this.ack.ackTarget({
        targetUserId: row.targetUserId,
        responderName: input.responderName,
        checkinId: input.checkinId
      });
    }
    return toTouchpointDTO(row.inserted, input.responderName);
  }
  /** Who has already reached out for this check-in (visible to members). */
  async list(checkinId, callerId) {
    const ctx = await this.repo.checkinContext(this.database, checkinId);
    if (!ctx) throw new NotFoundError("Check-in not found");
    const isMember = await this.repo.isMember(this.database, ctx.circleId, callerId);
    if (!isMember) throw new ForbiddenError("Not a member of this circle");
    const rows = await this.repo.listByCheckin(this.database, checkinId);
    return rows.map((r) => toTouchpointDTO(r, r.responderName));
  }
};
var touchpointService = new TouchpointService();

// src/modules/circles/circles.service.ts
import { eq as eq6 } from "drizzle-orm";

// src/modules/circles/circles.repo.ts
import { and as and3, desc, eq as eq3 } from "drizzle-orm";
var CircleRepo = class {
  async create(exec, name) {
    const [row] = await exec.insert(circles).values({ name }).returning();
    return row;
  }
  async findById(exec, id) {
    const [row] = await exec.select().from(circles).where(eq3(circles.id, id)).limit(1);
    return row ?? null;
  }
  /**
   * Add a member. `covenantAgreed` defaults false — the pact must be accepted
   * separately before the member can access content. Idempotent: re-adding an
   * existing member is a no-op that returns the existing row.
   */
  async addMember(exec, circleId, userId, covenantAgreed = false) {
    const [row] = await exec.insert(circleMemberships).values({ circleId, userId, covenantAgreed }).onConflictDoNothing({
      target: [circleMemberships.circleId, circleMemberships.userId]
    }).returning();
    if (row) return row;
    const [existing] = await exec.select().from(circleMemberships).where(
      and3(
        eq3(circleMemberships.circleId, circleId),
        eq3(circleMemberships.userId, userId)
      )
    ).limit(1);
    return existing;
  }
  async isMember(exec, circleId, userId) {
    const [row] = await exec.select({ id: circleMemberships.id }).from(circleMemberships).where(
      and3(
        eq3(circleMemberships.circleId, circleId),
        eq3(circleMemberships.userId, userId)
      )
    ).limit(1);
    return !!row;
  }
  /**
   * Every circle this user belongs to, most recently joined first — used on
   * sign-in to resume a returning member without re-running onboarding.
   */
  async myCircles(exec, userId) {
    const rows = await exec.select({
      circleId: circleMemberships.circleId,
      name: circles.name,
      covenantAgreed: circleMemberships.covenantAgreed,
      joinedAt: circleMemberships.joinedAt
    }).from(circleMemberships).innerJoin(circles, eq3(circles.id, circleMemberships.circleId)).where(eq3(circleMemberships.userId, userId)).orderBy(desc(circleMemberships.joinedAt));
    return rows.map(
      (r) => ({
        circle_id: r.circleId,
        name: r.name,
        covenant_agreed: r.covenantAgreed,
        joined_at: r.joinedAt.toISOString()
      })
    );
  }
  /** All member user IDs for a circle. */
  async memberIds(exec, circleId) {
    const rows = await exec.select({ userId: circleMemberships.userId }).from(circleMemberships).where(eq3(circleMemberships.circleId, circleId));
    return rows.map((r) => r.userId);
  }
  /** Member list with names, timezones, and pact status (for My Circle screen). */
  async members(exec, circleId) {
    const rows = await exec.select({
      userId: circleMemberships.userId,
      name: users.name,
      timezone: users.timezone,
      avatarUrl: users.avatarUrl,
      covenantAgreed: circleMemberships.covenantAgreed,
      joinedAt: circleMemberships.joinedAt
    }).from(circleMemberships).innerJoin(users, eq3(users.id, circleMemberships.userId)).where(eq3(circleMemberships.circleId, circleId));
    return rows.map(
      (r) => ({
        user_id: r.userId,
        name: r.name,
        timezone: r.timezone,
        avatar_url: r.avatarUrl ?? null,
        covenant_agreed: r.covenantAgreed,
        joined_at: r.joinedAt.toISOString()
      })
    );
  }
  async removeMember(exec, circleId, userId) {
    await exec.delete(circleMemberships).where(
      and3(
        eq3(circleMemberships.circleId, circleId),
        eq3(circleMemberships.userId, userId)
      )
    );
  }
};
var circleRepo = new CircleRepo();

// src/modules/circles/invites.service.ts
import { randomInt } from "node:crypto";
init_env();

// src/modules/circles/invites.repo.ts
import { and as and4, eq as eq4, gt, isNull } from "drizzle-orm";
var InviteRepo = class {
  async create(exec, values) {
    const [row] = await exec.insert(invites).values({
      circleId: values.circleId,
      code: values.code,
      expiresAt: values.expiresAt,
      ...values.email !== void 0 ? { email: values.email } : {}
    }).returning();
    return row;
  }
  /** A valid invite by 6-char code: exists, unexpired, unredeemed. */
  async findRedeemableByCode(exec, code) {
    const [row] = await exec.select().from(invites).where(
      and4(
        eq4(invites.code, code),
        gt(invites.expiresAt, /* @__PURE__ */ new Date()),
        isNull(invites.redeemedBy)
      )
    ).limit(1);
    return row ?? null;
  }
  /** A valid invite by id (used for magic invite links carrying the invite id). */
  async findRedeemableById(exec, id) {
    const [row] = await exec.select().from(invites).where(
      and4(
        eq4(invites.id, id),
        gt(invites.expiresAt, /* @__PURE__ */ new Date()),
        isNull(invites.redeemedBy)
      )
    ).limit(1);
    return row ?? null;
  }
  async markRedeemed(exec, id, userId) {
    await exec.update(invites).set({ redeemedBy: userId }).where(eq4(invites.id, id));
  }
  async codeExists(exec, code) {
    const [row] = await exec.select({ id: invites.id }).from(invites).where(eq4(invites.code, code)).limit(1);
    return !!row;
  }
};
var inviteRepo = new InviteRepo();

// src/modules/circles/invites.service.ts
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var CODE_LENGTH = 6;
var InviteService = class {
  constructor(repo = inviteRepo, database = db) {
    this.repo = repo;
    this.database = database;
  }
  repo;
  database;
  /** Create an invite for a circle, returning the code + deep link. */
  async create(circleId, email, exec = this.database) {
    const code = await this.generateUniqueCode(exec);
    const expiresAt = new Date(Date.now() + env.INVITE_CODE_TTL_HOURS * 36e5);
    const invite = await this.repo.create(exec, {
      circleId,
      code,
      expiresAt,
      ...email !== void 0 ? { email } : {}
    });
    return {
      code: invite.code,
      invite_link: `${env.APP_DEEPLINK_BASE}/${invite.id}`,
      expires_at: invite.expiresAt.toISOString()
    };
  }
  /** Resolve a redeemable invite from either a code or a link token (invite id). */
  async resolveRedeemable(args, exec = this.database) {
    let invite = null;
    if (args.code) {
      invite = await this.repo.findRedeemableByCode(exec, args.code.toUpperCase());
    } else if (args.inviteToken) {
      invite = await this.repo.findRedeemableById(exec, args.inviteToken);
    }
    if (!invite) {
      throw new NotFoundError("Invite is invalid, expired, or already used");
    }
    return invite;
  }
  async markRedeemed(inviteId, userId, exec = this.database) {
    await this.repo.markRedeemed(exec, inviteId, userId);
  }
  async generateUniqueCode(exec) {
    for (let attempt = 0; attempt < 8; attempt++) {
      let code = "";
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!await this.repo.codeExists(exec, code)) return code;
    }
    throw new ConflictError("Could not allocate a unique invite code; retry");
  }
};
var inviteService = new InviteService();

// src/modules/circles/pact.service.ts
import { and as and5, eq as eq5 } from "drizzle-orm";
var PactService = class {
  constructor(database = db) {
    this.database = database;
  }
  database;
  /** Set covenant_agreed = true for the caller in this circle. */
  async agree(circleId, userId, exec = this.database) {
    const updated = await exec.update(circleMemberships).set({ covenantAgreed: true }).where(
      and5(
        eq5(circleMemberships.circleId, circleId),
        eq5(circleMemberships.userId, userId)
      )
    ).returning({ id: circleMemberships.id });
    if (updated.length === 0) {
      throw new NotFoundError("Membership not found for this circle");
    }
  }
  async hasAgreed(circleId, userId, exec = this.database) {
    const [row] = await exec.select({ agreed: circleMemberships.covenantAgreed }).from(circleMemberships).where(
      and5(
        eq5(circleMemberships.circleId, circleId),
        eq5(circleMemberships.userId, userId)
      )
    ).limit(1);
    return row?.agreed === true;
  }
  /** Throws unless the caller is a member AND has agreed the pact. */
  async assertAccess(circleId, userId, exec = this.database) {
    const [row] = await exec.select({ agreed: circleMemberships.covenantAgreed }).from(circleMemberships).where(
      and5(
        eq5(circleMemberships.circleId, circleId),
        eq5(circleMemberships.userId, userId)
      )
    ).limit(1);
    if (!row) throw new ForbiddenError("Not a member of this circle");
    if (!row.agreed) throw new ForbiddenError("Circle pact must be agreed first");
  }
};
var pactService = new PactService();

// src/modules/circles/circle-events.ts
var noopCircleEventDispatcher = {
  async memberAdded() {
  }
};

// src/modules/circles/circles.service.ts
var CircleService = class {
  constructor(repo = circleRepo, invites2 = inviteService, pact = pactService, events = noopCircleEventDispatcher, database = db) {
    this.repo = repo;
    this.invites = invites2;
    this.pact = pact;
    this.events = events;
    this.database = database;
  }
  repo;
  invites;
  pact;
  events;
  database;
  /** Phase 2 delivery injects the real dispatcher at composition time. */
  setEventDispatcher(dispatcher) {
    this.events = dispatcher;
  }
  /**
   * Create a circle and auto-add the creator as its first member.
   * The creator still must agree the pact before accessing content.
   */
  async create(name, creatorId) {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError("Circle name is required");
    const row = await this.database.transaction(async (tx) => {
      const circle = await this.repo.create(tx, trimmed);
      await this.repo.addMember(tx, circle.id, creatorId, false);
      return circle;
    });
    return { id: row.id, name: row.name, created_at: row.createdAt.toISOString() };
  }
  /** Create an invite (code + deep link). Caller must be a member. */
  async createInvite(circleId, callerId, email) {
    const isMember = await this.repo.isMember(this.database, circleId, callerId);
    if (!isMember) throw new NotFoundError("Circle not found");
    return this.invites.create(circleId, email);
  }
  /**
   * Join via code or invite-link token. In ONE transaction: resolve a
   * redeemable invite, add the member, mark the invite redeemed. Then notify
   * existing members post-commit (FR #3). New members join with the pact
   * un-agreed — they must accept it before accessing content.
   */
  async join(args, userId) {
    if (!args.code && !args.inviteToken) {
      throw new ValidationError("An invite code or link is required");
    }
    const { circleRow, existingMemberIds } = await this.database.transaction(async (tx) => {
      const invite = await this.invites.resolveRedeemable(args, tx);
      const alreadyMember = await this.repo.isMember(tx, invite.circleId, userId);
      if (alreadyMember) {
        throw new ConflictError("You are already a member of this circle");
      }
      const existingMemberIds2 = await this.repo.memberIds(tx, invite.circleId);
      await this.repo.addMember(tx, invite.circleId, userId, false);
      await this.invites.markRedeemed(invite.id, userId, tx);
      const circleRow2 = await this.repo.findById(tx, invite.circleId);
      if (!circleRow2) throw new NotFoundError("Circle not found");
      return { circleRow: circleRow2, existingMemberIds: existingMemberIds2 };
    });
    if (existingMemberIds.length > 0) {
      const joiner = await this.userName(userId);
      await this.events.memberAdded({
        circleId: circleRow.id,
        newMemberName: joiner,
        recipientIds: existingMemberIds
      });
    }
    return {
      circle: {
        id: circleRow.id,
        name: circleRow.name,
        created_at: circleRow.createdAt.toISOString()
      }
    };
  }
  /** Circles this user already belongs to, so sign-in can resume them. */
  async mine(userId) {
    return this.repo.myCircles(this.database, userId);
  }
  /** Accept the Circle Pact (gate for all circle access). */
  async agreePact(circleId, userId) {
    await this.pact.agree(circleId, userId);
  }
  /** Member list for the My Circle screen. Caller must have pact access. */
  async members(circleId, callerId) {
    await this.pact.assertAccess(circleId, callerId);
    return this.repo.members(this.database, circleId);
  }
  async leave(circleId, userId) {
    const isMember = await this.repo.isMember(this.database, circleId, userId);
    if (!isMember) throw new NotFoundError("Not a member of this circle");
    await this.repo.removeMember(this.database, circleId, userId);
  }
  async userName(userId) {
    const [row] = await this.database.select({ name: users.name }).from(users).where(eq6(users.id, userId)).limit(1);
    return row?.name ?? "A friend";
  }
};
var circleService = new CircleService();

// src/delivery/notifier.service.ts
import { inArray, eq as eq9 } from "drizzle-orm";

// src/modules/users/devices.repo.ts
import { eq as eq7 } from "drizzle-orm";
var DeviceRepo = class {
  /**
   * Register (or re-point) a device token. Tokens are globally unique; if the
   * same token re-registers we update its owner/platform rather than duplicate.
   */
  async register(userId, token, platform, exec = db) {
    const [row] = await exec.insert(deviceTokens).values({ userId, token, platform }).onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId, platform }
    }).returning();
    return row;
  }
  async listForUser(userId, exec = db) {
    return exec.select().from(deviceTokens).where(eq7(deviceTokens.userId, userId));
  }
  async listForUsers(userIds, exec = db) {
    if (userIds.length === 0) return [];
    const rows = await exec.select().from(deviceTokens);
    const set = new Set(userIds);
    return rows.filter((r) => set.has(r.userId));
  }
  /** Remove a token the provider reported as unregistered/invalid. */
  async remove(token, exec = db) {
    await exec.delete(deviceTokens).where(eq7(deviceTokens.token, token));
  }
};
var deviceRepo = new DeviceRepo();

// src/delivery/push.provider.ts
var DefaultPushProvider = class {
  apns = null;
  fcm = null;
  apnsReady = false;
  fcmReady = false;
  async iosProvider() {
    if (this.apnsReady) return this.apns;
    this.apnsReady = true;
    const { ApnsPushProvider: ApnsPushProvider2 } = await Promise.resolve().then(() => (init_apns_provider(), apns_provider_exports));
    if (ApnsPushProvider2.isConfigured()) this.apns = new ApnsPushProvider2();
    return this.apns;
  }
  async androidProvider() {
    if (this.fcmReady) return this.fcm;
    this.fcmReady = true;
    const { FcmPushProvider: FcmPushProvider2 } = await Promise.resolve().then(() => (init_fcm_provider(), fcm_provider_exports));
    if (FcmPushProvider2.isConfigured()) this.fcm = new FcmPushProvider2();
    return this.fcm;
  }
  async send(message) {
    const real = message.platform === "ios" ? await this.iosProvider() : await this.androidProvider();
    if (real) return real.send(message);
    console.info(
      `[push:log-only] -> ${message.platform}:${message.token.slice(0, 8)}\u2026 "${message.title}" / "${message.body}"`
    );
    return { token: message.token, ok: true };
  }
};
var pushProvider = new DefaultPushProvider();

// src/delivery/email.provider.ts
init_env();
var DefaultEmailProvider = class _DefaultEmailProvider {
  transporter = null;
  initPromise = null;
  static isConfigured() {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT);
  }
  async ensureInit() {
    if (this.transporter) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const nodemailer = (await import("nodemailer")).default;
        this.transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          ...env.SMTP_USER && env.SMTP_PASS ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}
        });
      })();
    }
    await this.initPromise;
  }
  async send(message) {
    if (!_DefaultEmailProvider.isConfigured()) {
      console.info(
        `[email:log-only] from=${env.EMAIL_FROM} to=${message.to} subject="${message.subject}"`
      );
      return { to: message.to, ok: true };
    }
    try {
      await this.ensureInit();
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.body
      });
      return { to: message.to, ok: true };
    } catch (err) {
      return {
        to: message.to,
        ok: false,
        error: err instanceof Error ? err.message : "email send failed"
      };
    }
  }
};
var emailProvider = new DefaultEmailProvider();

// src/shared/idempotency.ts
import { and as and6, eq as eq8 } from "drizzle-orm";
async function claimSend(checkinId, recipientId, exec = db) {
  const inserted = await exec.insert(idempotencyKeys).values({ checkinId, recipientId }).onConflictDoNothing({
    target: [idempotencyKeys.checkinId, idempotencyKeys.recipientId]
  }).returning({ id: idempotencyKeys.id });
  return inserted.length > 0;
}

// src/delivery/notifier.service.ts
var NotifierService = class {
  constructor(devices = deviceRepo, push = pushProvider, email = emailProvider, database = db) {
    this.devices = devices;
    this.push = push;
    this.email = email;
    this.database = database;
  }
  devices;
  push;
  email;
  database;
  /* ---------------------- NotificationDispatcher ---------------------- */
  async dispatchDistress(input) {
    const { notification, recipientIds } = input;
    if (recipientIds.length === 0) return;
    const targetName = await this.userName(notification.targetUserId);
    const contacts = await this.loadContacts(recipientIds);
    const title = `${targetName} could use some care`;
    const body = notification.verse ? `Reach out \u2014 a text, a call, or a prayer. ${notification.verse}` : "Reach out \u2014 a text, a call, or a prayer.";
    const data = { type: "distress", checkin_id: notification.checkinId };
    await Promise.all(
      contacts.map((c) => this.deliverOnce(notification.checkinId, c, title, body, data))
    );
  }
  /* --------------------- TouchpointAckDispatcher ---------------------- */
  async ackTarget(input) {
    const [contact] = await this.loadContacts([input.targetUserId]);
    if (!contact) return;
    const title = "Someone stepped up";
    const body = `${input.responderName} stepped up to hold space for you today.`;
    const data = { type: "touchpoint_ack", checkin_id: input.checkinId };
    await this.sendToContact(contact, title, body, data);
  }
  /* --------------------- CircleEventDispatcher ------------------------ */
  async memberAdded(input) {
    if (input.recipientIds.length === 0) return;
    const contacts = await this.loadContacts(input.recipientIds);
    const title = "A new member joined your circle";
    const body = `${input.newMemberName} just joined. Say hello when you get a moment.`;
    const data = { type: "member_added", circle_id: input.circleId };
    await Promise.all(contacts.map((c) => this.sendToContact(c, title, body, data)));
  }
  /* ------------------------------ Grace ------------------------------- */
  async graceNudge(input) {
    if (input.recipientIds.length === 0) return;
    const contacts = await this.loadContacts(input.recipientIds);
    const title = `${input.quietMemberName} has been quiet`;
    const body = `${input.quietMemberName} has been quiet for a couple of weeks. No pressure for them to use the app \u2014 just drop a quick note to say you love them.`;
    const data = { type: "grace_nudge", circle_id: input.circleId };
    await Promise.all(contacts.map((c) => this.sendToContact(c, title, body, data)));
  }
  /* ----------------------------- internals ---------------------------- */
  /** Deliver to one recipient exactly once for this check-in. */
  async deliverOnce(checkinId, contact, title, body, data) {
    const won = await claimSend(checkinId, contact.userId);
    if (!won) return;
    await this.sendToContact(contact, title, body, data);
  }
  /** Push to every live token; fall back to email if none succeeded. */
  async sendToContact(contact, title, body, data) {
    let anyPushOk = false;
    for (const t of contact.tokens) {
      const msg = {
        token: t.token,
        platform: t.platform,
        title,
        body,
        data
      };
      const res = await this.push.send(msg);
      if (res.ok) {
        anyPushOk = true;
      } else if (res.invalidToken) {
        await this.devices.remove(t.token);
      }
    }
    if (!anyPushOk) {
      await this.email.send({ to: contact.email, subject: title, body });
    }
  }
  async loadContacts(userIds) {
    if (userIds.length === 0) return [];
    const rows = await this.database.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds));
    const tokens = await this.devices.listForUsers(userIds);
    const byUser = /* @__PURE__ */ new Map();
    for (const t of tokens) {
      const arr = byUser.get(t.userId) ?? [];
      arr.push(t);
      byUser.set(t.userId, arr);
    }
    return rows.map((r) => ({
      userId: r.id,
      name: r.name,
      email: r.email,
      tokens: byUser.get(r.id) ?? []
    }));
  }
  async userName(userId) {
    const [row] = await this.database.select({ name: users.name }).from(users).where(eq9(users.id, userId)).limit(1);
    return row?.name ?? "A friend";
  }
};
var notifierService = new NotifierService();

// src/delivery/wire.ts
var wired = false;
function wireDelivery() {
  if (wired) return;
  circleNotificationService.setDispatcher(notifierService);
  touchpointService.setAckDispatcher(notifierService);
  circleService.setEventDispatcher(notifierService);
  wired = true;
}

// src/modules/auth/auth.routes.ts
import { z as z2 } from "zod";

// src/modules/auth/auth.service.ts
import bcrypt from "bcryptjs";

// src/modules/auth/auth.repo.ts
import { eq as eq10 } from "drizzle-orm";
var AuthRepo = class {
  async createUser(exec, values) {
    const [row] = await exec.insert(users).values({
      name: values.name,
      email: values.email.toLowerCase(),
      timezone: values.timezone,
      ...values.passwordHash !== void 0 ? { passwordHash: values.passwordHash } : {}
    }).returning();
    return row;
  }
  async findByEmail(exec, email) {
    const [row] = await exec.select().from(users).where(eq10(users.email, email.toLowerCase())).limit(1);
    return row ?? null;
  }
  async findById(exec, id) {
    const [row] = await exec.select().from(users).where(eq10(users.id, id)).limit(1);
    return row ?? null;
  }
  async updateProfile(exec, id, patch) {
    const [row] = await exec.update(users).set(patch).where(eq10(users.id, id)).returning();
    return row;
  }
  async updatePasswordHash(exec, id, passwordHash) {
    const [row] = await exec.update(users).set({ passwordHash }).where(eq10(users.id, id)).returning();
    return row;
  }
};
var authRepo = new AuthRepo();

// src/modules/auth/tokens.ts
init_env();
import jwt from "jsonwebtoken";
function signAccess(userId) {
  return jwt.sign({ sub: userId, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL
  });
}
function signRefresh(userId) {
  return jwt.sign({ sub: userId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL
  });
}
function issueTokens(userId) {
  return {
    access_token: signAccess(userId),
    refresh_token: signRefresh(userId),
    expires_in: ttlToSeconds(env.JWT_ACCESS_TTL)
  };
}
function verifyAccess(token) {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (decoded.type !== "access") throw new Error("Wrong token type");
  return decoded;
}
function verifyRefresh(token) {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (decoded.type !== "refresh") throw new Error("Wrong token type");
  return decoded;
}
function signMagicLink(subject) {
  return jwt.sign({ sub: subject, type: "magic" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.MAGIC_LINK_TTL
  });
}
function verifyMagicLink(token) {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (decoded.type !== "magic") throw new Error("Wrong token type");
  return decoded;
}
function signPasswordReset(userId) {
  return jwt.sign({ sub: userId, type: "reset" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.MAGIC_LINK_TTL
  });
}
function verifyPasswordReset(token) {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (decoded.type !== "reset") throw new Error("Wrong token type");
  return decoded;
}
function ttlToSeconds(ttl) {
  const m = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return n;
  }
}

// src/modules/auth/auth.service.ts
var BCRYPT_ROUNDS = 12;
function toUserDTO(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    avatar_url: row.avatarUrl ?? null,
    notifications_paused: row.notificationsPaused,
    checkin_frequency: row.checkinFrequency,
    last_checkin_at: row.lastCheckinAt ? row.lastCheckinAt.toISOString() : null,
    created_at: row.createdAt.toISOString()
  };
}
var AuthService = class {
  constructor(repo = authRepo, database = db) {
    this.repo = repo;
    this.database = database;
  }
  repo;
  database;
  async register(input) {
    if (input.password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters");
    }
    const existing = await this.repo.findByEmail(this.database, input.email);
    if (existing) throw new ConflictError("An account with that email already exists");
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.repo.createUser(this.database, {
      name: input.name,
      email: input.email,
      passwordHash,
      timezone: input.timezone
    });
    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }
  async login(email, password) {
    const user = await this.repo.findByEmail(this.database, email);
    if (!user || !user.passwordHash) throw new UnauthorizedError("Invalid credentials");
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid credentials");
    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }
  /**
   * Issue a magic link. We never reveal whether the email is registered; the
   * caller (controller) responds 202 regardless. Returns the token so the
   * delivery layer can email it (out of scope here — logged in dev).
   */
  async issueMagicLink(email) {
    const user = await this.repo.findByEmail(this.database, email);
    if (!user) return { token: null };
    return { token: signMagicLink(user.id) };
  }
  async verifyMagicLink(token) {
    let claims;
    try {
      claims = verifyMagicLink(token);
    } catch {
      throw new UnauthorizedError("Magic link is invalid or expired");
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError("Account no longer exists");
    return { user: toUserDTO(user), tokens: issueTokens(user.id) };
  }
  /**
   * Issue a password-reset token. Same "never reveal whether the email
   * exists" contract as the magic link — the route always responds 202.
   */
  async requestPasswordReset(email) {
    const user = await this.repo.findByEmail(this.database, email);
    if (!user) return { token: null };
    return { token: signPasswordReset(user.id) };
  }
  async confirmPasswordReset(token, newPassword) {
    if (newPassword.length < 8) {
      throw new ValidationError("Password must be at least 8 characters");
    }
    let claims;
    try {
      claims = verifyPasswordReset(token);
    } catch {
      throw new UnauthorizedError("Reset code is invalid or expired");
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError("Account no longer exists");
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const updated = await this.repo.updatePasswordHash(this.database, user.id, passwordHash);
    return { user: toUserDTO(updated), tokens: issueTokens(updated.id) };
  }
  /** Refresh rotation: a valid refresh token yields a fresh token pair. */
  async refresh(refreshToken) {
    let claims;
    try {
      claims = verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedError("Refresh token is invalid or expired");
    }
    const user = await this.repo.findById(this.database, claims.sub);
    if (!user) throw new UnauthorizedError("Account no longer exists");
    return issueTokens(user.id);
  }
};
var authService = new AuthService();

// src/modules/auth/auth.routes.ts
var registerSchema = z2.object({
  name: z2.string().min(1),
  email: z2.string().email(),
  password: z2.string().min(8),
  timezone: z2.string().min(1)
});
var loginSchema = z2.object({ email: z2.string().email(), password: z2.string().min(1) });
var magicSchema = z2.object({ email: z2.string().email() });
var magicVerifySchema = z2.object({ token: z2.string().min(1) });
var refreshSchema = z2.object({ refresh_token: z2.string().min(1) });
var resetRequestSchema = z2.object({ email: z2.string().email() });
var resetConfirmSchema = z2.object({ token: z2.string().min(1), password: z2.string().min(8) });
async function authRoutes(app) {
  app.post("/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    return reply.code(201).send(result);
  });
  app.post("/auth/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    return reply.code(200).send(result);
  });
  app.post("/auth/magic-link", async (req, reply) => {
    const { email } = magicSchema.parse(req.body);
    const { token } = await authService.issueMagicLink(email);
    if (token) {
      req.log.info({ email }, "[magic-link] token issued (would be emailed)");
    }
    return reply.code(202).send();
  });
  app.post("/auth/magic-link/verify", async (req, reply) => {
    const { token } = magicVerifySchema.parse(req.body);
    const result = await authService.verifyMagicLink(token);
    return reply.code(200).send(result);
  });
  app.post("/auth/refresh", async (req, reply) => {
    const { refresh_token } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refresh_token);
    return reply.code(200).send({ tokens });
  });
  app.post("/auth/reset-password/request", async (req, reply) => {
    const { email } = resetRequestSchema.parse(req.body);
    const { token } = await authService.requestPasswordReset(email);
    if (token) {
      req.log.info({ email }, "[reset-password] token issued (would be emailed)");
    }
    return reply.code(202).send();
  });
  app.post("/auth/reset-password/confirm", async (req, reply) => {
    const { token, password } = resetConfirmSchema.parse(req.body);
    const result = await authService.confirmPasswordReset(token, password);
    return reply.code(200).send(result);
  });
}

// src/modules/circles/circles.routes.ts
import { z as z3 } from "zod";

// src/shared/middleware/auth.ts
async function requireAuth(request, reply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Missing bearer token" } });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const claims = verifyAccess(token);
    request.userId = claims.sub;
  } catch {
    await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
  }
}
function currentUserId(request) {
  if (!request.userId) throw new Error("requireAuth preHandler not applied to this route");
  return request.userId;
}

// src/modules/circles/circles.routes.ts
var createSchema = z3.object({ name: z3.string().min(1) });
var joinSchema = z3.object({ code: z3.string().length(6).optional(), invite_token: z3.string().min(1).optional() }).refine((v) => v.code || v.invite_token, { message: "code or invite_token required" });
var inviteSchema = z3.object({ email: z3.string().email().optional() });
var idParam = z3.object({ id: z3.string().uuid() });
async function circleRoutes(app) {
  app.addHook("preHandler", requireAuth);
  app.get("/circles/mine", async (req, reply) => {
    const circles2 = await circleService.mine(currentUserId(req));
    return reply.code(200).send({ circles: circles2 });
  });
  app.post("/circles", async (req, reply) => {
    const { name } = createSchema.parse(req.body);
    const circle = await circleService.create(name, currentUserId(req));
    return reply.code(201).send({ circle });
  });
  app.post("/circles/join", async (req, reply) => {
    const body = joinSchema.parse(req.body);
    const result = await circleService.join(
      { ...body.code ? { code: body.code } : {}, ...body.invite_token ? { inviteToken: body.invite_token } : {} },
      currentUserId(req)
    );
    return reply.code(200).send(result);
  });
  app.post("/circles/:id/invites", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { email } = inviteSchema.parse(req.body ?? {});
    const invite = await circleService.createInvite(id, currentUserId(req), email);
    return reply.code(201).send(invite);
  });
  app.post("/circles/:id/pact/agree", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await circleService.agreePact(id, currentUserId(req));
    return reply.code(200).send({ ok: true });
  });
  app.get("/circles/:id/members", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const members = await circleService.members(id, currentUserId(req));
    return reply.code(200).send({ members });
  });
  app.post("/circles/:id/leave", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await circleService.leave(id, currentUserId(req));
    return reply.code(200).send({ ok: true });
  });
}

// src/modules/checkins/checkins.routes.ts
import { z as z4 } from "zod";

// src/modules/checkins/checkins.service.ts
import { eq as eq12 } from "drizzle-orm";

// src/modules/checkins/checkins.repo.ts
import { and as and7, desc as desc2, eq as eq11, gt as gt2, inArray as inArray2 } from "drizzle-orm";
var CheckInRepo = class {
  async insert(exec, values) {
    const [row] = await exec.insert(checkins).values(values).returning();
    return row;
  }
  async findById(exec, id) {
    const [row] = await exec.select().from(checkins).where(eq11(checkins.id, id)).limit(1);
    return row ?? null;
  }
  /** True if the user is a member of the circle. */
  async isMember(exec, circleId, userId) {
    const [row] = await exec.select({ id: circleMemberships.id }).from(circleMemberships).where(
      and7(
        eq11(circleMemberships.circleId, circleId),
        eq11(circleMemberships.userId, userId)
      )
    ).limit(1);
    return !!row;
  }
  /** True if the caller has agreed to the pact for this circle. */
  async hasAgreedPact(exec, circleId, userId) {
    const [row] = await exec.select({ agreed: circleMemberships.covenantAgreed }).from(circleMemberships).where(
      and7(
        eq11(circleMemberships.circleId, circleId),
        eq11(circleMemberships.userId, userId)
      )
    ).limit(1);
    return row?.agreed === true;
  }
  /**
   * Sper: for each member, their most recent NON-EXPIRED check-in.
   * Members with no active check-in appear with null states.
   */
  async sper(exec, circleId) {
    const members = await exec.select({ userId: circleMemberships.userId, name: users.name, avatarUrl: users.avatarUrl }).from(circleMemberships).innerJoin(users, eq11(users.id, circleMemberships.userId)).where(eq11(circleMemberships.circleId, circleId));
    if (members.length === 0) return [];
    const memberIds = members.map((m) => m.userId);
    const active = await exec.select().from(checkins).where(
      and7(
        eq11(checkins.circleId, circleId),
        inArray2(checkins.userId, memberIds),
        gt2(checkins.expiresAt, /* @__PURE__ */ new Date())
      )
    ).orderBy(desc2(checkins.createdAt));
    const latest = /* @__PURE__ */ new Map();
    for (const c of active) {
      if (!latest.has(c.userId)) latest.set(c.userId, c);
    }
    return members.map(({ userId, name, avatarUrl }) => {
      const c = latest.get(userId);
      if (!c) {
        return {
          user_id: userId,
          name,
          avatar_url: avatarUrl ?? null,
          checkin_id: null,
          spiritual_state: null,
          physical_state: null,
          emotional_state: null,
          vocational_state: null,
          relational_state: null,
          created_at: null
        };
      }
      return {
        user_id: userId,
        name,
        avatar_url: avatarUrl ?? null,
        checkin_id: c.id,
        spiritual_state: c.spiritualState,
        physical_state: c.physicalState,
        emotional_state: c.emotionalState,
        vocational_state: c.vocationalState,
        relational_state: c.relationalState,
        created_at: c.createdAt.toISOString()
      };
    });
  }
  /**
   * Active Care Cards: for each member currently flagged Heavy/In the Pit on
   * their latest non-expired check-in, the flagged dimensions, note, and the
   * verse from the distress notification. Visible to any circle member.
   *
   * Also layers in the caller's own gratitude state for each card: if the
   * check-in's author has thanked them and this is the first fetch since,
   * `gratitude_shown` fires once (and is recorded as seen right here) so the
   * client can drop the card from the main dashboard afterward while
   * `gratitude_received` stays true for as long as the card exists, for the
   * detail view reached via the member's avatar.
   */
  async careCards(exec, circleId, callerId) {
    const active = await exec.select().from(checkins).where(and7(eq11(checkins.circleId, circleId), gt2(checkins.expiresAt, /* @__PURE__ */ new Date()))).orderBy(desc2(checkins.createdAt));
    const latest = /* @__PURE__ */ new Map();
    for (const c of active) {
      if (!latest.has(c.userId)) latest.set(c.userId, c);
    }
    const cards = [];
    for (const c of latest.values()) {
      const dims = [
        ["spiritual", c.spiritualState],
        ["physical", c.physicalState],
        ["emotional", c.emotionalState],
        ["vocational", c.vocationalState],
        ["relational", c.relationalState]
      ];
      const flagged = dims.filter(([, s]) => isDistress(s)).map(([d]) => d);
      if (flagged.length === 0) continue;
      const [author] = await exec.select({ name: users.name }).from(users).where(eq11(users.id, c.userId)).limit(1);
      const [notif] = await exec.select({ verse: circleNotifications.verse }).from(circleNotifications).where(eq11(circleNotifications.checkinId, c.id)).limit(1);
      let gratitudeShown;
      let gratitudeReceived;
      if (callerId !== c.userId) {
        const [grat] = await exec.select().from(careGratitudes).where(and7(eq11(careGratitudes.checkinId, c.id), eq11(careGratitudes.responderId, callerId))).limit(1);
        if (grat) {
          gratitudeReceived = true;
          if (!grat.seenAt) {
            gratitudeShown = true;
            await exec.update(careGratitudes).set({ seenAt: /* @__PURE__ */ new Date() }).where(eq11(careGratitudes.id, grat.id));
          }
        }
      }
      cards.push({
        checkin_id: c.id,
        target_user_id: c.userId,
        target_name: author?.name ?? "A friend",
        flagged_dimensions: flagged,
        optional_note: c.optionalNote ?? null,
        verse: notif?.verse ?? null,
        created_at: c.createdAt.toISOString(),
        ...gratitudeShown !== void 0 ? { gratitude_shown: gratitudeShown } : {},
        ...gratitudeReceived !== void 0 ? { gratitude_received: gratitudeReceived } : {}
      });
    }
    return cards;
  }
};
var checkInRepo = new CheckInRepo();

// src/modules/checkins/checkins.service.ts
var CheckInService = class {
  constructor(repo = checkInRepo, notifications = circleNotificationService, database = db) {
    this.repo = repo;
    this.notifications = notifications;
    this.database = database;
  }
  repo;
  notifications;
  database;
  /**
   * Core loop. In ONE transaction:
   *   1. Guard membership + pact.
   *   2. Insert the check-in.
   *   3. Un-pause the submitter (GAP #5: a returning user must not stay silenced).
   *   4. If any state is Heavy/In the Pit, create the CircleNotification record.
   * After commit, physically deliver the distress alert (failure never rolls
   * back a valid check-in).
   */
  async submit(input) {
    if (input.optional_note !== void 0 && input.optional_note.length > 140) {
      throw new ValidationError("optional_note exceeds 140 characters");
    }
    const flagged = this.anyDistress(input);
    const { checkinRow, broadcast, notificationRow } = await this.database.transaction(
      async (tx) => {
        const isMember = await this.repo.isMember(tx, input.circleId, input.userId);
        if (!isMember) {
          throw new ForbiddenError("Not a member of this circle");
        }
        const agreed = await this.repo.hasAgreedPact(tx, input.circleId, input.userId);
        if (!agreed) {
          throw new ForbiddenError("Circle pact must be agreed before checking in");
        }
        const now = /* @__PURE__ */ new Date();
        const checkinRow2 = await this.repo.insert(tx, {
          userId: input.userId,
          circleId: input.circleId,
          spiritualState: input.spiritual_state,
          physicalState: input.physical_state,
          emotionalState: input.emotional_state,
          vocationalState: input.vocational_state,
          relationalState: input.relational_state,
          ...input.optional_note !== void 0 ? { optionalNote: input.optional_note } : {}
        });
        await tx.update(users).set({ lastCheckinAt: now, notificationsPaused: false }).where(eq12(users.id, input.userId));
        let broadcast2 = null;
        if (flagged) {
          broadcast2 = await this.notifications.createDistressNotification(tx, {
            checkinId: checkinRow2.id,
            targetUserId: input.userId,
            circleId: input.circleId
          });
        }
        return {
          checkinRow: checkinRow2,
          broadcast: broadcast2,
          notificationRow: broadcast2?.notification ?? null
        };
      }
    );
    if (broadcast) {
      await this.notifications.deliver(broadcast);
    }
    const response = {
      checkin: toCheckInDTO(checkinRow)
    };
    if (notificationRow) {
      response.notification = toCircleNotificationDTO(notificationRow);
    }
    return response;
  }
  /** Current sper for a circle. Caller-membership enforced at the HTTP layer. */
  async sper(circleId, callerId) {
    const isMember = await this.repo.isMember(this.database, circleId, callerId);
    if (!isMember) throw new ForbiddenError("Not a member of this circle");
    return this.repo.sper(this.database, circleId);
  }
  /** Active Care Cards for the circle. Caller must be a member. */
  async careCards(circleId, callerId) {
    const isMember = await this.repo.isMember(this.database, circleId, callerId);
    if (!isMember) throw new ForbiddenError("Not a member of this circle");
    return this.repo.careCards(this.database, circleId, callerId);
  }
  anyDistress(input) {
    const states = [
      input.spiritual_state,
      input.physical_state,
      input.emotional_state,
      input.vocational_state,
      input.relational_state
    ];
    return states.some((s) => isDistress(s));
  }
};
var checkInService = new CheckInService();

// src/modules/checkins/checkins.routes.ts
var stateEnum = z4.enum(STATE_LEVELS);
var submitSchema = z4.object({
  circle_id: z4.string().uuid(),
  spiritual_state: stateEnum,
  physical_state: stateEnum,
  emotional_state: stateEnum,
  vocational_state: stateEnum,
  relational_state: stateEnum,
  optional_note: z4.string().max(140).optional()
});
var idParam2 = z4.object({ id: z4.string().uuid() });
async function checkinRoutes(app) {
  app.addHook("preHandler", requireAuth);
  app.post("/checkins", async (req, reply) => {
    const body = submitSchema.parse(req.body);
    const result = await checkInService.submit({
      userId: currentUserId(req),
      circleId: body.circle_id,
      spiritual_state: body.spiritual_state,
      physical_state: body.physical_state,
      emotional_state: body.emotional_state,
      vocational_state: body.vocational_state,
      relational_state: body.relational_state,
      ...body.optional_note !== void 0 ? { optional_note: body.optional_note } : {}
    });
    return reply.code(201).send(result);
  });
  app.get("/circles/:id/sper", async (req, reply) => {
    const { id } = idParam2.parse(req.params);
    const sper = await checkInService.sper(id, currentUserId(req));
    return reply.code(200).send({ sper });
  });
  app.get("/circles/:id/care-cards", async (req, reply) => {
    const { id } = idParam2.parse(req.params);
    const care_cards = await checkInService.careCards(id, currentUserId(req));
    return reply.code(200).send({ care_cards });
  });
}

// src/modules/touchpoints/touchpoints.routes.ts
import { z as z5 } from "zod";
var typeEnum = z5.enum(TOUCHPOINT_TYPES);
var logSchema = z5.object({ type: typeEnum });
var idParam3 = z5.object({ id: z5.string().uuid() });
async function touchpointRoutes(app) {
  app.addHook("preHandler", requireAuth);
  app.post("/checkins/:id/touchpoints", async (req, reply) => {
    const { id } = idParam3.parse(req.params);
    const { type } = logSchema.parse(req.body);
    const responderId = currentUserId(req);
    const responder = await authRepo.findById(db, responderId);
    if (!responder) throw new NotFoundError("User not found");
    const touchpoint = await touchpointService.log({
      checkinId: id,
      responderId,
      responderName: responder.name,
      type
    });
    return reply.code(201).send({ touchpoint });
  });
  app.get("/checkins/:id/touchpoints", async (req, reply) => {
    const { id } = idParam3.parse(req.params);
    const touchpoints = await touchpointService.list(id, currentUserId(req));
    return reply.code(200).send({ touchpoints });
  });
}

// src/modules/gratitude/gratitude.routes.ts
import { z as z6 } from "zod";

// src/modules/gratitude/gratitude.repo.ts
import { and as and8, eq as eq13, isNull as isNull2 } from "drizzle-orm";
var GratitudeRepo = class {
  /** Resolve the circle + author of a check-in (who's allowed to say thanks). */
  async checkinContext(exec, checkinId) {
    const [row] = await exec.select({ circleId: checkins.circleId, targetUserId: checkins.userId }).from(checkins).where(eq13(checkins.id, checkinId)).limit(1);
    return row ?? null;
  }
  /** Distinct responders on this check-in who haven't been thanked yet. */
  async unthankedResponderIds(exec, checkinId) {
    const rows = await exec.selectDistinct({ responderId: touchpointLogs.responderId }).from(touchpointLogs).leftJoin(
      careGratitudes,
      and8(
        eq13(careGratitudes.checkinId, touchpointLogs.checkinId),
        eq13(careGratitudes.responderId, touchpointLogs.responderId)
      )
    ).where(and8(eq13(touchpointLogs.checkinId, checkinId), isNull2(careGratitudes.id)));
    return rows.map((r) => r.responderId);
  }
  async insertMany(exec, checkinId, responderIds) {
    if (responderIds.length === 0) return;
    await exec.insert(careGratitudes).values(responderIds.map((responderId) => ({ checkinId, responderId })));
  }
};
var gratitudeRepo = new GratitudeRepo();

// src/modules/gratitude/gratitude.service.ts
var GratitudeService = class {
  constructor(repo = gratitudeRepo, database = db) {
    this.repo = repo;
    this.database = database;
  }
  repo;
  database;
  /**
   * Only the check-in's own author may say thanks, and only to responders
   * not already thanked for it — a repeat "Thank you!" reaches whoever
   * responded since the last one, never re-thanking the same person twice.
   */
  async send(checkinId, callerId) {
    return this.database.transaction(async (tx) => {
      const ctx = await this.repo.checkinContext(tx, checkinId);
      if (!ctx) throw new NotFoundError("Check-in not found");
      if (ctx.targetUserId !== callerId) {
        throw new ForbiddenError("Only the check-in author can send thanks");
      }
      const responderIds = await this.repo.unthankedResponderIds(tx, checkinId);
      await this.repo.insertMany(tx, checkinId, responderIds);
      return { thanked: responderIds.length };
    });
  }
};
var gratitudeService = new GratitudeService();

// src/modules/gratitude/gratitude.routes.ts
var idParam4 = z6.object({ id: z6.string().uuid() });
async function gratitudeRoutes(app) {
  app.addHook("preHandler", requireAuth);
  app.post("/checkins/:id/gratitude", async (req, reply) => {
    const { id } = idParam4.parse(req.params);
    const result = await gratitudeService.send(id, currentUserId(req));
    return reply.code(201).send(result);
  });
}

// src/modules/users/users.routes.ts
import { z as z7 } from "zod";
var platformEnum = z7.enum(DEVICE_PLATFORMS);
var registerSchema2 = z7.object({ token: z7.string().min(1), platform: platformEnum });
var checkinFrequencyEnum = z7.enum(CHECKIN_FREQUENCIES);
var updateProfileSchema = z7.object({
  notifications_paused: z7.boolean().optional(),
  timezone: z7.string().min(1).optional(),
  checkin_frequency: checkinFrequencyEnum.optional()
});
async function userRoutes(app) {
  app.addHook("preHandler", requireAuth);
  app.get("/users/me", async (req) => {
    const user = await authRepo.findById(db, currentUserId(req));
    if (!user) throw new NotFoundError("Account no longer exists");
    return { user: toUserDTO(user) };
  });
  app.patch("/users/me", async (req) => {
    const body = updateProfileSchema.parse(req.body);
    const user = await authRepo.updateProfile(db, currentUserId(req), {
      ...body.notifications_paused !== void 0 ? { notificationsPaused: body.notifications_paused } : {},
      ...body.timezone !== void 0 ? { timezone: body.timezone } : {},
      ...body.checkin_frequency !== void 0 ? { checkinFrequency: body.checkin_frequency } : {}
    });
    return { user: toUserDTO(user) };
  });
  app.post("/devices", async (req, reply) => {
    const { token, platform } = registerSchema2.parse(req.body);
    const row = await deviceRepo.register(currentUserId(req), token, platform);
    return reply.code(201).send({ device: { id: row.id, platform: row.platform } });
  });
}

// src/app.ts
async function buildApp() {
  wireDelivery();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.setErrorHandler(errorHandler);
  app.get("/health", async () => ({ status: "ok" }));
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(circleRoutes);
      await api.register(checkinRoutes);
      await api.register(touchpointRoutes);
      await api.register(gratitudeRoutes);
      await api.register(userRoutes);
    },
    { prefix: "/api/v1" }
  );
  return app;
}

// vercel-fn.ts
var appPromise;
function getApp() {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}
async function handler(req, res) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
export {
  handler as default
};
