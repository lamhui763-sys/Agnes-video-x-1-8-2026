import { spawn } from 'child_process';
import * as path from 'path';

const prompt = "第一人称球迷视角,世界杯决赛现场,手持摄像机晃动 效果,周围球迷疯狂庆祝,举杯欢呼,烟火表演,真实 现场音效氛围";
const output = "assets/world_cup_final.mp4";
const rawOutput = "assets/video_response.json";

console.log(`Starting video generation with prompt: "${prompt}"`);

const args = [
  "src/agnes_video.py",
  "--prompt", prompt,
  "--output", output,
  "--raw-output", rawOutput,
  "--num-frames", "121",
  "--frame-rate", "24"
];

const child = spawn("python3", args);

child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log(`\nChild process exited with code ${code}`);
  if (code === 0) {
    console.log(`Video successfully generated and saved to ${output}`);
  } else {
    console.error(`Video generation failed with exit code ${code}`);
  }
});
