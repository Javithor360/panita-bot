import './support';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idFromText, lookupFailureText, resolveTarget, type TargetSource } from '../src/features/lookup/resolve';
import { matchScore, normalize, rankMembers, type LookupMember } from '../src/features/lookup/rank';
import { pickMenu } from '../src/features/lookup/pick';
import { decodeCustomId } from '../src/core/customId';
import { EMOJIS } from '../src/config/emojis';

let counter = 0;
const member = (displayName: string, extra: Partial<LookupMember> = {}): LookupMember => ({
  id: String(100_000_000_000_000_000n + BigInt(++counter)),
  username: displayName.toLowerCase().replace(/\s/g, ''),
  globalName: null,
  nickname: null,
  displayName,
  ...extra,
});

const source = (options: { cached?: LookupMember[]; remote?: LookupMember[]; accounts?: string[]; searchFails?: boolean } = {}): TargetSource => ({
  cachedMembers: () => options.cached ?? [],
  searchMembers: async () => {
    if (options.searchFails) throw new Error('rate limited');
    return options.remote ?? [];
  },
  accountExists: async id => (options.accounts ?? []).includes(id),
});

const SELF = '900000000000000001';
const none = { user: null, query: null, selfId: SELF };

test('names are compared without case, accents or a leading @', () => {
  assert.equal(normalize('  @Ángel Ñandú '), 'angel nandu');
  assert.equal(matchScore('ANGEL', member('Ángel')), 3);
  assert.equal(matchScore('@angel', member('Ángel')), 3);
});

test('an exact name beats one that starts with the text, which beats one that contains it', () => {
  assert.equal(matchScore('javi', member('Javi')), 3);
  assert.equal(matchScore('jav', member('Javi')), 2);
  assert.equal(matchScore('avi', member('Javi')), 1);
  assert.equal(matchScore('xyz', member('Javi')), 0);
  assert.equal(matchScore('', member('Javi')), 0);
});

test('any of the names counts: username, global name, nickname', () => {
  const ana = member('Anita', { username: 'ana_92', globalName: 'Ana García', nickname: 'Anita' });
  assert.equal(matchScore('ana_92', ana), 3);
  assert.equal(matchScore('ana garcia', ana), 3);
  assert.equal(matchScore('anita', ana), 3);
  assert.equal(matchScore('garc', ana), 1);
});

test('the matches are ranked best first, shorter names first among equals, without repeats', () => {
  const javi = member('Javi');
  const javier = member('Javier');
  const hijavi = member('HiJavi');
  const ranked = rankMembers('javi', [hijavi, javier, javi, javi]);
  assert.deepEqual(ranked.map(entry => entry.member.displayName), ['Javi', 'Javier', 'HiJavi']);
  assert.deepEqual(ranked.map(entry => entry.score), [3, 2, 1]);
});

test('nothing given: the person who asked', async () => {
  assert.deepEqual(await resolveTarget(source(), none), { kind: 'found', userId: SELF });
  assert.deepEqual(await resolveTarget(source(), { ...none, query: '   ' }), { kind: 'found', userId: SELF });
});

test('a user (option, mention or ID the parser took) is used as is, even when nobody knows them', async () => {
  assert.deepEqual(await resolveTarget(source(), { ...none, user: { id: '555' } }), { kind: 'found', userId: '555' });
});

test('an ID or a mention in the text finds an account that is not in the server', async () => {
  const outside = '481512865795145730';
  const src = source({ accounts: [outside] });
  assert.deepEqual(await resolveTarget(src, { ...none, query: outside }), { kind: 'found', userId: outside });
  assert.deepEqual(await resolveTarget(src, { ...none, query: `<@${outside}>` }), { kind: 'found', userId: outside });
  assert.deepEqual(await resolveTarget(src, { ...none, query: `<@!${outside}>` }), { kind: 'found', userId: outside });
});

test('an ID that belongs to nobody is its own failure', async () => {
  assert.deepEqual(await resolveTarget(source(), { ...none, query: '481512865795145730' }), { kind: 'none', reason: 'unknown_id' });
  assert.equal(lookupFailureText('unknown_id'), 'esa ID no pertenece a nadie.');
});

test('a name with one match uses that person', async () => {
  const javi = member('Javi');
  const result = await resolveTarget(source({ cached: [javi, member('Ana')] }), { ...none, query: 'jav' });
  assert.deepEqual(result, { kind: 'found', userId: javi.id });
});

test('a name finds members that are not cached through the search', async () => {
  const far = member('Raycoleck');
  const result = await resolveTarget(source({ remote: [far] }), { ...none, query: 'rayco' });
  assert.deepEqual(result, { kind: 'found', userId: far.id });
  // The same person in the cache and in the search is one candidate
  assert.deepEqual(await resolveTarget(source({ cached: [far], remote: [far] }), { ...none, query: 'rayco' }), { kind: 'found', userId: far.id });
});

test('when the search fails the cache is still used', async () => {
  const javi = member('Javi');
  const result = await resolveTarget(source({ cached: [javi], searchFails: true }), { ...none, query: 'javi' });
  assert.deepEqual(result, { kind: 'found', userId: javi.id });
});

test('several matches ask for confirmation, best first, unless exactly one is an exact match', async () => {
  const javi = member('Javi');
  const javier = member('Javier');
  const exact = await resolveTarget(source({ cached: [javier, javi] }), { ...none, query: 'javi' });
  assert.deepEqual(exact, { kind: 'found', userId: javi.id });

  const sameName = [member('Javi'), member('Javi')];
  const ambiguous = await resolveTarget(source({ cached: sameName }), { ...none, query: 'javi' });
  assert.equal(ambiguous.kind, 'ask');

  const partial = await resolveTarget(source({ cached: [member('Javier'), member('Javiera')] }), { ...none, query: 'jav' });
  assert.equal(partial.kind === 'ask' && partial.candidates.length, 2);
  assert.deepEqual(partial.kind === 'ask' && partial.candidates.map(c => c.displayName), ['Javier', 'Javiera']);
});

test('no match, and too many matches, are failures with Noa\'s words', async () => {
  assert.deepEqual(await resolveTarget(source({ cached: [member('Ana')] }), { ...none, query: 'zzz' }), { kind: 'none', reason: 'no_match' });
  assert.equal(lookupFailureText('no_match'), 'no hay usuarios que coincidan con tu búsqueda, intenta ser más específico.');

  const crowd = Array.from({ length: 26 }, (_, i) => member(`Javi${i}`));
  assert.deepEqual(await resolveTarget(source({ cached: crowd }), { ...none, query: 'javi' }), { kind: 'none', reason: 'too_many' });
  assert.equal(lookupFailureText('too_many'), 'muchos usuarios coinciden con tu búsqueda, intenta ser más específico.');

  const edge = Array.from({ length: 25 }, (_, i) => member(`Javi${i}`));
  assert.equal((await resolveTarget(source({ cached: edge }), { ...none, query: 'javi' })).kind, 'ask');
});

test('idFromText only takes a mention or a full ID', () => {
  assert.equal(idFromText(' <@123456789012345678> '), '123456789012345678');
  assert.equal(idFromText('123456789012345678'), '123456789012345678');
  assert.equal(idFromText('12345'), null);
  assert.equal(idFromText('javi'), null);
  assert.equal(idFromText('<@&123456789012345678>'), null);
});

test('the confirmation menu lists up to 25 people with their account, in the voice of the bot', () => {
  const people = Array.from({ length: 30 }, (_, i) => member(`Persona ${i}`));
  const message = pickMenu({ displayName: 'Javi' }, 'persona', people, 'user:pick:badges|123456789012345678');

  assert.equal(message.content, `${EMOJIS.idle} ~ **Javi**, encontré varias personas con \`persona\`, elige a quién te refieres:`);
  assert.deepEqual(message.allowedMentions, { parse: [] });

  const row = (message.components![0] as any).toJSON();
  const menu = row.components[0];
  assert.equal(menu.options.length, 25);
  assert.equal(menu.options[0].value, people[0].id);
  assert.match(menu.options[0].description, /^@persona0 · \d+$/);
  assert.equal(menu.custom_id, 'user:pick:badges|123456789012345678');
});

test('long names and a query with backticks cannot break the menu', () => {
  const long = member('x'.repeat(300), { username: 'y'.repeat(300) });
  const message = pickMenu({ displayName: 'Javi' }, 'a`b'.repeat(40), [long], 'user:pick|1');
  const menu = (message.components![0] as any).toJSON().components[0];
  assert.ok(menu.options[0].label.length <= 100);
  assert.ok(menu.options[0].description.length <= 100);
  assert.equal(message.content!.includes('a`b'), false);
});

test('the flags travel in the custom id of the menu, which stays under the limit', () => {
  const owner = '123456789012345678';
  const message = pickMenu({ displayName: 'Javi' }, 'x', [member('Ana')], `user:pick:badges|${owner}`);
  const id = (message.components![0] as any).toJSON().components[0].custom_id as string;
  assert.ok(id.length <= 100);
  assert.deepEqual(decodeCustomId(id), { namespace: 'user', action: 'pick', args: ['badges'], owner });
});
