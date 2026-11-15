# Demo script (about 8 actions, fixed order)

Before you start (2 minutes): network up, API running (`cd ~/supplychain/api && node server.js`),
dashboard open at http://localhost:3000, and two browser tabs for Fauxton (ports 5984 and 7984, login `admin` / `adminpw`).
Use **new ids** for everything you create live (for example `B-DEMO-1` and `PRD-310`); an id can only be used once.

---

## 1. Show the architecture
**Do:** in the Ubuntu terminal run `docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -v '^dev-'`.
**Say:** "Two organizations each run a peer, which keeps a copy of the ledger. Four orderers agree on the order of transactions using BFT. Each org has its own certificate authority and its own database, CouchDB."
**Expect:** peers for Org1 and Org2, 4 orderers, CAs, CouchDB. (The Org3 containers are also listed; they are for step 7.)

## 2. Create a raw batch, then a product made from it (dashboard, acting as Org1)
**Do:** with "Acting as Org1": create batch `B-DEMO-1`, Cotton, 100, kg, supplier GreenFarm. Then create product `PRD-310`, Demo Shirt, quantity 20, unit pcs, sources `B-DEMO-1:30`.
**Say:** "The manufacturer registers raw material first, then makes a product from it. The chaincode checks the batch has enough left and subtracts what was used."
**Expect:** the batch list shows `70 / 100 kg left`. PRD-310 appears at Raw material.

## 3. Move the product through the stages with the correct org
**Do:** as Org1 click Move twice (Semi finished, Finished goods). Switch to "Acting as Org2" and click Move until Sold (Warehouse, Distribution, Retail, Sold).
**Say:** "Each stage belongs to one organization: the manufacturer owns the first stages, logistics and retail own the rest. A product can only move to the next stage, never skip or go back."
**Expect:** the pipeline fills one step at a time and the timeline shows who made each move.

## 4. A rejected transaction
**Do:** the dashboard only offers the legal next move, so show the refusals from the terminal: run `scripts/reject-demo.sh PRD-902` (use a new id each time). It sends four bad requests and prints each error.
**Say:** "These rules are inside the smart contract, not the web page. Even calling the API directly with curl, the wrong org or a skipped stage is refused by the peers before anything reaches the ledger."
**Expect:** four `HTTP 400` errors (only Org1 may create, duplicate id, cannot skip stage, wrong org) and a history with only the 2 successful events.

## 5. Ledger history and lineage
**Do:** in the dashboard select PRD-203 (seeded). Point at the **Lineage** card and the **Ledger history** table.
**Say:** "Lineage traces this product back to the raw batches and suppliers it came from. The history lists every transaction that changed it, with its transaction id. Nothing can be quietly edited."
**Expect:** cotton, dye and thread batches with suppliers and amounts, and a history table ending at Sold.

## 6. Fauxton: the same data in both organizations
**Do:** open `supplychannel_supplychain` in the Org1 tab (5984) and the Org2 tab (7984). Open document `PRD-203` in both.
**Say:** "Each organization stores its own full copy, in its own database, and they match. That is the shared ledger: no central server."
**Expect:** identical documents, including the `BATCH_` records.

## 7. Privacy: Org3 cannot read the channel
**Do:** run `scripts/org3-proof.sh`. Then open Org3's CouchDB at http://localhost:9984/_utils.
**Say:** "Org3 exists on the network but was never added to this channel. Its peer has joined no channels, a read fails with 'channel not found', and the orderer refuses to give it a block. Its database has no supplychannel data at all."
**Expect:** Org3 refused at each check, Org1 and Org2 succeed, and Org3's database list has only system databases.

## 8. Limits and BFT vs Raft (one slide)
**Say:** "It runs on one laptop, so decentralization is logical, not physical. The dashboard has no login. The ledger proves what was recorded, not that it is true in the real world. We used BFT ordering, which tolerates one faulty orderer out of four and even a lying one, but it is slower and needs more nodes than Raft, which only tolerates crashed nodes." (Details in `LIMITATIONS.md`.)

---

## If it breaks
| Problem | Fix (run in the **Ubuntu** shell) |
|---|---|
| Dashboard empty or "Request failed" | Restart the API: `cd ~/supplychain/api && node server.js` |
| Containers not running (`docker ps` is empty) | Docker Desktop must be running with WSL integration on. Then redo README steps 3 and 4 (start network, deploy chaincode). This needs a fresh ledger, so ask before using `./network.sh down`. |
| "No metadata was found for chaincode" | The chaincode deploy failed. Re-run `deployCC` (README step 4) and read its log. |
| Chaincode changed but behaviour did not | Raise **both** version and sequence in `deployCC`. |
| Id already exists | Use a new id; products and batches cannot be deleted. |
| Empty dashboard after a reset | Run `~/supplychain/seed.sh` (README step 5). |
| Org3 proof fails after a reset | The Org3 peer is gone after `network.sh down`; redo the Org3 setup before demoing step 7. |
| Quick health check | `scripts/test.sh` should print `ALL PASS`. |
