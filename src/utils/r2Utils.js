/**
 * R2 Storage Utilities for Backend
 * Handles conversion of R2 paths to public URLs
 */

/**
 * Asset hosts that were retired when the kuddl.co zone was replaced by
 * kuddlkin.co. The objects never moved — only the public hostname changed —
 * but absolute URLs built from the old hostname are still stored in the
 * database, and those hostnames no longer resolve (NXDOMAIN).
 *
 * The mapping is explicit (old host -> new host) rather than "rewrite to
 * whatever R2_PUBLIC_URL currently is", so a dev deployment can never rewrite a
 * prod URL onto the dev bucket.
 */
export const LEGACY_ASSET_HOSTS = {
  'https://prodassets.kuddl.co': 'https://prodassets.kuddlkin.co',
  'https://devassets.kuddl.co': 'https://devassets.kuddlkin.co',
  'https://dev-assets.kuddl.co': 'https://devassets.kuddlkin.co',
};

/**
 * Rewrite any retired asset hostname in a string to its live equivalent.
 * Safe on arbitrary text: if no legacy host appears, the input is returned as-is.
 * @param {string} text
 * @returns {string}
 */
export function rewriteLegacyAssetHosts(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const [oldHost, newHost] of Object.entries(LEGACY_ASSET_HOSTS)) {
    if (out.includes(oldHost)) out = out.split(oldHost).join(newHost);
  }
  return out;
}

/**
 * Strip any known public asset hostname off a URL to recover the R2 object key.
 * Tolerates the current R2_PUBLIC_URL *and* every retired hostname, so images
 * uploaded before the domain change can still be located in the bucket.
 * @param {string} url
 * @param {Object} env
 * @returns {string} the R2 key (or the original string if it wasn't a known URL)
 */
export function toR2Key(url, env) {
  if (!url || typeof url !== 'string') return url;
  const hosts = [env?.R2_PUBLIC_URL, ...Object.keys(LEGACY_ASSET_HOSTS), ...Object.values(LEGACY_ASSET_HOSTS)]
    .filter(Boolean);
  for (const host of hosts) {
    const prefix = host.endsWith('/') ? host : host + '/';
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }
  return url;
}

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
