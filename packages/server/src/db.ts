import Database from "better-sqlite3";
import type { RoomState } from "@fcdn/shared";

export class Db {
  private db: Database.Database;
  constructor(path = "fcdn.sqlite") {
    this.db = new Database(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, snapshot TEXT NOT NULL)");
  }
  save(s: RoomState) {
    this.db.prepare("INSERT INTO rooms (code, snapshot) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET snapshot = excluded.snapshot")
      .run(s.code, JSON.stringify(s));
  }
  loadAll(): RoomState[] {
    return this.db.prepare("SELECT snapshot FROM rooms").all()
      .map((r: any) => JSON.parse(r.snapshot) as RoomState);
  }
}
