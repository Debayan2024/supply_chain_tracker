# Supply Chain on Hyperledger Fabric

Tracks a product through 7 stages (RAW_MATERIAL, SEMI_FINISHED, FINISHED_GOODS, WAREHOUSE, DISTRIBUTION, RETAIL, SOLD) across two organizations on a Hyperledger Fabric 3.1.4 network with BFT (SmartBFT) ordering.

- **Org1MSP**: manufacturer (creates products; owns SEMI_FINISHED and FINISHED_GOODS)
- **Org2MSP**: logistics and retail (owns WAREHOUSE, DISTRIBUTION, RETAIL, SOLD)
- Channel: `supplychannel`, chaincode: `supplychain` (JavaScript)

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
Fresh network:
```bash
./network.sh deployCC -c supplychannel -ccn supplychain -ccp ~/supplychain/chaincode -ccl javascript -ccv 1.0
```
Changed chaincode on a running network (raise BOTH version and sequence):
```bash
./network.sh deployCC -c supplychannel -ccn supplychain -ccp ~/supplychain/chaincode -ccl javascript -ccv 2.0 -ccs 2
```

## 5. Seed demo data
```bash
~/supplychain/seed.sh
```

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

## 8. Reset (destructive: wipes the ledger)
```bash
cd ~/fabric3/fabric-samples/test-network
./network.sh down
```
Then repeat steps 3 to 6.

## 9. Troubleshooting
- **"No metadata was found for chaincode"**: the chaincode deployment failed. Re-run `deployCC` and read its log for the real error.
- **Chaincode changed but nothing happens**: you must raise both `-ccv` and `-ccs`.
- **Docker errors on Fabric 3.1.1**: upgrade to 3.1.4 (see section 2).
- **Commands not found**: you are probably in cmd or PowerShell; use the Ubuntu shell.
- Manual `peer` tests need `sleep 3` between an invoke and a query (the API already waits for commit).

## Project layout
```
chaincode/   smart contract (rules)
api/         Express + fabric-gateway API and static dashboard (api/public/index.html)
env.sh       peer CLI helpers: org1, org2, invoke, query
seed.sh      creates demo products through the API
```
