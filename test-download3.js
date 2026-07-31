import { Readable } from 'stream';
const fs = await import('fs');
fetch('https://google.com').then(res => {
  console.log("Status:", res.status);
}).catch(console.error);
