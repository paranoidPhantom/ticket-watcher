import { Database } from "bun:sqlite";

// Use data directory for persistent storage in Docker
const dataDir = process.env.DATA_DIR || '.';
const dbPath = `${dataDir}/bot_users.sqlite`;

// Debug: Log environment info
console.log(`DATA_DIR: ${dataDir}`);
console.log(`dbPath: ${dbPath}`);
console.log(`CWD: ${process.cwd()}`);

// First ensure directory exists with proper permissions
import { mkdirSync, existsSync, accessSync, constants } from 'fs';

if (!existsSync(dataDir)) {
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o755 });
    console.log(`Created directory: ${dataDir}`);
  } catch (error) {
    console.error(`Failed to create directory ${dataDir}:`, error);
  }
}

// Check permissions
if (existsSync(dataDir)) {
  try {
    accessSync(dataDir, constants.R_OK | constants.W_OK | constants.X_OK);
    console.log(`Directory ${dataDir} has RWX permissions`);
  } catch (error) {
    console.error(`Directory ${dataDir} lacks permissions:`, error);
  }
}

// Try to open database
let db: Database;
try {
  console.log(`Attempting to open database at: ${dbPath}`);
  db = new Database(dbPath, { create: true });
  console.log(`Database opened successfully at: ${dbPath}`);
} catch (error) {
  console.error(`Failed to open database at ${dbPath}:`, error);

  // Try in-memory database as fallback
  console.log(`Trying in-memory database as fallback`);
  try {
    db = new Database(':memory:');
    console.log(`Using in-memory database (data will not persist across restarts)`);
  } catch (memoryError) {
    console.error(`Failed to create in-memory database:`, memoryError);
    throw memoryError;
  }
}

// Enable WAL mode for better concurrency
db.run("PRAGMA journal_mode = WAL;");

// Create users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create settings table for selector storage
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create scraped_data table for storing latest scraped items
db.run(`
  CREATE TABLE IF NOT EXISTS scraped_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Initialize default selector if not exists
db.run(`
  INSERT OR IGNORE INTO settings (key, value)
  VALUES ('selector', '#orderCard > div:nth-child(2) > section > section > div > ul > li > a > div > span')
`);

// Prepare statements for better performance
const insertUser = db.prepare(
  "INSERT OR REPLACE INTO users (telegram_id, username, first_name) VALUES ($id, $username, $firstName)"
);

const deleteUser = db.prepare(
  "DELETE FROM users WHERE telegram_id = $id"
);

const getUser = db.prepare(
  "SELECT * FROM users WHERE telegram_id = $id"
);

const getUsersCount = db.prepare(
  "SELECT COUNT(*) as count FROM users"
);

const getSetting = db.prepare(
  "SELECT value FROM settings WHERE key = $key"
);

const setSetting = db.prepare(
  "INSERT OR REPLACE INTO settings (key, value) VALUES ($key, $value)"
);

const getLatestScrapedData = db.prepare(
  "SELECT data FROM scraped_data ORDER BY id DESC LIMIT 1"
);

const insertScrapedData = db.prepare(
  "INSERT INTO scraped_data (data) VALUES ($data)"
);

const getAllUsers = db.prepare(
  "SELECT telegram_id, username, first_name FROM users"
);

// Export database functions
export const userDb = {
  addUser: (id: number, username?: string, firstName?: string) => {
    insertUser.run({ $id: id, $username: username || null, $firstName: firstName || null });
    return true;
  },
  
  removeUser: (id: number) => {
    deleteUser.run({ $id: id });
    return true;
  },
  
  hasUser: (id: number) => {
    return getUser.get({ $id: id }) !== undefined;
  },
  
  getUserCount: () => {
    const result = getUsersCount.get() as { count: number } | undefined;
    return result ? result.count : 0;
  },

  getSelector: () => {
    const result = getSetting.get({ $key: 'selector' }) as { value: string } | undefined;
    return result ? result.value : '#orderCard > div:nth-child(2) > section > section > div > ul > li > a > div > span';
  },

  setSelector: (selector: string) => {
    setSetting.run({ $key: 'selector', $value: selector });
    return true;
  },

  getScrapeUrl: () => {
    return process.env.SCRAPE_URL || "https://widget.kassir.ru/?type=A&key=0d043285-33ff-bbbb-d1f0-4d379a98d494&domain=spb.kassir.ru&id=187697";
  },

  getLatestScrapedData: () => {
    const result = getLatestScrapedData.get() as { data: string } | undefined;
    return result ? JSON.parse(result.data) : null;
  },

  saveScrapedData: (data: string[]) => {
    insertScrapedData.run({ $data: JSON.stringify(data) });
    return true;
  },

  getAllUsers: () => {
    return getAllUsers.all() as { telegram_id: number, username: string | null, first_name: string | null }[];
  },

  close: () => {
    db.close();
  }
};
