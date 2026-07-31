import fs from 'fs';
fs.writeFileSync("mock.mp4", Buffer.from([0,0,0,0,1,2,3,4]));
