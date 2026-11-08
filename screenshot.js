// Link card images, made by screenshotting a share page with the screenshot service
// Uses the same service and bucket as the bot
const config = {
  screenshotServiceUrl: process.env.SCREENSHOT_SERVICE_URL,
  screenshotServiceApiKey: process.env.SCREENSHOT_SERVICE_API_KEY,
  saveS3Bucket: process.env.SAVE_S3_BUCKET,
  saveS3Region: process.env.SAVE_S3_REGION,
  screenshotW: 1200,
  screenshotH: 630,
  // JPEG keeps images under Bluesky's 1MB blob limit
  screenshotFormat: 'jpeg',
  appName: 'post-milestone'
};

export const screenshotSize = { width: config.screenshotW, height: config.screenshotH };

const POLL_INTERVAL = 2000;
// The service can take a while when it is busy, as it runs 3 jobs at a time
const POLL_TIMEOUT = 60000;

// Screenshots being made now, so concurrent requests share one job
const inFlight = new Map();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const screenshotsEnabled = () => Boolean(
  config.screenshotServiceUrl && config.screenshotServiceApiKey &&
  config.saveS3Bucket && config.saveS3Region
);

/**
 * Get the link card image for a profile, making it if it doesn't exist yet
 * Images are keyed by post count, so a new one is only made when the numbers change
 * @param {string} siteUrl - Base URL of this site, for the screenshot service to load
 * @param {object} stats - Profile stats from getProfileStats
 * @param {string} type - Share page type
 * @returns {Promise<string>} URL of the image in S3
 */
export function getShareImage(siteUrl, stats, type) {
  const key = `${config.appName}/cards/${stats.did}/${type}-${stats.postCount}.jpg`;

  if (!inFlight.has(key)) {
    const shareUrl = `${siteUrl}/social-share/${stats.handle}/${type}`;
    const job = createImage(shareUrl, key).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }

  return inFlight.get(key);
}

async function createImage(shareUrl, key) {
  const imageUrl = `https://${config.saveS3Bucket}.s3.${config.saveS3Region}.amazonaws.com/${key}`;

  if (await imageExists(imageUrl)) {
    return imageUrl;
  }

  console.log(`Screenshot: requesting ${shareUrl}`);
  await request('/v1/screenshot', {
    method: 'POST',
    body: JSON.stringify({
      url: shareUrl,
      storage: {
        provider: 's3',
        bucket: config.saveS3Bucket,
        region: config.saveS3Region,
        key
      },
      viewport: {
        width: config.screenshotW,
        height: config.screenshotH
      },
      format: config.screenshotFormat,
      options: {
        waitUntil: 'networkidle0',
        timeout: 30000,
        quality: 85
      },
      metadata: {
        app: config.appName,
        resourceId: key,
        resourceType: 'link-card'
      }
    })
  });

  // Wait for the image to appear in S3, rather than polling the job status.
  // The service runs on more than one machine and keeps jobs in memory, so
  // a status request can go to a machine that doesn't know about the job.
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT) {
    await sleep(POLL_INTERVAL);

    if (await imageExists(imageUrl)) {
      console.log(`Screenshot: ${imageUrl}`);
      return imageUrl;
    }
  }

  throw new Error(`Screenshot timed out for ${shareUrl}`);
}

async function imageExists(url) {
  const response = await fetch(url, { method: 'HEAD' });
  return response.ok;
}

async function request(path, options = {}) {
  const response = await fetch(`${config.screenshotServiceUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.screenshotServiceApiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error status: ${response.status}\n` +
      `URL: ${config.screenshotServiceUrl}${path}\n` +
      `Response: ${await response.text()}`);
  }

  return response.json();
}
