async function run() {
  try {
    const res = await fetch("https://image.pollinations.ai/models");
    const data = await res.json();
    console.log("Pollinations Models:", data);
  } catch (e) {
    console.log(e.message);
  }
}
run();
