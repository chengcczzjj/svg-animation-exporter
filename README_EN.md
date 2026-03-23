**English** | [中文](./README.md)

# SVG Animation Exporter

Export SVG animations to transparent-background MOV videos (ProRes 4444), ready to import into video editors like CapCut, Premiere Pro, etc.

## Features

- 🎬 Auto-scan SVG animation files in the working directory
- 🔍 Smart detection of animation types (entrance / loop)
- 📐 Customizable resolution scaling and frame rate
- 🎥 Output ProRes 4444 transparent video (`.mov`)
- 💻 Interactive command-line interface

## Prerequisites

- [Node.js](https://nodejs.org/) >= 16
- [FFmpeg](https://ffmpeg.org/) installed and added to system PATH

## Installation

```bash
npm install
```

## Quick Start

- **Windows** — Double-click `start_win.bat` to launch
- **macOS / Linux** — Run in terminal:
  ```bash
  chmod +x start_mac.sh   # first time only
  ./start_mac.sh
  ```

Alternatively, run on any platform:

```bash
npm start
```

An interactive CLI will guide you through the process:

1. Select SVG files to export
2. Choose export mode (entrance animation / loop animation / both)
3. Set frame rate and scale factor
4. Confirm and start exporting

Exported videos will be saved in the `output/` directory.

## Project Structure

```
├── start_win.bat          # Windows launch script
├── start_mac.sh           # macOS / Linux launch script
├── SVG/                   # SVG animation source files
├── package.json
├── tools/
│   ├── index.js           # Main entry, orchestrates all modules
│   ├── cli.js             # Interactive CLI
│   ├── config.js          # Configuration constants
│   ├── svg-scanner.js     # SVG file scanning & parsing
│   ├── frame-capture.js   # Puppeteer frame capture
│   ├── video-encoder.js   # FFmpeg video encoding
│   ├── utils.js           # Utility functions
│   └── web/               # Preview web pages
└── output/                # Exported video files
```

## Tech Stack

- **Puppeteer** — Headless browser frame capture
- **FFmpeg** (ProRes 4444) — Video encoding
- **Inquirer** — Interactive CLI prompts
- **Chalk / Ora / cli-progress** — Terminal UI enhancements

## License

MIT
