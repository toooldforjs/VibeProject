import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 64;

/**
 * Получает ключ шифрования из ENCRYPTION_KEY или выводит из него ключ фиксированной длины
 */
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || envKey.length < 16) {
    throw new Error('ENCRYPTION_KEY должен быть задан в .env (минимум 16 символов)');
  }
  return crypto.scryptSync(envKey, 'vibe-salt', KEY_LENGTH);
}

/**
 * Шифрует строку (для хранения в БД)
 * @param {string} text - исходный текст
 * @returns {string} - строка в формате iv:authTag:ciphertext (base64)
 */
export function encrypt(text) {
  if (!text) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Расшифровывает строку из БД
 * @param {string} encryptedBase64 - зашифрованная строка (base64)
 * @returns {string|null} - исходный текст или null
 */
export function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedBase64, 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch (e) {
    console.error('Ошибка расшифровки:', e.message);
    return null;
  }
}
