import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryTitle, groupByCategory } from '../src/features/help/overview';

const commands = [
  { name: 'ping', category: 'Utilidad' },
  { name: 'ask', category: 'General' },
  { name: 'avatar', category: 'Utilidad' },
  { name: 'extra', category: 'Otra' },
  { name: 'donate', category: 'General' },
  { name: 'ocr', category: 'Utilidad' },
];

test('commands are grouped by category in the given order, with unknown categories last', () => {
  const groups = groupByCategory(commands, ['General', 'Utilidad', 'Minecraft']);
  assert.deepEqual(groups.map(g => g.category), ['General', 'Utilidad', 'Otra']);
  assert.deepEqual(groups[1].names, ['ping', 'avatar', 'ocr']);
});

test('the heading of a category shows how many commands it has', () => {
  const groups = groupByCategory(commands, ['General', 'Utilidad']);
  assert.deepEqual(groups.map(categoryTitle), ['📁 General [2]', '📁 Utilidad [3]', '📁 Otra [1]']);
});
