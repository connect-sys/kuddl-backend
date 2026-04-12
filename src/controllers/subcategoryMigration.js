// Migration to add subcategory_id column to services table
export async function addSubcategoryIdToServices(request, env) {
  try {
    console.log('🔄 Adding subcategory_id column to services table...');
    
    // Check if column already exists
    const tableInfo = await env.KUDDL_DB.prepare('PRAGMA table_info(services)').all();
    const hasSubcategoryId = tableInfo.results.some(col => col.name === 'subcategory_id');
    
    if (hasSubcategoryId) {
      console.log('✅ subcategory_id column already exists in services table');
      return new Response(JSON.stringify({
        success: true,
        message: 'subcategory_id column already exists in services table'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Add the column
    await env.KUDDL_DB.prepare(`
      ALTER TABLE services ADD COLUMN subcategory_id TEXT
    `).run();
    
    console.log('✅ Added subcategory_id column to services table');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Successfully added subcategory_id column to services table'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Error adding subcategory_id column:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to add subcategory_id column',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
