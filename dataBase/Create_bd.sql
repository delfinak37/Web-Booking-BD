CREATE TABLE IF NOT EXISTS Users (
  user_id SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  login_id VARCHAR(100) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  password TEXT NOT NULL
);

CREATE TABLE Tables (
    table_id SERIAL PRIMARY KEY,
    table_number INTEGER NOT NULL UNIQUE CHECK (table_number BETWEEN 1 AND 12)
);

INSERT INTO Tables (table_number) 
VALUES 
(1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11), (12);

CREATE TABLE Bookings (
    booking_id SERIAL PRIMARY KEY,
    table_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    booking_end_time TIME NOT NULL,
    people_count INTEGER NOT NULL,
    FOREIGN KEY (table_id) REFERENCES Tables (table_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users (user_id) ON DELETE CASCADE
);

CREATE TABLE Payments (
    payment_id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'не оплачено',
    FOREIGN KEY (booking_id) REFERENCES Bookings (booking_id) ON DELETE CASCADE
);

CREATE TABLE AdminLogs (
  log_id SERIAL PRIMARY KEY,
  admin_id INT,
  action VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
