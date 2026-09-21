import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AlertProvider } from "./AlertProvider";
import { COLORS } from "./styles";

export default function RootLayout() {
  const initializeDatabase = async (db: any) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_premium INTEGER DEFAULT 0,
        username_color TEXT DEFAULT '#FFFFFF',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS study_schedule (
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

      CREATE TABLE IF NOT EXISTS progress_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        log_date TEXT NOT NULL,
        total_minutes INTEGER DEFAULT 0,
        sessions_completed INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        item_name TEXT NOT NULL,
        price INTEGER NOT NULL,
        purchased_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        requirement_value INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL,
        is_claimed INTEGER DEFAULT 0,
        claimed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (achievement_id) REFERENCES achievements(id),
        UNIQUE(user_id, achievement_id)
      );

      CREATE TABLE IF NOT EXISTS user_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL,
        is_active INTEGER DEFAULT 0,
        obtained_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (achievement_id) REFERENCES achievements(id),
        UNIQUE(user_id, achievement_id)
      );
    `);

    try {
      // ==========================================
      // MIGRATION USERS
      // ==========================================

      const userColumns = await db.getAllAsync(`PRAGMA table_info(users);`);

      const userColumnNames = userColumns.map((c: any) => c.name);

      // Tambahkan username_color jika database lama belum memilikinya
      if (!userColumnNames.includes("username_color")) {
        await db.execAsync(`
          ALTER TABLE users
          ADD COLUMN username_color TEXT DEFAULT '#FFFFFF';
        `);
      }

      // Pastikan user lama mempunyai warna default
      await db.execAsync(`
        UPDATE users
        SET username_color = '#FFFFFF'
        WHERE username_color IS NULL
           OR username_color = '';
      `);

      // ==========================================
      // MIGRATION STUDY SCHEDULE
      // ==========================================

      const columns = await db.getAllAsync(
        `PRAGMA table_info(study_schedule);`,
      );

      const names = columns.map((c: any) => c.name);

      if (!names.includes("study_date")) {
        await db.execAsync(`
          ALTER TABLE study_schedule
          ADD COLUMN study_date TEXT;
        `);
      }

      if (!names.includes("status")) {
        await db.execAsync(`
          ALTER TABLE study_schedule
          ADD COLUMN status TEXT DEFAULT 'waiting';
        `);
      }

      if (!names.includes("started_at")) {
        await db.execAsync(`
          ALTER TABLE study_schedule
          ADD COLUMN started_at TEXT;
        `);
      }

      if (!names.includes("finished_at")) {
        await db.execAsync(`
          ALTER TABLE study_schedule
          ADD COLUMN finished_at TEXT;
        `);
      }

      if (!names.includes("started_manually")) {
        await db.execAsync(`
          ALTER TABLE study_schedule
          ADD COLUMN started_manually INTEGER DEFAULT 0;
        `);
      }

      await db.execAsync(`
        UPDATE study_schedule
        SET status = 'waiting'
        WHERE status IS NULL;
      `);

      await db.execAsync(`
        UPDATE study_schedule
        SET status = 'finished'
        WHERE is_completed = 1
          AND status != 'finished';
      `);

      // ==========================================
      // SEED ACHIEVEMENT
      // Hanya menambahkan jika belum ada.
      // Tidak membuat data duplikat.
      // ==========================================

      await db.execAsync(`
        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'study_time',
          'Rookie',
          'Telah belajar selama 5 jam.',
          300
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'study_time'
          AND title = 'Rookie'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'study_time',
          'Learner',
          'Telah belajar selama 10 jam.',
          600
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'study_time'
          AND title = 'Learner'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'study_time',
          'Dedicated',
          'Telah belajar selama 25 jam.',
          1500
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'study_time'
          AND title = 'Dedicated'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'study_time',
          'Scholar',
          'Telah belajar selama 50 jam.',
          3000
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'study_time'
          AND title = 'Scholar'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'study_time',
          'Master',
          'Telah belajar selama 100 jam.',
          6000
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'study_time'
          AND title = 'Master'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'completed_schedule',
          'Planner',
          'Telah menyelesaikan 5 jadwal belajar.',
          5
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'completed_schedule'
          AND title = 'Planner'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'completed_schedule',
          'Organizer',
          'Telah menyelesaikan 10 jadwal belajar.',
          10
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'completed_schedule'
          AND title = 'Organizer'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'completed_schedule',
          'Consistent',
          'Telah menyelesaikan 25 jadwal belajar.',
          25
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'completed_schedule'
          AND title = 'Consistent'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'completed_schedule',
          'Disciplined',
          'Telah menyelesaikan 50 jadwal belajar.',
          50
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'completed_schedule'
          AND title = 'Disciplined'
        );

        INSERT INTO achievements
          (category, title, description, requirement_value)
        SELECT
          'completed_schedule',
          'Time Master',
          'Telah menyelesaikan 100 jadwal belajar.',
          100
        WHERE NOT EXISTS (
          SELECT 1 FROM achievements
          WHERE category = 'completed_schedule'
          AND title = 'Time Master'
        );
      `);
    } catch (e) {
      console.error("DATABASE MIGRATION ERROR:", e);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider
        databaseName="database.db"
        assetSource={{
          assetId: require("../database/database.db"),
        }}
        onInit={initializeDatabase}
      >
        <AlertProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: COLORS.primary,
            }}
          >
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "fade",
                animationDuration: 200,
                contentStyle: {
                  backgroundColor: COLORS.primary,
                },
              }}
            />
          </View>
        </AlertProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
