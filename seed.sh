#!/usr/bin/env bash
# Creates demo data through the API (the API must be running): 3 raw batches and 3 products
# built from them, left at different stages. Safe to run twice: existing ids are reported
# as "already exists" and skipped. (Older PRD-101..103 from chaincode v1 have no lineage.)
API=http://localhost:3000/api
post() { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -d "$2" | jq -c 'if .error then {error} else {id,stage,remaining} | with_entries(select(.value != null)) end'; }
stage() { echo -n "  $1 -> $3: "; post "/products/$1/stage" "{\"org\":\"$2\",\"stage\":\"$3\",\"note\":\"$4\"}"; }

echo "== Raw batches (Org1)"
post /batches '{"org":"org1","id":"B-COT-S1","material":"Cotton","quantity":500,"unit":"kg","supplier":"GreenFarm Ltd"}'
post /batches '{"org":"org1","id":"B-DYE-S1","material":"Dye","quantity":50,"unit":"l","supplier":"ColorWorks"}'
post /batches '{"org":"org1","id":"B-THR-S1","material":"Thread","quantity":200,"unit":"spool","supplier":"SpinCo"}'

echo "== PRD-201 Cotton T-Shirt: stays at SEMI_FINISHED"
post /products '{"org":"org1","id":"PRD-201","name":"Cotton T-Shirt","quantity":100,"unit":"pcs","sources":[{"batchId":"B-COT-S1","used":60},{"batchId":"B-DYE-S1","used":5},{"batchId":"B-THR-S1","used":10}]}'
stage PRD-201 org1 SEMI_FINISHED  "Cotton spun and dyed"

echo "== PRD-202 Denim Jacket: goes up to WAREHOUSE"
post /products '{"org":"org1","id":"PRD-202","name":"Denim Jacket","quantity":30,"unit":"pcs","sources":[{"batchId":"B-COT-S1","used":120},{"batchId":"B-THR-S1","used":20}]}'
stage PRD-202 org1 SEMI_FINISHED  "Denim woven"
stage PRD-202 org1 FINISHED_GOODS "Jackets stitched"
stage PRD-202 org2 WAREHOUSE      "Stored in rack B4"

echo "== PRD-203 Canvas Bag: full journey to SOLD"
post /products '{"org":"org1","id":"PRD-203","name":"Canvas Bag","quantity":50,"unit":"pcs","sources":[{"batchId":"B-COT-S1","used":40},{"batchId":"B-DYE-S1","used":3},{"batchId":"B-THR-S1","used":5}]}'
stage PRD-203 org1 SEMI_FINISHED  "Canvas woven"
stage PRD-203 org1 FINISHED_GOODS "Bags sewn"
stage PRD-203 org2 WAREHOUSE      "Received at central warehouse"
stage PRD-203 org2 DISTRIBUTION   "Dispatched by truck"
stage PRD-203 org2 RETAIL         "On shelf at city store"
stage PRD-203 org2 SOLD           "Sold to customer"
