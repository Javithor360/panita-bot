import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moderationDenial, type ModerationCheck } from '../src/features/moderation/checks';

const base = (override: Partial<ModerationCheck> = {}): ModerationCheck => ({
  moderatorId: 'mod',
  moderatorIsDeveloper: false,
  moderatorIsOwner: false,
  moderatorRolePosition: 10,
  targetId: 'target',
  target: { isStaff: false, rolePosition: 5, manageable: true },
  botId: 'bot',
  guildOwnerId: 'owner',
  ...override,
});

test('an ordinary member below the moderator can be sanctioned', () => {
  assert.equal(moderationDenial(base()), null);
});

test('nobody sanctions themselves, the bot or the owner', () => {
  assert.equal(moderationDenial(base({ targetId: 'mod' })), 'self');
  assert.equal(moderationDenial(base({ targetId: 'bot' })), 'bot');
  assert.equal(moderationDenial(base({ targetId: 'owner' })), 'owner');
});

test('yourself is refused even when the target is not in the server', () => {
  assert.equal(moderationDenial(base({ targetId: 'mod', target: null })), 'self');
});

test('someone who is not in the server can be banned: only the identity rules apply', () => {
  assert.equal(moderationDenial(base({ target: null })), null);
});

test('staff is protected from other staff, but not from the developer or the owner', () => {
  const staff = { isStaff: true, rolePosition: 1, manageable: true };
  assert.equal(moderationDenial(base({ target: staff })), 'staff');
  assert.equal(moderationDenial(base({ target: staff, moderatorIsDeveloper: true })), null);
  assert.equal(moderationDenial(base({ target: staff, moderatorIsOwner: true })), null);
});

test('a role equal or above the moderator is refused, unless they are the owner or the developer', () => {
  const equal = { isStaff: false, rolePosition: 10, manageable: true };
  const above = { isStaff: false, rolePosition: 11, manageable: true };
  assert.equal(moderationDenial(base({ target: equal })), 'hierarchyModerator');
  assert.equal(moderationDenial(base({ target: above })), 'hierarchyModerator');
  assert.equal(moderationDenial(base({ target: above, moderatorIsOwner: true })), null);
  assert.equal(moderationDenial(base({ target: above, moderatorIsDeveloper: true })), null);
});

test('a target the bot cannot reach is refused last, with its own reason', () => {
  const unreachable = { isStaff: false, rolePosition: 5, manageable: false };
  assert.equal(moderationDenial(base({ target: unreachable })), 'hierarchyBot');
  // The moderator's own rank is checked before the bot's
  assert.equal(moderationDenial(base({ target: { ...unreachable, rolePosition: 12 } })), 'hierarchyModerator');
});

test('without a known moderator rank the hierarchy of roles is not enforced, only the bot reach', () => {
  const above = { isStaff: false, rolePosition: 99, manageable: true };
  assert.equal(moderationDenial(base({ moderatorRolePosition: null, target: above })), null);
});
