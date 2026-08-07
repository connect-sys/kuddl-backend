import { describe, it, expect } from 'vitest';
import t from '../src/config/taxonomy.js';

describe('Screen-H taxonomy', () => {
  it('has exactly the four launch modules', () => {
    expect(t.MODULES).toEqual(['ADVENTURE', 'BLOOM', 'CARE', 'DISCOVER']);
  });

  it('Bloom uses "Coding & Tech" (renamed from Tech Classes) and includes Languages', () => {
    expect(t.SUBCATEGORIES.BLOOM).toContain('Coding & Tech');
    expect(t.SUBCATEGORIES.BLOOM).toContain('Languages');
    expect(t.SUBCATEGORIES.BLOOM).not.toContain('Tech Classes');
  });

  it('Adventure has no planners/decorators/cakes', () => {
    const joined = t.SUBCATEGORIES.ADVENTURE.join('|').toLowerCase();
    expect(joined).not.toContain('planner');
    expect(joined).not.toContain('decorator');
    expect(joined).not.toContain('cake');
  });

  it('Care has the 11 services plus an Other review bucket', () => {
    expect(t.SUBCATEGORIES.CARE).toContain('Speech & Language Therapy');
    expect(t.SUBCATEGORIES.CARE).toContain('Other');
    expect(t.SUBCATEGORIES.CARE.length).toBe(12);
  });
});

describe('rename + removal helpers', () => {
  it('resolves the Tech Classes rename to Coding & Tech', () => {
    expect(t.resolveSubcategory('BLOOM', 'Tech Classes')).toBe('Coding & Tech');
  });
  it('resolves a valid label case-insensitively', () => {
    expect(t.resolveSubcategory('bloom', 'dance')).toBe('Dance');
  });
  it('returns null for an invalid sub-category', () => {
    expect(t.resolveSubcategory('BLOOM', 'Underwater Basket Weaving')).toBeNull();
  });
  it('flags removed sub-categories', () => {
    expect(t.isRemovedSubcategory('Decorators')).toBe(true);
    expect(t.isRemovedSubcategory('Birthday Planner')).toBe(true);
    expect(t.isRemovedSubcategory('Dance')).toBe(false);
  });
});

describe('Care forbidden services never on platform', () => {
  it('flags daycare/nanny/creche/japa/babysitting', () => {
    expect(t.isCareForbidden('Daycare center')).toBe(true);
    expect(t.isCareForbidden('Nanny agency')).toBe(true);
    expect(t.isCareForbidden('Night nurse & japa')).toBe(true);
    expect(t.isCareForbidden('Speech & Language Therapy')).toBe(false);
  });
});

describe('inheritance rule', () => {
  it('only shows sub-categories for the partner\'s ticked modules', () => {
    const allowed = t.allowedSubcategoriesForPartner(['BLOOM']);
    expect(Object.keys(allowed)).toEqual(['BLOOM']);
    expect(allowed.BLOOM).toContain('Dance');
  });
});
