import * as CryptoJS from 'crypto-js';

/**
 * AES-256 encryption/decryption utility for sensitive fields
 * (medical questionnaire data, personal notes, etc.)
 */
export class CryptoUtil {
  private readonly key: string;

  constructor(encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length !== 32) {
      throw new Error('Encryption key must be exactly 32 characters');
    }
    this.key = encryptionKey;
  }

  /**
   * Encrypts a plaintext string using AES-256
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const encrypted = CryptoJS.AES.encrypt(plaintext, this.key, {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  }

  /**
   * Decrypts an AES-256 encrypted string
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.key, {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Encrypts a JSON object
   */
  encryptJson<T>(data: T): string {
    return this.encrypt(JSON.stringify(data));
  }

  /**
   * Decrypts and parses a JSON object
   */
  decryptJson<T>(ciphertext: string): T {
    const plaintext = this.decrypt(ciphertext);
    return JSON.parse(plaintext) as T;
  }

  /**
   * Creates a SHA-256 hash (for token hashing, non-reversible)
   */
  static hash(value: string): string {
    return CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex);
  }

  /**
   * Creates a HMAC-SHA256 (for webhook signature verification)
   */
  static hmac(value: string, secret: string): string {
    return CryptoJS.HmacSHA256(value, secret).toString(CryptoJS.enc.Hex);
  }
}
