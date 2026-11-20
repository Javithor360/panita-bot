import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import avatar from '../src/commands/utility/avatar';
import { UserError } from '../src/core/errors';
import { parsePrefixArgs, type ParseResult } from '../src/core/prefixParser';
import { pictureMessage } from '../src/features/info/avatarView';
import { buildPictureReply } from '../src/features/info/replies';

const schema = (avatar.data.toJSON().options ?? []) as any[];
const parsed = (raw: string) => {
  const result: ParseResult = parsePrefixArgs(raw, schema);
  assert.equal(result.kind, 'ok', raw);
  return (result as Extract<ParseResult, { kind: 'ok' }>).values;
};

test('avatar has --banner and --decoration next to --global, and each parses on its own', () => {
  for (const flag of ['global', 'banner', 'decoration']) {
    assert.deepEqual(parsed(`--${flag} Javi`).get(flag), { type: 'boolean', value: true }, flag);
    assert.deepEqual(parsed(`--${flag} Javi`).get('buscar'), { type: 'string', value: 'Javi' }, flag);
  }
  assert.deepEqual(parsed('--banner 481512865795145730').get('usuario'), { type: 'user', id: '481512865795145730' });
});

test('the banner and the decoration cannot be asked for together', async () => {
  const ctx = {
    options: { getBoolean: (name: string) => (name === 'banner' || name === 'decoration' ? true : null), getString: () => null, getUser: () => null },
    defer: async () => {},
  } as any;
  await assert.rejects(avatar.run(ctx), (error: unknown) => error instanceof UserError && /una sola opción/.test(error.message));
});

const formats = { png: 'https://cdn/b.png', jpg: 'https://cdn/b.jpg', webp: 'https://cdn/b.webp', gif: null };

test('a banner is shown big with its download links, and says whose it is', () => {
  const message = pictureMessage({ kind: 'banner', displayName: 'Javi', imageUrl: 'https://cdn/b.png?size=2048', formats, fromServer: true, random: () => 0 });
  const embed = (message.embeds![0] as any).toJSON();
  assert.equal(embed.title, 'Banner de Javi');
  assert.equal(embed.image.url, 'https://cdn/b.png?size=2048');
  assert.match(embed.footer.text, /Banner del servidor.*--global/);
  assert.deepEqual((message.components![0] as any).toJSON().components.map((b: any) => b.label), ['PNG', 'JPG', 'WebP']);

  const account = pictureMessage({ kind: 'banner', displayName: 'Javi', imageUrl: 'https://cdn/b.gif', formats: { ...formats, gif: 'https://cdn/b.gif' }, fromServer: false });
  assert.equal((account.embeds![0] as any).toJSON().footer.text, 'Banner de la cuenta');
  assert.deepEqual((account.components![0] as any).toJSON().components.map((b: any) => b.label), ['PNG', 'JPG', 'WebP', 'GIF']);
});

test('a decoration is shown big with one link and no footer', () => {
  const message = pictureMessage({ kind: 'decoration', displayName: 'Javi', imageUrl: 'https://cdn/d.png?size=512', formats: null });
  const embed = (message.embeds![0] as any).toJSON();
  assert.equal(embed.title, 'Decoración de Javi');
  assert.equal(embed.footer, undefined);
  assert.deepEqual((message.components![0] as any).toJSON().components.map((b: any) => b.label), ['Abrir']);
});

const fakes = (options: { userBanner?: string | null; memberBanner?: string | null; decoration?: string | null; inServer?: boolean }) => {
  const source = (hash: string | null | undefined, name: string) => ({
    banner: hash ?? null,
    displayName: name,
    bannerURL: ({ extension }: { extension?: string } = {}) => (hash ? `https://cdn/${name}-banner.${extension ?? 'png'}` : null),
  });
  const user = { ...source(options.userBanner, 'cuenta'), avatarDecorationURL: () => options.decoration ?? null, avatar: null };
  const member = options.inServer === false ? null : { ...source(options.memberBanner, 'miembro') };
  return {
    client: { users: { fetch: async () => user, cache: new Map() } },
    members: { fetch: async () => { if (!member) throw new Error('Unknown Member'); return member; } },
  } as any;
};

const embedOf = (message: Awaited<ReturnType<typeof buildPictureReply>>) => (message.embeds![0] as any).toJSON();

test('the server banner is shown for a member, and --global shows the account\'s', async () => {
  const guild = fakes({ userBanner: 'abc', memberBanner: 'def' });
  const server = embedOf(await buildPictureReply(guild, '1', 'banner', false));
  assert.equal(server.title, 'Banner de miembro');
  assert.equal(server.image.url, 'https://cdn/miembro-banner.png');
  assert.match(server.footer.text, /Banner del servidor/);

  const global = embedOf(await buildPictureReply(guild, '1', 'banner', true));
  assert.equal(global.title, 'Banner de cuenta');
  assert.equal(global.footer.text, 'Banner de la cuenta');
});

test('an animated banner is shown as a GIF and gets a GIF link', async () => {
  const message = await buildPictureReply(fakes({ userBanner: 'a_abc', inServer: false }), '1', 'banner', false);
  assert.equal((message.embeds![0] as any).toJSON().image.url, 'https://cdn/cuenta-banner.gif');
  assert.ok(((message.components![0] as any).toJSON().components as any[]).some(b => b.label === 'GIF'));
});

test('someone outside the server still has the account banner', async () => {
  const embed = embedOf(await buildPictureReply(fakes({ userBanner: 'abc', inServer: false }), '1', 'banner', false));
  assert.equal(embed.title, 'Banner de cuenta');
});

test('a person with no banner or no decoration gets a refusal, not an empty embed', async () => {
  await assert.rejects(buildPictureReply(fakes({}), '1', 'banner', false), (e: unknown) => e instanceof UserError && /no tiene un banner/.test(e.message));
  await assert.rejects(buildPictureReply(fakes({}), '1', 'decoration', false), (e: unknown) => e instanceof UserError && /no tiene una decoración/.test(e.message));
  const found = embedOf(await buildPictureReply(fakes({ decoration: 'https://cdn/deco.png' }), '1', 'decoration', false));
  assert.equal(found.image.url, 'https://cdn/deco.png');
});
