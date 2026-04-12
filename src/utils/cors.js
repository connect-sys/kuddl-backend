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

// Utility function to add CORS headers to responses
export function addCorsHeaders(response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
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
