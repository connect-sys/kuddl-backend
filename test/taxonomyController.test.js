import { describe, it, expect } from 'vitest';
import { buildTaxonomyResponse } from '../src/controllers/taxonomyController.js';

const u = (qs) => new URL(`https://x/api/taxonomy${qs || ''}`);

describe('taxonomy endpoint shape', () => {
  it('returns all modules + subcategories by default', () => {
    const r = buildTaxonomyResponse(u());
    expect(r.success).toBe(true);
    expect(r.modules).toEqual(['ADVENTURE', 'BLOOM', 'CARE', 'DISCOVER']);
    expect(r.subcategories.BLOOM).toContain('Coding & Tech');
    expect(Array.isArray(r.careTitles)).toBe(true);
  });

  it('filters to one module', () => {
    const r = buildTaxonomyResponse(u('?module=bloom'));
    expect(r.module).toBe('BLOOM');
    expect(r.subcategories).toContain('Dance');
  });

  it('applies the inheritance rule for a partner', () => {
    const r = buildTaxonomyResponse(u('?partnerModules=BLOOM,CARE'));
    expect(Object.keys(r.subcategories).sort()).toEqual(['BLOOM', 'CARE']);
    expect(r.subcategories.ADVENTURE).toBeUndefined();
  });
});
