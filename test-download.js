import { Readable } from 'stream';
fetch('https://files.catbox.moe/k9b657.png').then(res => {
  console.log("Status:", res.status);
  const readable = Readable.fromWeb(res.body);
  console.log("Readable created", readable != null);
}).catch(console.error);
