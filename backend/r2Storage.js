const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const zlib = require('zlib');

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (accountId && accessKeyId && secretAccessKey) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    console.log("Cloudflare R2 Storage S3 client initialized successfully.");
  }
  return s3Client;
}

// Compress Base64 fallback helper
function compressBase64(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (str.startsWith('gzip:') || str.startsWith('r2:')) return str;
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
 * Upload candidate PDF resume to Cloudflare R2 (10 GB Free tier).
 * Falls back to zlib gzip DB compression if R2 environment variables are not set.
 */
async function uploadResumePdf(fileName, base64Str) {
  if (!base64Str || typeof base64Str !== 'string') return '';
  if (base64Str.startsWith('r2:') || base64Str.startsWith('gzip:')) return base64Str;

  const client = getS3Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (client && bucketName) {
    try {
      const cleanFileName = (fileName || 'resume_' + Date.now() + '.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const fileKey = `resumes/${Date.now()}_${cleanFileName}`;

      // Extract raw binary buffer from Base64 data URI or string
      let rawBase64 = base64Str;
      let contentType = 'application/pdf';
      if (base64Str.includes(';base64,')) {
        const parts = base64Str.split(';base64,');
        contentType = parts[0].replace('data:', '') || 'application/pdf';
        rawBase64 = parts[1];
      }

      const fileBuffer = Buffer.from(rawBase64, 'base64');

      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: contentType,
      }));

      console.log(`Uploaded PDF resume to Cloudflare R2 bucket "${bucketName}": ${fileKey}`);

      // Public R2 custom domain or r2: key
      const publicDomain = process.env.R2_PUBLIC_DOMAIN;
      if (publicDomain) {
        return `${publicDomain.replace(/\/$/, '')}/${fileKey}`;
      }
      return `r2:${fileKey}`;
    } catch (err) {
      console.warn("Cloudflare R2 upload failed, falling back to zlib DB compression:", err.message);
    }
  }

  // Fallback mode: zlib gzip DB compression
  return compressBase64(base64Str);
}

/**
 * Fetch candidate PDF resume from Cloudflare R2 or decompress gzip DB string.
 */
async function fetchResumePdf(storageRef) {
  if (!storageRef || typeof storageRef !== 'string') return storageRef || '';

  // Case A: Cloudflare R2 reference key (r2:resumes/filename.pdf)
  if (storageRef.startsWith('r2:')) {
    const client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
    const fileKey = storageRef.replace('r2:', '');

    if (client && bucketName) {
      try {
        const response = await client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: fileKey,
        }));
        
        const streamToBuffer = (stream) => new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });

        const fileBuf = await streamToBuffer(response.Body);
        const base64Data = fileBuf.toString('base64');
        const contentType = response.ContentType || 'application/pdf';
        return `data:${contentType};base64,${base64Data}`;
      } catch (err) {
        console.error(`Failed to fetch PDF from Cloudflare R2 (${fileKey}):`, err.message);
      }
    }
  }

  // Case B: Public R2 URL or HTTP link
  if (storageRef.startsWith('http://') || storageRef.startsWith('https://')) {
    return storageRef;
  }

  // Case C: Gzip compressed DB string
  if (storageRef.startsWith('gzip:')) {
    return decompressBase64(storageRef);
  }

  return storageRef;
}

module.exports = {
  uploadResumePdf,
  fetchResumePdf,
  compressBase64,
  decompressBase64,
};
