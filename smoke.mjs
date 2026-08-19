// Handmatige rooktest: start `npm run build && npx vite preview --port 4174`
// en draai daarna `node smoke.mjs`. Loopt de app in een echte browser door.
import { chromium } from 'playwright';

const SHOT = process.env.SHOT_DIR || '/tmp/camp-smoke';
const BASIS = process.env.CAMP_URL || 'http://localhost:4173';
// Normaal pakt Playwright zelf de juiste browser (na `npx playwright install`).
// CHROME_PATH is er voor omgevingen waar er al een chromium klaarstaat.
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const fouten = [];
page.on('pageerror', (e) => fouten.push('PAGEERROR: ' + e.message));

const stap = async (naam, fn) => {
  await fn();
  await page.screenshot({ path: `${SHOT}/${naam}.png` });
  console.log('✓', naam);
};

await stap('01-login', async () => {
  await page.goto(`${BASIS}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
});

await stap('02-kaart', async () => {
  await page.getByRole('button', { name: /Beginnen zonder account|Zonder account verder/ }).click();
  await page.waitForTimeout(900);
});

await stap('03-nieuwe-plek', async () => {
  await page.locator('.tabbar button', { hasText: 'Plekken' }).click();
  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.locator('.sheet-body input.input').first().fill('Beukenbos aan de Ourthe');
  await page.locator('.sheet-body input.input').nth(1)
    .fill('https://www.google.com/maps/place/X/@50.19,5.49,17z/data=!4m5!3m4!8m2!3d50.2!4d5.5');
  await page.waitForTimeout(600);
  await page.locator('.chip', { hasText: 'Drinkwater' }).click();
  await page.locator('.chip', { hasText: 'Vuur mag' }).click();
  await page.locator('.textarea').first().fill('Vlak stukje achter de bocht.');
});

const veld = await page.locator('.sheet-body input.input').nth(1).inputValue();
console.log('   coordinaat uit Google-link:', veld.includes('50.20000') ? '50.20000, 5.50000 ✓' : veld);

await stap('04-tweede-plek', async () => {
  await page.getByRole('button', { name: 'Bewaren' }).click();
  await page.waitForTimeout(700);
  await page.locator('.fab').click();
  await page.waitForTimeout(300);
  await page.locator('.sheet-body input.input').first().fill('Duinpan bij Bergen');
  await page.locator('.sheet-body input.input').nth(1).fill(`52°38'00.0"N 4°37'00.0"E`);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Bewaren' }).click();
  await page.waitForTimeout(700);
});
console.log('   plekken bewaard:', await page.locator('.card.pressable').count());

await stap('05-zoeken', async () => {
  await page.locator('input.input').first().fill('duin');
  await page.waitForTimeout(300);
});
console.log('   na zoeken op "duin":', await page.locator('.card.pressable').count());

await stap('06-detail', async () => {
  await page.locator('input.input').first().fill('');
  await page.waitForTimeout(200);
  await page.locator('.card.pressable').first().click();
  await page.waitForTimeout(900);
});
console.log('   detailtitel:', await page.locator('.sheet-head h2').textContent());
console.log('   deelknop verborgen zonder account:',
  (await page.locator('button', { hasText: 'Deze plek delen' }).count()) === 0 ? 'ja ✓' : 'NEE');

await stap('07-logboek', async () => {
  await page.getByRole('button', { name: '+ Bezoek toevoegen' }).click();
  await page.waitForTimeout(400);
  await page.locator('.textarea').last().fill('Hele nacht uilen gehoord.');
  await page.getByRole('button', { name: 'Bewaren' }).click();
  await page.waitForTimeout(700);
});
console.log('   logboekregels:', await page.locator('.sheet-body .card.tight').count());

await stap('08-instellingen', async () => {
  // Alle open panelen dichtdoen; die liggen over de tabbalk heen.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.tabbar button', { hasText: 'Meer' }).click();
  await page.waitForTimeout(400);
});

await stap('09-lichtthema', async () => {
  await page.locator('.chip', { hasText: 'Dag' }).click();
  await page.waitForTimeout(400);
});

await stap('10-kapotte-deellink', async () => {
  await page.locator('.chip', { hasText: 'Nacht' }).click();
  await page.goto(`${BASIS}/#/s/bestaatniet`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
});
console.log('   melding:', (await page.locator('.note').first().textContent().catch(() => '—')));

await browser.close();
console.log('\nJS-fouten:', fouten.length ? fouten : 'geen');
