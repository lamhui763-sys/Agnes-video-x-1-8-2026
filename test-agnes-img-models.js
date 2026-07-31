import fetch from 'node-fetch';

async function test(modelName) {
    const key = "cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J";
    const res = await fetch("https://apihub.agnes-ai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: modelName,
            prompt: "A beautiful scenery of a futuristic city with flying cars, sunset, anime style",
            size: "1024x576"
        })
    });
    console.log(modelName, "Status:", res.status);
    console.log(modelName, "Response:", await res.text());
}

async function run() {
    await test("agnes-image-2.0-flash");
    await test("agnes-image-2.1-flash");
}
run();
