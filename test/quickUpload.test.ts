import { apiError, ok, silenceApiLogs, stubFetch } from './support';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudinaryError, type CloudinaryClient } from '../src/lib/cloudinary';
import { createQuickUpload, type ReactedMessage } from '../src/features/quickUpload/flow';
import { QUICK_UPLOAD, usableOptions } from '../src/features/quickUpload/rules';
import { REFUSAL_MESSAGES, UPLOAD_MESSAGES } from '../src/features/quickUpload/view';
import { decodeCustomId } from '../src/core/customId';
import galleryCommand from '../src/commands/fun/gallery';

beforeEach(() => silenceApiLogs());
afterEach(() => mock.restoreAll());

const CHANNEL = '903017941300281344';
const AUTHOR = '812345678901234567';
const NEWSTAMP = 'https://res.cloudinary.com/panita/image/upload/v1/panita-web/gallery/ed2/alex_dn/foto.png';

const OPTIONS = {
  can_upload: true,
  discord_name: 'alex_dn',
  editions: [
    { id: 'ed2', name: 'Tezzlar 3', restricted: false },
    { id: 'ed1', name: 'Tezzlar 2', restricted: true },
  ],
  // `others` and `logos` are hidden by the bot on top of what the API leaves out
  categories: [
    { id: 'build', name: 'Construcciones' },
    { id: 'paisajes', name: 'Paisajes' },
    { id: 'others', name: 'Otros' },
    { id: 'logos', name: 'Logos' },
  ],
};

const botUser = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  discord_id: AUTHOR,
  enabled: true,
  ign: 'alex',
  minecraft_status: 'premium',
  has_password: false,
  trusted_author: true,
  ...extra,
});

const image = (extra: Record<string, unknown> = {}) => ({
  url: 'https://cdn.discordapp.com/attachments/1/2/foto.png?ex=1',
  contentType: 'image/png',
  size: 1_000,
  name: 'foto.png',
  ...extra,
});

interface Reply {
  options: Record<string, unknown>;
  deleted: boolean;
}

/** A message that records what the bot does with it. */
const fakeMessage = (
  extra: { id?: string; channelId?: string; authorId?: string; bot?: boolean; webhookId?: string | null; attachments?: unknown[]; done?: boolean } = {},
) => {
  const reacted: string[] = [];
  const replies: Reply[] = [];
  const message = {
    id: extra.id ?? '1001',
    channelId: extra.channelId ?? CHANNEL,
    author: { id: extra.authorId ?? AUTHOR, bot: extra.bot ?? false },
    webhookId: extra.webhookId ?? null,
    attachments: { values: () => (extra.attachments ?? [image()]) as never },
    reactions: { cache: { get: (emoji: string) => (extra.done && emoji === '✅' ? { me: true } : undefined) } },
    react: async (emoji: string) => void reacted.push(emoji),
    reply: async (options: Record<string, unknown>) => {
      const reply: Reply = { options, deleted: false };
      replies.push(reply);
      return {
        delete: async () => {
          reply.deleted = true;
        },
      };
    },
    fetch: async () => message,
  };
  return { message: message as unknown as ReactedMessage, reacted, replies, raw: message };
};

/** A Cloudinary that records what it is asked and can be told to fail. */
const fakeCloudinary = (failUpload = false) => {
  const uploads: Array<{ size: number; contentType: string; folder: string }> = [];
  const destroyed: string[] = [];
  const client: CloudinaryClient = {
    async upload(file, contentType, folder) {
      if (failUpload) throw new CloudinaryError('Cloudinary refused the upload: down');
      uploads.push({ size: file.length, contentType, folder });
      return { url: NEWSTAMP, publicId: 'panita-web/gallery/ed2/alex_dn/foto' };
    },
    async destroy(publicId) {
      destroyed.push(publicId);
    },
  };
  return { client, uploads, destroyed };
};

/** A quick upload whose timers wait to be fired by the test. */
const setup = (extra: { channelId?: string | undefined; failUpload?: boolean; noCloudinary?: boolean } = {}) => {
  const timers: Array<{ run: () => void; ms: number }> = [];
  const cloud = fakeCloudinary(extra.failUpload);
  const quickUpload = createQuickUpload({
    channelId: 'channelId' in extra ? extra.channelId : CHANNEL,
    cloudinary: extra.noCloudinary ? undefined : cloud.client,
    setTimer: (run, ms) => {
      timers.push({ run, ms });
      return { unref() {} } as never;
    },
  });
  return { quickUpload, timers, cloud };
};

const download = () => new Response(Buffer.from('png-bytes'), { headers: { 'content-type': 'image/png' } });

/** A fake interaction that records, in order, what the handler answered. */
const fakeInteraction = (userId = AUTHOR, values: Record<string, string | string[]> = {}) => {
  const log: Array<[string, unknown]> = [];
  const record = (name: string) => async (arg?: unknown) => void log.push([name, arg]);
  const form: Record<string, string | string[]> = { title: 'Castillo', description: '', edition: ['ed2'], categories: ['build'], ...values };
  const interaction = {
    user: { id: userId },
    fields: {
      getTextInputValue: (id: string) => form[id] as string,
      getStringSelectValues: (id: string) => form[id] as string[],
    },
    showModal: record('showModal'),
    reply: record('reply'),
    deferReply: record('deferReply'),
    editReply: record('editReply'),
  };
  return { interaction: interaction as never, log, names: () => log.map(([name]) => name), last: () => log[log.length - 1][1] as { content: string } };
};

const EPHEMERAL = { flags: 64 };

/** Walks a photo through to a held offer: the author's own 👍 with the options answered by the API. */
const offered = async (h = setup(), message = fakeMessage()) => {
  stubFetch(ok(OPTIONS));
  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: message.message });
  return { ...h, ...message };
};

const submitForm = (h: ReturnType<typeof setup>, values: Record<string, string | string[]> = {}, userId = AUTHOR) => {
  const fake = fakeInteraction(userId, values);
  const done = h.quickUpload.components.uploadsubmit.run(fake.interaction as never, ['1001']);
  return { ...fake, done };
};

// ---------------------------------------------------------------------------
// The bot's 👍 on a trusted author's post
// ---------------------------------------------------------------------------

test('a trusted author\'s photo in the gallery channel gets the bot\'s 👍', async () => {
  const calls = stubFetch(ok(botUser()));
  const { message, reacted } = fakeMessage();

  await setup().quickUpload.onPost(message);

  assert.deepEqual(reacted, ['👍']);
  assert.deepEqual(calls, [{ method: 'GET', path: `/v1/discord/users/${AUTHOR}`, body: undefined }]);
});

test('a post that is not a member\'s photo in the gallery channel is not even looked up', async () => {
  const calls = stubFetch(ok(botUser()));
  const posts = [
    fakeMessage({ channelId: '1' }),
    fakeMessage({ bot: true }),
    fakeMessage({ webhookId: '99' }),
    fakeMessage({ attachments: [] }),
    fakeMessage({ attachments: [image({ contentType: 'video/mp4', name: 'clip.mp4' })] }),
    fakeMessage({ attachments: [image({ contentType: null })] }),
  ];

  for (const post of posts) await setup().quickUpload.onPost(post.message);

  assert.equal(calls.length, 0);
  assert.ok(posts.every(post => post.reacted.length === 0));
});

test('an author who is not a trusted author gets nothing', async () => {
  for (const user of [botUser({ trusted_author: false }), botUser({ enabled: false })]) {
    mock.restoreAll();
    silenceApiLogs();
    stubFetch(ok(user));
    const post = fakeMessage();
    await setup().quickUpload.onPost(post.message);
    assert.deepEqual(post.reacted, []);
  }

  mock.restoreAll();
  silenceApiLogs();
  stubFetch(apiError(404, 'not_found'));
  const unknown = fakeMessage();
  await setup().quickUpload.onPost(unknown.message);
  assert.deepEqual(unknown.reacted, []);
});

test('a failing lookup is logged and skips the reaction without throwing', async () => {
  stubFetch(apiError(503, 'unavailable'));
  const post = fakeMessage();

  await setup().quickUpload.onPost(post.message);

  assert.deepEqual(post.reacted, []);
});

test('without a gallery channel or without Cloudinary the quick upload is off', async () => {
  const calls = stubFetch(ok(botUser()), ok(OPTIONS));
  for (const h of [setup({ channelId: undefined }), setup({ noCloudinary: true })]) {
    const post = fakeMessage();
    await h.quickUpload.onPost(post.message);
    await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message });
    assert.deepEqual(post.reacted, []);
    assert.deepEqual(post.replies, []);
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// The author's own 👍
// ---------------------------------------------------------------------------

test('only the author\'s own 👍 on a photo starts anything', async () => {
  const calls = stubFetch(ok(OPTIONS));
  const h = setup();
  const post = fakeMessage();
  const cases = [
    { emoji: '👍', userId: '999' }, // someone else's 👍 is a social like: nothing is stored or asked
    { emoji: '❤️', userId: AUTHOR },
    { emoji: null, userId: AUTHOR },
  ];

  for (const reaction of cases) await h.quickUpload.onReaction({ ...reaction, message: post.message });
  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: fakeMessage({ attachments: [] }).message });
  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: fakeMessage({ channelId: '1' }).message });
  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: fakeMessage({ done: true }).message });

  assert.equal(calls.length, 0);
  assert.deepEqual(post.replies, []);
});

test('an author who cannot upload gets nothing', async () => {
  stubFetch(ok({ can_upload: false, discord_name: 'alex_dn', editions: [], categories: [] }));
  const post = fakeMessage();

  await setup().quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message });

  assert.deepEqual(post.replies, []);
});

test('the offer mentions only the author and has a button only they can use', async () => {
  const h = await offered();

  assert.equal(h.replies.length, 1);
  const { content, components, allowedMentions } = h.replies[0].options as {
    content: string;
    components: Array<{ toJSON(): { components: Array<{ custom_id: string; label: string }> } }>;
    allowedMentions: unknown;
  };
  assert.match(content, new RegExp(`^<@${AUTHOR}>`));
  assert.deepEqual(allowedMentions, { users: [AUTHOR], repliedUser: false });
  const button = components[0].toJSON().components[0];
  assert.equal(button.label, 'Subir a la galería');
  assert.deepEqual(decodeCustomId(button.custom_id), { namespace: 'gallery', action: 'upload', args: ['1001'], owner: AUTHOR });
  assert.equal(h.timers.at(-1)?.ms, QUICK_UPLOAD.offerTtlMs);
});

test('a second 👍 while the offer is up makes no second offer', async () => {
  const h = await offered();
  const calls = stubFetch(ok(OPTIONS));

  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: h.message });

  assert.equal(h.replies.length, 1);
  assert.equal(calls.length, 0);
});

test('two 👍 at the same moment make a single offer', async () => {
  stubFetch(ok(OPTIONS));
  const h = setup();
  const post = fakeMessage();

  await Promise.all([
    h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message }),
    h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message }),
  ]);

  assert.equal(post.replies.length, 1);
});

test('the offer removes its reply after about two minutes, and its button is then gone', async () => {
  const h = await offered();

  h.timers.find(timer => timer.ms === QUICK_UPLOAD.offerTtlMs)?.run();

  assert.equal(h.replies[0].deleted, true);
  const press = fakeInteraction();
  await h.quickUpload.components.upload.run(press.interaction as never, ['1001']);
  assert.deepEqual(press.log, [['reply', { content: UPLOAD_MESSAGES.expired, flags: 64 }]]);
});

test('when the options cannot be loaded and none are remembered, the author is told briefly and the notice goes away', async () => {
  stubFetch(apiError(503, 'unavailable'));
  const h = setup();
  const post = fakeMessage();

  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message });

  assert.equal(post.replies.length, 1);
  assert.equal(post.replies[0].options.content, UPLOAD_MESSAGES.optionsUnavailable(AUTHOR));
  assert.equal(h.quickUpload.offers.has('1001'), false);
  h.timers.find(timer => timer.ms === QUICK_UPLOAD.noticeTtlMs)?.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(post.replies[0].deleted, true);
});

test('when the options cannot be loaded the last ones are used', async () => {
  stubFetch(ok(OPTIONS), apiError(503, 'unavailable'));
  const h = setup();
  const first = fakeMessage({ id: '1001' });
  const second = fakeMessage({ id: '1002' });

  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: first.message });
  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: second.message });

  assert.equal(second.replies.length, 1);
  assert.equal(second.replies[0].options.content, UPLOAD_MESSAGES.open(AUTHOR, 1));
  assert.deepEqual(h.quickUpload.offers.get('1002')?.options, usableOptions(OPTIONS));
});

test('a slow answer counts as a failure: the options are asked with a short time limit and no retry', async () => {
  const calls = stubFetch(apiError(503, 'unavailable'));

  await setup().quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: fakeMessage().message });

  assert.equal(calls.length, 1);
});

test('the categories the bot hides are not offered', () => {
  const usable = usableOptions(OPTIONS);

  assert.deepEqual(usable.categories.map(category => category.id), ['build', 'paisajes']);
  assert.deepEqual(usable.editions.map(edition => edition.id), ['ed2', 'ed1']);
});

test('at most 25 options reach a select menu: the newest editions', () => {
  const editions = Array.from({ length: 30 }, (_, index) => ({ id: `ed${index}`, name: `Edición ${index}`, restricted: false }));

  const usable = usableOptions({ ...OPTIONS, editions });

  assert.equal(usable.editions.length, 25);
  assert.equal(usable.editions[0].id, 'ed0');
});

test('with nothing to choose the author is told instead of getting a form that cannot be built', async () => {
  stubFetch(ok({ ...OPTIONS, categories: [{ id: 'others', name: 'Otros' }] }));
  const h = setup();
  const post = fakeMessage();

  await h.quickUpload.onReaction({ emoji: '👍', userId: AUTHOR, message: post.message });

  assert.equal(post.replies[0].options.content, UPLOAD_MESSAGES.noOptions(AUTHOR));
  assert.equal(h.quickUpload.offers.has('1001'), false);
});

// ---------------------------------------------------------------------------
// The button and the form
// ---------------------------------------------------------------------------

test('/gallery carries the quick upload\'s button and form next to its own', () => {
  for (const action of ['upload', 'uploadsubmit', 'reroll', 'link']) assert.ok(galleryCommand.components[action], action);
});

test('the button opens the form straight away, from what the offer holds', async () => {
  const calls = stubFetch(ok({}));
  const h = await offered();
  calls.length = 0;
  const press = fakeInteraction();

  await h.quickUpload.components.upload.run(press.interaction as never, ['1001']);

  assert.deepEqual(press.names(), ['showModal']);
  assert.equal(calls.length, 0, 'nothing is asked of the API before the form');
  const modal = (press.log[0][1] as { toJSON(): { custom_id: string; components: Array<{ label: string; component: Record<string, unknown> }> } }).toJSON();
  assert.deepEqual(decodeCustomId(modal.custom_id), { namespace: 'gallery', action: 'uploadsubmit', args: ['1001'], owner: AUTHOR });
  const [title, description, edition, categories] = modal.components;
  assert.equal(title.component.max_length, 200);
  assert.equal(title.component.required, true);
  assert.equal(description.component.max_length, 2000);
  assert.equal(description.component.required, false);
  const editionMenu = edition.component as { min_values: number; max_values: number; options: Array<{ value: string; default?: boolean }> };
  assert.deepEqual([editionMenu.min_values, editionMenu.max_values], [1, 1]);
  assert.deepEqual(editionMenu.options.map(option => [option.value, option.default ?? false]), [['ed2', true], ['ed1', false]]);
  const categoryMenu = categories.component as { min_values: number; max_values: number; options: Array<{ value: string }> };
  assert.deepEqual([categoryMenu.min_values, categoryMenu.max_values], [1, 2]);
  assert.deepEqual(categoryMenu.options.map(option => option.value), ['build', 'paisajes']);
});

test('the button is refused for anyone but the author, and while an upload is running', async () => {
  const h = await offered();
  const stranger = fakeInteraction('999');
  await h.quickUpload.components.upload.run(stranger.interaction as never, ['1001']);
  assert.deepEqual(stranger.log, [['reply', { content: UPLOAD_MESSAGES.expired, ...EPHEMERAL }]]);

  const offer = h.quickUpload.offers.get('1001');
  assert.ok(offer);
  offer.state = 'uploading';
  const busy = fakeInteraction();
  await h.quickUpload.components.upload.run(busy.interaction as never, ['1001']);
  assert.deepEqual(busy.log, [['reply', { content: UPLOAD_MESSAGES.busy, ...EPHEMERAL }]]);
});

test('a button or form with no offer behind it says so privately', async () => {
  const h = setup();
  for (const handler of [h.quickUpload.components.upload, h.quickUpload.components.uploadsubmit]) {
    const fake = fakeInteraction();
    await handler.run(fake.interaction as never, ['1001']);
    assert.deepEqual(fake.log, [['reply', { content: UPLOAD_MESSAGES.expired, ...EPHEMERAL }]]);
    const missing = fakeInteraction();
    await handler.run(missing.interaction as never, []);
    assert.deepEqual(missing.names(), ['reply']);
  }
});

// ---------------------------------------------------------------------------
// The upload
// ---------------------------------------------------------------------------

test('a submitted form uploads to the website\'s folder, saves the photo, adds ✅, removes the offer and sends the link', async () => {
  const h = await offered();
  const calls = stubFetch(download(), ok({ id: 'photo-1' }, {}, 201));
  const form = fakeInteraction(AUTHOR, { title: ' Castillo ', description: ' Desde la torre ', categories: ['build', 'paisajes'] });

  await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

  assert.deepEqual(form.log[0], ['deferReply', EPHEMERAL], 'the acknowledgement is private and first');
  assert.deepEqual(h.cloud.uploads, [{ size: 9, contentType: 'image/png', folder: 'panita-web/gallery/ed2/alex_dn' }]);
  assert.equal(calls[0].path, image().url, 'the image is read from Discord, at the link of the message as it is now');
  assert.deepEqual(calls[1], {
    method: 'POST',
    path: '/v1/discord/photos',
    body: { discord_id: AUTHOR, url: NEWSTAMP, title: 'Castillo', description: 'Desde la torre', edition_id: 'ed2', category_ids: ['build', 'paisajes'] },
  });
  assert.deepEqual(h.reacted, ['✅']);
  assert.equal(h.replies[0].deleted, true);
  assert.equal(h.quickUpload.offers.has('1001'), false);
  assert.equal(form.last().content, UPLOAD_MESSAGES.done('photo-1'));
  assert.match(form.last().content, /gallery\?photo=photo-1/);
  assert.deepEqual(h.cloud.destroyed, []);
});

test('an empty description is sent as none', async () => {
  const h = await offered();
  const calls = stubFetch(download(), ok({ id: 'photo-1' }, {}, 201));

  await h.quickUpload.components.uploadsubmit.run(fakeInteraction(AUTHOR, { description: '  ' }).interaction as never, ['1001']);

  assert.equal((calls[1].body as { description: unknown }).description, null);
});

test('a form value that is not among the offered options uploads nothing and leaves the offer up', async () => {
  const h = await offered();
  const calls = stubFetch(download());

  for (const values of [{ edition: ['ed99'] }, { categories: ['epic_build'] }, { categories: [] }, { title: '   ' }]) {
    const form = fakeInteraction(AUTHOR, values);
    await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);
    assert.equal(form.last().content, REFUSAL_MESSAGES.invalid);
  }

  assert.equal(calls.length, 0);
  assert.equal(h.cloud.uploads.length, 0);
  assert.equal(h.quickUpload.offers.get('1001')?.state, 'open');
});

test('an image over 8 MB is refused before anything is uploaded, whatever Discord reported', async () => {
  const reported = await offered(setup(), fakeMessage({ attachments: [image({ size: QUICK_UPLOAD.maxBytes + 1 })] }));
  const calls = stubFetch(download());
  const first = fakeInteraction();
  await reported.quickUpload.components.uploadsubmit.run(first.interaction as never, ['1001']);
  assert.equal(first.last().content, UPLOAD_MESSAGES.tooBig);
  assert.equal(calls.length, 0, 'not even downloaded');
  assert.equal(reported.replies[0].deleted, true);

  // Discord says it is small but the bytes are not
  const lying = await offered();
  stubFetch(new Response(Buffer.alloc(QUICK_UPLOAD.maxBytes + 1), { headers: { 'content-type': 'image/png' } }));
  const second = fakeInteraction();
  await lying.quickUpload.components.uploadsubmit.run(second.interaction as never, ['1001']);
  assert.equal(second.last().content, UPLOAD_MESSAGES.tooBig);
  assert.equal(lying.cloud.uploads.length, 0);
});

test('exactly 8 MB is accepted', async () => {
  const h = await offered();
  stubFetch(new Response(Buffer.alloc(QUICK_UPLOAD.maxBytes), { headers: { 'content-type': 'image/png' } }), ok({ id: 'photo-1' }, {}, 201));

  await h.quickUpload.components.uploadsubmit.run(fakeInteraction().interaction as never, ['1001']);

  assert.equal(h.cloud.uploads[0].size, QUICK_UPLOAD.maxBytes);
});

test('when the API refuses the photo the file is removed and the author is told why', async () => {
  const refusals: Array<[Response, string]> = [
    [apiError(403, 'forbidden'), REFUSAL_MESSAGES.not_allowed],
    [apiError(400, 'invalid_request', { reason: 'unknown_id', fields: ['edition_id'] }), REFUSAL_MESSAGES.unknown_id],
    [apiError(403, 'forbidden', { fields: ['category_ids'] }), REFUSAL_MESSAGES.reserved_category],
    [apiError(404, 'not_found'), REFUSAL_MESSAGES.not_found],
    [apiError(409, 'conflict'), REFUSAL_MESSAGES.invalid],
  ];

  for (const [answer, message] of refusals) {
    const h = await offered();
    stubFetch(download(), answer);
    const form = fakeInteraction();

    await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

    assert.deepEqual(h.cloud.destroyed, ['panita-web/gallery/ed2/alex_dn/foto'], message);
    assert.equal(form.last().content, message);
    assert.deepEqual(h.reacted, [], 'no ✅ for a photo that was not saved');
    assert.equal(h.replies[0].deleted, true);
    mock.restoreAll();
    silenceApiLogs();
  }
});

test('when the outcome is unknown the file is kept and the author is told to check the gallery', async () => {
  const outcomes = [apiError(503, 'unavailable'), apiError(500, 'internal'), new Error('connection reset')];

  for (const outcome of outcomes) {
    const h = await offered();
    stubFetch(download(), outcome);
    const form = fakeInteraction();

    await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

    assert.deepEqual(h.cloud.destroyed, [], 'the photo may have been saved');
    assert.equal(form.last().content, UPLOAD_MESSAGES.unknownOutcome);
    assert.deepEqual(h.reacted, []);
    assert.equal(h.quickUpload.offers.has('1001'), false, 'a retry could save it twice');
    mock.restoreAll();
    silenceApiLogs();
  }
});

test('when Cloudinary fails the offer stays up for another try and the API is never asked', async () => {
  const h = await offered(setup({ failUpload: true }));
  const calls = stubFetch(download());
  const form = fakeInteraction();

  await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

  assert.equal(form.last().content, UPLOAD_MESSAGES.storageFailed);
  assert.equal(calls.filter(call => call.path === '/v1/discord/photos').length, 0);
  assert.equal(h.quickUpload.offers.get('1001')?.state, 'open');
  assert.equal(h.replies[0].deleted, false);
});

test('a download that fails also leaves the offer up', async () => {
  const h = await offered();
  stubFetch(new Response('', { status: 404 }));
  const form = fakeInteraction();

  await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

  assert.equal(form.last().content, UPLOAD_MESSAGES.storageFailed);
  assert.equal(h.quickUpload.offers.get('1001')?.state, 'open');
});

test('a message that was deleted or lost its image ends the offer', async () => {
  const h = await offered();
  h.raw.fetch = async () => {
    throw new Error('Unknown Message');
  };
  const form = fakeInteraction();

  await h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']);

  assert.equal(form.last().content, UPLOAD_MESSAGES.gone);
  assert.equal(h.replies[0].deleted, true);
  assert.equal(h.cloud.uploads.length, 0);
});

test('a double submit uploads once: the second finds the offer busy', async () => {
  const h = await offered();
  stubFetch(download(), ok({ id: 'photo-1' }, {}, 201));

  const first = submitForm(h);
  const second = submitForm(h);
  await Promise.all([first.done, second.done]);

  assert.deepEqual(second.log, [['reply', { content: UPLOAD_MESSAGES.busy, ...EPHEMERAL }]]);
  assert.equal(h.cloud.uploads.length, 1);
  assert.equal(first.last().content, UPLOAD_MESSAGES.done('photo-1'));
});

test('a form from someone who is not the author uploads nothing', async () => {
  const h = await offered();
  const calls = stubFetch(download());

  const stranger = submitForm(h, {}, '999');
  await stranger.done;

  assert.deepEqual(stranger.log, [['reply', { content: UPLOAD_MESSAGES.expired, ...EPHEMERAL }]]);
  assert.equal(calls.length, 0);
});

test('an unexpected failure frees the offer for another try and is thrown for the router to report', async () => {
  const h = await offered();
  stubFetch(download(), ok({ id: 'photo-1' }, {}, 201));
  h.cloud.client.upload = async () => {
    throw new TypeError('boom');
  };
  const form = fakeInteraction();

  await assert.rejects(h.quickUpload.components.uploadsubmit.run(form.interaction as never, ['1001']), TypeError);

  assert.equal(h.quickUpload.offers.get('1001')?.state, 'open');
});
