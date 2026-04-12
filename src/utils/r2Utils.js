/**
 * R2 Storage Utilities for Backend
 * Handles conversion of R2 paths to public URLs
 */

/**
 * Convert R2 internal path to public URL
 * @param {string} filePath - The internal R2 file path
 * @param {Object} env - Environment variables
 * @returns {string} Public URL to access the file
 */
export function getPublicR2Url(filePath, env) {
  if (!filePath || !env?.R2_PUBLIC_URL) return filePath;
  
  // If it's already a full URL (contains http/https), return as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  // If it's already a public R2 URL, return as is
  if (filePath.includes('r2.cloudflarestorage.com') || filePath.includes('r2.dev')) {
    return filePath;
  }
  
  // Remove leading slash if present
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  
  // Construct full public URL
  return `${env.R2_PUBLIC_URL}/${cleanPath}`;
}

/**
 * Convert profile data URLs to public R2 URLs
 * @param {Object} profileData - Profile data object
 * @param {Object} env - Environment variables
 * @returns {Object} Profile data with converted URLs
 */
export function convertProfileUrlsToPublic(profileData, env) {
  if (!profileData) return profileData;
  
  const converted = { ...profileData };
  
  // Convert profile image URL (check both possible column names)
  if (converted.profile_image_url) {
    converted.profile_image_url = getPublicR2Url(converted.profile_image_url, env);
  }
  
  // Convert document URLs if they exist
  if (converted.document_urls) {
    try {
      const docs = JSON.parse(converted.document_urls);
      if (docs && typeof docs === 'object') {
        if (docs.pan_card_url) {
          docs.pan_card_url = getPublicR2Url(docs.pan_card_url, env);
        }
        if (docs.aadhaar_card_url) {
          docs.aadhaar_card_url = getPublicR2Url(docs.aadhaar_card_url, env);
        }
        if (docs.cancelled_cheque_url) {
          docs.cancelled_cheque_url = getPublicR2Url(docs.cancelled_cheque_url, env);
        }
        converted.document_urls = JSON.stringify(docs);
      }
    } catch (error) {
      console.warn('⚠️ Error parsing document_urls for public URL conversion:', error);
    }
  }
  
  return converted;
}
