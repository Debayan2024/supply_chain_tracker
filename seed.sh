#!/usr/bin/env bash
# Re-creates demo products through the API (the API must be running).
API=http://localhost:3000/api
post() { curl -s -X POST "$API$1" -H 'Content-Type: application/json' -d "$2" | jq -c 'if .error then {error} else {id,stage} end'; }
stage() { post "/products/$1/stage" "{\"org\":\"$2\",\"stage\":\"$3\",\"note\":\"$4\"}"; }

post /products '{"org":"org1","id":"PRD-101","name":"Cotton T-Shirt","quantity":100}'
stage PRD-101 org1 SEMI_FINISHED   "Cotton spun into fabric"
stage PRD-101 org1 FINISHED_GOODS  "T-shirts stitched"
stage PRD-101 org2 WAREHOUSE       "Stored in rack B4"

post /products '{"org":"org1","id":"PRD-102","name":"Wool Sweater","quantity":50}'
stage PRD-102 org1 SEMI_FINISHED   "Wool spun"
stage PRD-102 org1 FINISHED_GOODS  "Sweaters knitted"
stage PRD-102 org2 WAREHOUSE       "Received at central warehouse"
stage PRD-102 org2 DISTRIBUTION    "Dispatched by truck"
stage PRD-102 org2 RETAIL          "On shelf at city store"
stage PRD-102 org2 SOLD            "Sold to customer"

post /products '{"org":"org1","id":"PRD-103","name":"Denim Jacket","quantity":30}'
stage PRD-103 org1 SEMI_FINISHED   "Denim woven"
