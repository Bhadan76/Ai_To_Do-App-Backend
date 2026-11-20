import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'isValidTimezoneOffset' })
export class IsValidTimezoneOffsetConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (!value || typeof value !== 'string') {
      return true;
    }

    // Extract the timezone offset from the end of the datetime string.
    const match = value.match(/(Z|[+-]\d{2}:\d{2})$/);
    if (!match) {
      return false;
    }

    if (match[1] === 'Z') {
      return true;
    }

    const offsetMatch = value.match(/([+-])(\d{2}):(\d{2})$/);
    if (!offsetMatch) {
      return false;
    }

    const hour = parseInt(offsetMatch[2], 10);
    const minute = parseInt(offsetMatch[3], 10);

    // Maximum absolute offset is 14:00.
    if (hour < 0 || hour > 14) {
      return false;
    }

    // If offset hour is 14, minutes must be 00.
    if (hour === 14 && minute !== 0) {
      return false;
    }

    if (minute < 0 || minute > 59) {
      return false;
    }

    return true;
  }
}

export function IsValidTimezoneOffset(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTimezoneOffsetConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isValidCalendarDate' })
export class IsValidCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (!value || typeof value !== 'string') {
      return true;
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (!match) {
      return true;
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1) {
      return false;
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    return day <= daysInMonth;
  }
}

export function IsValidCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidCalendarDateConstraint,
    });
  };
}
