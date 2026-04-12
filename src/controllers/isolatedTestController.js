/**
 * Isolated Test Controller - Test only parent/children creation
 */

import { addCorsHeaders } from '../utils/cors.js';
import { generateId } from '../utils/helpers.js';
import jwt from '@tsndr/cloudflare-worker-jwt';

export async function testParentChildrenCreation(request, env) {
  try {
    console.log('🧪 Starting isolated parent/children creation test');
    
    // Try to get authenticated parent from token
    let parentId = null;
    try {
      const authHeader = request.headers.get('Authorization');
      console.log('🔍 Authorization header:', authHeader);
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const isValid = await jwt.verify(token, env.JWT_SECRET);
        
        if (isValid) {
          const decoded = jwt.decode(token);
          if (decoded && decoded.payload && decoded.payload.id) {
            parentId = decoded.payload.id;
            console.log('✅ Authenticated parent ID from token:', parentId);
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Token verification failed, will create parent from phone');
    }

    const { parentDetails, children } = await request.json();

    console.log('📝 Request data:', {
      parentDetails,
      childrenCount: children?.length || 0,
      parentId
    });

    // If no parentId from token, create/find parent using phone
    if (!parentId && parentDetails && parentDetails.phone) {
      console.log('🔄 Creating/finding parent using phone:', parentDetails.phone);
      try {
        const formattedPhone = parentDetails.phone.replace(/\D/g, '');
        
        // Try to find existing parent by phone
        const existingParent = await env.KUDDL_DB.prepare(`
          SELECT id FROM parents WHERE phone = ? OR phone = ?
        `).bind(formattedPhone, `+91${formattedPhone}`).first();

        if (existingParent) {
          parentId = existingParent.id;
          console.log('✅ Found existing parent by phone:', parentId);
        } else {
          // Create new parent
          parentId = generateId();
          console.log('🆕 Creating new parent with ID:', parentId);
          
          await env.KUDDL_DB.prepare(`
            INSERT INTO parents (
              id, phone, full_name, email, address, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            parentId,
            formattedPhone,
            parentDetails.fullName || 'Parent User',
            parentDetails.email || '',
            parentDetails.address || '',
            new Date().toISOString(),
            new Date().toISOString()
          ).run();
          console.log('✅ Created new parent with ID:', parentId);
        }
      } catch (phoneError) {
        console.error('❌ Failed to create/find parent by phone:', phoneError);
        return addCorsHeaders(new Response(JSON.stringify({
          success: false,
          message: 'Failed to create parent profile: ' + phoneError.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }

    // Save children to database if parent exists
    let childrenCreated = 0;
    if (parentId && children && Array.isArray(children) && children.length > 0) {
      console.log(`👶 Processing ${children.length} children for parent ${parentId}`);
      
      for (const child of children) {
        try {
          console.log(`🔍 Processing child:`, child);
          
          // Check if child already exists
          const existingChild = await env.KUDDL_DB.prepare(`
            SELECT id FROM children 
            WHERE parent_id = ? AND name = ? AND age = ?
          `).bind(parentId, child.name, child.age).first();

          if (!existingChild) {
            const childId = generateId();
            console.log(`🆕 Creating new child with ID: ${childId}`);
            
            await env.KUDDL_DB.prepare(`
              INSERT INTO children (
                id, parent_id, name, age, gender, 
                medical_conditions, bedtime, dietary_restrictions,
                special_needs, allergies, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              childId, 
              parentId, 
              child.name, 
              child.age, 
              child.gender || 'unknown',
              child.medicalConditions || null,
              child.bedtime || null,
              child.dietaryRestrictions || null,
              child.specialNeeds || null,
              child.allergies || null,
              new Date().toISOString(), 
              new Date().toISOString()
            ).run();
            console.log(`✅ Saved new child: ${child.name} with ID: ${childId}`);
            childrenCreated++;
          } else {
             console.log(`ℹ️ Child already exists: ${child.name}`);
          }
        } catch (childError) {
          console.error(`❌ Failed to save child ${child.name}:`, childError);
        }
      }
    }

    // Verify parent and children were created by querying the database
    const parentCheck = await env.KUDDL_DB.prepare(`
      SELECT * FROM parents WHERE id = ?
    `).bind(parentId).first();

    const childrenCheck = await env.KUDDL_DB.prepare(`
      SELECT * FROM children WHERE parent_id = ?
    `).bind(parentId).all();

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Parent and children test completed',
      data: {
        parentId: parentId,
        parentExists: !!parentCheck,
        parentData: parentCheck,
        childrenRequested: children?.length || 0,
        childrenCreated: childrenCreated,
        childrenInDatabase: childrenCheck.results?.length || 0,
        childrenData: childrenCheck.results || []
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Isolated test error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Test failed: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
