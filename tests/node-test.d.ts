declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void
}

declare module 'node:assert/strict' {
  const assert: {
    ok(value: unknown, message?: string): asserts value
    equal<T>(actual: T, expected: T, message?: string): void
    deepEqual<T>(actual: T, expected: T, message?: string): void
  }
  export default assert
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
