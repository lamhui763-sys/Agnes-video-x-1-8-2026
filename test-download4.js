import { Readable } from 'stream';
fetch('https://google.com').then(res => {
  const readable = Readable.fromWeb(res.body);
  console.log("Readable ok?", readable != null);
}).catch(console.error);
