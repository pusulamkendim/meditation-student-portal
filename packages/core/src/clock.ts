export interface Clock {
  now(): Date;
}

export const CLOCK_TOKEN = Symbol('CLOCK_TOKEN');

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string) {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  advanceTo(instant: Date | string): void {
    const target = new Date(instant);
    if (target.getTime() < this.current.getTime()) {
      throw new Error('FakeClock cannot move backwards. Use set() to reset a test clock.');
    }
    this.current = target;
  }
}
