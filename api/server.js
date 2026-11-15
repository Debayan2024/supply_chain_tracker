const express = require('express');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHANNEL = 'supplychannel';
const CHAINCODE = 'supplychain';
const TN = path.join(os.homedir(), 'fabric3/fabric-samples/test-network/organizations/peerOrganizations');

// Which identity + peer belongs to which organization
const ORGS = {
  org1: { mspId: 'Org1MSP', domain: 'org1.example.com', endpoint: 'localhost:7051', host: 'peer0.org1.example.com' },
  org2: { mspId: 'Org2MSP', domain: 'org2.example.com', endpoint: 'localhost:9051', host: 'peer0.org2.example.com' },
};

// Open a connection (gateway) for one org. We cache it so we connect only once.
const cache = {};
function getContract(orgKey) {
  const org = ORGS[orgKey];
  if (!org) throw new Error('org must be "org1" or "org2"');
  if (cache[orgKey]) return cache[orgKey];

  const userDir = path.join(TN, org.domain, 'users', `User1@${org.domain}`, 'msp');
  const certPath = path.join(userDir, 'signcerts', 'cert.pem');
  const keyDir = path.join(userDir, 'keystore');
  const keyPath = path.join(keyDir, fs.readdirSync(keyDir)[0]);
  const tlsPath = path.join(TN, org.domain, 'tlsca', `tlsca.${org.domain}-cert.pem`);

  const client = new grpc.Client(
    org.endpoint,
    grpc.credentials.createSsl(fs.readFileSync(tlsPath)),
    { 'grpc.ssl_target_name_override': org.host }
  );

  const gateway = connect({
    client,
    identity: { mspId: org.mspId, credentials: fs.readFileSync(certPath) },
    signer: signers.newPrivateKeySigner(crypto.createPrivateKey(fs.readFileSync(keyPath))),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  cache[orgKey] = gateway.getNetwork(CHANNEL).getContract(CHAINCODE);
  return cache[orgKey];
}

const decode = (bytes) => new TextDecoder().decode(bytes);

// Turn Fabric errors into a readable message (e.g. "Cannot move from X to Y...")
function errorText(err) {
  if (err.details && err.details.length) return err.details.map((d) => d.message.replace(/^chaincode response \d+, /, '')).join(' | ');
  return err.message.replace(/^chaincode response \d+, /, '');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // dashboard goes here in Step 10

// Create a product (chaincode only allows Org1)
app.post('/api/products', async (req, res) => {
  try {
    const { org, id, name, quantity, unit, sources } = req.body;
    const out = await getContract(org).submitTransaction('CreateProduct', String(id), String(name), String(quantity),
      String(unit || ''), JSON.stringify(sources || []));
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Create a raw-material batch (chaincode only allows Org1)
app.post('/api/batches', async (req, res) => {
  try {
    const { org, id, material, quantity, unit, supplier } = req.body;
    const out = await getContract(org).submitTransaction('CreateBatch', String(id), String(material), String(quantity), String(unit), String(supplier));
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// List all raw batches
app.get('/api/batches', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('ListBatches');
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Read one batch
app.get('/api/batches/:id', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('GetBatch', req.params.id);
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(404).json({ error: errorText(e) }); }
});

// Move a product to the next stage
app.post('/api/products/:id/stage', async (req, res) => {
  try {
    const { org, stage, note } = req.body;
    const out = await getContract(org).submitTransaction('UpdateStage', req.params.id, String(stage), String(note || ''));
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Read a product (any org can read; default org1)
app.get('/api/products/:id', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('GetProduct', req.params.id);
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(404).json({ error: errorText(e) }); }
});

// Which batches and suppliers a product was made from
app.get('/api/products/:id/lineage', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('GetLineage', req.params.id);
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(404).json({ error: errorText(e) }); }
});

// Full ledger history of a product
app.get('/api/products/:id/history', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('GetHistory', req.params.id);
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(404).json({ error: errorText(e) }); }
});

// List all products (for the dashboard)
app.get('/api/products', async (req, res) => {
  try {
    const out = await getContract(req.query.org || 'org1').evaluateTransaction('ListProducts');
    res.json(JSON.parse(decode(out)));
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.listen(3000, () => console.log('API running on http://localhost:3000'));
