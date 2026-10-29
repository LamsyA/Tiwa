import { describe, expect, it } from 'vitest';
import {
  EVENT_FORMATS,
  EVENT_TYPES,
  FORMAT_RULES,
  TIMEFRAMES,
  VENDOR_CATEGORIES,
  getEventType,
  suggestEventName,
} from './index.js';

describe('event-type templates (P3-T01)', () => {
  it('has at least 20 templates covering all four formats', () => {
    expect(EVENT_TYPES.length).toBeGreaterThanOrEqual(20);
    for (const format of EVENT_FORMATS) {
      expect(
        EVENT_TYPES.some((template) => template.format === format),
        format,
      ).toBe(true);
    }
  });

  it('has unique template keys in snake_case', () => {
    const keys = EVENT_TYPES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it.each(EVENT_TYPES.map((template) => [template.key, template] as const))(
    '%s is complete and consistent',
    (_key, template) => {
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.days).toBeGreaterThanOrEqual(1);
      expect(template.defaultDurationHours).toBeGreaterThan(0);

      // Checklist: unique keys, known timeframes.
      const checklistKeys = template.checklist.map((item) => item.key);
      expect(new Set(checklistKeys).size, 'duplicate checklist key').toBe(checklistKeys.length);
      expect(template.checklist.length).toBeGreaterThanOrEqual(8);
      for (const item of template.checklist) expect(TIMEFRAMES).toContain(item.timeframe);

      // Budget: unique keys, whole percents summing to 100.
      const budgetKeys = template.budget.map((split) => split.key);
      expect(new Set(budgetKeys).size).toBe(budgetKeys.length);
      expect(template.budget.reduce((sum, split) => sum + split.percent, 0)).toBe(100);
      for (const split of template.budget) expect(Number.isInteger(split.percent) && split.percent > 0).toBe(true);

      // Vendor categories exist in the marketplace list.
      for (const category of template.vendorCategories) expect(Object.keys(VENDOR_CATEGORIES)).toContain(category);

      // Programme keys unique; tickets only where the format allows them.
      const programmeKeys = template.programme.map((item) => item.key);
      expect(new Set(programmeKeys).size).toBe(programmeKeys.length);
      if (template.features.tickets) expect(FORMAT_RULES[template.format].ticketsAllowed).toBe(true);
    },
  );

  it('format rules: PUBLIC only where allowed, default visibility is offered', () => {
    for (const format of EVENT_FORMATS) {
      const rules = FORMAT_RULES[format];
      expect(rules.visibilities).toContain(rules.defaultVisibility);
      expect(rules.ticketsAllowed).toBe(rules.visibilities.includes('PUBLIC'));
    }
    expect(FORMAT_RULES.PRIVATE_CELEBRATION.visibilities).not.toContain('PUBLIC');
  });

  it('suggests a name from the host first name', () => {
    const birthday = getEventType('birthday');
    expect(birthday).toBeDefined();
    expect(suggestEventName(birthday!, 'Ada')).toBe("Ada's Birthday");
    expect(suggestEventName(birthday!, '  ')).toBe('Birthday');
    expect(getEventType('nope')).toBeUndefined();
  });
});
