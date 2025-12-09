const getCrypto = (): Crypto | undefined => {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  return globalThis.crypto;
};

const toHex = (buffer: Uint8Array): string => {
  let result = '';
  buffer.forEach((byte) => {
    result += byte.toString(16).padStart(2, '0');
  });
  return result;
};

export const generateHexId = (byteLength = 16): string => {
  const cryptoObj = getCrypto();

  if (cryptoObj?.getRandomValues) {
    const array = new Uint8Array(byteLength);
    cryptoObj.getRandomValues(array);
    return toHex(array);
  }

  let fallback = '';
  for (let i = 0; i < byteLength; i++) {
    const value = Math.floor(Math.random() * 256);
    fallback += value.toString(16).padStart(2, '0');
  }
  return fallback;
};

export const generateUUID = (): string => {
  const cryptoObj = getCrypto();
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  const hex = generateHexId(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
