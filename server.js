require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Set SESSION_SECRET to a long random value before production.");
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "goldenvest.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 type TEXT NOT NULL CHECK(type IN ('bank_deposit','bitcoin_deposit','withdrawal','investment','profit_loss_adjustment')),
 amount REAL NOT NULL CHECK(amount > 0),
 currency TEXT NOT NULL DEFAULT 'NGN',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reference TEXT,
 notes TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 reviewed_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 transaction_id INTEGER REFERENCES transactions(id),
 entry_type TEXT NOT NULL,
 amount REAL NOT NULL,
 currency TEXT NOT NULL,
 note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const SQLiteStore = SQLiteStoreFactory(session);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"], connectSrc: ["'self'"], objectSrc: ["'none'"],
    upgradeInsecureRequests: isProd ? [] : null
  }
}}));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 1000 * 60 * 60 * 4 }
}));
app.use(express.static(path.join(__dirname, "public")));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
const insertUser = db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)");
const findUser = db.prepare("SELECT * FROM users WHERE email = ?");
const getUser = db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id = ?");
const getTotals = db.prepare(`
 SELECT
 COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount WHEN entry_type='debit' THEN -amount ELSE amount END),0) AS balance
 FROM ledger WHERE user_id = ? AND currency='NGN'
`);
function cleanText(v, max=100) { return String(v || "").trim().slice(0,max); }
function requireAuth(req,res,next) {
  if (!req.session.userId) return res.status(401).json({error:"Please sign in first."});
  next();
}
function requireAdmin(req,res,next) {
  const user = req.session.userId ? getUser.get(req.session.userId) : null;
  if (!user || user.role !== "admin") return res.status(403).json({error:"Admin access required."});
  req.user = user; next();
}
function csrfCheck(req,res,next) {
  // SameSite cookies and same-origin API usage are enabled. Add a dedicated CSRF token
  // library before enabling third-party form origins or production financial actions.
  const origin = req.get("origin");
  if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({error:"Cross-origin request blocked."});
  }
  next();
}
app.use("/api", csrfCheck);

app.post("/api/register", authLimiter, async (req,res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) {
    return res.status(400).json({error:"Enter a name, valid email, and password of at least 10 characters."});
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = insertUser.run(name,email,hash);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({error:"Could not create session."});
      req.session.userId = Number(result.lastInsertRowid);
      res.json({ok:true,user:getUser.get(req.session.userId)});
    });
  } catch(e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({error:"An account with this email already exists."});
    res.status(500).json({error:"Registration failed."});
  }
});
app.post("/api/login", authLimiter, async (req,res) => {
  const email = cleanText(req.body.email,254).toLowerCase();
  const password = String(req.body.password || "");
  const user = findUser.get(email);
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Email or password is incorrect."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Could not create session."});
    req.session.userId = user.id;
    res.json({ok:true,user:getUser.get(user.id)});
  });
});
app.post("/api/logout", requireAuth, (req,res) => req.session.destroy(() => res.json({ok:true})));
app.get("/api/me", requireAuth, (req,res) => {
  const user = getUser.get(req.session.userId);
  const transactions = db.prepare("SELECT id,type,amount,currency,status,reference,notes,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 50").all(user.id);
  const ledger = db.prepare("SELECT entry_type,amount,currency,note,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 50").all(user.id);
  res.json({user,transactions,ledger,mode:"TEST MODE — no real funds are moved"});
});
app.post("/api/deposit-request", requireAuth, (req,res) => {
  const method = cleanText(req.body.method,30);
  const amount = Number(req.body.amount);
  const reference = cleanText(req.body.reference,120);
  if (!["bank_deposit","bitcoin_deposit"].includes(method)) return res.status(400).json({error:"Choose bank transfer or Bitcoin."});
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return res.status(400).json({error:"Enter a valid amount."});
  if (method === "bitcoin_deposit" && !reference) return res.status(400).json({error:"For this test-mode request, enter a transaction hash or a note. Do not send Bitcoin to an address shown by this demo."});
  const result = db.prepare("INSERT INTO transactions(user_id,type,amount,currency,status,reference,notes) VALUES(?,?,?,?,?,?,?)")
    .run(req.session.userId,method,amount,method==="bitcoin_deposit"?"BTC":"NGN","pending",reference,"TEST MODE: pending manual review; no funds received.");
  res.json({ok:true,id:Number(result.lastInsertRowid),message:"Request saved as pending. This demo does not receive or transfer money."});
});
app.post("/api/withdrawal-request", requireAuth, (req,res) => {
  const amount = Number(req.body.amount);
  const method = cleanText(req.body.method,30);
  const details = cleanText(req.body.details,160);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !["bank","bitcoin"].includes(method) || details.length < 4) {
    return res.status(400).json({error:"Enter a valid amount, payout method, and payout note."});
  }
  const result = db.prepare("INSERT INTO transactions(user_id,type,amount,currency,status,reference,notes) VALUES(?,?,?,?,?,?,?)")
    .run(req.session.userId,"withdrawal",amount,method==="bitcoin"?"BTC":"NGN","pending",details,"TEST MODE: no payout is processed.");
  res.json({ok:true,id:Number(result.lastInsertRowid),message:"Withdrawal request saved as pending. No payout was made."});
});
app.get("/api/admin/transactions", requireAuth, requireAdmin, (req,res) => {
  const rows = db.prepare(`SELECT t.*,u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200`).all();
  res.json({transactions:rows});
});
app.post("/api/admin/transactions/:id/review", requireAuth, requireAdmin, (req,res) => {
  const id = Number(req.params.id), decision = cleanText(req.body.decision,20), note = cleanText(req.body.note,250);
  if (!Number.isInteger(id) || !["approved","rejected"].includes(decision)) return res.status(400).json({error:"Invalid review request."});
  const tx = db.prepare("SELECT * FROM transactions WHERE id=?").get(id);
  if (!tx || tx.status !== "pending") return res.status(404).json({error:"Pending transaction not found."});
  // Test-mode review changes status only; it never creates a spendable balance or transfers funds.
  db.prepare("UPDATE transactions SET status=?,notes=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?")
    .run(decision,`TEST MODE review: ${note}`,req.user.id,id);
  res.json({ok:true,message:"Test-mode status updated. No balance or real payment changed."});
});
app.get("/api/admin/users", requireAuth, requireAdmin, (req,res) => {
  res.json({users:db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 200").all()});
});
app.get("/api/health", (req,res) => res.json({ok:true,mode:"test"}));

app.get("/{*splat}", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`GoldenVest test-mode app listening on http://localhost:${PORT}`));
