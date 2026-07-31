async function test() {
    const key = "cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J";
    const model = "models/gemini-3.1-flash-image";
    const res = await fetch("https://apihub.agnes-ai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model,
            prompt: "A beautiful scenery of a futuristic city with flying cars, sunset, anime style",
            size: "1024x576"
        })
    });
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
}
test();
