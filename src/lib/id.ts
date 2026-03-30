export type CryptoLike = Partial<Pick<Crypto, 'getRandomValues' | 'randomUUID'>>;

function getCryptoApi(): CryptoLike | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

function fillPseudoRandom(bytes: Uint8Array): void {
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
}

function bytesToUuidV4(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function safeRandomUuid(cryptoApi: CryptoLike | undefined = getCryptoApi()): string {
  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Fall through to deterministic fallback path.
    }
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    try {
      cryptoApi.getRandomValues(bytes);
    } catch {
      fillPseudoRandom(bytes);
    }
  } else {
    fillPseudoRandom(bytes);
  }

  return bytesToUuidV4(bytes);
}

export function createClientId(prefix: string, cryptoApi?: CryptoLike): string {
  return `${prefix}-${safeRandomUuid(cryptoApi)}`;
}
