import { addCorsHeaders } from '../utils/cors.js';

// Complete provider verification
export async function completeVerification(request, env) {
    try {
      const { providerId } = await request.json();

      if (!providerId) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Provider ID is required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Check if provider exists and get current status
      const provider = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ?'
      ).bind(providerId).first();

      if (!provider) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Provider not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Check profile completeness using the same field list as profile completion calculation
      const requiredFields = [
        'first_name', 'last_name', 'email', 'phone', 'gender', 'date_of_birth',
        'pincode', 'address', 'city', 'state', 'area', 'service_categories',
        'specific_services', 'age_groups', 'experience_years', 'languages',
        'description', 'qualifications', 'serviceable_pincodes',
        'account_holder_name', 'account_number', 'ifsc_code', 'bank_name', 'account_type'
      ];

      const missingFields = [];
      requiredFields.forEach(field => {
        const value = provider[field];
        if (!value || value === '' || value === 0 || value === 'New' || value === 'Partner' || 
            String(value).includes('@temp.kuddl.com')) {
          missingFields.push(field);
        }
      });

      const profileComplete = missingFields.length === 0;

      if (!profileComplete) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Profile is not complete. Please complete all required fields.',
          missingFields: {
            firstName: !provider.first_name,
            email: !provider.email,
            city: !provider.city,
            state: !provider.state,
            businessName: !provider.business_name,
            experience: !provider.experience_years,
            description: !provider.description,
            address: !provider.address,
            pincode: !provider.pincode
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Check document verification status
      const documents = await env.KUDDL_DB.prepare(`
        SELECT document_type, verification_status 
        FROM document_verifications 
        WHERE provider_id = ? AND verification_status = 'verified'
      `).bind(providerId).all();

      const requiredDocs = ['pan_card', 'aadhaar_card', 'cancelled_cheque'];
      const verifiedDocs = documents.results.map(doc => doc.document_type);
      const missingDocs = requiredDocs.filter(doc => !verifiedDocs.includes(doc));

      if (missingDocs.length > 0) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Not all required documents are verified',
          missingDocuments: missingDocs
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Update provider status to verified
      await env.KUDDL_DB.prepare(`
        UPDATE providers 
        SET kyc_status = 'verified', 
            is_active = 1,
            updated_at = ?
        WHERE id = ?
      `).bind(new Date().toISOString(), providerId).run();

      // Log verification completion
      console.log(`✅ Provider ${providerId} verification completed`);

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Provider verification completed successfully',
        provider: {
          id: providerId,
          status: 'verified',
          verifiedAt: new Date().toISOString()
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (error) {
      console.error('Error completing verification:', error);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to complete verification',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
}

// Get provider verification status
export async function getVerificationStatus(request, env) {
    try {
      const url = new URL(request.url);
      const providerId = url.pathname.split('/').pop();

      if (!providerId) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Provider ID is required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Get provider details
      const provider = await env.KUDDL_DB.prepare(
        'SELECT * FROM providers WHERE id = ?'
      ).bind(providerId).first();

      if (!provider) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Provider not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Check profile completeness (comprehensive check matching frontend)
      const profileFields = {
        firstName: !!provider.first_name,
        lastName: !!provider.last_name,
        email: !!provider.email,
        phone: !!provider.phone,
        dateOfBirth: !!provider.date_of_birth,
        gender: !!provider.gender,
        address: !!provider.address,
        city: !!provider.city,
        state: !!provider.state,
        pincode: !!provider.pincode,
        serviceCategories: !!provider.service_categories,
        specificServices: !!provider.specific_services,
        ageGroups: !!provider.age_groups,
        experienceYears: !!provider.experience_years,
        languages: !!provider.languages,
        description: !!provider.description,
        accountHolderName: !!provider.account_holder_name,
        bankName: !!provider.bank_name,
        accountNumber: !!provider.account_number,
        ifscCode: !!provider.ifsc_code,
        // Document fields
        profileImageUrl: !!provider.profile_image_url
      };

      const profileComplete = Object.values(profileFields).every(field => field);
      const profileCompletionPercentage = Math.round(
        (Object.values(profileFields).filter(field => field).length / Object.keys(profileFields).length) * 100
      );

      // Get document verification status
      const documents = await env.KUDDL_DB.prepare(`
        SELECT document_type, verification_status, document_url, created_at
        FROM document_verifications 
        WHERE provider_id = ?
      `).bind(providerId).all();

      const documentStatus = {
        pan_card: documents.results.find(doc => doc.document_type === 'pan_card')?.verification_status || 'pending',
        aadhaar_card: documents.results.find(doc => doc.document_type === 'aadhaar_card')?.verification_status || 'pending',
        cancelled_cheque: documents.results.find(doc => doc.document_type === 'cancelled_cheque')?.verification_status || 'pending'
      };

      const documentsComplete = Object.values(documentStatus).every(status => status === 'verified');

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        data: {
          providerId,
          kycStatus: provider.kyc_status,
          isActive: provider.is_active,
          profileComplete,
          profileCompletionPercentage,
          profileFields,
          documentsComplete,
          documentStatus,
          canCompleteVerification: profileComplete && documentsComplete,
          lastUpdated: provider.updated_at
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (error) {
      console.error('Error getting verification status:', error);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to get verification status',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
}

// Update document verification status
export async function updateDocumentVerification(request, env) {
    try {
      const { providerId, documentType, status, adminNotes } = await request.json();

      if (!providerId || !documentType || !status) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Provider ID, document type, and status are required'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      const validStatuses = ['pending', 'verified', 'rejected', 'needs_review'];
      if (!validStatuses.includes(status)) {
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      // Update document verification status
      await env.KUDDL_DB.prepare(`
        UPDATE document_verifications 
        SET verification_status = ?, 
            admin_notes = ?,
            verified_at = ?,
            updated_at = ?
        WHERE provider_id = ? AND document_type = ?
      `).bind(
        status,
        adminNotes || null,
        status === 'verified' ? new Date().toISOString() : null,
        new Date().toISOString(),
        providerId,
        documentType
      ).run();

      return addCorsHeaders(new Response(JSON.stringify({
        success: true,
        message: 'Document verification status updated successfully',
        data: {
          providerId,
          documentType,
          status,
          updatedAt: new Date().toISOString()
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (error) {
      console.error('Error updating document verification:', error);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Failed to update document verification',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
}
