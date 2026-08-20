import { useEffect, useState } from 'react';
import { Empty, Field, Note, Sheet } from '../components/ui.jsx';
import {
  listFriends, listCircles, searchProfiles, requestFriend, acceptFriend, removeFriend,
  createCircle, deleteCircle, addToCircle, removeFromCircle,
} from '../lib/social.js';

/** Vrienden en groepen. Delen aan een groep scheelt later werk. */
export default function Mensen({ profile, onChanged }) {
  const [friends, setFriends] = useState({ friends: [], incoming: [], outgoing: [] });
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newCircle, setNewCircle] = useState(false);
  const [editingCircle, setEditingCircle] = useState(null);
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const [f, c] = await Promise.all([listFriends(), listCircles()]);
      setFriends(f);
      setCircles(c);
      onChanged?.(f.friends, c);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="center" style={{ padding: 40 }}><span className="spinner" /></div>;

  const naam = (p) => p?.display_name || p?.handle || 'Onbekend';

  return (
    <>
      {error && <Note tone="bad">{error}</Note>}

      {profile && (
        <div className="card">
          <div className="tiny muted">Jouw naam om te delen</div>
          <div className="row" style={{ marginTop: 4 }}>
            <div className="grow strong mono">@{profile.handle}</div>
            <span style={{ fontSize: 22 }}>{profile.emoji}</span>
          </div>
          <div className="hint">Dit is wat een vriend intypt om jou toe te voegen.</div>
        </div>
      )}

      {friends.incoming.length > 0 && (
        <>
          <div className="section-title">Wil jou toevoegen</div>
          {friends.incoming.map((f) => (
            <div className="card tight" key={f.id}>
              <div className="row">
                <div className="grow">
                  <div className="strong small">{f.profile?.emoji} {naam(f.profile)}</div>
                  <div className="tiny muted">@{f.profile?.handle}</div>
                </div>
                <button className="btn sm primary" onClick={async () => { await acceptFriend(f.id); refresh(); }}>
                  Accepteren
                </button>
                <button className="btn sm ghost" onClick={async () => { await removeFriend(f.id); refresh(); }}>
                  Nee
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="section-title">Vrienden</div>
      {!friends.friends.length && !friends.outgoing.length && (
        <Empty art="🧭" title="Nog geen vrienden">
          Voeg iemand toe op hun naam, dan kun je plekken rechtstreeks met ze delen — dat blijft
          staan, ook als een link kwijtraakt. Let op: het telt pas als de ander je verzoek
          accepteert.
        </Empty>
      )}
      {friends.friends.map((f) => (
        <div className="card tight" key={f.id}>
          <div className="row">
            <div className="grow">
              <div className="strong small">{f.profile?.emoji} {naam(f.profile)}</div>
              <div className="tiny muted">@{f.profile?.handle}</div>
            </div>
            <button className="btn sm ghost danger" onClick={async () => { await removeFriend(f.id); refresh(); }}>
              Verwijderen
            </button>
          </div>
        </div>
      ))}
      {friends.outgoing.map((f) => (
        <div className="card tight" key={f.id}>
          <div className="row">
            <div className="grow">
              <div className="strong small">{f.profile?.emoji} {naam(f.profile)}</div>
              <div className="tiny muted">Wacht op antwoord</div>
            </div>
            <button className="btn sm ghost" onClick={async () => { await removeFriend(f.id); refresh(); }}>
              Intrekken
            </button>
          </div>
        </div>
      ))}
      <button className="btn wide" onClick={() => setAdding(true)}>+ Vriend toevoegen</button>

      <div className="section-title">Groepen</div>
      {!circles.length && (
        <p className="small muted" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Een groep is handig als je vaker met dezelfde mensen op pad gaat: deel één keer met
          "Busploeg" en wie je later toevoegt ziet het meteen.
        </p>
      )}
      {circles.map((circle) => (
        <div className="card tight" key={circle.id}>
          <div className="row">
            <div className="grow">
              <div className="strong small">{circle.emoji} {circle.name}</div>
              <div className="tiny muted">
                {circle.members.length} {circle.members.length === 1 ? 'lid' : 'leden'}
                {!circle.mine && ' · je zit hierin'}
              </div>
            </div>
            {circle.mine && (
              <button className="btn sm ghost" onClick={() => setEditingCircle(circle)}>Beheren</button>
            )}
          </div>
        </div>
      ))}
      <button className="btn wide" onClick={() => setNewCircle(true)}>+ Groep maken</button>

      {adding && (
        <AddFriend
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); refresh(); }}
        />
      )}
      {newCircle && (
        <NewCircle
          onClose={() => setNewCircle(false)}
          onMade={() => { setNewCircle(false); refresh(); }}
        />
      )}
      {editingCircle && (
        <CircleEditor
          circle={editingCircle}
          friends={friends.friends}
          onClose={() => setEditingCircle(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function AddFriend({ onClose, onAdded }) {
  const [term, setTerm] = useState('');
  const [treffers, setTreffers] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const kort = term.trim().length < 3;

  const zoek = async () => {
    if (kort) return;
    setBusy(true);
    setStatus(null);
    setTreffers(null);
    try {
      const gevonden = await searchProfiles(term);
      setTreffers(gevonden);
      if (!gevonden.length) setStatus({ tone: 'bad', text: 'Niemand gevonden die zo begint.' });
    } catch (e) {
      setStatus({ tone: 'bad', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const vraag = async (profiel) => {
    try {
      await requestFriend(profiel.id);
      onAdded();
    } catch (e) {
      setStatus({
        tone: 'bad',
        text: e.message.includes('duplicate')
          ? 'Je hebt deze persoon al gevraagd.'
          : e.message,
      });
    }
  };

  return (
    <Sheet title="Vriend toevoegen" onClose={onClose}>
      {status && <Note tone={status.tone}>{status.text}</Note>}

      <Field
        label="Hun naam"
        hint="Het begin is genoeg — minstens drie letters. Hun naam staat bovenaan bij Mensen, in hun eigen app."
      >
        <div className="row" style={{ gap: 7 }}>
          <input
            className="input grow"
            value={term}
            placeholder="jas"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && zoek()}
          />
          <button className="btn" onClick={zoek} disabled={busy || kort}>
            {busy ? <span className="spinner" /> : 'Zoek'}
          </button>
        </div>
      </Field>

      {treffers?.map((profiel) => (
        <div className="card tight" key={profiel.id}>
          <div className="row">
            <div className="grow">
              <div className="strong">
                {profiel.emoji} {profiel.display_name || profiel.handle}
              </div>
              <div className="tiny muted">@{profiel.handle}</div>
            </div>
            <button className="btn primary sm" onClick={() => vraag(profiel)}>
              Vragen
            </button>
          </div>
        </div>
      ))}
    </Sheet>
  );
}

const CIRCLE_EMOJI = ['👥', '🚐', '🥾', '👨‍👩‍👧', '🔥', '🏔️', '🚴', '🛶'];

function NewCircle({ onClose, onMade }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [busy, setBusy] = useState(false);

  return (
    <Sheet title="Nieuwe groep" onClose={onClose}>
      <Field label="Naam">
        <input
          className="input"
          value={name}
          placeholder="Busploeg"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Icoon">
        <div className="chips">
          {CIRCLE_EMOJI.map((e) => (
            <button key={e} className={`chip${emoji === e ? ' on' : ''}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <button
        className="btn primary wide"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          await createCircle(name.trim(), emoji);
          onMade();
        }}
      >
        {busy ? <span className="spinner" /> : null} Maken
      </button>
    </Sheet>
  );
}

function CircleEditor({ circle, friends, onClose, onChanged }) {
  const [members, setMembers] = useState(circle.members);

  const inCircle = (id) => members.some((m) => m.member_id === id);

  const toggle = async (friend) => {
    const id = friend.profile.id;
    if (inCircle(id)) {
      await removeFromCircle(circle.id, id);
      setMembers((m) => m.filter((x) => x.member_id !== id));
    } else {
      await addToCircle(circle.id, id);
      setMembers((m) => [...m, { member_id: id, profile: friend.profile }]);
    }
    onChanged();
  };

  return (
    <Sheet title={`${circle.emoji} ${circle.name}`} onClose={onClose}>
      {!friends.length && (
        <Note tone="info">Voeg eerst vrienden toe; die kun je daarna in deze groep zetten.</Note>
      )}
      {friends.map((f) => (
        <div className="card tight" key={f.id}>
          <div className="row">
            <div className="grow">
              <div className="strong small">{f.profile?.emoji} {f.profile?.display_name || f.profile?.handle}</div>
            </div>
            <button
              className={`btn sm${inCircle(f.profile.id) ? '' : ' primary'}`}
              onClick={() => toggle(f)}
            >
              {inCircle(f.profile.id) ? 'Eruit' : 'Erin'}
            </button>
          </div>
        </div>
      ))}

      <div className="section-title">Gevaarlijke knoppen</div>
      <button
        className="btn danger wide"
        onClick={async () => {
          await deleteCircle(circle.id);
          onChanged();
          onClose();
        }}
      >
        Groep opheffen
      </button>
      <div className="hint">Shares aan deze groep vervallen daarmee ook.</div>
    </Sheet>
  );
}
