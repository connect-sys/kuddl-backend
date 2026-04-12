class TwilioService {
  constructor(env) {
    this.accountSid = env.TWILIO_ACCOUNT_SID;
    this.authToken = env.TWILIO_AUTH_TOKEN;
    this.verifyServiceSid = env.TWILIO_VERIFY_SERVICE_SID;
    this.testMode = env.TWILIO_TEST_MODE === 'true';
    this.baseUrl = `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}`;
  }

  async sendOTP(phoneNumber) {
    try {
      // In test mode, just return success without actually sending SMS
      if (this.testMode) {
        console.log(`[TEST MODE] Would send OTP to ${phoneNumber}`);
        return {
          sid: 'test_verification_sid',
          status: 'pending',
          to: phoneNumber,
          channel: 'sms'
        };
      }

      const auth = btoa(`${this.accountSid}:${this.authToken}`);
      
      const body = new URLSearchParams({
        To: phoneNumber,
        Channel: 'sms'
      });

      const response = await fetch(`${this.baseUrl}/Verifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Twilio Verify API error:', error);
        throw new Error(`Twilio Verify API error: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending OTP via Twilio Verify:', error);
      throw error;
    }
  }

  async verifyOTP(phoneNumber, code) {
    try {
      // In test mode, accept any 6-digit code
      if (this.testMode) {
        console.log(`[TEST MODE] Verifying OTP ${code} for ${phoneNumber}`);
        if (code && code.length === 6) {
          return {
            sid: 'test_verification_check_sid',
            status: 'approved',
            to: phoneNumber,
            channel: 'sms'
          };
        } else {
          return {
            status: 'denied'
          };
        }
      }

      const auth = btoa(`${this.accountSid}:${this.authToken}`);
      
      const body = new URLSearchParams({
        To: phoneNumber,
        Code: code
      });

      const response = await fetch(`${this.baseUrl}/VerificationCheck`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Twilio Verify Check API error:', error);
        throw new Error(`Twilio Verify Check API error: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error verifying OTP via Twilio Verify:', error);
      throw error;
    }
  }
}

export default TwilioService;
