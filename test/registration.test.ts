import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegisterModal,
  CONFIRM_INPUT,
  IGN_INPUT,
  parseStatus,
  PASSWORD_INPUT,
  registerStep,
  validateFields,
} from '../src/lib/registration';

const account = (overrides: Partial<{ enabled: boolean; ign: string | null; minecraft_status: 'premium' | 'cracked' | null }> = {}) => ({
  enabled: false,
  ign: null,
  minecraft_status: null,
  ...overrides,
});

test('registerStep: a new member is asked everything', () => {
  assert.equal(registerStep(account(), false), 'new');
  assert.equal(registerStep(account(), true), 'new');
});

test('registerStep: a deactivated member keeps their IGN and only confirms it', () => {
  assert.equal(registerStep(account({ ign: 'Steve', minecraft_status: 'premium' }), false), 'returning');
  assert.equal(registerStep(account({ ign: 'Steve' }), true), 'returning');
});

test('registerStep: an active member without a status is only asked the status', () => {
  assert.equal(registerStep(account({ enabled: true, ign: 'Steve' }), false), 'status_only');
});

test('registerStep: an active member with a status has nothing left to do', () => {
  assert.equal(registerStep(account({ enabled: true, ign: 'Steve', minecraft_status: 'cracked' }), false), 'done');
});

test('registerStep: asking for a password on an active account goes straight to the password form', () => {
  assert.equal(registerStep(account({ enabled: true, ign: 'Steve', minecraft_status: 'premium' }), true), 'password');
  assert.equal(registerStep(account({ enabled: true, ign: 'Steve' }), true), 'password');
});

test('parseStatus accepts only the two statuses', () => {
  assert.equal(parseStatus('premium'), 'premium');
  assert.equal(parseStatus('cracked'), 'cracked');
  for (const value of ['', 'Premium', 'other', undefined]) assert.equal(parseStatus(value), null);
});

const inputIds = (modal: ReturnType<typeof buildRegisterModal>) =>
  modal.toJSON().components.flatMap(row => ('components' in row ? row.components.map(c => ('custom_id' in c ? c.custom_id : '')) : []));

test('buildRegisterModal asks for the IGN alone, the password alone, or both', () => {
  assert.deepEqual(inputIds(buildRegisterModal('register:submit', 'T', { askIgn: true, askPassword: false })), [IGN_INPUT]);
  assert.deepEqual(inputIds(buildRegisterModal('register:submit', 'T', { askIgn: false, askPassword: true })), [PASSWORD_INPUT, CONFIRM_INPUT]);
  assert.deepEqual(inputIds(buildRegisterModal('register:submit', 'T', { askIgn: true, askPassword: true })), [IGN_INPUT, PASSWORD_INPUT, CONFIRM_INPUT]);
});

test('buildRegisterModal keeps the custom id and its limits', () => {
  const json = buildRegisterModal('register:submit:premium:1:ask', 'Activación de Cuenta', { askIgn: true, askPassword: true }).toJSON();

  assert.equal(json.custom_id, 'register:submit:premium:1:ask');
  const [ign, password] = json.components.flatMap(row => ('components' in row ? row.components : []));
  assert.ok('min_length' in ign && ign.min_length === 3 && ign.max_length === 16);
  assert.ok('min_length' in password && password.min_length === 6 && password.max_length === 32);
});

test('buildRegisterModal refuses a form with nothing to ask', () => {
  assert.throws(() => buildRegisterModal('x', 'T', { askIgn: false, askPassword: false }));
});

test('validateFields accepts a valid IGN and trims it', () => {
  assert.deepEqual(validateFields({ ign: ' Steve_01 ' }, { askIgn: true, askPassword: false }), { ok: true, ign: 'Steve_01' });
});

test('validateFields rejects a malformed IGN', () => {
  for (const ign of ['', 'ab', 'a'.repeat(17), 'Ste ve', 'Stéve', 'Steve!']) {
    assert.deepEqual(validateFields({ ign }, { askIgn: true, askPassword: false }), { ok: false, error: 'invalid_ign' });
  }
});

test('validateFields compares the password and its confirmation', () => {
  const fields = { askIgn: false, askPassword: true };

  assert.deepEqual(validateFields({ password: 'Panita#2026', confirm: 'Panita#2026' }, fields), { ok: true, password: 'Panita#2026' });
  assert.deepEqual(validateFields({ password: 'Panita#2026', confirm: 'Panita#2027' }, fields), { ok: false, error: 'password_mismatch' });
  assert.deepEqual(validateFields({ confirm: 'x' }, fields), { ok: false, error: 'password_mismatch' });
});

test('validateFields ignores fields that were not asked', () => {
  assert.deepEqual(validateFields({ ign: 'bad name', password: 'a', confirm: 'b' }, { askIgn: false, askPassword: false }), { ok: true });
});

test('validateFields checks the IGN before the password', () => {
  const result = validateFields({ ign: 'x', password: 'a', confirm: 'b' }, { askIgn: true, askPassword: true });

  assert.deepEqual(result, { ok: false, error: 'invalid_ign' });
});

test('the password rules are left to the API: a short or plain password passes the local check', () => {
  assert.deepEqual(validateFields({ password: 'abc', confirm: 'abc' }, { askIgn: false, askPassword: true }), { ok: true, password: 'abc' });
});
