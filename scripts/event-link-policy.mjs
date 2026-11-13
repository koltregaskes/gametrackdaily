export function normaliseGameEvent(event) {
  const retired = new Set([
    'coming-soon','coming-soon-4','coming-soon-5','frosty-games-fest',
    'women-led-games','ioi-showcase','death-stranding-2-game-premiere',
    'wholesome-direct','black-voices-in-gaming','green-games',
    'devolver-digital-presents-a-captivating-showcase-dedicated-to-one-developer-and-one-game-kenny-suns-upcoming-ball-x-pit'
  ]);
  const links = [event.watchUrl,event.officialUrl].filter(Boolean);
  const broken = links.some(link=>{
    try {const url=new URL(link);return url.hostname==='www.summergamefest.com'&&retired.has(url.pathname.replace(/^\/events\//,'').replace(/\/$/,''))&&url.pathname.startsWith('/events/');}
    catch{return false;}
  });
  if(!broken)return event;
  const note='Original event page is no longer available; this link opens the official festival site.';
  return {...event,watchUrl:'https://www.summergamefest.com/',officialUrl:'https://www.summergamefest.com/',watchLabel:'Official festival site',notes:event.notes?.includes(note)?event.notes:[event.notes,note].filter(Boolean).join(' ')};
}
