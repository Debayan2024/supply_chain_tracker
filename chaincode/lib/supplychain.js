'use strict';

const { Contract } = require('fabric-contract-api');

// The fixed order of stages. A product may only move forward, one step at a time.
const STAGES = ['RAW_MATERIAL', 'SEMI_FINISHED', 'FINISHED_GOODS', 'WAREHOUSE', 'DISTRIBUTION', 'RETAIL', 'SOLD'];

// Which organisation is allowed to move a product INTO each stage.
const STAGE_OWNER = {
    SEMI_FINISHED: 'Org1MSP',
    FINISHED_GOODS: 'Org1MSP',
    WAREHOUSE: 'Org2MSP',
    DISTRIBUTION: 'Org2MSP',
    RETAIL: 'Org2MSP',
    SOLD: 'Org2MSP',
};

// Turn the ledger's protobuf timestamp into a normal date string.
function toIso(ts) {
    const s = ts.seconds;
    let seconds;
    if (typeof s === 'number') seconds = s;                                   // plain number (history entries)
    else if (s && typeof s.toNumber === 'function') seconds = s.toNumber();   // Long object (current transaction)
    else if (s && typeof s.low === 'number') seconds = s.low;
    else seconds = Number(s);
    return new Date(seconds * 1000).toISOString();
}

class SupplyChainContract extends Contract {

    // Create a new product at the first stage. Only Org1 (supplier side) may do this.
    async CreateProduct(ctx, id, name, quantity) {
        const mspId = ctx.clientIdentity.getMSPID();   // which organisation signed this request?
        if (mspId !== 'Org1MSP') {
            throw new Error('Only Org1 (supplier) can create products');
        }

        const existing = await ctx.stub.getState(id);  // look the id up in the ledger
        if (existing && existing.length > 0) {
            throw new Error(`Product ${id} already exists`);
        }

        const product = {
            id: id,
            name: name,
            quantity: Number(quantity),
            stage: 'RAW_MATERIAL',
            owner: mspId,
            events: [
                {
                    stage: 'RAW_MATERIAL',
                    by: mspId,
                    note: 'Product created',
                    txId: ctx.stub.getTxID(),
                    time: toIso(ctx.stub.getTxTimestamp()),
                },
            ],
        };

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));  // write to the ledger
        return JSON.stringify(product);
    }

    // Move a product to the NEXT stage. The rules are enforced here, on every peer.
    async UpdateStage(ctx, id, newStage, note) {
        const mspId = ctx.clientIdentity.getMSPID();

        const data = await ctx.stub.getState(id);
        if (!data || data.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }
        const product = JSON.parse(data.toString());

        // Rule 1: the stage name must be valid.
        const newIndex = STAGES.indexOf(newStage);
        if (newIndex === -1) {
            throw new Error(`Unknown stage ${newStage}. Valid stages: ${STAGES.join(', ')}`);
        }

        // Rule 2: no skipping, no going backwards. Only the very next stage is allowed.
        const currentIndex = STAGES.indexOf(product.stage);
        if (newIndex !== currentIndex + 1) {
            throw new Error(`Cannot move from ${product.stage} to ${newStage}. Next allowed stage: ${STAGES[currentIndex + 1] || 'none (already SOLD)'}`);
        }

        // Rule 3: only the right organisation may enter this stage.
        if (STAGE_OWNER[newStage] !== mspId) {
            throw new Error(`${mspId} is not allowed to move a product to ${newStage} (only ${STAGE_OWNER[newStage]})`);
        }

        product.stage = newStage;
        product.owner = mspId;
        product.events.push({
            stage: newStage,
            by: mspId,
            note: note || '',
            txId: ctx.stub.getTxID(),
            time: toIso(ctx.stub.getTxTimestamp()),
        });

        await ctx.stub.putState(id, Buffer.from(JSON.stringify(product)));
        return JSON.stringify(product);
    }

    // Read one product. Anyone on the channel may do this.
    async GetProduct(ctx, id) {
        const data = await ctx.stub.getState(id);
        if (!data || data.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }
        return data.toString();
    }

    // Every version of the product that was ever written to the ledger, oldest first.
    async ListProducts(ctx) {
        const results = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let r = await iterator.next();
        while (!r.done) {
            const p = JSON.parse(Buffer.from(r.value.value).toString('utf8'));
            results.push({ id: p.id, name: p.name, quantity: p.quantity, stage: p.stage, owner: p.owner });
            r = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    async GetHistory(ctx, id) {
        const iterator = await ctx.stub.getHistoryForKey(id);
        const history = [];

        let result = await iterator.next();
        while (!result.done) {
            const entry = result.value;
            const product = JSON.parse(entry.value.toString());
            history.push({
                txId: entry.txId,
                time: toIso(entry.timestamp),
                stage: product.stage,
                owner: product.owner,
            });
            result = await iterator.next();
        }
        await iterator.close();

        if (history.length === 0) {
            throw new Error(`Product ${id} does not exist`);
        }
        return JSON.stringify(history);
    }
}

module.exports = SupplyChainContract;
