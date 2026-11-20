import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  IsValidTimezoneOffset,
  IsValidCalendarDate,
  IsValidTimezoneOffsetConstraint,
  IsValidCalendarDateConstraint,
} from './date.validator';

class TestDto {
  @IsValidTimezoneOffset({ message: 'Invalid timezone offset' })
  offsetField!: string | null;

  @IsValidCalendarDate({ message: 'Invalid calendar date' })
  dateField!: string | null;
}

function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(TestDto, input);
  return validate(dto);
}

describe('IsValidTimezoneOffsetConstraint', () => {
  const constraint = new IsValidTimezoneOffsetConstraint();

  it('accepts Z', () => {
    expect(constraint.validate('2026-11-01T00:00:00Z')).toBe(true);
  });

  it('accepts valid positive timezone offset', () => {
    expect(constraint.validate('2026-11-01T00:00:00+05:30')).toBe(true);
  });

  it('accepts valid negative timezone offset', () => {
    expect(constraint.validate('2026-12-31T23:59:59-04:00')).toBe(true);
  });

  it('accepts maximum valid offset +14:00', () => {
    expect(constraint.validate('2026-11-01T00:00:00+14:00')).toBe(true);
  });

  it('accepts maximum valid offset -14:00', () => {
    expect(constraint.validate('2026-11-01T00:00:00-14:00')).toBe(true);
  });

  it('rejects offset hour 14 with non-zero minutes', () => {
    expect(constraint.validate('2026-11-01T00:00:00+14:01')).toBe(false);
  });

  it('rejects offset hour > 14', () => {
    expect(constraint.validate('2026-11-01T00:00:00+15:00')).toBe(false);
  });

  it('rejects invalid timezone hour +99:99', () => {
    expect(constraint.validate('2026-11-01T00:00:00+99:99')).toBe(false);
  });

  it('rejects invalid timezone hour +25:00', () => {
    expect(constraint.validate('2026-11-01T00:00:00+25:00')).toBe(false);
  });

  it('rejects invalid timezone minute +05:99', () => {
    expect(constraint.validate('2026-11-01T00:00:00+05:99')).toBe(false);
  });

  it('accepts fractional seconds with timezone', () => {
    expect(constraint.validate('2026-11-01T00:00:00.123Z')).toBe(true);
  });

  it('returns true for null/undefined', () => {
    expect(constraint.validate(null)).toBe(true);
    expect(constraint.validate(undefined)).toBe(true);
  });
});

describe('IsValidCalendarDateConstraint', () => {
  const constraint = new IsValidCalendarDateConstraint();

  it('accepts leap year February 29', () => {
    expect(constraint.validate('2028-02-29T00:00:00Z')).toBe(true);
  });

  it('rejects non-leap year February 29', () => {
    expect(constraint.validate('2026-02-29T00:00:00Z')).toBe(false);
  });

  it('rejects February 30', () => {
    expect(constraint.validate('2026-02-30T00:00:00Z')).toBe(false);
  });

  it('rejects invalid month', () => {
    expect(constraint.validate('2026-13-01T00:00:00Z')).toBe(false);
  });

  it('rejects invalid day', () => {
    expect(constraint.validate('2026-01-32T00:00:00Z')).toBe(false);
  });

  it('accepts valid dates', () => {
    expect(constraint.validate('2026-11-01T00:00:00Z')).toBe(true);
    expect(constraint.validate('2026-01-01T00:00:00Z')).toBe(true);
    expect(constraint.validate('2026-12-31T00:00:00Z')).toBe(true);
  });

  it('returns true for null/undefined', () => {
    expect(constraint.validate(null)).toBe(true);
    expect(constraint.validate(undefined)).toBe(true);
  });
});

describe('TaskQueryDto validator integration', () => {
  it('accepts valid timezone-aware dates with DTO', async () => {
    const errors = await validateDto({
      offsetField: '2026-11-01T00:00:00Z',
      dateField: '2026-11-01T00:00:00Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid timezone offset with DTO', async () => {
    const errors = await validateDto({
      offsetField: '2026-11-01T00:00:00+99:99',
    });
    const offsetErrors = errors.filter((e) => e.property === 'offsetField');
    expect(offsetErrors.length).toBeGreaterThan(0);
  });

  it('rejects invalid calendar date with DTO', async () => {
    const errors = await validateDto({
      dateField: '2026-02-30T00:00:00Z',
    });
    const dateErrors = errors.filter((e) => e.property === 'dateField');
    expect(dateErrors.length).toBeGreaterThan(0);
  });
});
