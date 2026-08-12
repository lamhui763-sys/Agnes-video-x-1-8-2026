<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Agnes Video Generator

AI-powered cinematic video generation platform with multi-scene workflow, experience library, and character management.

View your app in AI Studio: https://ai.studio/apps/1b9a8ea0-ed07-4214-8804-99ec9f327b4a

## Features

- **Multi-Agent Generation**: Uses Gemini, Agnes AI, and Mistral for intelligent content creation
- **7-Step Storyboard Workflow**: AI-reviewed image and video generation pipeline
- **Experience Library**: Learns from past failures to improve future generations
- **Character Management**: Consistent character avatars across scenes
- **Multiple Art Styles**: Cinematic, Anime, Watercolor, and more
- **Real-time Monitoring**: AI Transmission Monitor for generation status

## Run Locally

**Prerequisites:** Node.js 20+, npm or bun

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables in `.env.local`:
   ```
   AGNES_API_KEY=your_agnes_api_key
   GEMINI_API_KEY=your_gemini_api_key
   MISTRAL_API_KEY=your_mistral_api_key
   CATBOX_USERHASH=your_catbox_userhash
   ```

3. Run the app:
   ```bash
   npm run dev
   ```

## Build for Production

```bash
npm run build
npm start
```

## Deploy to Railway

1. Connect this repo to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push

## Deploy with Docker

```bash
docker build -t agnes-video .
docker run -p 3000:3000 --env-file .env.local agnes-video
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend**: Express.js, Google GenAI SDK
- **Database**: Firebase Firestore
- **Build**: esbuild, Vite

## Project Structure

```
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── lib/                # Utilities (Firebase, API client, prompts)
│   ├── App.tsx             # Main application
│   └── types.ts            # TypeScript interfaces
├── server.ts               # Express backend server
├── scripts/                # Automation scripts
├── assets/                 # Static media (gitignored)
└── firebase-applet-config.json  # Firebase configuration
```

## License

Private - AI Studio template
