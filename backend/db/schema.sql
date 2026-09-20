-- UstaGo Production Relational Database Schema (SQLite / PostgreSQL Compatible)

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  phone VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(128),
  name VARCHAR(128),
  role VARCHAR(32) DEFAULT 'Buyurtmachi',
  balance DOUBLE PRECISION DEFAULT 10000.0,
  rating DOUBLE PRECISION DEFAULT 5.0,
  verified BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) REFERENCES users(id),
  client_name VARCHAR(128),
  title VARCHAR(256) NOT NULL,
  category VARCHAR(64) NOT NULL,
  budget DOUBLE PRECISION NOT NULL,
  location VARCHAR(256),
  description TEXT,
  status VARCHAR(32) DEFAULT 'OPEN',
  offers_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offers (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) REFERENCES jobs(id),
  worker_id VARCHAR(64) REFERENCES users(id),
  worker_name VARCHAR(128),
  price DOUBLE PRECISION NOT NULL,
  comment TEXT,
  status VARCHAR(32) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id),
  amount DOUBLE PRECISION NOT NULL,
  type VARCHAR(32) NOT NULL, -- 'STARTER_BONUS', 'TOPUP', 'PAYMENT', 'ESCROW'
  provider VARCHAR(32) NOT NULL, -- 'CLICK', 'PAYME', 'SYSTEM'
  status VARCHAR(32) DEFAULT 'SUCCESS',
  click_trans_id VARCHAR(64),
  payme_trans_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
