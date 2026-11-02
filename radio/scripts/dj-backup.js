const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const iterations = 600000;
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024)
    throw Error('Use a backup password of at least 12 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations}, material,
    {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}

export async function encryptBackup(settings, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, encoder.encode(JSON.stringify(settings)));
  return JSON.stringify({format:'radio-dj-backup',version:1,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))});
}

export async function decryptBackup(file, password) {
  if (typeof file !== 'string' || file.length > 150000) throw Error('Backup file is invalid or too large.');
  try {
    const data = JSON.parse(file);
    if (!data || data.format !== 'radio-dj-backup' || data.version !== 1 ||
        typeof data.salt !== 'string' || typeof data.iv !== 'string' || typeof data.ciphertext !== 'string') throw Error();
    const salt = fromBase64(data.salt), iv = fromBase64(data.iv), ciphertext = fromBase64(data.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw Error();
    const key = await keyFor(password, salt);
    const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv}, key, ciphertext);
    const settings = JSON.parse(decoder.decode(plaintext));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error();
    return settings;
  } catch {
    throw Error('Wrong password or damaged backup file.');
  }
}
