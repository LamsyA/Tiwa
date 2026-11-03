/* global __ENV, __VU, __ITER -- k6 runtime globals (not Node) */
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

// GATE P5 / UF-10: 500 concurrent guest uploaders to one gallery.
// Mirrors the real browser multipart flow exactly (create → create-multipart
// → PUT part → complete-multipart → app complete). Each VU is a distinct
// guest (own session + own X-Forwarded-For, like real clients behind
// different IPs — the per-IP rate limits model abuse, not load).
// Cookies are forwarded manually: session cookies are Secure and the Go
// cookie jar won't send those over plain http://localhost (browsers do).
export const options = {
  scenarios: {
    uploaders: {
      // Ramp to 500 concurrent guests and hold: a thundering-herd start
      // overflows the accept queue (connection resets) on any stack, so
      // the gate measures sustained concurrency, not a single SYN burst.
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '20s', target: 300 },
        { duration: '20s', target: 500 },
        { duration: '60s', target: 500 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    create_duration: ['p(95)<300'],
  },
};

const BASE = __ENV.BASE_URL;
const EVENT_ID = __ENV.EVENT_ID;
const CODE = __ENV.CODE;
const createDuration = new Trend('create_duration');
const PNG = '\x89PNG\r\n\x1a\n' + 'x'.repeat(10240);

function ip() {
  return `10.${1 + Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

function sessionCookie(setCookie) {
  const header = Array.isArray(setCookie) ? setCookie.find((h) => h.includes('tiwa_gs_')) : setCookie;
  if (!header) return '';
  return header.split(';')[0];
}

function uploadIdOf(xml) {
  const match = /<UploadId>([^<]+)<\/UploadId>/.exec(xml);
  return match ? match[1] : '';
}

export default function () {
  const tag = `k6-${__VU}-${__ITER}`;
  const fwd = { 'X-Forwarded-For': ip() };
  const json = { 'Content-Type': 'application/json', ...fwd };
  let res = http.post(`${BASE}/api/gallery/${CODE}/session`, JSON.stringify({ name: 'k6' }), { headers: json });
  if (!check(res, { 'session ok': (r) => r.status === 200 })) return;
  const cookie = sessionCookie(res.headers['Set-Cookie']);
  const authed = { ...json, Cookie: cookie };

  const started = Date.now();
  res = http.post(
    `${BASE}/api/uploads/create`,
    JSON.stringify({
      eventId: EVENT_ID,
      album: 'GUEST',
      kind: 'PHOTO',
      fileName: `${tag}.png`,
      mime: 'image/png',
      sizeBytes: PNG.length,
    }),
    { headers: authed },
  );
  createDuration.add(Date.now() - started);
  if (!check(res, { 'create ok': (r) => r.status === 200 })) return;
  const { key, mediaId } = res.json().data;

  // Multipart: create → PUT part 1 → complete (mirrors @uppy/aws-s3).
  res = http.post(`${BASE}/api/uploads/sign`, JSON.stringify({ key, method: 'POST' }), { headers: authed });
  if (!check(res, { 'sign-create ok': (r) => r.status === 200 })) return;
  const createXml = http.post(res.json().data.url, null);
  const uploadId = uploadIdOf(createXml.body || '');
  if (!uploadId) return;

  res = http.post(`${BASE}/api/uploads/sign`, JSON.stringify({ key, method: 'PUT', uploadId, partNumber: 1 }), {
    headers: authed,
  });
  if (!check(res, { 'sign-part ok': (r) => r.status === 200 })) return;
  const put = http.put(res.json().data.url, PNG, { headers: { 'Content-Type': 'application/octet-stream' } });
  if (!check(put, { 'put ok': (r) => r.status === 200 })) return;
  const etag = (put.headers['Etag'] || put.headers['ETag'] || '').replace(/"/g, '');
  if (!etag) return;

  res = http.post(`${BASE}/api/uploads/sign`, JSON.stringify({ key, method: 'POST', uploadId }), { headers: authed });
  if (!check(res, { 'sign-complete ok': (r) => r.status === 200 })) return;
  const completeBody = `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"${etag}"</ETag></Part></CompleteMultipartUpload>`;
  const done = http.post(res.json().data.url, completeBody, { headers: { 'Content-Type': 'application/xml' } });
  if (!check(done, { 'complete-mpu ok': (r) => r.status === 200 })) return;

  res = http.post(`${BASE}/api/uploads/complete`, JSON.stringify({ mediaId }), { headers: authed });
  check(res, { 'complete ok': (r) => r.status === 200 });
}
