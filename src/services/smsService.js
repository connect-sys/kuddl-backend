import twilio from "twilio";

export function sendOtpSms(env, phone, otp) {
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client.messages.create({
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    to: phone,
    body: `Kuddl by TenderNest: Your OTP is ${otp}. Valid for 5 minutes.`
  });
}
