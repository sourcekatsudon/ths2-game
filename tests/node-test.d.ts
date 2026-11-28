declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void
}

declare module 'node:assert/strict' {
  const assert: {
    ok(value: unknown, message?: string): asserts value
    equal<T>(actual: T, expected: T, message?: string): void
  }
  export default assert
}
