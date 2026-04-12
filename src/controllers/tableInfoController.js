/**
 * Table Info Controller - Get table structure information
 */

import { addCorsHeaders } from '../utils/cors.js';

export async function getTableInfo(request, env) {
  try {
    const url = new URL(request.url);
    const tableName = url.searchParams.get('table') || 'providers';

    // Get table structure
    const tableInfo = await env.KUDDL_DB.prepare(`PRAGMA table_info(${tableName})`).all();
    const columns = tableInfo.results?.map(col => ({
      name: col.name,
      type: col.type,
      notNull: col.notnull,
      defaultValue: col.dflt_value,
      primaryKey: col.pk
    })) || [];

    // Get row count
    const countResult = await env.KUDDL_DB.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).first();
    const rowCount = countResult?.count || 0;

    return addCorsHeaders(new Response(JSON.stringify({
      success: true,
      data: {
        tableName: tableName,
        columns: columns,
        columnCount: columns.length,
        rowCount: rowCount,
        columnNames: columns.map(col => col.name)
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    console.error('❌ Table info error:', error);
    return addCorsHeaders(new Response(JSON.stringify({
      success: false,
      message: 'Failed to get table info: ' + error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}
