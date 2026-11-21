import './support';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { needsLookup } from '../src/features/ask/gate';
import type { KnownNames } from '../src/services/knowledge';

const NONE: KnownNames = { editions: [], forms: [] };
const KNOWN: KnownNames = {
  editions: [
    { id: 'tezzlar3', name: 'Tezzlar III', started_at: null, ended_at: null, is_canon: true },
    { id: 'panitamon', name: 'Panitamon', started_at: null, ended_at: null, is_canon: true },
    { id: 'x2', name: '2', started_at: null, ended_at: null, is_canon: false },
  ],
  forms: [{ slug: 'survey-tezzlar3', title: 'Formulario Diagnóstico', description: null, is_open: true, require_login: true, question_count: 3 }],
};

describe('lookup gate', () => {
  for (const question of [
    '¿Quién es Javithor360 jugador?',
    '¿Cuántos emblemas tiene Pepe?',
    '¿Quién estuvo en la edición de Panitamon?',
    '¿Cuánto duró la última edición?',
    'Dame una foto de Pepe',
    '¿Cuál es la foto con más likes?',
    '¿Quién fue el Panita del Mes de marzo?',
    '¿Quién donó en más ediciones?',
    '¿Cuándo es el cumpleaños de Pepe?',
    '¿Qué instancias hay?',
    '¿Qué sabes de la encuesta?',
    '¿Qué proyecto viene después?',
    '¿Hay algún servidor abierto?',
    '¿Ya anunciaron algo nuevo?',
  ]) {
    it(`lets through: ${question}`, () => assert.equal(needsLookup(question, NONE), true));
  }

  for (const question of ['hola, ¿cómo estás?', '¿Cómo me uno al servidor?', '¿Cuál es la IP?', 'cuéntame un chiste', '¿Cuáles son las reglas?']) {
    it(`keeps out: ${question}`, () => assert.equal(needsLookup(question, KNOWN), false));
  }

  it('lets through a question that names an edition or a form that the API listed', () => {
    assert.equal(needsLookup('cuéntame de Panitamon', KNOWN), true);
    assert.equal(needsLookup('que paso en tezzlar iii', KNOWN), true);
    assert.equal(needsLookup('qué hay en survey-tezzlar3', KNOWN), true);
    assert.equal(needsLookup('el formulario diagnostico', KNOWN), true);
  });

  it('does not treat a very short name as a hit, nor a name inside another word', () => {
    assert.equal(needsLookup('tengo 2 perros', KNOWN), false);
    assert.equal(needsLookup('el panitamonster es gracioso', KNOWN), false);
  });

  it('before the lists are read, only the keywords decide', () => {
    assert.equal(needsLookup('cuéntame de Panitamon', NONE), false);
  });

  it('matches without caring about accents or case', () => {
    assert.equal(needsLookup('¿QUIEN ES EL JUGADOR?', NONE), true);
    assert.equal(needsLookup('dame una FOTO al azar', NONE), true);
  });
});
