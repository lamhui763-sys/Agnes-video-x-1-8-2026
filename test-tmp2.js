import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';

async function run() {
  const formData = new FormData();
  formData.append("file", fs.createReadStream("mock.mp4"));
  const response = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData,
  });
  const data = await response.json();
  console.log(data);
}
run();
