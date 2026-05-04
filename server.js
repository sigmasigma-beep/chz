const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── CP Stock / Treasury ──────────────────────────────────────────────────────
// Tracks total CP ever minted by admin grants (not user-to-user sends)
// Stored in a simple settings table
async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      cred_id TEXT UNIQUE NOT NULL,
      protection_id TEXT NOT NULL,
      balance NUMERIC DEFAULT 0,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      from_cred_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      to_cred_id TEXT NOT NULL,
      to_name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      message TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // CP Stock: total CP minted into existence by admin
  await pool.query(`
    INSERT INTO settings (key, value) VALUES ('cp_stock', '1000000')
    ON CONFLICT (key) DO NOTHING
  `);

  // Ensure protection_id allows up to 8 digits (column is TEXT so already fine)
  // Add notes column to accounts if not present
  await pool.query(`
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''
  `);

  const existing = await pool.query(`SELECT id FROM accounts WHERE cred_id = '10219982'`);
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO accounts (id, first_name, last_name, cred_id, protection_id, balance, is_admin) VALUES ($1,'Chase','Petrosky','10219982','3491',999999,TRUE)`,
      [uuidv4()]
    );
    console.log('Admin account created.');
  }
  console.log('Database ready.');
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const credId = req.headers['credid'];
    const protectionId = req.headers['protectionid'];
    const result = await pool.query(
      `SELECT * FROM accounts WHERE cred_id = $1 AND protection_id = $2 AND is_admin = TRUE`,
      [credId, protectionId]
    );
    if (result.rows.length === 0) return res.status(403).json({ error: 'Admin access denied.' });
    req.admin = result.rows[0];
    next();
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
}

async function requireAuth(req, res, next) {
  try {
    const credId = req.headers['credid'];
    const protectionId = req.headers['protectionid'];
    const result = await pool.query(
      `SELECT * FROM accounts WHERE cred_id = $1 AND protection_id = $2`,
      [credId, protectionId]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid Cred ID or Protection ID.' });
    req.account = result.rows[0];
    next();
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtAccount(a) {
  return {
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    credId: a.cred_id,
    balance: parseFloat(a.balance),
    isAdmin: a.is_admin,
    notes: a.notes || '',
    createdAt: a.created_at
  };
}
function fmtTx(t) {
  return {
    id: t.id,
    fromCredId: t.from_cred_id,
    fromName: t.from_name,
    toCredId: t.to_cred_id,
    toName: t.to_name,
    amount: parseFloat(t.amount),
    message: t.message,
    createdAt: t.created_at
  };
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { credId, protectionId } = req.body;
    const result = await pool.query(
      `SELECT * FROM accounts WHERE cred_id = $1 AND protection_id = $2`,
      [credId, protectionId]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid Cred ID or Protection ID.' });
    res.json({ success: true, account: fmtAccount(result.rows[0]) });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── Public: Register new account ─────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, credId, protectionId } = req.body;
    if (!firstName || !lastName || !credId || !protectionId)
      return res.status(400).json({ error: 'All fields required.' });
    if (!/^\d{8}$/.test(credId))
      return res.status(400).json({ error: 'Cred ID must be exactly 8 digits.' });
    if (!/^\d{4,8}$/.test(protectionId))
      return res.status(400).json({ error: 'Protection ID must be 4–8 digits.' });

    await pool.query(
      `INSERT INTO accounts (id,first_name,last_name,cred_id,protection_id,balance,is_admin) VALUES ($1,$2,$3,$4,$5,0,FALSE)`,
      [uuidv4(), firstName.trim(), lastName.trim(), credId, protectionId]
    );
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'That Cred ID is already taken.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── Public: Directory (no protection IDs shown) ──────────────────────────────
app.get('/api/directory', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT first_name, last_name, cred_id, is_admin, created_at FROM accounts ORDER BY first_name ASC`
    );
    res.json(result.rows.map(a => ({
      firstName: a.first_name,
      lastName: a.last_name,
      credId: a.cred_id,
      isAdmin: a.is_admin,
      createdAt: a.created_at
    })));
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── User routes ──────────────────────────────────────────────────────────────
app.get('/api/me', requireAuth, async (req, res) => {
  res.json(fmtAccount(req.account));
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM transactions WHERE from_cred_id = $1 OR to_cred_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.account.cred_id]
    );
    res.json(result.rows.map(fmtTx));
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

app.post('/api/send', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { toCredId, amount, message } = req.body;
    const amt = parseFloat(amount);
    if (!toCredId || isNaN(amt) || amt <= 0)
      return res.status(400).json({ error: 'Invalid amount or recipient.' });
    await client.query('BEGIN');
    const senderR = await client.query(`SELECT * FROM accounts WHERE cred_id = $1 FOR UPDATE`, [req.account.cred_id]);
    const recipR  = await client.query(`SELECT * FROM accounts WHERE cred_id = $1 FOR UPDATE`, [toCredId]);
    const sender    = senderR.rows[0];
    const recipient = recipR.rows[0];
    if (!recipient) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Recipient not found.' }); }
    if (sender.cred_id === toCredId) { await client.query('ROLLBACK'); return res.status(400).json({ error: "Can't send to yourself!" }); }
    if (parseFloat(sender.balance) < amt) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Not enough Cheezy Poofs!' }); }
    await client.query(`UPDATE accounts SET balance = balance - $1 WHERE cred_id = $2`, [amt, sender.cred_id]);
    await client.query(`UPDATE accounts SET balance = balance + $1 WHERE cred_id = $2`, [amt, toCredId]);
    await client.query(
      `INSERT INTO transactions (id,from_cred_id,from_name,to_cred_id,to_name,amount,message) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuidv4(), sender.cred_id, `${sender.first_name} ${sender.last_name}`, toCredId, `${recipient.first_name} ${recipient.last_name}`, amt, message||'']
    );
    await client.query('COMMIT');
    res.json({ success: true, newBalance: parseFloat(sender.balance) - amt });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Server error.' }); }
  finally { client.release(); }
});

app.get('/api/lookup/:credId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT first_name, last_name, cred_id FROM accounts WHERE cred_id = $1`,
      [req.params.credId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const a = result.rows[0];
    res.json({ firstName: a.first_name, lastName: a.last_name, credId: a.cred_id });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

// All accounts (full details)
app.get('/api/admin/accounts', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM accounts ORDER BY created_at ASC`);
    res.json(result.rows.map(a => ({ ...fmtAccount(a) })));
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// All transactions
app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM transactions ORDER BY created_at DESC`);
    res.json(result.rows.map(fmtTx));
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Rich stats for dashboard
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const accounts   = await pool.query(`SELECT COUNT(*) as cnt, SUM(balance) as total FROM accounts`);
    const txCount    = await pool.query(`SELECT COUNT(*) as cnt, SUM(amount) as vol FROM transactions`);
    const richest    = await pool.query(`SELECT first_name, last_name, balance FROM accounts ORDER BY balance DESC LIMIT 1`);
    const newest     = await pool.query(`SELECT first_name, last_name, created_at FROM accounts ORDER BY created_at DESC LIMIT 1`);
    const stockRow   = await pool.query(`SELECT value FROM settings WHERE key = 'cp_stock'`);
    const todayTx    = await pool.query(`SELECT COUNT(*) as cnt FROM transactions WHERE created_at >= NOW() - INTERVAL '24 hours'`);
    const adminGiven = await pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE from_cred_id = 'ADMIN'`);

    res.json({
      totalAccounts: parseInt(accounts.rows[0].cnt),
      totalCP: parseFloat(accounts.rows[0].total) || 0,
      totalTransactions: parseInt(txCount.rows[0].cnt),
      totalVolume: parseFloat(txCount.rows[0].vol) || 0,
      richest: richest.rows[0] ? { name: `${richest.rows[0].first_name} ${richest.rows[0].last_name}`, balance: parseFloat(richest.rows[0].balance) } : null,
      newest: newest.rows[0] ? { name: `${newest.rows[0].first_name} ${newest.rows[0].last_name}`, createdAt: newest.rows[0].created_at } : null,
      cpStock: parseFloat(stockRow.rows[0]?.value) || 1000000,
      todayTransactions: parseInt(todayTx.rows[0].cnt),
      totalAdminGranted: parseFloat(adminGiven.rows[0].total)
    });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Set CP stock level
app.post('/api/admin/set-stock', requireAdmin, async (req, res) => {
  try {
    const { stock } = req.body;
    if (isNaN(parseFloat(stock)) || parseFloat(stock) < 0)
      return res.status(400).json({ error: 'Invalid stock value.' });
    await pool.query(`UPDATE settings SET value = $1 WHERE key = 'cp_stock'`, [String(stock)]);
    res.json({ success: true, cpStock: parseFloat(stock) });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Create account (admin version — allows setting isAdmin flag)
app.post('/api/admin/create-account', requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, credId, protectionId, startingBalance, isAdmin } = req.body;
    if (!firstName || !lastName || !credId || !protectionId)
      return res.status(400).json({ error: 'All fields required.' });
    if (!/^\d{8}$/.test(credId))
      return res.status(400).json({ error: 'Cred ID must be 8 digits.' });
    if (!/^\d{4,8}$/.test(protectionId))
      return res.status(400).json({ error: 'Protection ID must be 4–8 digits.' });
    await pool.query(
      `INSERT INTO accounts (id,first_name,last_name,cred_id,protection_id,balance,is_admin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuidv4(), firstName.trim(), lastName.trim(), credId, protectionId, parseFloat(startingBalance)||0, isAdmin ? true : false]
    );
    res.json({ success: true });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Cred ID already in use.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Give / remove money
app.post('/api/admin/give-money', requireAdmin, async (req, res) => {
  try {
    const { credId, amount, reason } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Invalid amount.' });
    const result = await pool.query(`SELECT * FROM accounts WHERE cred_id = $1`, [credId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
    const account = result.rows[0];
    const newBal = Math.max(0, parseFloat(account.balance) + amt);
    await pool.query(`UPDATE accounts SET balance = $1 WHERE cred_id = $2`, [newBal, credId]);
    await pool.query(
      `INSERT INTO transactions (id,from_cred_id,from_name,to_cred_id,to_name,amount,message) VALUES ($1,'ADMIN','Admin (Chase Petrosky)',$2,$3,$4,$5)`,
      [uuidv4(), credId, `${account.first_name} ${account.last_name}`, Math.abs(amt), reason || (amt > 0 ? 'Admin grant' : 'Admin deduction')]
    );
    res.json({ success: true, newBalance: newBal });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Reset balance to zero
app.post('/api/admin/reset-balance', requireAdmin, async (req, res) => {
  try {
    const { credId } = req.body;
    const result = await pool.query(`SELECT * FROM accounts WHERE cred_id = $1`, [credId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
    const account = result.rows[0];
    await pool.query(`UPDATE accounts SET balance = 0 WHERE cred_id = $1`, [credId]);
    res.json({ success: true, newBalance: 0 });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Edit account name / notes / protection ID
app.post('/api/admin/edit-account', requireAdmin, async (req, res) => {
  try {
    const { credId, firstName, lastName, protectionId, notes } = req.body;
    if (!credId) return res.status(400).json({ error: 'Cred ID required.' });
    if (protectionId && !/^\d{4,8}$/.test(protectionId))
      return res.status(400).json({ error: 'Protection ID must be 4–8 digits.' });
    await pool.query(
      `UPDATE accounts SET
        first_name = COALESCE(NULLIF($1,''), first_name),
        last_name  = COALESCE(NULLIF($2,''), last_name),
        protection_id = COALESCE(NULLIF($3,''), protection_id),
        notes = COALESCE($4, notes)
       WHERE cred_id = $5`,
      [firstName||'', lastName||'', protectionId||'', notes ?? null, credId]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Bulk give — give same amount to all non-admin accounts
app.post('/api/admin/bulk-give', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, reason } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt === 0) return res.status(400).json({ error: 'Invalid amount.' });
    await client.query('BEGIN');
    const accounts = await client.query(`SELECT * FROM accounts WHERE is_admin = FALSE`);
    for (const a of accounts.rows) {
      const newBal = Math.max(0, parseFloat(a.balance) + amt);
      await client.query(`UPDATE accounts SET balance = $1 WHERE cred_id = $2`, [newBal, a.cred_id]);
      await client.query(
        `INSERT INTO transactions (id,from_cred_id,from_name,to_cred_id,to_name,amount,message) VALUES ($1,'ADMIN','Admin (Chase Petrosky)',$2,$3,$4,$5)`,
        [uuidv4(), a.cred_id, `${a.first_name} ${a.last_name}`, Math.abs(amt), reason || 'Bulk admin grant']
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, affected: accounts.rows.length });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Server error.' }); }
  finally { client.release(); }
});

// Search accounts
app.get('/api/admin/search', requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const result = await pool.query(
      `SELECT * FROM accounts WHERE
        first_name ILIKE $1 OR last_name ILIKE $1 OR cred_id ILIKE $1
       ORDER BY first_name ASC LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows.map(fmtAccount));
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Delete account
app.delete('/api/admin/delete-account/:credId', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM accounts WHERE cred_id = $1`, [req.params.credId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
    if (result.rows[0].is_admin) return res.status(400).json({ error: 'Cannot delete admin account.' });
    await pool.query(`DELETE FROM accounts WHERE cred_id = $1`, [req.params.credId]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

// Clear all transactions (nuclear option)
app.delete('/api/admin/clear-transactions', requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM transactions`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error.' }); }
});

setupDB().then(() => {
  app.listen(PORT, () => console.log(`🧀 Cheezy Poof server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
});
