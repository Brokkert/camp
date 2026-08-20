import { useCallback, useEffect, useState } from 'react';
import Kaart from './tabs/Kaart.jsx';
import Plekken from './tabs/Plekken.jsx';
import Gedeeld from './tabs/Gedeeld.jsx';
import Mensen from './tabs/Mensen.jsx';
import Instellingen from './tabs/Instellingen.jsx';
import Login from './views/Login.jsx';
import SharedView from './views/SharedView.jsx';
import SpotForm from './components/SpotForm.jsx';
import SpotDetail from './components/SpotDetail.jsx';
import ShareSheet from './components/ShareSheet.jsx';
import { SharedSpotSheet } from './tabs/Gedeeld.jsx';
import { Note } from './components/ui.jsx';
import { useSession, loadProfile } from './lib/auth.js';
import { useVault } from './lib/vault.js';
import { sharedWithMe } from './lib/sharing.js';
import { isConfigured } from './lib/config.js';

const TABS = [
  { id: 'kaart', label: 'Kaart', icon: '🗺️' },
  { id: 'plekken', label: 'Plekken', icon: '📋' },
  { id: 'gedeeld', label: 'Gedeeld', icon: '🤝' },
  { id: 'mensen', label: 'Mensen', icon: '👥' },
  { id: 'meer', label: 'Meer', icon: '⚙️' },
];

/** Hash-routing: op GitHub Pages is er geen server die paden kan afhandelen. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const shareToken = hash.match(/^#\/s\/(.+)$/)?.[1] || null;
  const joinCode = hash.match(/^#\/join\/(.+)$/)?.[1] || null;
  return { shareToken, joinCode, clear: () => { window.location.hash = ''; } };
}

export default function App() {
  const { session, ready, user } = useSession();
  const { shareToken, joinCode, clear } = useHashRoute();
  const [tab, setTab] = useState('kaart');
  const [skipLogin, setSkipLogin] = useState(() => localStorage.getItem('camp:lokaal') === 'ja');
  const [profile, setProfile] = useState(null);

  const vault = useVault(user);
  const [shared, setShared] = useState([]);
  const [loadingShared, setLoadingShared] = useState(true);
  const [friends, setFriends] = useState([]);
  const [circles, setCircles] = useState([]);

  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [viewingShared, setViewingShared] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [follow, setFollow] = useState(null);
  const [here, setHere] = useState(null);

  const configured = isConfigured();

  // Thema meteen zetten, nog voor het eerste scherm.
  useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('camp:theme') || 'light';
  }, []);

  const refreshProfile = useCallback(() => {
    if (user) loadProfile().then(setProfile).catch(() => {});
  }, [user]);
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!user) {
      setShared([]);
      setLoadingShared(false);
      return;
    }
    setLoadingShared(true);
    sharedWithMe()
      .then(setShared)
      .catch(() => setShared([]))
      .finally(() => setLoadingShared(false));
  }, [user]);

  // Eén keer je positie ophalen, zodat "dichtstbij" kan sorteren. Zonder
  // toestemming werkt alles gewoon, alleen die sortering vervalt.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 600000 }
    );
  }, []);

  // Een deel-link gaat voor op alles: geen inlogscherm, geen navigatie.
  if (shareToken) {
    return <SharedView token={shareToken} onLeave={clear} />;
  }

  if (!ready) {
    return (
      <div className="login-wrap center">
        <span className="spinner" />
      </div>
    );
  }

  // Een uitnodigingslink gaat voor op "ik klikte laatst weg naar de lokale
  // kluis": anders zou de uitgenodigde het aanmeldscherm nooit te zien krijgen.
  if (!session && (!skipLogin || joinCode)) {
    return (
      <Login
        configured={configured}
        joinCode={joinCode}
        onSkip={() => {
          localStorage.setItem('camp:lokaal', 'ja');
          setSkipLogin(true);
        }}
      />
    );
  }

  const openSpot = (spot) => {
    if (spot.shared) {
      const match = shared.find((s) => `gedeeld-${s.share_id}` === spot.id);
      if (match) setViewingShared(match);
      return;
    }
    setViewing(spot);
  };

  const goTo = (spot) => {
    setTab('kaart');
    setFollow({ lat: spot.lat, lng: spot.lng, zoom: 14 });
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          <span className="brandmark">⛺</span> Camp
        </h1>
        <div className="spacer" />
        <span className={`sync ${vault.offline ? 'offline' : vault.cloud ? 'online' : 'local'}`}>
          <span className="led" />
          {vault.offline ? 'geen bereik' : vault.cloud ? 'gesynchroniseerd' : 'lokale kluis'}
        </span>
      </div>

      <div className={`main${tab === 'kaart' ? ' flush' : ''}`}>
        {vault.error && <Note tone="bad">{vault.error}</Note>}

        {tab === 'kaart' && (
          <Kaart
            spots={vault.spots}
            shared={shared}
            onOpen={openSpot}
            onDrop={(point) => setEditing({ ...point })}
            follow={follow}
            here={here}
          />
        )}

        {tab === 'plekken' && (
          <Plekken
            spots={vault.spots}
            here={here}
            onOpen={setViewing}
            onNew={() => setEditing({})}
          />
        )}

        {tab === 'gedeeld' && <Gedeeld shared={shared} loading={loadingShared} />}

        {tab === 'mensen' &&
          (user ? (
            <Mensen
              profile={profile}
              onChanged={(f, c) => {
                setFriends(f);
                setCircles(c);
              }}
            />
          ) : (
            <Note tone="info">
              Vrienden en groepen werken alleen met een account. Ga naar <strong>Meer</strong> om in
              te loggen — je lokale plekken kun je daarna in één keer overzetten.
            </Note>
          ))}

        {tab === 'meer' && (
          <Instellingen
            user={user}
            profile={profile}
            spots={vault.spots}
            onImported={vault.addSpots}
            onReloadProfile={refreshProfile}
          />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {editing && (
        <SpotForm
          spot={editing}
          user={user}
          onSave={vault.saveSpot}
          onClose={() => setEditing(null)}
        />
      )}

      {viewing && (
        <SpotDetail
          spot={vault.spots.find((s) => s.id === viewing.id) || viewing}
          user={user}
          canShare={Boolean(user)}
          onClose={() => setViewing(null)}
          onEdit={(spot) => {
            setViewing(null);
            setEditing(spot);
          }}
          onShare={(spot) => {
            if (!user) return;
            setViewing(null);
            setSharing(spot);
          }}
          onDelete={vault.deleteSpot}
        />
      )}

      {viewingShared && (
        <SharedSpotSheet spot={viewingShared} onClose={() => setViewingShared(null)} />
      )}

      {sharing && (
        <ShareSheet
          spot={sharing}
          friends={friends}
          circles={circles}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}
