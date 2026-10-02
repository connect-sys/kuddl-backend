/**
 * CORS utility functions
 */

// CORS headers with cache control
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, Access-Control-Allow-Headers, X-API-Key, X-Client-Version',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Access-Control-Allow-Credentials': 'false',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// Utility function to add CORS headers to responses.
// Accepts either a Response (sets headers on it) OR a plain headers object
// (returns a merged headers object). Several controllers call it as
// `headers: addCorsHeaders({ 'Content-Type': 'application/json' })` — without the
// object branch that crashes with "Cannot read properties of undefined
// (reading 'set')" because a plain object has no `.headers`.
export function addCorsHeaders(response) {
  if (response && response.headers && typeof response.headers.set === 'function') {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
  // Plain headers object (or undefined): merge CORS headers in, caller's win.
  return { ...corsHeaders, ...(response || {}) };
}

// Handle CORS preflight requests
export function handleCorsOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}

// Utility function to create API response with no-cache headers
export function createApiResponse(data, status = 200, additionalHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...additionalHeaders
  };
  
  return addCorsHeaders(new Response(JSON.stringify(data), {
    status,
    headers
  }));
}
