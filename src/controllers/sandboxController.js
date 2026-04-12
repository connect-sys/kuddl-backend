import { createApiResponse } from '../utils/cors.js';

// Helper function to authenticate with Sandbox API and get JWT token
async function getSandboxAccessToken(env) {
  try {
    console.log('🔐 [Sandbox] Authenticating with API...');
    console.log('🔐 [Sandbox] Base URL:', env.SANDBOX_BASE_URL);
    console.log('🔐 [Sandbox] API Key:', env.SANDBOX_APPID ? `${env.SANDBOX_APPID.substring(0, 15)}...` : 'MISSING');
    console.log('🔐 [Sandbox] API Secret:', env.SANDBOX_SECRET ? `${env.SANDBOX_SECRET.substring(0, 15)}...` : 'MISSING');
    
    const response = await fetch(`${env.SANDBOX_BASE_URL}/authenticate`, {
      method: 'POST',
      headers: {
        'x-api-key': env.SANDBOX_APPID,
        'x-api-secret': env.SANDBOX_SECRET,
        'x-api-version': '1.0'
      }
    });

    const data = await response.json();
    console.log('🔐 [Sandbox] Auth response status:', response.status);
    console.log('🔐 [Sandbox] Auth response data:', JSON.stringify(data, null, 2));
    
    if (response.ok && data.data?.access_token) {
      console.log('✅ [Sandbox] Authentication successful');
      return data.data.access_token;
    } else {
      console.error('❌ [Sandbox] Authentication failed:', data);
      throw new Error(`Authentication failed: ${data.message || JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error('💥 [Sandbox] Authentication error:', error);
    throw error;
  }
}

// Helper function to create Sandbox API headers with JWT token
async function getSandboxHeaders(env) {
  const accessToken = await getSandboxAccessToken(env);
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'x-api-key': env.SANDBOX_APPID,
    'x-api-version': '1.0'
  };
}

/**
 * AADHAAR OTP SEND - Send OTP for Aadhaar verification
 */
export async function sendAadhaarOtp(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    const { aadhaar_number } = await request.json();
    if (!aadhaar_number || aadhaar_number.length !== 12) {
      return createApiResponse({ error: 'Valid 12-digit Aadhaar number is required' }, 400);
    }

    const isTestMode = env.SANDBOX_API_TEST_MODE === 'true';
    console.log('🔍 SANDBOX_API_TEST_MODE value:', env.SANDBOX_API_TEST_MODE, 'type:', typeof env.SANDBOX_API_TEST_MODE);
    console.log('🔍 isTestMode:', isTestMode);
    console.log('🔍 All env vars:', Object.keys(env));

    if (isTestMode) {
      console.log('🧪 [Test Mode] Sending Aadhaar OTP for provider:', providerId);

      // Test mode - simulate successful OTP send for any valid 12-digit Aadhaar number
      const testRequestId = `TEST_${providerId}_${Date.now()}`;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      return createApiResponse({
        success: true,
        message: 'OTP sent successfully (Test Mode)',
        request_id: testRequestId,
        test_mode: true,
        data: {
          reference_id: testRequestId,
          message: 'Test OTP sent. Use 123456 for verification.',
          aadhaar_masked: `****-****-${aadhaar_number.slice(-4)}`
        }
      });
    } else {
      console.log('🔴 [Live Mode] Sending Aadhaar OTP for provider:', providerId);

      try {
        // First, get the access token for authorization
        const accessToken = await getSandboxAccessToken(env);
        
        // Live mode - make actual API call to Sandbox API
        const response = await fetch(`${env.SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp`, {
          method: 'POST',
          headers: {
            'Authorization': accessToken, // Just the token, no "Bearer" prefix for Sandbox API
            'x-api-key': env.SANDBOX_APPID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.otp.request',
            aadhaar_number: String(aadhaar_number), // Ensure string as per API docs
            consent: 'Y',
            reason: 'For KYC verification'
          })
        });

        const data = await response.json();
        console.log('🔍 Sandbox API Response:', JSON.stringify(data, null, 2));

        // Check for successful response (Sandbox API returns code: 200)
        if (data.code === 200 && data.data) {
          return createApiResponse({
            success: true,
            message: 'OTP sent successfully',
            request_id: String(data.data.reference_id), // Convert to string for consistency
            test_mode: false,
            data: {
              reference_id: String(data.data.reference_id), // Convert to string for consistency
              message: data.data.message || 'OTP sent successfully',
              aadhaar_masked: `****-****-${aadhaar_number.slice(-4)}`,
              transaction_id: data.transaction_id
            }
          });
        } else {
          console.error('❌ Sandbox API Error:', data);
          return createApiResponse({
            success: false,
            message: data.message || data.error || 'Failed to send OTP'
          }, 400);
        }
      } catch (apiError) {
        console.error('❌ Sandbox API Call Error:', apiError);
        return createApiResponse({
          success: false,
          message: 'Failed to connect to verification service'
        }, 500);
      }
    }
  } catch (error) {
    console.error('💥 Aadhaar OTP send error:', error);
    return createApiResponse({ error: 'Failed to send OTP' }, 500);
  }
}

/**
 * AADHAAR OTP VERIFY - Verify OTP for Aadhaar verification
 */
export async function verifyAadhaarOtp(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    const { request_id, otp } = await request.json();
    if (!request_id || !otp) {
      return createApiResponse({ error: 'Request ID and OTP are required' }, 400);
    }

    const isTestMode = env.SANDBOX_API_TEST_MODE === 'true';

    if (isTestMode) {
      console.log('🧪 [Test Mode] Verifying Aadhaar OTP for provider:', providerId);

      // Test mode - accept 123456 as valid OTP for any TEST_ request ID
      if (request_id.startsWith('TEST_') && otp === '123456') {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return createApiResponse({
          success: true,
          message: 'Aadhaar verified successfully (Test Mode)',
          test_mode: true,
          aadhaar_data: {
            name: 'Test User',
            aadhaar_number: '****-****-0019',
            date_of_birth: '01-01-1990',
            gender: 'M',
            address: {
              house: 'Test House',
              street: 'Test Street',
              district: 'Test District',
              state: 'Test State',
              pincode: '123456',
              country: 'India'
            },
            full_address: 'Test House, Test Street, Test District, Test State - 123456',
            status: 'VALID',
            care_of: 'S/O: Test Father',
            photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigD/9k='
          },
          verification_status: 'verified'
        });
      } else {
        return createApiResponse({
          success: false,
          message: 'Invalid OTP. For test mode, use OTP: 123456'
        }, 400);
      }
    } else {
      console.log('🔴 [Live Mode] Verifying Aadhaar OTP for provider:', providerId);

      try {
        // First, get the access token for authorization
        const accessToken = await getSandboxAccessToken(env);
        
        const requestBody = {
          '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.otp.verify.request',
          reference_id: String(request_id), // Convert to string as per API docs
          otp: String(otp) // Convert to string as per API docs
        };
        
        console.log('🔍 Sandbox API Verify Request Body:', JSON.stringify(requestBody, null, 2));
        console.log('🔍 Sandbox API Verify Headers:', {
          'Authorization': `${accessToken.substring(0, 20)}...`, // Log partial token for debugging
          'x-api-key': env.SANDBOX_APPID,
          'x-api-version': '1.0',
          'Content-Type': 'application/json'
        });
        
        // Live mode - make actual API call to Sandbox API
        const response = await fetch(`${env.SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp/verify`, {
          method: 'POST',
          headers: {
            'Authorization': accessToken, // Just the token, no "Bearer" prefix for Sandbox API
            'x-api-key': env.SANDBOX_APPID,
            'x-api-version': '1.0',
          },
          body: JSON.stringify(requestBody)
        });
        console.log('🔍 Sandbox API Verify Response:', response);

        const data = await response.json();
        console.log('🔍 Sandbox API Verify Response Status:', response.status);
        console.log('🔍 Sandbox API Verify Response:', JSON.stringify(data, null, 2));

        // Check for successful response (Sandbox API returns code: 200)
        if (response.ok && data.code === 200) {
          return createApiResponse({
            success: true,
            message: 'Aadhaar verified successfully',
            test_mode: false,
            aadhaar_data: data.data,
            verification_status: 'verified',
            transaction_id: data.transaction_id
          });
        } else {
          return createApiResponse({
            success: false,
            message: data.message || 'OTP verification failed'
          }, 400);
        }
          
          
      } catch (apiError) {
        console.error('❌ Sandbox API Verify Call Error:', apiError);
        return createApiResponse({
          success: false,
          message: 'Failed to connect to verification service'
        }, 500);
      }
    }
  } catch (error) {
    console.error('💥 Aadhaar OTP verification error:', error);
    return createApiResponse({ error: 'Failed to verify OTP' }, 500);
  }
}

/**
 * PAN VERIFICATION - Verify PAN using Sandbox
 */
export async function verifyPan(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    const { pan_number, name } = await request.json();
    if (!pan_number || !name) {
      return createApiResponse({ error: 'PAN number and name are required' }, 400);
    }

    console.log('🚀 [Sandbox] Verifying PAN for provider:', providerId);

    const headers = await getSandboxHeaders(env);
    
    // Call Sandbox PAN Verification API
    const response = await fetch(`${env.SANDBOX_BASE_URL}/kyc/pan/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id_number: pan_number,
        name: name
      })
    });

    const data = await response.json();
    console.log('📋 [Sandbox] PAN verification response:', { status: response.status, data });

    if (response.ok && data.success) {
      return createApiResponse({
        success: true,
        message: 'PAN verified successfully',
        pan_data: data.data,
        verification_status: 'verified'
      });
    } else {
      return createApiResponse({
        success: false,
        message: data.message || 'PAN verification failed'
      }, 400);
    }
  } catch (error) {
    console.error('💥 [Sandbox] PAN verification error:', error);
    return createApiResponse({ error: 'Failed to verify PAN' }, 500);
  }
}

/**
 * GST VERIFICATION - Verify GST using Sandbox
 */
export async function verifyGst(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    const { gst_number } = await request.json();
    if (!gst_number || gst_number.length !== 15) {
      return createApiResponse({ error: 'Valid 15-character GST number is required' }, 400);
    }

    console.log('🚀 [Sandbox] Verifying GST for provider:', providerId);

    const headers = await getSandboxHeaders(env);
    
    // Call Sandbox GST Verification API
    const response = await fetch(`${env.SANDBOX_BASE_URL}/kyc/gst/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id_number: gst_number
      })
    });

    const data = await response.json();
    console.log('📋 [Sandbox] GST verification response:', { status: response.status, data });

    if (response.ok && data.success) {
      return createApiResponse({
        success: true,
        message: 'GST verified successfully',
        gst_data: data.data,
        verification_status: 'verified'
      });
    } else {
      return createApiResponse({
        success: false,
        message: data.message || 'GST verification failed'
      }, 400);
    }
  } catch (error) {
    console.error('💥 [Sandbox] GST verification error:', error);
    return createApiResponse({ error: 'Failed to verify GST' }, 500);
  }
}

/**
 * BANK ACCOUNT VERIFICATION - Verify bank account using Sandbox
 */
export async function verifyBankAccount(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    const { ifsc_code, account_number, account_holder_name, phone } = await request.json();
    if (!ifsc_code || !account_number || !account_holder_name) {
      return createApiResponse({ error: 'IFSC code, account number, and account holder name are required' }, 400);
    }

    console.log('🚀 [Sandbox] Verifying bank account for provider:', providerId);

    const headers = await getSandboxHeaders(env);
    
    // Call Sandbox Bank Account Verification API
    const response = await fetch(`${env.SANDBOX_BASE_URL}/kyc/bank_account/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ifsc: ifsc_code,
        account_number: account_number,
        name: account_holder_name,
        phone: phone || '9999999999'
      })
    });

    const data = await response.json();
    console.log('📋 [Sandbox] Bank verification response:', { status: response.status, data });

    if (response.ok && data.success) {
      return createApiResponse({
        success: true,
        message: 'Bank account verified successfully',
        bank_data: data.data,
        verification_status: 'verified'
      });
    } else {
      return createApiResponse({
        success: false,
        message: data.message || 'Bank account verification failed'
      }, 400);
    }
  } catch (error) {
    console.error('💥 [Sandbox] Bank verification error:', error);
    return createApiResponse({ error: 'Failed to verify bank account' }, 500);
  }
}

/**
 * GET KYC STATUS - Get current KYC verification status for provider
 */
export async function getKycStatus(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    console.log('🔍 [KYC] Getting status for provider:', providerId);

    // Get provider kyc_status from database
    const provider = await env.KUDDL_DB.prepare(`
      SELECT kyc_status FROM providers WHERE id = ?
    `).bind(providerId).first();

    if (!provider) {
      return createApiResponse({ error: 'Provider not found' }, 404);
    }

    console.log('✅ [KYC] Status retrieved:', provider.kyc_status);

    return createApiResponse({
      success: true,
      kyc_status: provider.kyc_status || 'pending'
    });
  } catch (error) {
    console.error('💥 [KYC] Get status error:', error);
    return createApiResponse({ error: 'Failed to get KYC status' }, 500);
  }
}

/**
 * IFSC CODE LOOKUP - Lookup bank details by IFSC code
 */
export async function lookupIfsc(request, env) {
  try {
    const providerId = request.user?.id;
    if (!providerId) return createApiResponse({ error: 'Unauthorized' }, 401);

    // Get IFSC code from params (passed from worker.js)
    const ifscCode = request.params?.ifsc?.toUpperCase();

    if (!ifscCode || ifscCode.length !== 11) {
      return createApiResponse({ error: 'Valid 11-character IFSC code is required' }, 400);
    }

    console.log('🚀 [IFSC] Looking up IFSC:', ifscCode, 'for provider:', providerId);

    // Use free Razorpay IFSC API (reliable and doesn't require authentication)
    try {
      console.log('🔄 [IFSC] Calling Razorpay IFSC API...');
      const response = await fetch(`https://ifsc.razorpay.com/${ifscCode}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [IFSC] Bank details found:', data);
        
        return createApiResponse({
          success: true,
          message: 'IFSC details found',
          data: {
            IFSC: data.IFSC,
            BANK: data.BANK,
            BRANCH: data.BRANCH,
            ADDRESS: data.ADDRESS,
            CITY: data.CITY,
            STATE: data.STATE,
            CONTACT: data.CONTACT || null
          }
        });
      } else {
        console.log('❌ [IFSC] Invalid IFSC code');
        return createApiResponse({
          success: false,
          message: 'Invalid IFSC code or bank details not found'
        }, 404);
      }
    } catch (error) {
      console.error('❌ [IFSC] API error:', error.message);
      return createApiResponse({
        success: false,
        message: 'Failed to lookup IFSC code. Please try again.'
      }, 500);
    }
  } catch (error) {
    console.error('💥 [IFSC] Lookup error:', error);
    return createApiResponse({
      success: false,
      message: 'Failed to lookup IFSC code. Please try again.'
    }, 500);
  }
}
