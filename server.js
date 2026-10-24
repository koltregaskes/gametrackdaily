const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT || 4787);
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const TOOLS = [
  {
    id: 'canvas-planner',
    title: 'Canvas Planner',
    category: 'Planning',
    eyebrow: 'Visual workflow',
    tagline: 'Plan image campaigns across focused boards and tasks.',
    description: 'Live local planner for organising visual work and pushing batches through a cleaner pipeline.',
    launcherPath: 'W:\\Agent Workspace 2\\tools\\canvas-planner\\start.cmd',
    readmePath: 'W:\\Agent Workspace 2\\tools\\canvas-planner\\README.md',
    openUrl: 'http://127.0.0.1:3000',
    openLabel: 'Open App',
    status: 'Server launcher',
    accent: '#7cf2c3'
  },
  {
    id: 'mj-calendar',
    title: 'MJ Calendar',
    category: 'Planning',
    eyebrow: 'Daily checklist',
    tagline: 'Track reviews, videos, upscales, and publishing day by day.',
    description: 'A local-first Midjourney checklist calendar with presets, notes, and fast date navigation.',
    launcherPath: 'W:\\Agent Workspace 2\\tools\\mj-calendar\\start.cmd',
    readmePath: 'W:\\Agent Workspace 2\\tools\\mj-calendar\\README.md',
    openUrl: pathToFileURL('W:\\Repos\\_My Tools\\mj-calendar\\index.html').href,
    openLabel: 'Open App',
    status: 'Instant open',
    accent: '#f7b55b'
  },
  {
    id: 'buffer-replacement',
    title: 'Signal Stack',
    category: 'Publishing',
    eyebrow: 'Creator scheduling',
    tagline: 'Plan Instagram, TikTok, and YouTube publishing in one place.',
    description: 'A local publishing prototype aimed at image and video scheduling beyond text-first social tools.',
    launcherPath: 'W:\\Agent Workspace 2\\tools\\buffer-replacement\\start.cmd',
    readmePath: 'W:\\Agent Workspace 2\\tools\\buffer-replacement\\README.md',
    openUrl: pathToFileURL('W:\\Repos\\_My Tools\\buffer-replacement\\web\\index.html').href,
    openLabel: 'Open App',
    status: 'Instant open',
    accent: '#ff8b63'
  },
  {
    id: 'trailer-creator',
    title: 'Trailer Creator',
    category: 'Publishing',
    eyebrow: 'Dossier builder',
    tagline: 'Shape trailer notes, lore snippets, and narration in one workspace.',
    description: 'A dossier-style tool for packaging story, hooks, and trailer structure into something usable.',
    launcherPath: 'W:\\Agent Workspace 2\\tools\\trailer_creator\\start.cmd',
    readmePath: 'W:\\Agent Workspace 2\\tools\\trailer_creator\\README.md',
    openUrl: pathToFileURL('W:\\Repos\\_My Tools\\trailer_creator\\index.html').href,
    openLabel: 'Open App',
    status: 'Instant open',
    accent: '#c98fff'
  },
  {
    id: 'strudel-studio',
    title: 'Strudel Studio',
    category: 'Music',
    eyebrow: 'Unified music tool',
    tagline: 'One Strudel-inspired studio direction for coded music, samples, scenes, and recording.',
    description: 'This card now represents the merged Strudel path: the fast prototype ideas from strudel-test and the richer studio ambition from strudel-rave-remix.',
    launcherPath: 'W:\\Agent Workspace 2\\tools\\strudel-rave-remix\\start.cmd',
    readmePath: 'W:\\Repos\\_My Tools\\strudel-rave-remix\\README.md',
    openUrl: 'http://127.0.0.1:4174',
    openLabel: 'Open App',
    status: 'Server launcher',
    accent: '#6bd6ff'
  }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
    });
    response.end(data);
  });
}

function publicTool(tool) {
  return {
    id: tool.id,
    title: tool.title,
    category: tool.category,
    eyebrow: tool.eyebrow,
    tagline: tool.tagline,
    description: tool.description,
    openUrl: tool.openUrl,
    openLabel: tool.openLabel,
    readmeUrl: pathToFileURL(tool.readmePath).href,
    launcherPath: tool.launcherPath,
    status: tool.status,
    accent: tool.accent
  };
}

function launchTool(tool) {
  const child = spawn('cmd.exe', ['/c', 'start', '""', `"${tool.launcherPath}"`], {
    cwd: path.dirname(tool.launcherPath),
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const route = requestUrl.pathname;

  if (request.method === 'GET' && route === '/api/health') {
    sendJson(response, 200, { ok: true, toolCount: TOOLS.length });
    return;
  }

  if (request.method === 'GET' && route === '/api/tools') {
    sendJson(response, 200, { tools: TOOLS.map(publicTool) });
    return;
  }

  if (request.method === 'POST' && route === '/api/launch') {
    try {
      const rawBody = await collectRequestBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const tool = TOOLS.find((item) => item.id === body.id);

      if (!tool) {
        sendJson(response, 404, { error: 'Tool not found' });
        return;
      }

      launchTool(tool);
      sendJson(response, 200, {
        ok: true,
        message: `${tool.title} launch requested.`,
        tool: publicTool(tool)
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Launch failed' });
    }
    return;
  }

  let filePath = route === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, route);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  sendFile(response, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Tools Hub running at http://${HOST}:${PORT}`);
});
