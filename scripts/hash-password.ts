/** Usage: npm run admin:hash -- 'your password'  → prints ADMIN_PASSWORD_HASH value */
import { hashPassword } from "../src/lib/admin/auth";

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Provide a password of at least 12 characters.");
  process.exit(1);
}
console.log(hashPassword(pw));
