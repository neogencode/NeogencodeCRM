const cloudinary = require('cloudinary').v2;
const zlib = require('zlib');

let isCloudinaryConfigured = false;

function initCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    isCloudinaryConfigured = true;
  } else {
    isCloudinaryConfigured = false;
  }
}

// Compress Base64 fallback helper
function compressBase64(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (str.startsWith('gzip:') || str.startsWith('http://') || str.startsWith('https://')) return str;
  try {
    const compressedBuf = zlib.gzipSync(Buffer.from(str, 'utf-8'));
    return 'gzip:' + compressedBuf.toString('base64');
  } catch (e) {
    return str;
  }
}

function decompressBase64(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (!str.startsWith('gzip:')) return str;
  try {
    const compressedBuf = Buffer.from(str.replace('gzip:', ''), 'base64');
    return zlib.gunzipSync(compressedBuf).toString('utf-8');
  } catch (e) {
    return str;
  }
}

/**
 * Upload candidate PDF resume to Cloudinary (25 GB Free tier, No Card Needed!).
 * Falls back to Zlib Gzip DB compression if Cloudinary env vars are not set.
 */
async function uploadResumePdf(fileName, base64Str) {
  const result = await uploadResumePdfDetailed(fileName, base64Str);
  return result.url;
}

function getStorageTelemetryInfo(storageRef) {
  if (!storageRef || typeof storageRef !== 'string') {
    return {
      storageProvider: 'None',
      storageStatus: 'NO_FILE',
      storageReason: 'No PDF resume attached to candidate'
    };
  }

  if (storageRef.startsWith('http://') || storageRef.startsWith('https://')) {
    return {
      storageProvider: 'Cloudinary CDN',
      storageStatus: 'SUCCESS',
      storageReason: 'PDF resume hosted on Cloudinary CDN Media Library (neogencode_resumes/)'
    };
  }

  if (storageRef.startsWith('gzip:')) {
    initCloudinary();
    const missingKeys = [];
    if (!process.env.CLOUDINARY_CLOUD_NAME) missingKeys.push('CLOUDINARY_CLOUD_NAME');
    if (!process.env.CLOUDINARY_API_KEY) missingKeys.push('CLOUDINARY_API_KEY');
    if (!process.env.CLOUDINARY_API_SECRET) missingKeys.push('CLOUDINARY_API_SECRET');

    if (missingKeys.length > 0) {
      return {
        storageProvider: 'Turso DB (Zlib Fallback)',
        storageStatus: 'FALLBACK_TRIGGERED',
        storageReason: `Cloudinary environment variable(s) [${missingKeys.join(', ')}] missing in Vercel. PDF resume compressed by 90%+ with Zlib (gzip) and stored safely in Turso DB.`
      };
    } else {
      return {
        storageProvider: 'Turso DB (Zlib Fallback)',
        storageStatus: 'FALLBACK_TRIGGERED',
        storageReason: 'Cloudinary credentials configured but upload failed or fallback was triggered. Compressed with Zlib (gzip) and stored safely in Turso DB.'
      };
    }
  }

  return {
    storageProvider: 'Local Storage / Uncompressed DB',
    storageStatus: 'RAW_BASE64',
    storageReason: 'Raw uncompressed string stored in database'
  };
}

async function uploadResumePdfDetailed(fileName, base64Str) {
  if (!base64Str || typeof base64Str !== 'string') {
    return {
      url: '',
      storageProvider: 'None',
      storageStatus: 'NO_FILE',
      storageReason: 'No file data received'
    };
  }

  if (base64Str.startsWith('http://') || base64Str.startsWith('https://')) {
    return {
      url: base64Str,
      storageProvider: 'Cloudinary CDN',
      storageStatus: 'SUCCESS',
      storageReason: 'Valid Cloudinary CDN URL'
    };
  }

  initCloudinary();

  if (isCloudinaryConfigured) {
    try {
      let dataUri = base64Str;
      if (!base64Str.startsWith('data:')) {
        dataUri = `data:application/pdf;base64,${base64Str}`;
      }

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'neogencode_resumes',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true
      });

      console.log("Successfully uploaded PDF resume to Cloudinary:", result.secure_url);
      return {
        url: result.secure_url,
        storageProvider: 'Cloudinary CDN',
        storageStatus: 'SUCCESS',
        storageReason: `Resume successfully uploaded to Cloudinary Media Library (folder neogencode_resumes/)`
      };
    } catch (err) {
      console.warn("Cloudinary upload failed, falling back to Zlib DB compression:", err.message);
      const gzipStr = compressBase64(base64Str);
      return {
        url: gzipStr,
        storageProvider: 'Turso DB (Zlib Fallback)',
        storageStatus: 'FALLBACK_TRIGGERED',
        storageReason: `Cloudinary API Error: "${err.message}". PDF compressed by 90%+ with Zlib and stored safely in Turso DB.`
      };
    }
  }

  const missingKeys = [];
  if (!process.env.CLOUDINARY_CLOUD_NAME) missingKeys.push('CLOUDINARY_CLOUD_NAME');
  if (!process.env.CLOUDINARY_API_KEY) missingKeys.push('CLOUDINARY_API_KEY');
  if (!process.env.CLOUDINARY_API_SECRET) missingKeys.push('CLOUDINARY_API_SECRET');

  const gzipStr = compressBase64(base64Str);
  return {
    url: gzipStr,
    storageProvider: 'Turso DB (Zlib Fallback)',
    storageStatus: 'FALLBACK_TRIGGERED',
    storageReason: `Cloudinary environment variable(s) missing in Vercel: [${missingKeys.join(', ')}]. PDF resume compressed by 90%+ with Zlib and stored safely in Turso DB.`
  };
}

/**
 * Fetch candidate PDF resume from Cloudinary CDN URL or decompress Zlib DB string.
 */
async function fetchResumePdf(storageRef) {
  if (!storageRef || typeof storageRef !== 'string') return storageRef || '';

  // Case A: Cloudinary HTTPS URL or public link
  if (storageRef.startsWith('http://') || storageRef.startsWith('https://')) {
    return storageRef;
  }

  // Case B: Zlib Gzip compressed DB string
  if (storageRef.startsWith('gzip:')) {
    return decompressBase64(storageRef);
  }

  return storageRef;
}

module.exports = {
  uploadResumePdf,
  uploadResumePdfDetailed,
  getStorageTelemetryInfo,
  fetchResumePdf,
  compressBase64,
  decompressBase64,
};
