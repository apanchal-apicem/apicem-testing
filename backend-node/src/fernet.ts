// Hand-rolled implementation of the Fernet spec (https://github.com/fernet/spec), matching
// Python's `cryptography.Fernet` byte-for-byte -- deliberately NOT the `fernet` npm package,
// which pulls in `crypto-js` with critical, actively-flagged vulnerabilities (weak PBKDF2,
// insufficient entropy) for the exact job (credential encryption) where that matters most.
// Node's own `crypto` module needs zero third-party trust and is a straightforward fit: the
// spec is just AES-128-CBC + HMAC-SHA256 with a fixed token layout, both natively supported.
//
// This MUST correctly decrypt rows already sitting in app.secrets, encrypted by the old Python
// backend with the same FERNET_KEY -- confirmed via full read-through of connections.py's
// encrypt side and connectors/shopify/sync.py's decrypt side that the stored format is the
// plain, unmodified Fernet spec (no custom framing), so no re-encryption migration is needed.
import crypto from "node:crypto";

const VERSION_BYTE = 0x80;

function base64UrlDecode(input: string): Buffer {
  // Python's urlsafe_b64encode always includes "=" padding; Node's Buffer base64url decoder
  // tolerates both padded and unpadded input, so no stripping/re-padding is needed here --
  // but being explicit about accepting either keeps this robust regardless of which produced
  // a given token.
  return Buffer.from(input, "base64url");
}

function base64UrlEncode(buf: Buffer): string {
  // Node's 'base64url' encoding omits padding; re-add it to match Python's Fernet output
  // exactly (harmless either way for Node's own decoder, but keeps tokens spec-conformant
  // for any other consumer).
  const unpadded = buf.toString("base64url");
  const padLength = (4 - (unpadded.length % 4)) % 4;
  return unpadded + "=".repeat(padLength);
}

export class Fernet {
  private readonly signingKey: Buffer;
  private readonly encryptionKey: Buffer;

  constructor(key: string) {
    const raw = base64UrlDecode(key);
    if (raw.length !== 32) {
      throw new Error(`Fernet key must decode to 32 bytes, got ${raw.length}`);
    }
    this.signingKey = raw.subarray(0, 16);
    this.encryptionKey = raw.subarray(16, 32);
  }

  encrypt(plaintext: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));

    const cipher = crypto.createCipheriv("aes-128-cbc", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    const payload = Buffer.concat([Buffer.from([VERSION_BYTE]), timestamp, iv, ciphertext]);
    const hmac = crypto.createHmac("sha256", this.signingKey).update(payload).digest();

    return Buffer.from(base64UrlEncode(Buffer.concat([payload, hmac])), "utf-8");
  }

  decrypt(token: Buffer | string): Buffer {
    const tokenStr = typeof token === "string" ? token : token.toString("utf-8");
    const decoded = base64UrlDecode(tokenStr);
    if (decoded.length < 1 + 8 + 16 + 32) {
      throw new Error("Fernet token too short to be valid");
    }

    const version = decoded[0];
    if (version !== VERSION_BYTE) {
      throw new Error(`unsupported Fernet token version: ${version}`);
    }

    const hmacStart = decoded.length - 32;
    const payload = decoded.subarray(0, hmacStart);
    const providedHmac = decoded.subarray(hmacStart);
    const expectedHmac = crypto.createHmac("sha256", this.signingKey).update(payload).digest();

    // Constant-time comparison -- a naive Buffer.equals() here would leak timing information
    // about how many leading bytes matched, the same class of bug HMAC verification exists to
    // avoid in the first place.
    if (!crypto.timingSafeEqual(providedHmac, expectedHmac)) {
      throw new Error("Fernet token HMAC verification failed (wrong key or tampered token)");
    }

    const iv = payload.subarray(9, 25);
    const ciphertext = payload.subarray(25);

    const decipher = crypto.createDecipheriv("aes-128-cbc", this.encryptionKey, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
