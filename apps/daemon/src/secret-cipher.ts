import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SecretCipher {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}

export class LocalSecretCipher implements SecretCipher {
  private keyPromise?: Promise<Buffer>;

  constructor(private readonly keyFilename: string) {}

  private loadKey() {
    this.keyPromise ??= (async () => {
      await mkdir(path.dirname(this.keyFilename), { recursive: true });
      try {
        const existing = await readFile(this.keyFilename);
        if (existing.length !== 32) throw new Error("本地密钥长度不正确");
        return existing;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const created = randomBytes(32);
      try {
        await writeFile(this.keyFilename, created, { flag: "wx", mode: 0o600 });
        return created;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await readFile(this.keyFilename);
        if (existing.length !== 32) throw new Error("本地密钥长度不正确");
        return existing;
      }
    })();
    return this.keyPromise;
  }

  async encrypt(value: string) {
    const key = await this.loadKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  async decrypt(value: string) {
    const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("加密令牌格式不正确");
    const key = await this.loadKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}

export class EphemeralSecretCipher implements SecretCipher {
  private readonly key = randomBytes(32);

  async encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  async decrypt(value: string) {
    const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("加密令牌格式不正确");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}
