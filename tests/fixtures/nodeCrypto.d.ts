// A projektben nincs @types/node: a változatlanság-fixture csak a sha256-ot használja a node:crypto-ból.
declare module 'node:crypto' {
  interface Hash { update(data: string): Hash; digest(encoding: 'hex'): string }
  export function createHash(algorithm: 'sha256'): Hash;
}
