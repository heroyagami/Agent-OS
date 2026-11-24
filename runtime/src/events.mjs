export class AsyncEventQueue {
  constructor() { this.values = []; this.waiters = []; this.closed = false; }
  push(value) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.values.push(value);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) this.waiters.shift()({ value: undefined, done: true });
  }
  next() {
    if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false });
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  return() { this.close(); return Promise.resolve({ value: undefined, done: true }); }
  [Symbol.asyncIterator]() { return this; }
}
