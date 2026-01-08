import { Bot } from "gramio";
import { userDb } from "./db.ts";
import { startInfiniteLoop } from "./scraper.ts";

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined in environment variables");
}

// Import setBotInstance to pass bot instance to scraper
import { setBotInstance } from "./scraper.ts";

// Start the scraper in the background
const botPromise = startInfiniteLoop().catch(error => {
  console.error("Failed to start scraper:", error);
});

const bot = new Bot(token)
  .command("start", (context) => {
    const userId = context.from?.id;
    const username = context.from?.username;
    const firstName = context.from?.first_name;

    if (!userId) {
      context.send("Unable to get user information.");
      return;
    }

    try {
      // Store user in database
      userDb.addUser(userId, username, firstName);
      const totalUsers = userDb.getUserCount();

      context.send(
        `Hello ${firstName || "there"}! 👋\n` +
          `I've added you to my database.\n` +
          `Total users: ${totalUsers}\n` +
          `Use /help to see available commands.`
      );
    } catch (error) {
      console.error("Error adding user:", error);
      context.send("Sorry, there was an error adding you to the database.");
    }
  })
  .command("help", (context) => {
    const totalUsers = userDb.getUserCount();
    context.send(
      `Available commands:\n` +
        `/start - Register in database (${totalUsers} users)\n` +
        `/stop - Remove yourself from database\n` +
        `/help - Show this help message`
    );
  })
  .command("stop", (context) => {
    const userId = context.from?.id;
    const firstName = context.from?.first_name;

    if (!userId) {
      context.send("Unable to get user information.");
      return;
    }

    try {
      if (userDb.hasUser(userId)) {
        userDb.removeUser(userId);
        const totalUsers = userDb.getUserCount();
        context.send(
          `Goodbye ${firstName || "there"}! 👋\n` +
            `You've been removed from my database.\n` +
            `Total users: ${totalUsers}`
        );
      } else {
        context.send(
          `You're not registered in my database.\n` +
            `Use /start to register first.`
        );
      }
    } catch (error) {
      console.error("Error removing user:", error);
      context.send("Sorry, there was an error removing you from the database.");
    }
  })
  .command("selector", (context) => {
    const userId = context.from?.id;
    const args = context.text?.replace(/^\/selector\s*/, "") || "";

    // Check admin permissions
    const adminId = parseInt(process.env.BOT_ADMIN_ID || "0");
    if (userId !== adminId) {
      context.send("❌ Only admin can use this command.");
      return;
    }

    if (!args.trim()) {
      // Show current selector and URL
      const currentSelector = userDb.getSelector();
      const currentUrl = userDb.getScrapeUrl();
      context.send(
        `Current configuration:\n\n` +
        `🔗 *URL:*\n\`${currentUrl}\`\n\n` +
        `🎯 *Selector:*\n\`${currentSelector}\`\n\n` +
        `To update selector: /selector <new_css_selector>`
      );
    } else {
      // Update selector
      try {
        userDb.setSelector(args.trim());
        context.send(`✅ Selector updated to:\n\`${args.trim()}\``);
      } catch (error) {
        console.error("Error updating selector:", error);
        context.send("❌ Failed to update selector.");
      }
    }
  })
  .onStart(() => {
    console.log("Telegram bot started successfully! 🤖");
    console.log(`Admin ID: ${process.env.BOT_ADMIN_ID}`);
    console.log(`Current URL: ${userDb.getScrapeUrl()}`);
    console.log(`Current selector: ${userDb.getSelector()}`);

    // Pass bot instance to scraper for notifications
    setBotInstance(bot);
  });

bot.start();
