import { useEffect, useState } from './lib.js';

export const ROUTES = ['home', 'map', 'scan', 'discover', 'profile', 'rewards', 'leaderboard', 'activity', 'add', 'contributions', 'admin', 'social', 'collection', 'quests', 'dev', 'calendar'];

function parse() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: ROUTES.includes(path) ? path : 'home', params: new URLSearchParams(qs || '') };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (to) => { location.hash = '#/' + to; };
