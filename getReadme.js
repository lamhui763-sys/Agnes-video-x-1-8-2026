import https from 'https';

https.get('https://raw.githubusercontent.com/HBAI-Ltd/Toonflow-app/master/docs/README.zhtw.md', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data); });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
