import prisma from "../../config/db.js";

async function dispatchOtpSms(phone, otp) {
  const endpoint = process.env.SMS_GATEWAY_URL;
  if (!endpoint) {
    console.log("OTP:", otp);
    return;
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
      to: phone,
      message: `Your LifeHub OTP is ${otp}. Valid for 5 minutes.`
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OTP SMS send failed (${res.status}): ${text}`);
  }
}

export const sendOTP = async (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await prisma.login_otps.create({
    data: {
      phone,
      code: otp,
      expires_at: new Date(Date.now() + 5 * 60 * 1000)
    }
  });

  await dispatchOtpSms(phone, otp);

  return true;
};

export const verifyOTP = async (phone, code) => {
  const record = await prisma.login_otps.findFirst({
    where: { phone, code }
  });

  if (!record || record.expires_at < new Date())
    throw new Error("OTP expired or invalid");

  await prisma.login_otps.delete({
    where: { id: record.id }
  });

  return true;
};
