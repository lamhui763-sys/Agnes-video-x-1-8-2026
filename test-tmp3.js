import fs from 'fs';
async function run() {
  const formData = new FormData();
  const fileBuffer = fs.readFileSync("mock.mp4");
  const blob = new Blob([fileBuffer], { type: "video/mp4" });
  formData.append("file", blob, "mock.mp4");
  const response = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData,
  });
  const data = await response.json();
  console.log(data);
  const directUrl = data.data.url.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
  const dl = await fetch(directUrl);
  console.log(dl.status, dl.headers.get("content-type"));
}
run();
