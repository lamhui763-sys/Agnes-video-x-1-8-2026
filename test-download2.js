import { Readable } from 'stream';
fetch('https://files.catbox.moe/k9b657.png').then(res => {
  console.log("Status:", res.status);
}).catch(console.error);
