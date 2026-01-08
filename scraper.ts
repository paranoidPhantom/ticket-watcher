import puppeteer from "puppeteer";
import { userDb } from "./db.ts";

type ScrapeResult = {
  texts: string[];
  timestamp: number;
  changed: boolean;
  url?: string;
};

// URL from environment variable or default
const DEFAULT_URL = "https://widget.kassir.ru/?type=A&key=0d043285-33ff-bbbb-d1f0-4d379a98d494&domain=spb.kassir.ru&id=187697";
const URL = process.env.SCRAPE_URL || DEFAULT_URL;

// Keep browser instance persistent
let browser: puppeteer.Browser | null = null;
let browserLaunchPromise: Promise<puppeteer.Browser> | null = null;

async function getBrowser(): Promise<puppeteer.Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-sync'
    ]
  });

  try {
    browser = await browserLaunchPromise;
  } finally {
    browserLaunchPromise = null;
  }

  return browser;
}

async function cleanupBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

async function scrapePage() {
  let browser: puppeteer.Browser;
  try {
    browser = await getBrowser();

    const page = await browser.newPage();

    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`Loading page from ${URL.substring(0, 50)}...`);
    await page.goto(URL, { waitUntil: 'networkidle0' });
    
    // Wait an extra second as requested
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to find all list item elements
    try {
      const currentSelector = userDb.getSelector();
      console.log(`Using selector: ${currentSelector}`);

      await page.waitForSelector(currentSelector, { timeout: 5000 });
      const elements = await page.$$(currentSelector);

      if (elements.length > 0) {
        const texts = await Promise.all(
          elements.map(async (element) => {
            return await page.evaluate(el => el.innerText.trim(), element);
          })
        );

        console.warn(`Found ${texts.length} items:`);
        texts.forEach((text, index) => {
          console.warn(`  ${index + 1}: ${text}`);
        });

        // Compare with previous data
        const previousData = userDb.getLatestScrapedData();
        const currentData = texts;

        const result: ScrapeResult = {
          texts: currentData,
          timestamp: Date.now(),
          changed: false,
          url: URL
        };

        if (!previousData || JSON.stringify(previousData) !== JSON.stringify(currentData)) {
          result.changed = true;

          // Generate change description
          let changeMessage = "🔄 *Data changed!*\n\n";

          if (!previousData) {
            changeMessage += "📥 *Initial data captured*\n";
            changeMessage += `Found ${currentData.length} items:\n`;
            currentData.forEach((item, i) => {
              changeMessage += `${i + 1}. ${item}\n`;
            });
          } else {
            const oldSet = new Set(previousData);
            const newSet = new Set(currentData);

            const added = currentData.filter(item => !oldSet.has(item));
            const removed = previousData.filter(item => !newSet.has(item));

            if (added.length > 0) {
              changeMessage += `➕ *Added ${added.length} item(s):*\n`;
              added.forEach((item, i) => {
                changeMessage += `${i + 1}. ${item}\n`;
              });
              changeMessage += "\n";
            }

            if (removed.length > 0) {
              changeMessage += `➖ *Removed ${removed.length} item(s):*\n`;
              removed.forEach((item, i) => {
                changeMessage += `${i + 1}. ${item}\n`;
              });
              changeMessage += "\n";
            }

            if (added.length === 0 && removed.length === 0) {
              // Items might be reordered
              if (JSON.stringify(previousData) !== JSON.stringify(currentData)) {
                changeMessage += "🔄 *Items reordered*\n";
              }
            }
          }

          // Save new data
          userDb.saveScrapedData(currentData);

          // Return result with change description
          result.changeMessage = changeMessage.trim();
        } else {
          // No changes, just return result
          console.warn("No changes detected.");
        }

        await page.close();
        return result;
      } else {
        console.warn(`No items found with selector: ${currentSelector}`);
        return { texts: [], timestamp: Date.now(), changed: false };
      }
    } catch (error) {
      console.warn(`Selector not found within timeout: ${error.message}`);
      // Optional: Take screenshot for debugging
      // await page.screenshot({ path: 'debug.png' });
      return { texts: [], timestamp: Date.now(), changed: false };
    }

    await page.close();

  } catch (error) {
    console.error("Error during scraping:", error);
    // Clean up browser instance on any error
    if (browser && browser.isConnected()) {
      await cleanupBrowser();
    }
    return { texts: [], timestamp: Date.now(), changed: false };
  }
}

let botInstance: any = null;

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up...');
  await cleanupBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, cleaning up...');
  await cleanupBrowser();
  process.exit(0);
});

function setBotInstance(bot: any) {
  botInstance = bot;
}

async function startInfiniteLoop() {
  console.log("Starting infinite scraping loop (3-second intervals)");

  while (true) {
    const startTime = Date.now();

    const result = await scrapePage();

    // If changes detected and bot is available, notify all users
    if (result.changed && 'changeMessage' in result && botInstance) {
      try {
        const users = userDb.getAllUsers();
        console.log(`Notifying ${users.length} users about changes`);

        for (const user of users) {
          try {
            await botInstance.api.sendMessage({
              chat_id: user.telegram_id,
              text: result.changeMessage,
              parse_mode: "Markdown"
            });
            console.log(`Notified user ${user.telegram_id} (${user.first_name || 'unknown'})`);
          } catch (error) {
            console.error(`Failed to notify user ${user.telegram_id}:`, error);
            // Continue with other users even if one fails
          }
        }

        console.log(`Successfully notified ${users.length} users`);
      } catch (error) {
        console.error("Error notifying users:", error);
      }
    }

    const elapsed = Date.now() - startTime;
    const waitTime = Math.max(0, 3000 - elapsed);

    console.log(`Scrape completed in ${elapsed}ms. Next scrape in ${waitTime}ms.`);

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// Start the loop if this file is run directly
if (import.meta.main) {
  startInfiniteLoop().catch(error => {
    console.error("Fatal error in scraping loop:", error);
    process.exit(1);
  });
}

export { scrapePage, startInfiniteLoop, setBotInstance };
