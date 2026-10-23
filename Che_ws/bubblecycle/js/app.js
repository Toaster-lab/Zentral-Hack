import { html, render } from './lib.js';
import { useRoute, navigate } from './router.js';
import { Icon, ToastHost, Avatar } from './ui.js';
import { useStore } from './store.js';
import { LogSheetHost } from './screens/logsheet.js';
import Home from './screens/home.js';
import MapScreen from './screens/map.js';
import Scan from './screens/scan.js';
import Discover from './screens/discover.js';
import Profile from './screens/profile.js';
import Rewards from './screens/rewards.js';
import Leaderboard from './screens/leaderboard.js';
import Activity from './screens/activity.js';
import AddPlace from './screens/addplace.js';
import Contributions from './screens/contributions.js';
import Admin from './screens/admin.js';
import Social from './screens/social.js';
import Collection from './screens/collection.js';
import Quests from './screens/quests.js';

const SCREENS = { home: Home, map: MapScreen, scan: Scan, discover: Discover, profile: Profile, rewards: Rewards, leaderboard: Leaderboard, activity: Activity, add: AddPlace, contributions: Contributions, admin: Admin, social: Social, collection: Collection, quests: Quests };

// Profile now lives in the avatar button (top right) so the bar stays uncrowded.
const TABS = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'map', label: 'Map', icon: 'map', also: ['add'] },
  { name: 'scan', label: 'Scan', icon: 'scan', center: true },
  { name: 'discover', label: 'Discover', icon: 'sparkle' },
  { name: 'social', label: 'Social', icon: 'users' },
];
const PROFILE_ROUTES = ['profile', 'rewards', 'leaderboard', 'activity', 'contributions', 'admin', 'collection', 'quests'];

function App() {
  const route = useRoute();
  const s = useStore();
  const Screen = SCREENS[route.name];
  const onProfile = PROFILE_ROUTES.includes(route.name);
  const avatar = s.social.enabled ? s.social.avatar : null;
  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="app-bar">
      <button class="brand" onClick=${() => navigate('home')} aria-label="BubbleCycle home"><span class="brand-bubble" aria-hidden="true"></span>BubbleCycle</button>
      <button class=${`avatar-btn ${onProfile ? 'active' : ''}`} onClick=${() => navigate('profile')} aria-label="Profile, rewards and settings" aria-current=${route.name === 'profile' ? 'page' : undefined}>
        ${avatar ? html`<${Avatar} avatar=${avatar} size=${40} />` : html`<span class="avatar-bubble tone-mint" style="width:40px;height:40px"><${Icon} name="user" size=${22} /></span>`}
      </button>
    </header>
    <main id="main" class="app-main">
      <${Screen} key=${route.name + route.params.toString()} params=${route.params} />
    </main>
    <nav class="bottom-nav" aria-label="Main">
      ${TABS.map((t) => {
        const active = route.name === t.name || t.also?.includes(route.name);
        return html`<button class=${`nav-item ${t.center ? 'nav-center' : ''} ${active ? 'active' : ''}`}
          aria-current=${active ? 'page' : undefined} onClick=${() => navigate(t.name)}>
          <span class="nav-icon"><${Icon} name=${t.icon} size=${t.center ? 28 : 24} /></span>
          <span class="nav-label">${t.label}</span>
        </button>`;
      })}
    </nav>
    <${LogSheetHost} />
    <${ToastHost} />
  `;
}

render(html`<${App} />`, document.getElementById('app'));
