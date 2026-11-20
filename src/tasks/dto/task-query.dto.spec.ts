import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskQueryDto } from './task-query.dto';

function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(TaskQueryDto, input);
  return validate(dto);
}

describe('TaskQueryDto', () => {
  it('accepts valid UTC datetime for dueDateFrom and dueDateTo', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00Z',
      dueDateTo: '2026-12-31T23:59:59Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts valid positive timezone offset for dueDateFrom', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00+05:30',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts valid negative timezone offset for dueDateTo', async () => {
    const errors = await validateDto({
      dueDateTo: '2026-12-31T23:59:59-04:00',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts fractional seconds with timezone', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00.123Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects date-only dueDateFrom', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateFrom');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('rejects date-only dueDateTo', async () => {
    const errors = await validateDto({
      dueDateTo: '2026-12-31',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateTo');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('rejects timezone-less datetime for dueDateFrom', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateFrom');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('rejects timezone-less datetime for dueDateTo', async () => {
    const errors = await validateDto({
      dueDateTo: '2026-12-31T23:59:59',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateTo');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('rejects invalid calendar date for dueDateFrom', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-13-45T00:00:00Z',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateFrom');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('rejects invalid calendar date for dueDateTo', async () => {
    const errors = await validateDto({
      dueDateTo: '2026-02-30T00:00:00Z',
    });
    const dateErrors = errors.filter((e) => e.property === 'dueDateTo');
    expect(dateErrors.length).toBeGreaterThan(0);
  });

  it('accepts valid ascending date range', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00Z',
      dueDateTo: '2026-12-31T23:59:59Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts equal date range boundaries', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00Z',
      dueDateTo: '2026-11-01T00:00:00Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts only dueDateFrom without dueDateTo', async () => {
    const errors = await validateDto({
      dueDateFrom: '2026-11-01T00:00:00Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts only dueDateTo without dueDateFrom', async () => {
    const errors = await validateDto({
      dueDateTo: '2026-12-31T23:59:59Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts neither date boundary', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });
});
