import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "../crypto/aes";

const SESSION_FILE = path.join(process.cwd(), "telegram-session.enc");

export function saveSessionString(session: string): void {
  const encrypted = encrypt(session);
  fs.writeFileSync(SESSION_FILE, encrypted, { encoding: "utf8" });
}

export function loadSessionString(): string | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  const encrypted = fs.readFileSync(SESSION_FILE, { encoding: "utf8" });
  return decrypt(encrypted);
}







