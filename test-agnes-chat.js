import fetch from 'node-fetch';

async function test(modelName) {
    const key = "cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J";
    const res = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: "Hello" }]
        })
    });
    console.log(res.status);
    console.log(await res.text());
}
test("agnes-2.0-flash");
