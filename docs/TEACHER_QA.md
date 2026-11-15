# Likely teacher questions and short answers

**Why use a blockchain instead of a normal database?**
Two organizations that do not fully trust each other need one shared record that neither can quietly change. With a normal database, whoever runs it controls it. Here every organization holds a copy, and every change is signed and permanent.

**Where are the business rules enforced?**
In the chaincode (smart contract), which runs on the peers. The dashboard only displays things. Calling the API directly gets the same refusals (see `docs/evidence/rejections.txt`).

**What is a peer, an orderer, a channel, chaincode?**
A peer runs the contract and stores a ledger copy. An orderer puts transactions in order and builds blocks; it does not run the contract. A channel is a private ledger shared only by its members. Chaincode is the smart contract.

**Walk me through one transaction.**
Submit, endorse, order, commit. The peers run the rules and sign (endorse); the orderers agree on the sequence; the peers write the block. If a rule fails, it fails at the endorsement step, so nothing is ordered or stored.

**Why does a rejected transaction not appear on the ledger?**
Because it never gets past endorsement. The peers refuse to sign it, so it is never sent to the orderers and never put into a block.

**Does both organizations have to approve a transaction?**
Yes: the chaincode was deployed with Fabric's default endorsement policy, which for two organizations means both must sign.

**What is the world state versus the blockchain?**
The blockchain is the full history of every transaction. The world state (CouchDB) holds only the current value of each item, so reads are fast.

**How do you know Org3 cannot see the data?**
Three tests (`docs/evidence/org3-privacy.txt`): its peer has joined no channels, a query says "channel 'supplychannel' not found", and the orderer returns FORBIDDEN when Org3 asks for a block. Its CouchDB has no `supplychannel_*` database. Org1 and Org2 read the same product fine.

**What is lineage?**
Each product records which raw batches and how much of each it used. A batch tracks what remains and which products consumed it. The chaincode rejects using more than remains, and the whole transaction fails if any source is invalid.

**Raft or BFT, and why?**
Raft survives crashed orderers but assumes the survivors are honest. BFT (SmartBFT) also survives orderers that misbehave or lie, but needs 3f+1 nodes (4 orderers to tolerate 1) and is slower. We used BFT to show the stronger guarantee.

**What happens if the chaincode needs to change?**
It goes through the lifecycle again: package, install, approve by each organization, commit, with a higher version and sequence. We did this when adding lineage (v1.0 to v2.0, sequence 2).

**Can someone edit or delete a record?**
Not on the ledger. A later transaction can change the current state, but the history keeps every earlier version and who made it.

**Is this production ready?**
No. See `LIMITATIONS.md`: single laptop, no real login, test credentials, one peer per organization.

**What would you do next?**
Real user authentication mapped to organization identities, more peers and orgs on separate machines, proper unit tests, and an access policy for who may read which batches.
