const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_FILE = path.join(DATA_DIR, 'packages.json');
const LOG_FILE = path.join(DATA_DIR, 'tracking.log');
const META_FILE = path.join(DATA_DIR, 'node-meta.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');

// Write node metadata on startup (for migration demo)
const nodeMeta = {
  pod: os.hostname(),
  node: process.env.NODE_NAME || 'unknown',
  startedAt: new Date().toISOString(),
  version: process.env.APP_VERSION || '1.0.0'
};
fs.writeFileSync(META_FILE, JSON.stringify(nodeMeta, null, 2));

function appendLog(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_FILE, line);
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

function loadPackages() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return []; }
}

function savePackages(packages) {
  fs.writeFileSync(DB_FILE, JSON.stringify(packages, null, 2));
}

// Seed demo data if empty
function seedData() {
  const packages = loadPackages();
  if (packages.length === 0) {
    const demo = [
      {
        id: uuidv4(),
        code: 'BR' + Math.random().toString(36).substring(2,11).toUpperCase() + 'BR',
        sender: { name: 'João Silva', city: 'São Paulo', state: 'SP', cep: '01310-100' },
        recipient: { name: 'Maria Santos', city: 'Rio de Janeiro', state: 'RJ', cep: '20040-020' },
        description: 'Eletrônicos - Notebook',
        weight: '2.5kg',
        status: 'in_transit',
        events: [
          { ts: new Date(Date.now() - 86400000 * 3).toISOString(), location: 'São Paulo - SP', description: 'Objeto postado', status: 'posted' },
          { ts: new Date(Date.now() - 86400000 * 2).toISOString(), location: 'Campinas - SP', description: 'Em trânsito para unidade de distribuição', status: 'in_transit' },
          { ts: new Date(Date.now() - 86400000 * 1).toISOString(), location: 'Rio de Janeiro - RJ', description: 'Chegou à unidade de distribuição', status: 'arrived' }
        ],
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
      },
      {
        id: uuidv4(),
        code: 'BR' + Math.random().toString(36).substring(2,11).toUpperCase() + 'BR',
        sender: { name: 'Empresa Tech LTDA', city: 'Curitiba', state: 'PR', cep: '80010-010' },
        recipient: { name: 'Carlos Oliveira', city: 'Belo Horizonte', state: 'MG', cep: '30130-110' },
        description: 'Documentos',
        weight: '0.3kg',
        status: 'delivered',
        events: [
          { ts: new Date(Date.now() - 86400000 * 5).toISOString(), location: 'Curitiba - PR', description: 'Objeto postado', status: 'posted' },
          { ts: new Date(Date.now() - 86400000 * 3).toISOString(), location: 'São Paulo - SP', description: 'Em trânsito', status: 'in_transit' },
          { ts: new Date(Date.now() - 86400000 * 1).toISOString(), location: 'Belo Horizonte - MG', description: 'Saiu para entrega', status: 'out_for_delivery' },
          { ts: new Date(Date.now() - 3600000).toISOString(), location: 'Belo Horizonte - MG', description: 'Objeto entregue ao destinatário', status: 'delivered' }
        ],
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
      }
    ];
    savePackages(demo);
    appendLog({ event: 'SEED', message: 'Demo data created', count: demo.length });
  }
}

seedData();
appendLog({ event: 'STARTUP', pod: nodeMeta.pod, node: nodeMeta.node, message: 'Application started' });

// API Routes
app.get('/api/health', (req, res) => {
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  res.json({ status: 'ok', ...meta, uptime: process.uptime() });
});

app.get('/api/packages', (req, res) => {
  const packages = loadPackages();
  appendLog({ event: 'LIST', count: packages.length });
  res.json(packages);
});

app.get('/api/packages/:code', (req, res) => {
  const packages = loadPackages();
  const pkg = packages.find(p => p.code === req.params.code.toUpperCase());
  if (!pkg) return res.status(404).json({ error: 'Pacote não encontrado' });
  appendLog({ event: 'TRACK', code: pkg.code, status: pkg.status });
  res.json(pkg);
});

app.post('/api/packages', (req, res) => {
  const packages = loadPackages();
  const newPkg = {
    id: uuidv4(),
    code: 'BR' + Math.random().toString(36).substring(2,11).toUpperCase() + 'BR',
    sender: req.body.sender,
    recipient: req.body.recipient,
    description: req.body.description,
    weight: req.body.weight || '1kg',
    status: 'posted',
    events: [
      { ts: new Date().toISOString(), location: req.body.sender?.city + ' - ' + req.body.sender?.state, description: 'Objeto postado', status: 'posted' }
    ],
    createdAt: new Date().toISOString()
  };
  packages.push(newPkg);
  savePackages(packages);
  appendLog({ event: 'CREATE', code: newPkg.code, sender: newPkg.sender?.name, recipient: newPkg.recipient?.name });
  res.status(201).json(newPkg);
});

app.post('/api/packages/:code/event', (req, res) => {
  const packages = loadPackages();
  const idx = packages.findIndex(p => p.code === req.params.code.toUpperCase());
  if (idx === -1) return res.status(404).json({ error: 'Pacote não encontrado' });
  const event = { ts: new Date().toISOString(), ...req.body };
  packages[idx].events.push(event);
  packages[idx].status = event.status || packages[idx].status;
  savePackages(packages);
  appendLog({ event: 'UPDATE', code: packages[idx].code, newStatus: packages[idx].status });
  res.json(packages[idx]);
});

app.get('/api/logs', (req, res) => {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const logs = lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
    res.json(logs.slice(-100).reverse());
  } catch { res.json([]); }
});

app.get('/api/node-info', (req, res) => {
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  res.json({
    ...meta,
    dataDir: DATA_DIR,
    dbFile: DB_FILE,
    packageCount: loadPackages().length,
    logLines: fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length
  });
});

app.listen(3000, () => {
  console.log('Correios Rastreamento running on :3000');
  appendLog({ event: 'LISTEN', port: 3000 });
});
