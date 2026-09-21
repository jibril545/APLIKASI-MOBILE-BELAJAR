# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## KALAU MAU UPDATE MOBILE APP NYA

eas update --channel preview --platform android --message "Update fitur baru"

## SCAN EXPO GO

npx expo start

## BUILD APP ULANG

eas build --profile preview --platform android

## DATABASE

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS study_streak;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS progress_log;
DROP TABLE IF EXISTS study_schedule;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE NOT NULL,
password TEXT NOT NULL,
is_premium INTEGER DEFAULT 0,
created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_schedule (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
subject TEXT NOT NULL,
study_date TEXT,
start_time TEXT NOT NULL,
duration INTEGER NOT NULL,
reminder INTEGER DEFAULT 1,
is_completed INTEGER DEFAULT 0,
completed_at TEXT,
created_at TEXT DEFAULT CURRENT_TIMESTAMP,
status TEXT DEFAULT 'waiting',
started_at TEXT,
finished_at TEXT,
started_manually INTEGER DEFAULT 0,
FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE progress_log (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
log_date TEXT NOT NULL,
total_minutes INTEGER DEFAULT 0,
sessions_completed INTEGER DEFAULT 0,
FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE purchases (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER NOT NULL,
item_type TEXT NOT NULL,
item_name TEXT NOT NULL,
price INTEGER NOT NULL,
purchased_at TEXT DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (user_id) REFERENCES users(id)
);

PRAGMA foreign_keys = ON;
