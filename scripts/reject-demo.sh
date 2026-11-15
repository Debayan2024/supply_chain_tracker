#!/usr/bin/env bash
# Shows that the business rules live in the chaincode: bad requests are rejected
# at endorsement and never reach the ledger. The API must be running.
# Usage: scripts/reject-demo.sh [PRODUCT_ID]   (use a NEW id each run; default PRD-900)
API=http://localhost:3000/api
ID=${1:-PRD-900}

call() {  # call <label> <expectation> <METHOD> <path> [json body]
  echo "=== $1"
  echo "Expect: $2"
  if [ "$3" = POST ]; then
    echo "Request:  POST $4  $5"
    out=$(curl -s -w '\n%{http_code}' -X POST "$API$4" -H 'Content-Type: application/json' -d "$5")
  else
    echo "Request:  GET $4"
    out=$(curl -s -w '\n%{http_code}' "$API$4")
  fi
  echo "HTTP:     ${out##*$'\n'}"
  echo "Response: $(echo "${out%$'\n'*}" | jq -c .)"
  echo
}

call "1. Org2 tries to create a product" "REJECTED (only Org1MSP may create)" \
  POST /products "{\"org\":\"org2\",\"id\":\"$ID\",\"name\":\"Rejection Test Shirt\",\"quantity\":10,\"unit\":\"pcs\"}"
call "2. Org1 creates $ID (control case)" "SUCCESS" \
  POST /products "{\"org\":\"org1\",\"id\":\"$ID\",\"name\":\"Rejection Test Shirt\",\"quantity\":10,\"unit\":\"pcs\"}"
call "3. Org1 creates $ID again" "REJECTED (duplicate id)" \
  POST /products "{\"org\":\"org1\",\"id\":\"$ID\",\"name\":\"Rejection Test Shirt\",\"quantity\":10,\"unit\":\"pcs\"}"
call "4. Org1 skips RAW_MATERIAL -> FINISHED_GOODS" "REJECTED (no skipping stages)" \
  POST /products/$ID/stage '{"org":"org1","stage":"FINISHED_GOODS","note":"skip attempt"}'
call "5. Org2 moves $ID to SEMI_FINISHED" "REJECTED (stage belongs to Org1)" \
  POST /products/$ID/stage '{"org":"org2","stage":"SEMI_FINISHED","note":"wrong org"}'
call "6. Org1 moves $ID to SEMI_FINISHED" "SUCCESS" \
  POST /products/$ID/stage '{"org":"org1","stage":"SEMI_FINISHED","note":"Correct move"}'
call "7. History of $ID" "ONLY the 2 successful events (created, SEMI_FINISHED); no trace of rejected attempts" \
  GET /products/$ID/history
