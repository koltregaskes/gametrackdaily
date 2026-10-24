# Tools Hub

A local-first launcher hub for the finished internal tools in `W:\Agent Workspace 2\tools`.

This repo started as `games-hub`, but this build turns it into a machine-local control centre for the tool stack you are actively using.

## What It Does

- Shows the active local tools as large visual launch cards
- Groups them into clear categories like planning, publishing, and music
- Starts the real local launcher for each tool from the browser UI
- Provides direct links to the tool UI and local README where available
- Runs fully on this machine as a lightweight Node app

## Included Tools

- Canvas Planner
- Midjourney Review Calendar
- Signal Stack
- Trailer Creator
- Strudel Studio

## Excluded For Now

- `SyncPad` stays separate because it is a private desktop app
- `emergent-ai-test1` / `TaskMaster` is not included in the hub
- the two Strudel repos are represented as one combined hub destination while the underlying repo merge is still in progress

## Run It

1. Open [start.cmd](W:\Repos\_local\surfaces\games-hub\start.cmd)
2. The hub opens at `http://127.0.0.1:4787`
3. Click a tool tile to launch its existing workspace launcher

## Files

- `server.js` - local launcher API and static server
- `package.json` - run scripts
- `public/index.html` - hub shell
- `public/app.js` - card rendering and launch actions
- `public/styles.css` - visual design
- `start.cmd` - Windows launcher for the hub itself
