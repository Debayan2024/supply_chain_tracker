# Known limitations

These are stated honestly so the project is not oversold.

- **One laptop.** Everything runs on one machine, so it is not truly decentralized. Isolation between organizations is logical (certificates and channel membership), not physical.
- **One peer per organization.** If an organization's peer goes down, that organization has no copy to read from and cannot endorse. There is no peer redundancy.
- **No real login.** The dashboard's "Acting as" dropdown is a demo shortcut: anyone who can open the page can act as either organization. A real system would map authenticated users to organization identities. For this reason the dashboard must not be exposed publicly.
- **The ledger proves what was recorded, not that it is true.** If someone enters "sold" for goods that were not sold, the blockchain stores that faithfully. It guarantees who recorded it and that it cannot be altered afterwards, not that it is physically correct.
- **BFT cost.** BFT ordering with 4 orderers tolerates 1 faulty orderer (the 3f+1 rule). It is slower and needs more nodes than Raft. We did not test taking an orderer down during the demo.
- **Test credentials.** CouchDB uses the test default login `admin` / `adminpw`, and the identities come from the sample test network. Not suitable for production.
- **No unit-test suite.** The chaincode is tested by script (`scripts/test.sh`, `scripts/reject-demo.sh`), not by a full unit-test suite.
- **Lineage is simplified.** Batches and sources are tracked with quantity checks, but there is no separate legal owner vs custodian, and a product can be created without any sources. Products created before chaincode v2.0 (PRD-101 to PRD-103) have no lineage.
- **Test data cannot be deleted.** Ledger entries are permanent, so test runs leave extra batches and products behind. Only a fresh network removes them.
- **Org3 is a demo device.** The third organization exists only to show channel privacy; it never takes part in transactions.
