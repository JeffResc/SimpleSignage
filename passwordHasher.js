const crypto = require('crypto');

const pw = process.argv.slice(2)[0];
const hash = crypto.createHash("sha256").update(pw).digest("base64");

console.log('Hash  for ' + pw + ' is: ' + hash);
