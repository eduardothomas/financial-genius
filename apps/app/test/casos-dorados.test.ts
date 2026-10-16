import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHIVO, generar } from '../scripts/casos-dorados';

describe('casos dorados para iOS', () => {
  it('el JSON de iOS está al día con los textos y formatos de esta app', () => {
    const actual = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
    assert.deepEqual(actual, JSON.parse(JSON.stringify(generar())), 'Corre: pnpm --filter @fg/app casos-dorados');
  });
});
