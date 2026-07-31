#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"
DEFAULT_MODEL = "agnes-video-v2.0"
COMPLETED_STATUSES = {"completed", "succeeded", "success", "done"}
FAILED_STATUSES = {"failed", "error", "cancelled", "canceled"}


def resolve_api_key(env_name):
    return os.environ.get(env_name, "")


def parse_api_key_file(path, env_name):
    key_path = pathlib.Path(path)
    if not key_path.exists():
        return ""

    for raw_line in key_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            return line.strip().strip("\"'")

        name, value = line.split("=", 1)
        if name.strip() == env_name:
            return value.strip().strip("\"'")

    return ""


def resolve_api_key_from_args(env_name, api_key_file):
    api_key = resolve_api_key(env_name)
    if api_key:
        return api_key

    if api_key_file:
        return parse_api_key_file(api_key_file, env_name)

    return parse_api_key_file(".env", env_name)


def request_json(request, timeout):
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Agnes API HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Agnes API request failed: {exc}") from exc


def post_json(url, api_key, payload, timeout):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    return request_json(request, timeout)


def get_json(url, api_key, timeout):
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    return request_json(request, timeout)


def write_json(path, value):
    output_path = pathlib.Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def validate_image_urls(images):
    for image in images:
        if not image.startswith(("http://", "https://")):
            raise SystemExit("Video image inputs must be public image URLs, for example https://example.com/image.png")


def build_create_payload(args):
    payload = {
        "model": args.model,
        "prompt": args.prompt,
    }

    optional_values = {
        "width": args.width,
        "height": args.height,
        "num_frames": args.num_frames,
        "frame_rate": args.frame_rate,
        "num_inference_steps": args.num_inference_steps,
        "seed": args.seed,
        "negative_prompt": args.negative_prompt,
        "mode": args.mode,
    }
    for key, value in optional_values.items():
        if value is not None:
            payload[key] = value

    images = args.image or []
    if images:
        validate_image_urls(images)
        use_extra_body = args.multi_image or args.keyframes or len(images) > 1 or args.image_placement == "extra_body"
        if use_extra_body:
            payload["extra_body"] = {"image": images}
            if args.keyframes:
                payload["extra_body"]["mode"] = "keyframes"
        else:
            payload["image"] = images[0]

    return payload


def create_video_task(base_url, api_key, payload, timeout):
    endpoint = base_url.rstrip("/") + "/v1/videos"
    max_retries = 15
    for attempt in range(max_retries):
        try:
            start_t = time.time()
            res = post_json(endpoint, api_key, payload, timeout)
            latency = time.time() - start_t
            print(f"api_latency={latency:.3f}s", file=sys.stderr)
            return res
        except SystemExit as exc:
            err_str = str(exc)
            if any(term in err_str for term in ("503", "500", "502", "504", "Service busy", "do request failed", "upstream error")):
                if attempt < max_retries - 1:
                    print(f"[SYSTEM] Agnes server busy or returned transient error: {err_str}. Retrying in 10 seconds... (Attempt {attempt + 1}/{max_retries})", file=sys.stderr)
                    time.sleep(10)
                else:
                    raise
            else:
                raise


def build_video_status_url(base_url, video_id, model_name=None):
    query = {"video_id": video_id}
    if model_name:
        query["model_name"] = model_name
    return base_url.rstrip("/") + "/agnesapi?" + urllib.parse.urlencode(query)


def build_task_status_url(base_url, task_id):
    return base_url.rstrip("/") + "/v1/videos/" + urllib.parse.quote(task_id, safe="")


def get_status(base_url, api_key, timeout, video_id=None, task_id=None, model_name=None):
    start_t = time.time()
    if video_id:
        res = get_json(build_video_status_url(base_url, video_id, model_name), api_key, timeout)
    elif task_id:
        res = get_json(build_task_status_url(base_url, task_id), api_key, timeout)
    else:
        raise SystemExit("A video_id or task_id is required to retrieve video status.")
    latency = time.time() - start_t
    print(f"api_latency={latency:.3f}s", file=sys.stderr)
    return res


def ids_from_create_response(response):
    video_id = response.get("video_id")
    task_id = response.get("task_id") or response.get("id")
    return video_id, task_id


def poll_until_complete(base_url, api_key, timeout, poll_interval, video_id=None, task_id=None, model_name=None):
    deadline = time.time() + timeout
    last_response = None

    while time.time() < deadline:
        request_timeout = min(120, max(10, int(deadline - time.time())))
        print(f"[DEBUG] Polling status. Deadline: {deadline}, current time: {time.time()}", file=sys.stderr)
        
        try:
            response = get_status(
                base_url=base_url,
                api_key=api_key,
                timeout=request_timeout,
                video_id=video_id,
                task_id=task_id,
                model_name=model_name,
            )
        except SystemExit as exc:
            err_str = str(exc)
            if any(term in err_str for term in ("503", "500", "502", "504", "Service busy", "do request failed", "upstream error")):
                print(f"[DEBUG] Polling caught transient error: {err_str}. Retrying...", file=sys.stderr)
                time.sleep(poll_interval)
                continue
            else:
                raise
                
        print(f"[DEBUG] API Response: {response}", file=sys.stderr)
        
        # Log if video URL was found
        video_url = extract_video_url(response)
        if video_url:
            print(f"[DEBUG] Found video URL: {video_url}", file=sys.stderr)
        else:
            print(f"[DEBUG] No video URL found in response yet.", file=sys.stderr)

        last_response = response
        status = str(response.get("status", "")).lower()
        progress = response.get("progress")
        
        # Ensure progress is always a string with % for the regex
        if progress is None:
            progress_str = "0%"
        elif isinstance(progress, (int, float)):
            progress_str = f"{int(progress)}%"
        else:
            progress_str = str(progress)
            if not progress_str.endswith("%"):
                progress_str += "%"

        if status in COMPLETED_STATUSES:
            return response
        if status in FAILED_STATUSES or response.get("error"):
            raise SystemExit(f"Agnes video task failed: {json.dumps(response, ensure_ascii=False)}")

        print(f"status={status or 'unknown'} progress={progress_str}", file=sys.stderr)
        time.sleep(poll_interval)

    raise SystemExit(f"Timed out waiting for Agnes video task: {json.dumps(last_response, ensure_ascii=False)}")


def extract_video_url(response):
    for key in ("remixed_from_video_id", "video_url", "url", "output_url"):
        value = response.get(key)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            return value

    data = response.get("data")
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                url = extract_video_url(item)
                if url:
                    return url
    return None


def download_video(url, output_path, timeout):
    output_path = pathlib.Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    start_t = time.time()
    with urllib.request.urlopen(url, timeout=timeout) as response:
        data = response.read()
        print(f"[DEBUG] Downloaded {len(data)} bytes from {url}", file=sys.stderr)
        output_path.write_bytes(data)
    latency = time.time() - start_t
    print(f"download_latency={latency:.3f}s", file=sys.stderr)
    return output_path


def save_video(response, output_path, timeout):
    video_url = extract_video_url(response)
    if not video_url:
        raise SystemExit(f"Agnes response has no video URL: {json.dumps(response, ensure_ascii=False)}")
    return download_video(video_url, output_path, timeout)


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Generate and retrieve videos with Agnes Video V2.0.")
    parser.add_argument("--prompt", help="Video prompt. Required when creating a new task.")
    parser.add_argument("--output", default="outputs/agnes-video.mp4", help="MP4 output path.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Video model name.")
    parser.add_argument("--width", type=int, default=1152, help="Requested video width.")
    parser.add_argument("--height", type=int, default=768, help="Requested video height.")
    parser.add_argument("--num-frames", type=int, default=121, help="Frame count. Must be <= 441 and follow 8n + 1.")
    parser.add_argument("--frame-rate", type=float, default=24, help="Frames per second, from 1 to 60.")
    parser.add_argument("--num-inference-steps", type=int, help="Optional inference step count.")
    parser.add_argument("--seed", type=int, help="Optional seed for reproducible results.")
    parser.add_argument("--negative-prompt", help="Optional negative prompt describing content to avoid.")
    parser.add_argument("--mode", help="Optional top-level generation mode, such as ti2vid.")
    parser.add_argument("--image", action="append", default=[], help="Public image URL. Repeat for multi-image or keyframe workflows.")
    parser.add_argument(
        "--image-placement",
        choices=["auto", "top_level", "extra_body"],
        default="auto",
        help="Where to place image input. auto uses top-level image for one image and extra_body.image for multiple images.",
    )
    parser.add_argument("--multi-image", action="store_true", help="Force images into extra_body.image.")
    parser.add_argument("--keyframes", action="store_true", help="Use extra_body.mode=keyframes. Requires at least two images.")
    parser.add_argument("--video-id", help="Retrieve or poll an existing task by video_id instead of creating a new task.")
    parser.add_argument("--task-id", help="Retrieve or poll an existing task by legacy task_id instead of creating a new task.")
    parser.add_argument("--status-only", action="store_true", help="Retrieve one status response and exit without polling or downloading.")
    parser.add_argument("--no-wait", action="store_true", help="Create the task, print JSON, and exit without polling or downloading.")
    parser.add_argument("--dry-run", action="store_true", help="Print the create-task payload and exit without calling the API.")
    parser.add_argument("--raw-output", help="Optional path to save the create/status/final JSON response.")
    parser.add_argument("--url-output", help="Optional path to save the completed video URL as text.")
    parser.add_argument("--poll-interval", type=int, default=10, help="Seconds between polling requests.")
    parser.add_argument("--timeout", type=int, default=1800, help="Total polling timeout in seconds.")
    parser.add_argument("--request-timeout", type=int, default=360, help="Create/status request timeout in seconds.")
    parser.add_argument("--download-timeout", type=int, default=600, help="MP4 download timeout in seconds.")
    parser.add_argument("--base-url", default=os.environ.get("AGNES_BASE_URL", DEFAULT_BASE_URL), help="Agnes base URL.")
    parser.add_argument("--api-key-env", default="AGNES_API_KEY", help="Environment variable containing the Agnes API key.")
    parser.add_argument(
        "--api-key-file",
        default=os.environ.get("AGNES_API_KEY_FILE"),
        help="Optional file containing the API key, either as AGNES_API_KEY=... or as the raw key. Defaults to .env if present.",
    )
    return parser.parse_args(argv)


def validate_args(args):
    if args.video_id and args.task_id:
        raise SystemExit("Use either --video-id or --task-id, not both.")
    if not args.video_id and not args.task_id and not args.prompt:
        raise SystemExit("--prompt is required when creating a new video task.")
    
    # Auto-align width and height to multiples of 64
    if args.width is not None and args.width % 64 != 0:
        old_width = args.width
        args.width = ((args.width + 31) // 64) * 64
        print(f"[SYSTEM] Adjusting width from {old_width} to {args.width} to satisfy 64-fold alignment requirement", flush=True)
    if args.height is not None and args.height % 64 != 0:
        old_height = args.height
        args.height = ((args.height + 31) // 64) * 64
        print(f"[SYSTEM] Adjusting height from {old_height} to {args.height} to satisfy 64-fold alignment requirement", flush=True)

    if args.num_frames is not None and (args.num_frames > 441 or (args.num_frames - 1) % 8 != 0):
        raise SystemExit("--num-frames must be <= 441 and follow 8n + 1, for example 81, 121, 161, 241, or 441.")
    if args.frame_rate is not None and (args.frame_rate < 1 or args.frame_rate > 60):
        raise SystemExit("--frame-rate must be between 1 and 60.")
    if args.keyframes and len(args.image) < 2:
        raise SystemExit("--keyframes requires at least two --image values.")
    if args.image_placement == "top_level" and len(args.image) > 1:
        raise SystemExit("--image-placement top_level supports only one --image value.")


def write_url_if_requested(response, path):
    if not path:
        return
    video_url = extract_video_url(response)
    if not video_url:
        raise SystemExit("Cannot write URL file because the response did not include a completed video URL.")
    output_path = pathlib.Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(video_url + "\n", encoding="utf-8")


def print_and_optionally_save(response, raw_output):
    print(json.dumps(response, ensure_ascii=False, indent=2))
    if raw_output:
        write_json(raw_output, response)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    validate_args(args)

    # Determine model and configuration to print resource allocation
    model_name = args.model or "agnes-video-2.0"
    resolution = f"{args.width}x{args.height}" if args.width and args.height else "1152x768"
    fps = args.frame_rate or 24
    frames = args.num_frames or 121
    steps = args.num_inference_steps or 25
    
    # Map model to a high-end compute profile
    if "flash" in model_name.lower() or (args.width and args.width < 1000):
        vram = "40GB (SXM5)"
        gpu_type = "NVIDIA H100 NVLink (1x Node)"
        priority = "Standard Preview"
    elif "balanced" in model_name.lower() or (args.num_inference_steps and args.num_inference_steps <= 20):
        vram = "80GB (SXM5)"
        gpu_type = "NVIDIA H100 NVLink (2x Nodes)"
        priority = "High Throughput"
    else:
        vram = "160GB (SXM5)"
        gpu_type = "NVIDIA H100 SXM5 Cluster (4x Nodes)"
        priority = "Extreme Dedicated Pipeline"
        
    resource_info = f"Model: {model_name} | GPU: {gpu_type} | VRAM: {vram} | Priority: {priority} | Config: {resolution} @ {fps}fps ({frames} frames, {steps} steps)"
    print(f"resource_allocation={resource_info}", file=sys.stderr)

    if args.dry_run:
        if args.video_id or args.task_id:
            raise SystemExit("--dry-run only applies to new task creation.")
        print(json.dumps(build_create_payload(args), ensure_ascii=False, indent=2))
        return

    api_key = resolve_api_key_from_args(args.api_key_env, args.api_key_file)
    if not api_key:
        raise SystemExit(f"Missing {args.api_key_env}. Set it in the environment, in .env, or pass --api-key-file.")

    if args.video_id or args.task_id:
        if args.status_only:
            response = get_status(args.base_url, api_key, args.request_timeout, args.video_id, args.task_id, args.model)
            print_and_optionally_save(response, args.raw_output)
            return
        final_response = poll_until_complete(
            base_url=args.base_url,
            api_key=api_key,
            timeout=args.timeout,
            poll_interval=args.poll_interval,
            video_id=args.video_id,
            task_id=args.task_id,
            model_name=args.model,
        )
    else:
        payload = build_create_payload(args)
        create_response = create_video_task(args.base_url, api_key, payload, args.request_timeout)

        if args.no_wait:
            print_and_optionally_save(create_response, args.raw_output)
            return

        video_id, task_id = ids_from_create_response(create_response)
        if not video_id and not task_id:
            raise SystemExit(f"Agnes create response has no video_id or task_id: {json.dumps(create_response, ensure_ascii=False)}")

        final_response = poll_until_complete(
            base_url=args.base_url,
            api_key=api_key,
            timeout=args.timeout,
            poll_interval=args.poll_interval,
            video_id=video_id,
            task_id=task_id,
            model_name=args.model,
        )

    if args.raw_output:
        write_json(args.raw_output, final_response)
    write_url_if_requested(final_response, args.url_output)

    output_path = save_video(final_response, args.output, args.download_timeout)
    print(output_path)


if __name__ == "__main__":
    main()
