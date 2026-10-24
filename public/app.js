const toolGrid = document.getElementById('toolGrid');
const categoryFilters = document.getElementById('categoryFilters');
const hubStatus = document.getElementById('hubStatus');
const toolCardTemplate = document.getElementById('toolCardTemplate');

const artThemes = {
  'canvas-planner': {
    title: 'CANVAS',
    subtitle: 'BOARD FLOW',
    accent: '#7cf2c3',
    bgA: '#0f2430',
    bgB: '#14233f'
  },
  'mj-calendar': {
    title: 'MJ',
    subtitle: 'DAY GRID',
    accent: '#f7b55b',
    bgA: '#261b10',
    bgB: '#3e2a12'
  },
  'buffer-replacement': {
    title: 'SIGNAL',
    subtitle: 'SCHEDULE',
    accent: '#ff8b63',
    bgA: '#231318',
    bgB: '#422020'
  },
  'trailer-creator': {
    title: 'TRAILER',
    subtitle: 'DOSSIER',
    accent: '#c98fff',
    bgA: '#1a1431',
    bgB: '#2e2145'
  },
  'strudel-studio': {
    title: 'STRUDEL',
    subtitle: 'STUDIO',
    accent: '#8df062',
    bgA: '#0c2331',
    bgB: '#1a2f43'
  }
};

let allTools = [];
let activeCategory = 'All';

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildPosterArt(toolId) {
  const theme = artThemes[toolId] || {
    title: 'TOOLS',
    subtitle: 'LOCAL',
    accent: '#80ffd1',
    bgA: '#102030',
    bgB: '#1c2438'
  };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${theme.title}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.bgA}" />
          <stop offset="100%" stop-color="${theme.bgB}" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.28" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" fill="url(#bg)" />
      <circle cx="530" cy="90" r="80" fill="${theme.accent}" opacity="0.13" />
      <circle cx="120" cy="360" r="110" fill="${theme.accent}" opacity="0.08" />
      <path d="M68 318 L270 108 L430 188 L570 66" fill="none" stroke="url(#glow)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
      <path d="M70 346 L270 136 L430 216 L570 94" fill="none" stroke="${theme.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
      <rect x="54" y="54" width="132" height="132" rx="24" fill="none" stroke="${theme.accent}" stroke-opacity="0.25" stroke-width="2"/>
      <rect x="472" y="250" width="110" height="110" rx="28" fill="${theme.accent}" fill-opacity="0.12" stroke="${theme.accent}" stroke-opacity="0.3" stroke-width="2"/>
      <text x="54" y="245" fill="#f5f4ef" font-size="82" font-weight="800" font-family="Arial, sans-serif">${theme.title}</text>
      <text x="58" y="292" fill="${theme.accent}" font-size="26" font-weight="700" letter-spacing="6" font-family="Arial, sans-serif">${theme.subtitle}</text>
    </svg>
  `;

  return svgToDataUri(svg);
}

function setStatus(message) {
  hubStatus.textContent = message;
}

function renderFilters() {
  const categories = ['All', ...new Set(allTools.map((tool) => tool.category))];
  categoryFilters.innerHTML = '';

  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-btn';
    button.textContent = category;
    button.classList.toggle('active', category === activeCategory);
    button.addEventListener('click', () => {
      activeCategory = category;
      renderFilters();
      renderTools();
    });
    categoryFilters.appendChild(button);
  });
}

function filteredTools() {
  if (activeCategory === 'All') {
    return allTools;
  }

  return allTools.filter((tool) => tool.category === activeCategory);
}

function renderTools() {
  const tools = filteredTools();
  toolGrid.innerHTML = '';

  if (tools.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tools match this category yet.';
    toolGrid.appendChild(empty);
    return;
  }

  tools.forEach((tool) => {
    const fragment = toolCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.tool-card');
    const art = fragment.querySelector('.tool-card__art');
    const title = fragment.querySelector('.tool-card__title');
    const eyebrow = fragment.querySelector('.tool-card__eyebrow');
    const status = fragment.querySelector('.tool-card__status');
    const tagline = fragment.querySelector('.tool-card__tagline');
    const description = fragment.querySelector('.tool-card__description');
    const launchButton = fragment.querySelector('.launch-btn');
    const openLink = fragment.querySelector('.open-link');
    const readmeLink = fragment.querySelector('.readme-link');

    card.style.setProperty('--accent-color', tool.accent);
    art.style.backgroundImage = `url("${buildPosterArt(tool.id)}")`;
    title.textContent = tool.title;
    eyebrow.textContent = tool.eyebrow;
    status.textContent = tool.status;
    tagline.textContent = tool.tagline;
    description.textContent = tool.description;
    openLink.href = tool.openUrl;
    openLink.textContent = tool.openLabel || 'Open UI';
    readmeLink.href = tool.readmeUrl;

    launchButton.addEventListener('click', async () => {
      launchButton.disabled = true;
      const originalLabel = launchButton.textContent;
      launchButton.textContent = 'Launching...';
      setStatus(`Launching ${tool.title}...`);

      try {
        const response = await fetch('/api/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tool.id })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Launch failed');
        }

        setStatus(payload.message);
        window.setTimeout(() => {
          setStatus(`${allTools.length} tools ready to launch from this machine.`);
        }, 1800);
      } catch (error) {
        setStatus(`Launch failed for ${tool.title}: ${error.message}`);
      } finally {
        launchButton.disabled = false;
        launchButton.textContent = originalLabel;
      }
    });

    toolGrid.appendChild(fragment);
  });
}

async function loadTools() {
  setStatus('Loading local tool registry...');

  try {
    const response = await fetch('/api/tools');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Could not load tools');
    }

    allTools = payload.tools || [];
    renderFilters();
    renderTools();
    setStatus(`${allTools.length} tools ready to launch from this machine.`);
  } catch (error) {
    toolGrid.innerHTML = '';
    const errorState = document.createElement('div');
    errorState.className = 'empty-state';
    errorState.textContent = `The hub could not load the local tool registry. ${error.message}`;
    toolGrid.appendChild(errorState);
    setStatus('Hub failed to load.');
  }
}

loadTools();
