# Scientific-calculator-app
Use one of the most popular scientific calculators right on your desktop.

Find the right executable for your platform in Releases.

OR

Buid from source (instructions below)

## Requirements
 
- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- Internet connection (the calculator runs from the website)
---
 
## Setup
 
```bash
# Install dependencies
npm install
```
 
---
 
## Run (development)
 
```bash
npm start
```
 
---
 
## Build a distributable app
 
First install `electron-builder`:
 
```bash
npm install --save-dev electron-builder
```
 
Then build for your platform:
 
```bash
# macOS (.dmg)
npm run build:mac
 
# Windows (.exe installer + portable)
npm run build:win
 
# Linux (AppImage + .deb)
npm run build:linux
```
 
Output goes to the `dist/` folder.
 
---

