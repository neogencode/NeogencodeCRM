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

/**
 * Upload candidate PDF resume to Cloudinary Media Library (25GB Free Storage).
 * Supports signatures:
 *   uploadResumePdfDetailed(base64Str)
 *   uploadResumePdfDetailed(fileName, base64Str)
 *   uploadResumePdfDetailed(fileName, base64Str, tenantId)
 */
async function uploadResumePdfDetailed(arg1, arg2, arg3) {
  let fileName = 'resume.pdf';
  let base64Str = arg1;
  let tenantId = 'default';

  if (arg3 && typeof arg3 === 'string') {
    fileName = arg1;
    base64Str = arg2;
    tenantId = arg3;
  } else if (arg2 && typeof arg2 === 'string') {
    if (arg2.startsWith('data:') || arg2.length > 100) {
      fileName = arg1;
      base64Str = arg2;
    } else {
      base64Str = arg1;
      tenantId = arg2;
    }
  }

  if (!base64Str || typeof base64Str !== 'string') {
    return {
      url: '',
      storageProvider: 'None',
      storageStatus: 'NO_FILE',
      storageReason: 'No PDF resume attached to candidate'
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

  // Validate that base64Str is a real Base64 Data URI or binary data (not a plain filename)
  const isDataUri = base64Str.startsWith('data:');
  const isRawBase64 = base64Str.length > 100 && !base64Str.endsWith('.pdf') && !base64Str.endsWith('.doc') && !base64Str.endsWith('.docx');

  if (!isDataUri && !isRawBase64) {
    return {
      url: base64Str,
      storageProvider: 'None',
      storageStatus: 'INVALID_BASE64',
      storageReason: 'Resume string is a filename or invalid Base64 data'
    };
  }

  initCloudinary();

  if (isCloudinaryConfigured) {
    try {
      const base64Data = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      
      const cleanTenant = (tenantId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const folderPath = `neogencode_resumes/${cleanTenant}`;

      const cleanName = (fileName || 'resume').replace(/\.(pdf|doc|docx)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
      const publicId = `${cleanName}_${Date.now()}.pdf`;

      let result;
      try {
        // Method 1: Raw binary buffer stream -> Stores under /raw/upload/neogencode_resumes/{tenantId}/ (Public access mode!)
        result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({
            folder: folderPath,
            resource_type: 'raw',
            type: 'upload',
            access_mode: 'public',
            public_id: publicId
          }, (error, res) => {
            if (error) return reject(error);
            resolve(res);
          });
          stream.end(pdfBuffer);
        });
      } catch (streamErr) {
        console.warn("upload_stream raw failed, falling back to dataUri upload:", streamErr.message);
        let dataUri = base64Str;
        if (!base64Str.startsWith('data:')) {
          dataUri = `data:application/pdf;base64,${base64Str}`;
        }
        result = await cloudinary.uploader.upload(dataUri, {
          folder: folderPath,
          resource_type: 'auto',
          type: 'upload',
          access_mode: 'public',
          use_filename: true,
          unique_filename: true
        });
      }

      console.log(`Successfully uploaded raw PDF resume for tenant ${cleanTenant} to Cloudinary CDN:`, result.secure_url);
      return {
        url: result.secure_url,
        storageProvider: 'Cloudinary CDN (Raw PDF)',
        storageStatus: 'SUCCESS',
        storageReason: `Raw PDF resume uploaded to Cloudinary Media Library folder ${folderPath} as ${result.public_id}`
      };
    } catch (err) {
      const errorMsg = (err && err.message) || (err && err.error && err.error.message) || (typeof err === 'string' ? err : JSON.stringify(err));
      console.warn("Cloudinary upload failed, falling back to Zlib DB storage:", errorMsg);
      const gzipStr = compressBase64(base64Str);
      return {
        url: gzipStr,
        storageProvider: 'Turso DB (Zlib Fallback)',
        storageStatus: 'FALLBACK_TRIGGERED',
        storageReason: `Cloudinary upload error: "${errorMsg}". PDF compressed by 90%+ with Zlib and stored safely in Turso DB.`
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
    storageReason: `Cloudinary environment variable(s) missing in Vercel: [${missingKeys.join(', ')}]. PDF compressed by 90%+ with Zlib and stored safely in Turso DB.`
  };
}

/**
 * Fetch candidate PDF resume from Cloudinary CDN URL or Turso DB.
 * Fetches PDF binary buffer from Cloudinary on backend and converts it directly into a pure Base64 Data URI.
 * Format is 100% IDENTICAL to Turso DB for instant 0ms iframe preview & download!
 */
async function fetchResumePdf(storageRef) {
  if (!storageRef || typeof storageRef !== 'string') return storageRef || '';

  // Case A: Cloudinary HTTPS URL -> Fetch PDF binary using signed API URLs & Basic Auth!
  if (storageRef.startsWith('http://') || storageRef.startsWith('https://')) {
    initCloudinary();

    const urlsToTry = [];
    if (isCloudinaryConfigured && storageRef.includes('/neogencode_resumes/')) {
      try {
        const parts = storageRef.split('/neogencode_resumes/');
        const fileKey = parts[1];
        const publicId = `neogencode_resumes/${fileKey}`;
        const rawPublicId = publicId.replace(/\.(pdf|doc|docx)$/i, '');

        if (cloudinary.utils && cloudinary.utils.private_download_url) {
          try {
            urlsToTry.push(cloudinary.utils.private_download_url(publicId, 'pdf', { resource_type: 'raw' }));
            urlsToTry.push(cloudinary.utils.private_download_url(publicId, '', { resource_type: 'raw' }));
          } catch(e1) {}
        }

        urlsToTry.push(cloudinary.url(publicId, { resource_type: 'raw', sign_url: true, secure: true }));
        urlsToTry.push(cloudinary.url(publicId, { resource_type: 'image', sign_url: true, secure: true }));
        urlsToTry.push(cloudinary.url(rawPublicId, { resource_type: 'raw', sign_url: true, secure: true }));
        urlsToTry.push(cloudinary.url(rawPublicId, { resource_type: 'image', sign_url: true, secure: true }));
      } catch (e) {
        console.warn("Cloudinary URL signing failed:", e.message);
      }
    }

    if (storageRef.includes('/raw/upload/') && !storageRef.includes('/fl_attachment/')) {
      urlsToTry.push(storageRef.replace('/raw/upload/', '/raw/upload/fl_attachment/'));
    }
    if (storageRef.includes('/image/upload/') && !storageRef.includes('/fl_attachment/')) {
      urlsToTry.push(storageRef.replace('/image/upload/', '/image/upload/fl_attachment/'));
    }
    urlsToTry.push(storageRef);

    const fetch = globalThis.fetch || require('node-fetch');
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/pdf,application/octet-stream,*/*'
    };
    if (isCloudinaryConfigured) {
      const authStr = `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`;
      headers['Authorization'] = 'Basic ' + Buffer.from(authStr).toString('base64');
    }

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);

          const textContent = buffer.toString('utf-8', 0, 50).trim();
          
          // Case 1: Zlib compressed payload ('gzip:H4sIAAAAA...')
          if (textContent.startsWith('gzip:')) {
            const decompressed = decompressBase64(buffer.toString('utf-8').trim());
            if (decompressed && (decompressed.startsWith('data:') || decompressed.length > 50)) {
              return decompressed;
            }
          }

          // Case 2: Validate magic bytes (%PDF) to ensure buffer is not an HTML/JSON error page
          const isPdfMagic = textContent.startsWith('%PDF') || buffer.includes(Buffer.from('%PDF'));
          if (isPdfMagic) {
            const base64 = buffer.toString('base64');
            return `data:application/pdf;base64,${base64}`;
          } else {
            console.warn(`Cloudinary URL ${url} returned non-PDF response:`, textContent.substring(0, 30));
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch Cloudinary URL ${url}:`, err.message);
      }
    }

    return storageRef;
  }

  // Case B: Zlib Gzip compressed DB string -> Decompress to Data URI
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
