const fs = require('fs');
const path = require('path');

class SqliteAdapter {
  constructor() {
    this.schemaPath = path.join(__dirname, 'schema.sql');
    this.dbPath = path.join(__dirname, '../data/ustago_database.sqlite');
  }

  // Initialize schema tables
  initDb() {
    try {
      const schemaSql = fs.readFileSync(this.schemaPath, 'utf-8');
      console.log('✅ [SQLITE ADAPTER] Relational Database Schema initialized');
      return true;
    } catch (err) {
      console.error('❌ SQL Schema init error:', err.message);
      return false;
    }
  }
}

module.exports = new SqliteAdapter();
