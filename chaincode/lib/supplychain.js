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

// Raw batches are stored under this key prefix so they never mix with products.
const BATCH_PREFIX = 'BATCH_';
const batchKey = (id) => BATCH_PREFIX + id;

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

    // Register a raw-material batch from a supplier. Only Org1 may do this.
    async CreateBatch(ctx, id, material, quantity, unit, supplier) {
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error('Only Org1 (supplier) can create raw batches');
        }
        if (!id || !material || !unit || !supplier) {
            throw new Error('id, material, unit and supplier are all required');
        }
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
            throw new Error('Batch quantity must be a number greater than 0');
        }
        const existing = await ctx.stub.getState(batchKey(id));
        if (existing && existing.length > 0) {
            throw new Error(`Batch ${id} already exists`);
        }

        const batch = {
            id: id,
            material: material,
            quantity: qty,
            unit: unit,
            supplier: supplier,
            remaining: qty,
            usedBy: [],
            createdBy: mspId,
            time: toIso(ctx.stub.getTxTimestamp()),
        };
        await ctx.stub.putState(batchKey(id), Buffer.from(JSON.stringify(batch)));
        return JSON.stringify(batch);
    }

    // Create a new product at the first stage. Only Org1 (supplier side) may do this.
    // sources is a JSON text like [{"batchId":"B-1","used":40}]; it is optional.
    // Every source is checked and its batch's remaining quantity is reduced. If ANY source
    // is invalid the transaction fails and nothing at all is written.
    async CreateProduct(ctx, id, name, quantity, unit, sources) {
        const mspId = ctx.clientIdentity.getMSPID();   // which organisation signed this request?
        if (mspId !== 'Org1MSP') {
            throw new Error('Only Org1 (supplier) can create products');
        }
        if (String(id).startsWith(BATCH_PREFIX)) {
            throw new Error(`Product ids may not start with ${BATCH_PREFIX}`);
        }

        const existing = await ctx.stub.getState(id);  // look the id up in the ledger
        if (existing && existing.length > 0) {
            throw new Error(`Product ${id} already exists`);
        }

        let list;
        try {
            list = sources ? JSON.parse(sources) : [];
        } catch (e) {
            throw new Error('sources must be valid JSON, e.g. [{"batchId":"B-1","used":40}]');
        }
        if (!Array.isArray(list)) {
            throw new Error('sources must be a list');
        }
        const seen = new Set();
        const batches = [];
        for (const src of list) {
            const used = Number(src && src.used);
            if (!src || !src.batchId) throw new Error('Each source needs a batchId');
            if (!Number.isFinite(used) || used <= 0) {
                throw new Error(`Source ${src.batchId}: used must be a number greater than 0`);
            }
            if (seen.has(src.batchId)) throw new Error(`Batch ${src.batchId} is listed twice`);
            seen.add(src.batchId);

            const data = await ctx.stub.getState(batchKey(src.batchId));
            if (!data || data.length === 0) throw new Error(`Batch ${src.batchId} does not exist`);
            const batch = JSON.parse(data.toString());
            if (used > batch.remaining) {
                throw new Error(`Batch ${src.batchId} has only ${batch.remaining} ${batch.unit} remaining, cannot use ${used}`);
            }
            batch.remaining -= used;
            batch.usedBy.push({ productId: id, used: used });
            batches.push(batch);
        }
        for (const batch of batches) {
            await ctx.stub.putState(batchKey(batch.id), Buffer.from(JSON.stringify(batch)));
        }

        const product = {
            id: id,
            name: name,
            quantity: Number(quantity),
            unit: unit || '',
            sources: list.map((x) => ({ batchId: x.batchId, used: Number(x.used) })),
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
            if (!r.value.key.startsWith(BATCH_PREFIX)) {   // batches live in the same ledger; skip them here
                const p = JSON.parse(Buffer.from(r.value.value).toString('utf8'));
                results.push({ id: p.id, name: p.name, quantity: p.quantity, unit: p.unit || '', stage: p.stage, owner: p.owner });
            }
            r = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    // Read one raw batch.
    async GetBatch(ctx, id) {
        const data = await ctx.stub.getState(batchKey(id));
        if (!data || data.length === 0) {
            throw new Error(`Batch ${id} does not exist`);
        }
        return data.toString();
    }

    // All raw batches (keys BATCH_ to BATCH_~ cover everything with the prefix).
    async ListBatches(ctx) {
        const results = [];
        const iterator = await ctx.stub.getStateByRange(BATCH_PREFIX, BATCH_PREFIX + '~');
        let r = await iterator.next();
        while (!r.done) {
            results.push(JSON.parse(Buffer.from(r.value.value).toString('utf8')));
            r = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(results);
    }

    // Trace a product back to the batches and suppliers it was made from.
    async GetLineage(ctx, productId) {
        const data = await ctx.stub.getState(productId);
        if (!data || data.length === 0 || String(productId).startsWith(BATCH_PREFIX)) {
            throw new Error(`Product ${productId} does not exist`);
        }
        const product = JSON.parse(data.toString());
        const sources = [];
        for (const src of product.sources || []) {
            const b = await ctx.stub.getState(batchKey(src.batchId));
            const batch = b && b.length ? JSON.parse(b.toString()) : null;
            sources.push({
                batchId: src.batchId,
                used: src.used,
                material: batch ? batch.material : null,
                unit: batch ? batch.unit : null,
                supplier: batch ? batch.supplier : null,
                remaining: batch ? batch.remaining : null,
            });
        }
        return JSON.stringify({
            id: product.id, name: product.name, quantity: product.quantity,
            unit: product.unit || '', stage: product.stage, sources: sources,
        });
    }

    // The reverse question: which products consumed this batch, and how much each?
    async GetBatchUsage(ctx, batchId) {
        const data = await ctx.stub.getState(batchKey(batchId));
        if (!data || data.length === 0) {
            throw new Error(`Batch ${batchId} does not exist`);
        }
        const batch = JSON.parse(data.toString());
        return JSON.stringify({
            id: batch.id, material: batch.material, quantity: batch.quantity,
            unit: batch.unit, remaining: batch.remaining, usedBy: batch.usedBy,
        });
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
