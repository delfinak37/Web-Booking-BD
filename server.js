const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(morgan('combined'));

app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'change.html'));
});

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];

  if (!token) {
    console.log('Не предоставлен токен');
    return res.status(403).json({ error: 'Токен не предоставлен' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Неудачная верификация токена');
      return res.status(403).json({ error: 'Неудачная верификация токена' });
    }
    console.log(`Успешная верификация токена для пользователя: ${user.userId}`);
    req.user = user;
    next();
  });
};

app.post('/register', async (req, res) => {
  const { first_name, login_id, password } = req.body;
  console.log('POST /register - Регистрация пользователя', { login_id });

  try {
    const result = await pool.query('SELECT * FROM Users WHERE login_id = $1', [login_id]);
    if (result.rows.length > 0) {
      console.log(`Ошибка: Пользователь с логином ${login_id} уже существует`);
      return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO Users (first_name, login_id, password) VALUES ($1, $2, $3)',
      [first_name, login_id, hashedPassword]
    );

    console.log(`Пользователь зарегистрирован: ${login_id}`);
    res.status(201).json({ message: 'Пользователь успешно зарегистрирован' });
  } catch (err) {
    console.error('Ошибка при регистрации:', err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

app.post('/login', async (req, res) => {
  const { login_id, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM Users WHERE login_id = $1', [login_id]);
    if (result.rows.length === 0) {
      console.log(`Ошибка: Неверный логин ${login_id}`);
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log(`Ошибка: Неверный пароль для логина ${login_id}`);
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign({ userId: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const redirectPage = user.role === 'admin' ? 'admin.html' : 'booking.html';
    console.log(`Успешная авторизация: ${login_id}, роль: ${user.role}`);

    res.json({ message: 'Успешный вход', token, redirect: redirectPage });
  } catch (err) {
    console.error('Ошибка при входе:', err);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

app.get('/tables', async (req, res) => {
  console.log('GET /tables - Получение списка столов');
  try {
    const result = await pool.query('SELECT * FROM Tables');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении списка столов:', err);
    res.status(500).json({ error: 'Ошибка при получении данных о столах' });
  }
});

app.get('/check-availability', async (req, res) => {
  const { table_id, booking_date, booking_time, booking_end_time } = req.query;
  console.log(`POST /bookings - Пользователь ${user_id} бронирует стол ${table_id}`);

  try {
    const result = await pool.query(
      `SELECT * FROM Bookings 
        WHERE table_id = $1 
        AND booking_date = $2 
        AND (
          (booking_time <= $3 AND booking_end_time > $3) OR
          (booking_time < $4 AND booking_end_time >= $4) OR
          (booking_time >= $3 AND booking_end_time <= $4)
        )`, 
      [table_id, booking_date, booking_time, booking_end_time]
    );

    if (result.rows.length > 0) {
      console.log(`Ошибка: Стол ${table_id} занят на выбранное время`);
      return res.status(400).json({ error: 'Стол занят на указанное время' });
    }

    console.log(`Стол ${table_id} доступен`);
    res.json({ available: true });
  } catch (err) {
    console.error('Ошибка при проверке доступности стола:', err);
    res.status(500).json({ error: 'Ошибка при проверке занятости стола' });
  }
});

app.post('/bookings', authenticateToken, async (req, res) => {
  const { table_id, booking_date, booking_time, booking_end_time, people_count } = req.body;
  const user_id = req.user.userId;

  console.log(`POST /bookings - Пользователь ${user_id} бронирует стол ${table_id} на дату ${booking_date} с ${booking_time} до ${booking_end_time}, количество человек: ${people_count}`);

  if (!table_id || !user_id || !booking_date || !booking_time || !booking_end_time || !people_count) {
    console.log('Ошибка: Не все поля заполнены');
    return res.status(400).json({ error: 'Все поля должны быть заполнены' });
  }

  try {
    console.log('Проверка доступности стола перед бронированием...');
    const availabilityCheck = await pool.query(
      `SELECT * FROM Bookings 
        WHERE table_id = $1
        AND booking_date = $2
        AND (
          (booking_time < $4 AND booking_end_time > $3)
        )`,
      [table_id, booking_date, booking_time, booking_end_time]
    );

    if (availabilityCheck.rows.length > 0) {
      console.log(`Ошибка: Стол ${table_id} занят на указанное время`);
      return res.status(400).json({ error: 'Стол занят на указанное время' });
    }

    console.log(`Бронирование стола ${table_id}...`);
    const result = await pool.query(
      `INSERT INTO Bookings (table_id, user_id, booking_date, booking_time, booking_end_time, people_count)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [table_id, user_id, booking_date, booking_time, booking_end_time, people_count]
    );

    const paymentAmount = people_count * 300;
    console.log(`Создание платежа на сумму ${paymentAmount} для бронирования ${result.rows[0].booking_id}`);
    await pool.query(
      `INSERT INTO Payments (booking_id, amount, payment_status)
      VALUES ($1, $2, 'не оплачено')`,
      [result.rows[0].booking_id, paymentAmount]
    );

    console.log(`Бронирование успешно! ID бронирования: ${result.rows[0].booking_id}`);
    res.json({ message: 'Бронирование успешно! Ожидайте оплату.', booking: result.rows[0] });
  } catch (err) {
    console.error('Ошибка при бронировании:', err);
    res.status(500).json({ error: 'Ошибка при бронировании стола' });
  }
});

const authenticateAdmin = (req, res, next) => {
  console.log(`Проверка прав администратора для пользователя ${req.user.userId}`);
  if (req.user.role !== 'admin') {
    console.log(`Пользователь ${req.user.userId} не имеет прав администратора`);
    return res.status(403).json({ error: 'Нет прав для выполнения этого действия' });
  }
  console.log(`Пользователь ${req.user.userId} подтвержден как администратор`);
  next();
};

const logAdminAction = async (adminId, action) => {
  console.log(`Запись действия администратора ${adminId}: ${action}`);
  await pool.query(
    `INSERT INTO AdminLogs (admin_id, action) VALUES ($1, $2)`,
    [adminId, action]
  );
};

app.put('/update-payment-status', authenticateToken, authenticateAdmin, async (req, res) => {
  const { booking_id, payment_status } = req.body;
  const adminId = req.user.userId;

  console.log(`PUT /update-payment-status - Админ ${adminId} обновляет статус оплаты для бронирования ${booking_id} на ${payment_status}`);

  if (!booking_id || !payment_status) {
    console.log('Ошибка: Недостаточно данных для обновления статуса');
    return res.status(400).json({ error: 'Недостаточно данных для обновления' });
  }

  try {
    console.log('Попытка обновления статуса:', { booking_id, payment_status });

    const result = await pool.query(
      `UPDATE Payments SET payment_status = $1 WHERE booking_id = $2 RETURNING *`,
      [payment_status, booking_id]
    );

    if (result.rows.length === 0) {
      console.log(`Ошибка: Бронирование ${booking_id} не найдено`);
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }

    console.log(`Логирование действия администратора: Обновление статуса оплаты для бронирования ${booking_id}`);
    await logAdminAction(adminId, `Обновлен статус оплаты для бронирования ${booking_id} на ${payment_status}`);

    console.log(`Статус оплаты для бронирования ${booking_id} успешно обновлен`);
    res.json({ message: 'Статус оплаты обновлен', payment: result.rows[0] });
  } catch (err) {
    console.error('Ошибка при обновлении статуса оплаты:', err);
    res.status(500).json({ error: 'Ошибка при обновлении статуса оплаты' });
  }
});

app.get('/admin/payment-history', authenticateToken, authenticateAdmin, async (req, res) => {
  console.log(`GET /admin/payment-history - Запрос истории изменений от администратора ${req.user.userId}`);
  try {
    const result = await pool.query('SELECT * FROM AdminLogs ORDER BY timestamp DESC');
    console.log('История изменений успешно получена');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при получении истории изменений:', err);
    res.status(500).json({ error: 'Ошибка при получении истории изменений' });
  }
});

app.get('/admin/bookings', authenticateToken, authenticateAdmin, async (req, res) => {
  console.log(`GET /admin/bookings - Запрос данных о бронированиях от администратора ${req.user.userId}`);
    try {
      const result = await pool.query(`
        SELECT 
          b.booking_id, 
          b.table_id, 
          b.booking_date, 
          b.booking_time, 
          b.booking_end_time, 
          b.people_count, 
          p.payment_status
        FROM Bookings b
        LEFT JOIN Payments p ON b.booking_id = p.booking_id
        ORDER BY booking_id
      `);
      console.log('Данные о бронированиях успешно получены');
      res.json(result.rows);
    } catch (err) {
      console.error('Ошибка при получении данных о бронированиях:', err);
      res.status(500).json({ error: 'Ошибка при получении данных о бронированиях' });
    }
  });

function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

app.get('/bookings/user', authenticateToken, async (req, res) => {
  const user_id = req.user.userId;
  try {
    const result = await pool.query(
      `SELECT 
        b.booking_id, 
        b.table_id, 
        b.booking_date, 
        b.booking_time, 
        b.booking_end_time, 
        b.people_count, 
        p.payment_status 
       FROM Bookings b
       LEFT JOIN Payments p ON b.booking_id = p.booking_id
       WHERE b.user_id = $1 
       ORDER BY b.booking_date, b.booking_time`,
      [user_id]
    );

    const bookings = result.rows.map(row => ({
      ...row,
      booking_date: formatDate(row.booking_date),
      payment_status: row.payment_status || 'Не указано',
    }));

    res.json(bookings);
  } catch (err) {
    console.error('Ошибка при получении бронирований для пользователя:', err);
    res.status(500).json({ error: 'Ошибка при получении бронирований', details: err.message }); 
  }
});

app.get('/user/info', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query('SELECT first_name, login_id FROM Users WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = result.rows[0];
    res.json(user);
  } catch (err) {
    console.error('Ошибка при получении информации о пользователе:', err);
    res.status(500).json({ error: 'Ошибка при получении информации о пользователе' });
  }
});

app.delete('/bookings/:booking_id', authenticateToken, async (req, res) => {
  const { booking_id } = req.params;
  const user_id = req.user.userId;

  console.log(`DELETE /bookings/${booking_id} - Пользователь ${user_id} пытается удалить бронирование`);

  try {
    const bookingResult = await pool.query('SELECT * FROM Bookings WHERE booking_id = $1', [booking_id]);
    
    if (bookingResult.rows.length === 0) {
      console.log(`Ошибка: Бронирование с ID ${booking_id} не найдено`);
      return res.status(404).json({ error: 'Бронирование не найдено' });
    }

    const booking = bookingResult.rows[0];

    if (booking.user_id !== user_id) {
      console.log(`Ошибка: Пользователь ${user_id} не может удалить чужое бронирование`);
      return res.status(403).json({ error: 'Нет прав для удаления этого бронирования' });
    }

    await pool.query('DELETE FROM Bookings WHERE booking_id = $1', [booking_id]);

    console.log(`Бронирование с ID ${booking_id} успешно удалено`);

    res.json({ message: 'Бронирование успешно удалено' });
  } catch (err) {
    console.error('Ошибка при удалении бронирования:', err);
    res.status(500).json({ error: 'Ошибка при удалении бронирования' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
