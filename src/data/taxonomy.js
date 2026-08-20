// Wat je van een kampeerplek wilt onthouden. Bewust een vaste lijst: vrije
// tekst is fijn om in te typen en waardeloos om later op te filteren.

export const SPOT_KINDS = [
  { id: 'wild', label: 'Wildkamperen', emoji: '🌲' },
  { id: 'bivak', label: 'Bivakplek', emoji: '⛺' },
  { id: 'hangmat', label: 'Hangmatplek', emoji: '🪢' },
  { id: 'camper', label: 'Camper / bus', emoji: '🚐' },
  { id: 'boer', label: 'Bij de boer', emoji: '🚜' },
  { id: 'camping', label: 'Kleine camping', emoji: '🏕️' },
  { id: 'shelter', label: 'Schuilhut', emoji: '🛖' },
  { id: 'strand', label: 'Strand', emoji: '🏖️' },
];

export const kindOf = (id) => SPOT_KINDS.find((k) => k.id === id) || SPOT_KINDS[0];

// Gegroepeerd, want een platte lijst van dertig vinkjes leest niemand.
export const TAG_GROUPS = [
  {
    label: 'Water',
    tags: [
      { id: 'water', label: 'Drinkwater', emoji: '🚰' },
      { id: 'beek', label: 'Beek of rivier', emoji: '🏞️' },
      { id: 'zwemmen', label: 'Zwemmen kan', emoji: '🏊' },
    ],
  },
  {
    label: 'Comfort',
    tags: [
      { id: 'vuur-ok', label: 'Vuur mag', emoji: '🔥' },
      { id: 'vlak', label: 'Vlakke ondergrond', emoji: '🟩' },
      { id: 'luwte', label: 'Uit de wind', emoji: '🌬️' },
      { id: 'schaduw', label: 'Schaduw', emoji: '🌳' },
      { id: 'wc', label: 'Toilet in de buurt', emoji: '🚻' },
      { id: 'afval', label: 'Afvalbak', emoji: '🗑️' },
    ],
  },
  {
    label: 'Bereikbaarheid',
    tags: [
      { id: 'auto', label: 'Met de auto tot aan', emoji: '🚗' },
      { id: 'camperhoog', label: 'Hoge bus past', emoji: '🚐' },
      { id: 'lopen', label: 'Laatste stuk lopen', emoji: '🥾' },
      { id: 'ov', label: 'Met OV te doen', emoji: '🚌' },
      { id: 'winter', label: 'Ook in de winter', emoji: '❄️' },
    ],
  },
  {
    label: 'Sfeer',
    tags: [
      { id: 'stil', label: 'Echt stil', emoji: '🤫' },
      { id: 'uitzicht', label: 'Uitzicht', emoji: '🌄' },
      { id: 'zonsopkomst', label: 'Zonsopkomst', emoji: '🌅' },
      { id: 'sterren', label: 'Donkere hemel', emoji: '✨' },
      { id: 'afgelegen', label: 'Niemand te zien', emoji: '🧭' },
    ],
  },
  {
    label: 'Let op',
    tags: [
      { id: 'muggen', label: 'Muggen', emoji: '🦟' },
      { id: 'nat', label: 'Loopt onder water', emoji: '💧' },
      { id: 'weg', label: 'Weglawaai', emoji: '🛣️' },
      { id: 'vee', label: 'Vee in de wei', emoji: '🐄' },
      { id: 'geen-bereik', label: 'Geen bereik', emoji: '📵' },
      { id: 'jacht', label: 'Jachtgebied', emoji: '🎯' },
    ],
  },
];

export const ALL_TAGS = TAG_GROUPS.flatMap((g) => g.tags);
export const tagOf = (id) => ALL_TAGS.find((t) => t.id === id) || { id, label: id, emoji: '·' };

// Hoe het juridisch zit. Geen oordeel, gewoon wat jij erover weet — handig als
// je een jaar later terugkomt en niet meer weet of je daar mocht staan.
export const LEGAL_STATES = [
  { id: 'unknown', label: 'Weet ik niet', emoji: '❓', tone: 'muted' },
  { id: 'ok', label: 'Mag officieel', emoji: '✅', tone: 'good' },
  { id: 'gedoogd', label: 'Wordt gedoogd', emoji: '🤝', tone: 'warn' },
  { id: 'toestemming', label: 'Met toestemming', emoji: '🔑', tone: 'warn' },
  { id: 'grijs', label: 'Grijs gebied', emoji: '⚠️', tone: 'warn' },
  { id: 'verboden', label: 'Mag eigenlijk niet', emoji: '🚫', tone: 'bad' },
];

export const legalOf = (id) => LEGAL_STATES.find((l) => l.id === id) || LEGAL_STATES[0];

export const MONTHS = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

/** Een lege plek, met alle velden erin zodat React geen ongecontroleerde inputs krijgt. */
export function emptySpot(overrides = {}) {
  return {
    name: '',
    lat: null,
    lng: null,
    kind: 'wild',
    rating: null,
    notes: '',
    access: '',
    tags: [],
    best_months: [],
    capacity: null,
    elevation: null,
    legal: 'unknown',
    photos: [],
    archived: false,
    ...overrides,
  };
}
