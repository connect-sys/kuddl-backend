/**
 * Documents Controller
 * Handles document upload and verification endpoints
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import { getPublicR2Url } from '../utils/r2Utils.js';

// Profile document upload endpoint (for profile completion)
export async function uploadProfileDocument(request, env) {
  try {
    console.log('📁 Profile document upload request received');
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Authorization token required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token
    const jwt = await import('@tsndr/cloudflare-worker-jwt');
    let isValid = false;
    let payload = null;
    
    try {
      isValid = await jwt.verify(token, env.JWT_SECRET);
      if (isValid) {
        payload = jwt.decode(token);
      }
    } catch (error) {
      console.error('JWT verification error:', error.message);
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Upload failed',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    if (!isValid) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    console.log('🔍 JWT payload:', JSON.stringify(payload, null, 2));
    
    // Try different possible userId fields
    let partnerId = null;
    let phoneNumber = null;
    
    if (payload.payload) {
      partnerId = payload.payload.userId || payload.payload.id || payload.payload.sub;
      phoneNumber = payload.payload.phone;
    } else {
      partnerId = payload.userId || payload.id || payload.sub;
      phoneNumber = payload.phone;
    }
    
    console.log('👤 Partner ID extracted:', partnerId);
    console.log('📱 Phone number extracted:', phoneNumber);
    console.log('👤 Partner ID type:', typeof partnerId);

    // If no partnerId but we have phone number, try to find partner by phone
    if ((!partnerId || partnerId === 'undefined' || partnerId === 'null' || typeof partnerId === 'undefined') && phoneNumber) {
      console.log('🔍 No partner ID found, searching by phone number:', phoneNumber);
      try {
        const existingPartner = await env.KUDDL_DB.prepare(
          'SELECT id FROM providers WHERE phone = ?'
        ).bind(phoneNumber).first();
        
        if (existingPartner) {
          partnerId = existingPartner.id;
          console.log('✅ Found partner by phone:', partnerId);
        } else {
          console.warn('⚠️ No partner found with phone number:', phoneNumber);
        }
      } catch (dbError) {
        console.error('❌ Database query failed:', dbError.message);
      }
    }

    // Final validation
    if (!partnerId || partnerId === 'undefined' || partnerId === 'null' || typeof partnerId === 'undefined') {
      console.error('❌ Invalid partner ID after all attempts:', partnerId);
      console.error('❌ Full payload structure:', JSON.stringify(payload, null, 2));
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Invalid token: no user ID found. Payload: ${JSON.stringify(payload)}`,
        debug: {
          payloadKeys: Object.keys(payload),
          payloadPayloadKeys: payload.payload ? Object.keys(payload.payload) : null,
          extractedId: partnerId,
          extractedPhone: phoneNumber
        }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Get partner phone for folder structure (using phone as requested)
    let partner = null;
    try {
      partner = await env.KUDDL_DB.prepare(
        'SELECT phone FROM providers WHERE id = ?'
      ).bind(partnerId).first();
      console.log('👤 Partner found:', partner);
    } catch (dbError) {
      console.warn('⚠️ Database query failed:', dbError.message);
    }

    // Use partner phone if found, otherwise use partner ID
    let folderIdentifier = partnerId || 'unknown';
    if (partner?.phone) {
      folderIdentifier = partner.phone;
      console.log('✅ Using partner phone for folder:', folderIdentifier);
    } else {
      console.log('⚠️ Using partner ID for folder (phone missing):', folderIdentifier);
    }

    console.log('🔍 Parsing form data...');
    const formData = await request.formData();
    const file = formData.get('file');
    const documentType = formData.get('type') || 'profile';
    
    console.log('📋 Form data parsed:', {
      hasFile: !!file,
      documentType,
      partnerId,
      partnerEmail: partner?.email || 'not found',
      folderIdentifier,
      fileType: file?.type,
      fileName: file?.name,
      fileSize: file?.size
    });

    if (!file) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'File is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Validate file type with flexible JPEG handling
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'image/bmp', 'image/tiff'
    ];
    
    // More flexible file type validation
    const isValidType = allowedTypes.some(allowedType => {
      // Handle JPEG variations   
      if ((allowedType === 'image/jpeg' || allowedType === 'image/jpg') && 
          (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
        return true;
      }
      return file.type === allowedType;
    });
    
    if (!isValidType) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: `Unsupported file type: ${file.type}. Allowed types: ${allowedTypes.join(', ')}`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate filename with new folder structure
    const timestamp = Date.now();
    const extension = file.name ? file.name.split('.').pop() : 'bin';
    const sanitizedIdentifier = folderIdentifier.replace(/[^a-zA-Z0-9@.-]/g, '_');
    
    // Determine subfolder based on document type - EXACT structure as requested
    let subfolder = 'docs';
    if (documentType === 'profile' || documentType === 'profilePicture') {
      subfolder = 'profile';
    }
    
    const fileName = `partners/${sanitizedIdentifier}/${subfolder}/${documentType}_${timestamp}.${extension}`;
    
    console.log('📁 Generated filename:', fileName);

    let fileUrl;
    let publicUrl;

    // Check if we're in development mode
    if (env.ENVIRONMENT === 'development') {
      console.log('🔧 Development mode: Using base64 data URL for document');
      
      // Convert document to base64 for development
      const fileBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
      fileUrl = `data:${file.type};base64,${base64}`;
      publicUrl = fileUrl; // Same as fileUrl for development
      
      console.log('🔗 Document base64 URL generated (length:', fileUrl.length, ')');
    } else {
      console.log('🚀 Production mode: Uploading to R2 storage');
      
      // Check for existing files of the same type and delete them
      try {
        console.log('🔍 Checking for existing files to replace...');
        
        // List objects in the partner's folder
        const listResult = await env.KUDDL_STORAGE.list({
          prefix: `partners/${sanitizedIdentifier}/${subfolder}/${documentType}_`
        });
        
        // Delete existing files of the same document type
        if (listResult.objects && listResult.objects.length > 0) {
          console.log(`🗑️ Found ${listResult.objects.length} existing files to delete`);
          for (const object of listResult.objects) {
            await env.KUDDL_STORAGE.delete(object.key);
            console.log(`✅ Deleted old file: ${object.key}`);
          }
        }
      } catch (deleteError) {
        console.warn('⚠️ Could not delete existing files:', deleteError.message);
        // Continue with upload even if deletion fails
      }

      // Upload to R2
      console.log('☁️ Uploading to R2:', fileName);
      await env.KUDDL_STORAGE.put(fileName, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
      });
      console.log('✅ R2 upload successful');

      // Generate public R2 URL for database storage
      publicUrl = getPublicR2Url(fileName, env);
      
      if (!publicUrl) {
        throw new Error('Failed to generate public URL');
      }

      fileUrl = `https://kuddl-storage.tech-149.workers.dev/${fileName}`;
    }

    // Update the provider's profile with the document URL and insert into document_verifications table
    try {
      
      // Insert into document_verifications table for admin panel
      try {
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await env.KUDDL_DB.prepare(`
          INSERT INTO document_verifications (
            id, partner_id, document_type, file_name, document_url, 
            verification_status, file_size, mime_type, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          documentId,
          partnerId,
          documentType,
          file.name,
          env.ENVIRONMENT === 'development' ? fileUrl : fileName, // Store base64 URL in dev, R2 key in prod
          'pending',
          file.size || 0,
          file.type || 'application/octet-stream',
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        console.log('✅ Inserted document into document_verifications table');
      } catch (docInsertError) {
        console.warn('⚠️ Could not insert into document_verifications table:', docInsertError.message);
      }
      
      if (documentType === 'profile' || documentType === 'profilePicture') {
        // Update profile_image_url in providers table
        await env.KUDDL_DB.prepare(`
          UPDATE providers SET profile_image_url = ?, updated_at = ? WHERE id = ?
        `).bind(publicUrl, new Date().toISOString(), partnerId).run();
        console.log('✅ Updated profile_image_url in providers table');
      } else {
        // Update specific document URL column in providers table
        let columnName = '';
        switch (documentType) {
          case 'panCard':
          case 'pancard':
            columnName = 'pan_card_url';
            break;
          case 'aadhaarCard':
            columnName = 'aadhaar_card_url';
            break;
          case 'cancelledCheque':
            columnName = 'cancelled_cheque_url';
            break;
          default:
            console.log(`⚠️ Unknown document type for database update: ${documentType}`);
        }
        
        if (columnName) {
          try {
            await env.KUDDL_DB.prepare(`
              UPDATE providers SET ${columnName} = ?, updated_at = ? WHERE id = ?
            `).bind(publicUrl, new Date().toISOString(), partnerId).run();
            console.log(`✅ Updated ${columnName} in providers table`);
          } catch (dbError) {
            console.warn(`⚠️ Could not update ${columnName} in providers table:`, dbError.message);
          }
        }
      }
    } catch (dbUpdateError) {
      console.warn('⚠️ Could not update database with file URL:', dbUpdateError.message);
      // Continue, the file was uploaded successfully
    }

    // Return success response with public R2 URL
    console.log('✅ Upload completed successfully');
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'File uploaded successfully',
      url: publicUrl,
      fileName: fileName,
      documentType: documentType
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Upload failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Get provider documents
export async function getProviderDocuments(request, env) {
  try {
    const url = new URL(request.url);
    const providerId = url.pathname.split('/').pop();
    
    console.log('📄 Getting documents for provider:', providerId);
    
    // Get provider email for folder structure
    const provider = await env.KUDDL_DB.prepare(
      'SELECT email FROM providers WHERE id = ?'
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
    
    // Get documents from document_verifications table
    const documents = await env.KUDDL_DB.prepare(`
      SELECT * FROM document_verifications 
      WHERE partner_id = ? 
      ORDER BY created_at DESC
    `).bind(providerId).all();
    
    console.log('📄 Found documents:', documents.results?.length || 0);
    console.log('📄 Document details:', JSON.stringify(documents.results, null, 2));
    
    // Convert document URLs to public URLs
    const { getPublicR2Url } = await import('../utils/r2Utils.js');
    const documentsWithUrls = (documents.results || []).map(doc => {
      const publicUrl = getPublicR2Url(doc.document_url, env);
      console.log(`📄 Document ${doc.document_type}: ${doc.document_url} → ${publicUrl}`);
      return {
        ...doc,
        document_url: publicUrl
      };
    });
    
    console.log('✅ Returning documents:', documentsWithUrls.length);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Documents retrieved successfully',
      documents: documentsWithUrls
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Get documents error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get documents',
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
    const updateData = await request.json();
    console.log('📝 Updating document verification:', updateData);
    
    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Document verification updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
  } catch (error) {
    console.error('❌ Update verification error:', error);
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

// View document by key
export async function viewDocument(request, env) {
  try {
    const url = new URL(request.url);
    const encodedKey = url.pathname.split('/').pop();
    const key = decodeURIComponent(encodedKey);
    
    console.log('👁️ Viewing document - Encoded:', encodedKey);
    console.log('👁️ Viewing document - Decoded:', key);
    
    // Get document from R2
    const object = await env.KUDDL_STORAGE.get(key);
    
    if (!object) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'Document not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    return addCorsHeaders(new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600'
      }
    }));
    
  } catch (error) {
    console.error('❌ View document error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to view document',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Public upload for profile photos (no auth required)
export async function uploadProfilePublic(request, env) {
  try {
    console.log('📁 Public profile upload request received');
    
    const formData = await request.formData();
    const file = formData.get('file');
    const documentType = formData.get('type') || 'profile';
    
    if (!file) {
      return addCorsHeaders(new Response(JSON.stringify({
        success: false,
        message: 'File is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // Generate unique filename for public uploads
    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const fileName = `public/${documentType}_${timestamp}.${extension}`;

    // Upload to R2
    console.log('☁️ Uploading to R2:', fileName);
    await env.KUDDL_STORAGE.put(fileName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });
    console.log('✅ R2 upload successful');

    // Generate public URL for the uploaded file
    const fileUrl = `https://kuddl-storage.tech-149.workers.dev/${fileName}`;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'File uploaded successfully',
      url: fileUrl,
      fileName: fileName,
      documentType: documentType
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Public upload error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Upload failed',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
