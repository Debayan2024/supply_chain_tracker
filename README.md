# Supply Chain on Hyperledger Fabric

Tracks a product through 7 stages (RAW_MATERIAL, SEMI_FINISHED, FINISHED_GOODS, WAREHOUSE, DISTRIBUTION, RETAIL, SOLD) across two organizations on a Hyperledger Fabric 3.1.4 network with BFT (SmartBFT) ordering.

- **Org1MSP**: manufacturer (creates products; owns SEMI_FINISHED and FINISHED_GOODS)
- **Org2MSP**: logistics and retail (owns WAREHOUSE, DISTRIBUTION, RETAIL, SOLD)
- Channel: `supplychannel`, chaincode: `supplychain` (JavaScript, v2.0)
- **Lineage:** raw batches (supplier, quantity, remaining) are consumed by products, so any product can be traced back to its batches and suppliers
- **Org3:** a third organization that exists on the network but is deliberately NOT a channel member, to prove channel privacy

Documentation: [demo script](docs/DEMO.md), [limitations](docs/LIMITATIONS.md), [teacher Q&A](docs/TEACHER_QA.md), [evidence index](docs/evidence/INDEX.md).

> **Windows users:** run every command in the **Ubuntu (WSL2) shell**, not cmd or PowerShell.

## 1. Prerequisites
- Windows + WSL2 Ubuntu, Docker Desktop with WSL integration enabled
- Docker 29.x, Node.js, Git, curl

## 2. First-time install of Fabric 3.1.4
```bash
mkdir -p ~/fabric3 && cd ~/fabric3
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 3.1.4 --ca-version 1.5.17 docker samples binary
```
Samples end up in `~/fabric3/fabric-samples`; network scripts are in `~/fabric3/fabric-samples/test-network`.

**Note:** Fabric **3.1.1 does not work with Docker 29**. Version **3.1.4** fixes it. Do not use 3.1.1.

## 3. Start the network and channel
```bash
cd ~/fabric3/fabric-samples/test-network
./network.sh up createChannel -c supplychannel -ca -bft -s couchdb
```
This starts 2 peers, 4 orderers (BFT), 3 CAs and 2 CouchDB instances.

## 4. Deploy the chaincode
Fresh network (sequence defaults to 1):
```bash
./network.sh deployCC -c supplychannel -ccn supplychain -ccp ~/supplychain/chaincode -ccl javascript -ccv 2.0
```
Changed chaincode on a running network: raise BOTH version and sequence. (The network this project was built on was upgraded from v1.0 to `-ccv 2.0 -ccs 2`; the next change would be `-ccv 3.0 -ccs 3`.)
```bash
./network.sh deployCC -c supplychannel -ccn supplychain -ccp ~/supplychain/chaincode -ccl javascript -ccv 3.0 -ccs 3
```

## 5. Seed demo data
```bash
~/supplychain/seed.sh
```
Creates 3 raw batches (cotton, dye, thread) and 3 products built from them: PRD-201 at SEMI_FINISHED, PRD-202 at WAREHOUSE, PRD-203 at SOLD. Safe to run twice (existing ids are skipped).

## 6. Start the API
```bash
cd ~/supplychain/api
npm install     # first time only
node server.js
```

## 7. Open the dashboard and Fauxton
- Dashboard: http://localhost:3000
- Fauxton Org1: http://localhost:5984/_utils
- Fauxton Org2: http://localhost:7984/_utils
- CouchDB login (test default): `admin` / `adminpw`

## 8. API routes
Every request takes `org` (`org1` or `org2`) in the JSON body (POST) or as `?org=` (GET, default org1).

| Route | What it does |
|---|---|
| `POST /api/batches` | Create a raw batch `{org,id,material,quantity,unit,supplier}` (Org1 only) |
| `GET /api/batches`, `GET /api/batches/:id` | List batches / read one (shows `remaining` and `usedBy`) |
| `POST /api/products` | Create a product `{org,id,name,quantity,unit,sources:[{batchId,used}]}` (Org1 only) |
| `POST /api/products/:id/stage` | Move to the next stage `{org,stage,note}` |
| `GET /api/products`, `GET /api/products/:id` | List products / read one |
| `GET /api/products/:id/history` | Every ledger transaction that changed the product |
| `GET /api/products/:id/lineage` | The batches and suppliers the product was made from |

## 9. Org3 privacy proof (a non-member cannot read the channel)
Org3 gets its own identity, peer and CouchDB but is never added to `supplychannel`. Setup (from `~/fabric3/fabric-samples/test-network/addOrg3`):
```bash
./addOrg3.sh generate -ca        # Org3 crypto + ca_org3. Does NOT touch the channel.
DOCKER_SOCK=/var/run/docker.sock docker compose \
  -f compose/compose-org3.yaml -f compose/docker/docker-compose-org3.yaml \
  -f compose/compose-couch-org3.yaml -f compose/docker/docker-compose-couch-org3.yaml up -d
```
Do **not** use `./addOrg3.sh up`: it adds Org3 to the channel, the opposite of the goal. Then prove it:
```bash
~/supplychain/scripts/org3-proof.sh
```
Expected: Org3's peer has joined no channels, its read fails with `channel 'supplychannel' not found`, the orderer answers `FORBIDDEN`, Org1 and Org2 read the product fine. Org3's CouchDB (http://localhost:9984/_utils) has no `supplychannel_*` database.

## 10. Scripts
| Script | Purpose |
|---|---|
| `seed.sh` | Demo batches and products (see section 5) |
| `scripts/test.sh` | End-to-end checklist, prints PASS/FAIL for 14 checks (run it after any change) |
| `scripts/reject-demo.sh [ID]` | Shows rejected transactions; needs a NEW product id each run (default PRD-900, already used) |
| `scripts/org3-proof.sh` | Org3 privacy proof (section 9) |
| `env.sh` | Peer CLI helpers: `org1`, `org2`, `invoke '<json>'`, `query '<json>'` |

Test runs and demos leave data on the ledger (ids cannot be deleted); only a reset removes it.

## 11. Reset (destructive: wipes the ledger)
```bash
cd ~/fabric3/fabric-samples/test-network
./network.sh down
```
Then repeat steps 3 to 6 (and section 9 if you want Org3 again; its containers do not survive a reset, and I did not verify whether `network.sh down` also removes them).

## 12. Troubleshooting
- **"No metadata was found for chaincode"**: the chaincode deployment failed. Re-run `deployCC` and read its log for the real error.
- **Chaincode changed but nothing happens**: you must raise both `-ccv` and `-ccs`.
- **Docker errors on Fabric 3.1.1**: upgrade to 3.1.4 (see section 2).
- **Commands not found**: you are probably in cmd or PowerShell; use the Ubuntu shell.
- Manual `peer` tests need `sleep 3` between an invoke and a query (the API already waits for commit).

## Project layout
```
chaincode/   smart contract (rules, batches, lineage)
api/         Express + fabric-gateway API and static dashboard (api/public/index.html)
scripts/     test.sh, reject-demo.sh, org3-proof.sh
docs/        DEMO.md, LIMITATIONS.md, TEACHER_QA.md, evidence/, screenshots/
env.sh       peer CLI helpers: org1, org2, invoke, query
seed.sh      creates demo batches and products through the API
```
