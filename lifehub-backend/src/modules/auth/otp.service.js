import crypto from "node:crypto";
import prisma from "../../config/db.js";

function readNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const OTP_TTL_SECONDS = Math.max(readNumber(process.env.OTP_TTL_SECONDS, 300), 60);
const OTP_RESEND_COOLDOWN_SECONDS = Math.max(
  Math.min(
    readNumber(process.env.OTP_RESEND_COOLDOWN_SECONDS, 45),
    Math.max(OTP_TTL_SECONDS - 5, 15)
  ),
  15
);
const OTP_TTL_MS = OTP_TTL_SECONDS * 1000;
const OTP_RESEND_COOLDOWN_MS = OTP_RESEND_COOLDOWN_SECONDS * 1000;

function getOtpHashSecret() {
  const secret = process.env.OTP_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("OTP_HASH_SECRET or JWT_SECRET must be configured");
  }
  return secret;
}

function sanitizePhone(rawPhone) {
  return String(rawPhone || "").trim();
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function defaultCountryCodeDigits() {
  const raw = String(process.env.DEFAULT_PHONE_COUNTRY_CODE || "").trim();
  if (!raw) return "";
  return digitsOnly(raw);
}

function normalizeSmsDestination(phone, { requireE164 }) {
  const raw = sanitizePhone(phone);
  if (!raw) throw new Error("Phone is required");

  const digits = digitsOnly(raw);
  if (!digits || digits.length < 10 || digits.length > 15) {
    throw new Error("Phone must be 10 to 15 digits");
  }

  if (raw.startsWith("+")) {
    return `+${digits}`;
  }

  const defaultCode = defaultCountryCodeDigits();
  if (defaultCode && digits.length === 10) {
    return `+${defaultCode}${digits}`;
  }

  if (digits.length >= 11) {
    return `+${digits}`;
  }

  if (requireE164) {
    throw new Error(
      "Phone must include country code (example: +919000000001) or set DEFAULT_PHONE_COUNTRY_CODE"
    );
  }

  return raw;
}

function hashOtp({ phone, otp }) {
  const secret = getOtpHashSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`${phone}:${String(otp)}`)
    .digest("hex");
}

function safeStringEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function createOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

export function buildPhoneCandidates(rawPhone) {
  const phone = sanitizePhone(rawPhone);
  if (!phone) return [];

  const digits = digitsOnly(phone);
  const defaultCode = defaultCountryCodeDigits();
  const seen = new Set();
  const values = [];

  function push(value) {
    const text = sanitizePhone(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    values.push(text);
  }

  push(phone);
  if (digits) {
    push(digits);
    push(`+${digits}`);
  }
  if (defaultCode && digits.length === 10) {
    push(`${defaultCode}${digits}`);
    push(`+${defaultCode}${digits}`);
  }
  if (defaultCode && digits.startsWith(defaultCode) && digits.length > defaultCode.length) {
    const local = digits.slice(defaultCode.length);
    push(local);
    push(`+${local}`);
  }

  return values;
}

async function sendViaTwilio({ to, message }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio is not fully configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER."
    );
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: message
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let providerMessage = text;
    try {
      const parsed = JSON.parse(text || "{}");
      providerMessage = parsed?.message
        ? `${parsed.message}${parsed?.code ? ` (code ${parsed.code})` : ""}`
        : text;
    } catch {
      // keep raw text
    }
    throw new Error(`Twilio OTP send failed (${res.status}): ${providerMessage}`);
  }
}

async function sendViaGenericGateway({ to, message }) {
  const endpoint = process.env.SMS_GATEWAY_URL;
  if (!endpoint) {
    throw new Error(
      "SMS gateway is not configured. Set SMS_PROVIDER=TWILIO or provide SMS_GATEWAY_URL."
    );
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SMS_GATEWAY_TOKEN
        ? { Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN}` }
        : {})
    },
    body: JSON.stringify({
      to,
      message
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OTP SMS send failed (${res.status}): ${text}`);
  }
}

async function dispatchOtpSms(phone, otp) {
  const provider = String(process.env.SMS_PROVIDER || "").trim().toUpperCase();
  const ttlMinutes = Math.ceil(OTP_TTL_SECONDS / 60);
  const message = `Your LifeHub OTP is ${otp}. Valid for ${ttlMinutes} minute(s).`;

  if (provider === "TWILIO") {
    const to = normalizeSmsDestination(phone, { requireE164: true });
    try {
      await sendViaTwilio({ to, message });
    } catch (error) {
      if (process.env.SMS_GATEWAY_URL) {
        await sendViaGenericGateway({ to, message });
        return;
      }
      throw new Error(
        `${error.message}. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER and E.164 phone format.`
      );
    }
    return;
  }

  const to = normalizeSmsDestination(phone, { requireE164: false });
  await sendViaGenericGateway({ to, message });
}

export const sendOTP = async (rawPhone) => {
  const candidates = buildPhoneCandidates(rawPhone);
  if (!candidates.length) {
    throw new Error("Phone is required");
  }

  const user = await prisma.users.findFirst({
    where: {
      phone: { in: candidates }
    },
    select: {
      id: true,
      phone: true
    }
  });
  if (!user?.phone) {
    throw new Error("No account found for this phone number");
  }

  const canonicalPhone = String(user.phone);
  const now = new Date();
  const cooldownStart = new Date(Date.now() - OTP_RESEND_COOLDOWN_MS);

  const recent = await prisma.login_otps.findFirst({
    where: {
      phone: canonicalPhone,
      created_at: { gte: cooldownStart },
      expires_at: { gt: now }
    },
    orderBy: { created_at: "desc" }
  });
  if (recent) {
    throw new Error(
      `OTP already sent recently. Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before retrying.`
    );
  }

  const otp = createOtpCode();
  const otpHash = hashOtp({ phone: canonicalPhone, otp });

  await prisma.login_otps.deleteMany({
    where: { phone: canonicalPhone }
  });

  await prisma.login_otps.create({
    data: {
      phone: canonicalPhone,
      code: otpHash,
      expires_at: new Date(Date.now() + OTP_TTL_MS),
      created_at: now
    }
  });

  try {
    await dispatchOtpSms(canonicalPhone, otp);
  } catch (error) {
    await prisma.login_otps.deleteMany({
      where: { phone: canonicalPhone }
    });
    throw error;
  }
  return true;
};

export const verifyOTP = async (rawPhone, code) => {
  const normalizedCode = String(code || "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("OTP must be a 6-digit code");
  }

  const candidates = buildPhoneCandidates(rawPhone);
  if (!candidates.length) {
    throw new Error("Phone is required");
  }

  const record = await prisma.login_otps.findFirst({
    where: {
      phone: { in: candidates },
      expires_at: { gt: new Date() }
    },
    orderBy: { created_at: "desc" }
  });
  if (!record) {
    throw new Error("OTP expired or invalid");
  }

  const expectedHash = hashOtp({ phone: record.phone, otp: normalizedCode });
  const isValidHashed = safeStringEqual(expectedHash, record.code);
  const isValidLegacyPlaintext = safeStringEqual(String(record.code || ""), normalizedCode);
  if (!isValidHashed && !isValidLegacyPlaintext) {
    throw new Error("OTP expired or invalid");
  }

  await prisma.login_otps.deleteMany({
    where: { phone: record.phone }
  });

  return true;
};
