const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const VALID_STATUSES = ['reçue', 'en préparation', 'terminée', 'annulée'];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';
const SESSION_COOKIE = 'tsaky_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf8');
app.use(express.json({ limit: '100kb' }));

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const part of cookies) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
function isAdmin(req) {
  const token = getCookie(req, SESSION_COOKIE);
  const expiresAt = sessions.get(token);
  if (!token || !expiresAt) return false;
  if (expiresAt < Date.now()) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Connexion administrateur requise.' });
  return res.redirect('/login');
}
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (attempt.until > Date.now() && attempt.count >= 8) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  const supplied = Buffer.from(String(req.body && req.body.password || ''));
  const expected = Buffer.from(ADMIN_PASSWORD);
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!valid) {
    if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 15 * 60 * 1000; }
    attempt.count++;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
  res.json({ ok: true, redirect: '/dashboard' });
});
app.post('/api/logout', (req, res) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/session', (req, res) => res.json({ authenticated: isAdmin(req) }));
app.use(['/dashboard', '/dashboard.html', '/products', '/products.html'], requireAdmin);
app.use(express.static(path.join(__dirname, 'public')));

function readOrders() {
  try {
    const value = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('Impossible de lire orders.json :', error.message);
    throw new Error('Le fichier des commandes est illisible.');
  }
}
function writeOrders(orders) {
  const tempFile = ORDERS_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(orders, null, 2), 'utf8');
  fs.renameSync(tempFile, ORDERS_FILE);
}
function readProducts() {
  try { const value = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); return Array.isArray(value) ? value : []; }
  catch (error) { console.error('Impossible de lire products.json :', error.message); throw new Error('Le fichier des produits est illisible.'); }
}
function writeProducts(products) {
  const tempFile = PRODUCTS_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(products, null, 2), 'utf8');
  fs.renameSync(tempFile, PRODUCTS_FILE);
}
function cleanProduct(input, id) {
  const name = String(input && input.name || '').trim().slice(0, 120);
  const category = String(input && input.category || '').trim().slice(0, 60);
  const price = Number(input && input.price);
  const img = String(input && input.img || '').trim().slice(0, 1000);
  if (!name || !category || !Number.isFinite(price) || price < 0 || price > 100000000) return null;
  if (img && !/^https?:\/\//i.test(img) && !img.startsWith('/')) return null;
  return { id, name, category, price: Math.round(price), img };
}
app.get('/api/products', (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json(readProducts()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const products = readProducts();
    const id = products.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
    const product = cleanProduct(req.body, id);
    if (!product) return res.status(400).json({ error: 'Nom, catégorie, prix et image valide sont requis.' });
    products.push(product); writeProducts(products); res.status(201).json({ ok: true, product });
  } catch (error) { res.status(500).json({ error: error.message || 'Enregistrement impossible.' }); }
});
app.put('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const products = readProducts(); const index = products.findIndex(p => String(p.id) === String(req.params.id));
    if (index < 0) return res.status(404).json({ error: 'Produit introuvable.' });
    const product = cleanProduct(req.body, products[index].id);
    if (!product) return res.status(400).json({ error: 'Nom, catégorie, prix et image valide sont requis.' });
    products[index] = product; writeProducts(products); res.json({ ok: true, product });
  } catch (error) { res.status(500).json({ error: error.message || 'Modification impossible.' }); }
});
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const products = readProducts(); const updated = products.filter(p => String(p.id) !== String(req.params.id));
    if (updated.length === products.length) return res.status(404).json({ error: 'Produit introuvable.' });
    writeProducts(updated); res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: error.message || 'Suppression impossible.' }); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'TSAKY & CO' }));
app.post('/api/orders', (req, res) => {
  const o = req.body;
  if (!o || !Array.isArray(o.items) || !o.items.length) return res.status(400).json({ error: 'La commande est vide.' });
  let catalog;
  try { catalog = readProducts(); } catch (error) { return res.status(500).json({ error: error.message }); }
  const normalizedItems = [];
  for (const item of o.items) {
    const product = catalog.find(p => String(p.id) === String(item.id) || p.name === item.product);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return res.status(400).json({ error: 'Article invalide ou indisponible : actualisez le menu.' });
    normalizedItems.push({ product: product.name, price: product.price, quantity: item.quantity, note: String(item.note || '').slice(0, 250) });
  }
  const total = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!Number.isFinite(total)) return res.status(400).json({ error: 'Total invalide.' });
  try {
    const all = readOrders();
    const order = {
      orderId: 'TS-' + Date.now(),
      createdAt: new Date().toISOString(),
      customer: String(o.customer || '').slice(0, 100),
      kind: String(o.kind || 'Sur place').slice(0, 40),
      table: String(o.table || '').slice(0, 20),
      payment: String(o.payment || 'Espèces').slice(0, 40),
      items: normalizedItems,
      total,
      status: 'reçue'
    };
    all.push(order);
    writeOrders(all);
    res.status(201).json({ ok: true, orderId: order.orderId, total: order.total });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Impossible d’enregistrer la commande.' });
  }
});
app.get('/api/orders', requireAdmin, (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json(readOrders()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
app.patch('/api/orders/:orderId/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  try {
    const orders = readOrders();
    const order = orders.find(item => item.orderId === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    order.status = status;
    order.updatedAt = new Date().toISOString();
    writeOrders(orders);
    res.json({ ok: true, order });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/products', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`TSAKY & CO : http://localhost:${PORT} | Tableau de bord : http://localhost:${PORT}/dashboard | Pour Tailscale, utilisez l’adresse Tailscale IPv4 de cet ordinateur.`));
