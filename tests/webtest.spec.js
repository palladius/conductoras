const { test, expect } = require('@playwright/test');

test('Load ADK SRE Benjamin and check for 5+ conductor tracks', async ({ page }) => {
  const consoleLogs = [];
  const errors = [];

  // Listen to console errors and logs
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      console.error(`Page error: ${msg.text()}`);
    } else {
      console.log(`Page log: ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    errors.push(exception);
    console.error(`Uncaught exception: "${exception}"`);
  });

  // Open app on ADK SRE Benjamin
  // Note: we assume the server is running at localhost:8000
  console.log('Navigating to http://localhost:8000/?repo=adk-sre-benjamin');
  await page.goto('http://localhost:8000/?repo=adk-sre-benjamin', { waitUntil: 'networkidle' });

  // Let's click "Start Briefing" if it's there
  try {
      const btn = await page.locator('#btnStartBriefing');
      if (await btn.isVisible()) {
          console.log('Clicking Start Briefing...');
          await btn.click();
      }
  } catch(e) {}
  
  // Also click Play just in case
  try {
      await page.locator('#btnPlay').click();
  } catch(e) {}

  // The simulation is running. To get 5+ conductor tracks on screen, 
  // we might need to fast forward or just wait. 
  // Let's click the progress bar at 90% to fast forward.
  try {
      console.log('Fast forwarding timeline to 90%...');
      const progressBar = page.locator('#progressContainer');
      const box = await progressBar.boundingBox();
      if (box) {
          await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
      }
  } catch(e) {
      console.log('Could not fast forward:', e);
  }

  // Wait a little bit for the UI to update
  await page.waitForTimeout(1000);

  // Check the Tracks Log table
  const trackItems = page.locator('#tracksLogTable > div');
  const count = await trackItems.count();
  console.log(`Found ${count} tracks in the log table.`);

  if (errors.length > 0) {
      console.error('There were JS errors on the page!');
  }

  expect(count).toBeGreaterThanOrEqual(5);
});
