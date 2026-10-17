import './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CloudinaryError, createCloudinary } from '../src/lib/cloudinary';

beforeEach(() => {
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

const config = { cloudName: 'panita', apiKey: 'key-123', apiSecret: 'secret-456' };
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const SECONDS = String(Math.floor(NOW / 1000));
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

interface Sent {
  url: string;
  form: FormData;
}

const stubCloudinary = (...answers: Array<Response | Error>) => {
  const sent: Sent[] = [];
  let next = 0;
  mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, form: init.body as FormData });
    const answer = answers[Math.min(next++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer.clone();
  });
  return sent;
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

test('an upload is signed over the folder and the timestamp, and returns the url and public id', async () => {
  const sent = stubCloudinary(
    reply(200, { secure_url: 'https://res.cloudinary.com/panita/image/upload/v1/x.png', public_id: 'panita-web/gallery/ed1/alex/x' }),
  );

  const image = await createCloudinary(config, () => NOW).upload(Buffer.from('png'), 'image/png', 'panita-web/gallery/ed1/alex');

  assert.deepEqual(image, { url: 'https://res.cloudinary.com/panita/image/upload/v1/x.png', publicId: 'panita-web/gallery/ed1/alex/x' });
  assert.equal(sent[0].url, 'https://api.cloudinary.com/v1_1/panita/image/upload');
  const form = sent[0].form;
  assert.equal(form.get('folder'), 'panita-web/gallery/ed1/alex');
  assert.equal(form.get('timestamp'), SECONDS);
  assert.equal(form.get('api_key'), 'key-123');
  assert.equal(form.get('signature'), sha1(`folder=panita-web/gallery/ed1/alex&timestamp=${SECONDS}secret-456`));
  assert.ok(form.get('file') instanceof Blob);
  assert.equal((form.get('file') as Blob).type, 'image/png');
  // As the website's upload: no preset, no public id, no transformation, and the secret never travels
  assert.deepEqual([...form.keys()].sort(), ['api_key', 'file', 'folder', 'signature', 'timestamp']);
});

test('a refused upload throws with the reason Cloudinary gave', async () => {
  stubCloudinary(reply(400, { error: { message: 'Invalid image file' } }));

  await assert.rejects(
    createCloudinary(config, () => NOW).upload(Buffer.from('x'), 'image/png', 'f'),
    (error: Error) => error instanceof CloudinaryError && /Invalid image file/.test(error.message),
  );
});

test('a network failure and an answer without a url are both a CloudinaryError', async () => {
  stubCloudinary(new Error('connection reset'));
  await assert.rejects(createCloudinary(config).upload(Buffer.from('x'), 'image/png', 'f'), CloudinaryError);

  mock.restoreAll();
  stubCloudinary(reply(200, { nothing: true }));
  await assert.rejects(createCloudinary(config).upload(Buffer.from('x'), 'image/png', 'f'), CloudinaryError);
});

test('destroy signs the public id and the timestamp', async () => {
  const sent = stubCloudinary(reply(200, { result: 'ok' }));

  await createCloudinary(config, () => NOW).destroy('panita-web/gallery/ed1/alex/x');

  assert.equal(sent[0].url, 'https://api.cloudinary.com/v1_1/panita/image/destroy');
  assert.equal(sent[0].form.get('public_id'), 'panita-web/gallery/ed1/alex/x');
  assert.equal(sent[0].form.get('signature'), sha1(`public_id=panita-web/gallery/ed1/alex/x&timestamp=${SECONDS}secret-456`));
});

test('destroy never throws: a failure is only logged', async () => {
  stubCloudinary(new Error('down'));
  await createCloudinary(config).destroy('x');

  mock.restoreAll();
  mock.method(console, 'error', () => {});
  stubCloudinary(reply(500, {}));
  await createCloudinary(config).destroy('x');
});
