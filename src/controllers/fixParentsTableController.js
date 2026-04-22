import { addCorsHeaders } from '../utils/cors.js';

/**
 * Fix parents table - add missing columns
 */
export async function fixParentsTable(request, env) {
  try {
    console.log('🔄 Fixing parents table...');

    // Get current table structure
    const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(parents)`).all();
    console.log('📊 Current table structure:', JSON.stringify(tableInfo, null, 2));

    const columns = tableInfo.results || tableInfo;
    const columnNames = columns.map(col => col.name);

    // Add missing columns
    const columnsToAdd = [
      { name: 'gender', type: 'TEXT' },
      { name: 'date_of_birth', type: 'DATE' },
      { name: 'profile_picture', type: 'TEXT' },
    ];

    for (const col of columnsToAdd) {
      if (!columnNames.includes(col.name)) {
        console.log(`➕ Adding column: ${col.name}`);
        await env.KUDDL_DB.prepare(`
          ALTER TABLE parents ADD COLUMN ${col.name} ${col.type}
        `).run();
      } else {
        console.log(`✅ Column ${col.name} already exists`);
      }
    }

    // Rename fullname to full_name if needed
    if (columnNames.includes('fullname') && !columnNames.includes('full_name')) {
      console.log('🔄 Renaming fullname to full_name...');
      // SQLite doesn't support RENAME COLUMN directly in older versions
      // We need to copy data
      await env.KUDDL_DB.prepare(`
        UPDATE parents SET full_name = fullname WHERE fullname IS NOT NULL
      `).run();
    }

    // Get updated table structure
    const updatedTableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(parents)`).all();
    console.log('✅ Updated table structure:', JSON.stringify(updatedTableInfo, null, 2));

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      message: 'Parents table fixed successfully',
      tableInfo: updatedTableInfo.results || updatedTableInfo
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Error fixing parents table:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to fix parents table',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
