import nodemailer from "nodemailer";

let emailTransporter;

function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;

  if ((process.env.SMTP_ENABLED || "false") !== "true") {
    return null;
  }

  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return emailTransporter;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Connector request failed ${res.status}: ${text}`);
  }
}

export async function sendInApp(notification, context = {}) {
  return {
    ok: true,
    channel: "IN_APP",
    notificationId: notification.id,
    context
  };
}

export async function sendEmail(notification, context = {}) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return { ok: true, channel: "EMAIL", skipped: "SMTP_DISABLED", context };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || "noreply@lifehub.local",
    to: context.emailTo || process.env.NOTIF_FALLBACK_EMAIL || "fallback@lifehub.local",
    subject: `[${notification.priority}] ${notification.event_type}`,
    text: notification.content || ""
  });

  return { ok: true, channel: "EMAIL" };
}

export async function sendSms(notification, context = {}) {
  const endpoint = process.env.SMS_GATEWAY_URL;
  if (!endpoint) {
    return { ok: true, channel: "SMS", skipped: "SMS_GATEWAY_DISABLED", context };
  }

  await postJson(
    endpoint,
    {
      to: context.phoneTo || process.env.NOTIF_FALLBACK_PHONE || "",
      message: `[${notification.event_type}] ${notification.content}`
    },
    process.env.SMS_GATEWAY_TOKEN
      ? { Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN}` }
      : {}
  );

  return { ok: true, channel: "SMS" };
}

export async function sendPush(notification, context = {}) {
  const endpoint = process.env.PUSH_GATEWAY_URL;
  if (!endpoint) {
    return { ok: true, channel: "PUSH", skipped: "PUSH_GATEWAY_DISABLED", context };
  }

  await postJson(
    endpoint,
    {
      userId: context.userId,
      title: notification.event_type,
      body: notification.content
    },
    process.env.PUSH_GATEWAY_TOKEN
      ? { Authorization: `Bearer ${process.env.PUSH_GATEWAY_TOKEN}` }
      : {}
  );

  return { ok: true, channel: "PUSH" };
}

export async function deliverByChannel(channelName, notification, context = {}) {
  switch (channelName) {
    case "IN_APP":
      return sendInApp(notification, context);
    case "EMAIL":
      return sendEmail(notification, context);
    case "SMS":
      return sendSms(notification, context);
    case "PUSH":
      return sendPush(notification, context);
    default:
      throw new Error(`Unsupported notification channel: ${channelName}`);
  }
}
