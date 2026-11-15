#!/usr/bin/env bash
# End-to-end checklist. Prints PASS/FAIL per check and exits non-zero if any fail.
# Needs: network up, chaincode v2.0 deployed, API running on :3000, Org3 peer up.
# Each run creates NEW ids (timestamp suffix), so it can be repeated; the test data stays on the ledger.
API=http://localhost:3000/api
T=$(date +%s)
BATCH=T-BATCH-$T
PROD=T-PROD-$T
FAILS=0; TOTAL=0

req() {  # req METHOD path [json]  -> sets CODE and BODY
  local out
  if [ "$1" = POST ]; then out=$(curl -s -w '\n%{http_code}' -X POST "$API$2" -H 'Content-Type: application/json' -d "$3")
  else out=$(curl -s -w '\n%{http_code}' "$API$2"); fi
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
check() {  # check "description" <condition exit code>
  TOTAL=$((TOTAL+1))
  if [ "$2" -eq 0 ]; then echo "PASS  $1"; else echo "FAIL  $1"; echo "      HTTP $CODE  $BODY" | cut -c1-300; FAILS=$((FAILS+1)); fi
}
jqt() { echo "$BODY" | jq -e "$1" >/dev/null 2>&1; }   # jq test on last response body

echo "Running checklist (batch $BATCH, product $PROD)"; echo

req GET /products
[ "$CODE" = 200 ] && jqt 'length >= 3 and all(.[]; .id | startswith("BATCH_") | not)'
check "list products (200, at least 3 products, no batches mixed in)" $?

req POST /batches "{\"org\":\"org2\",\"id\":\"$BATCH\",\"material\":\"Cotton\",\"quantity\":100,\"unit\":\"kg\",\"supplier\":\"TestSupplier\"}"
[ "$CODE" = 400 ] && jqt '.error | test("Only Org1")'
check "Org2 cannot create a batch (rejected)" $?

req POST /batches "{\"org\":\"org1\",\"id\":\"$BATCH\",\"material\":\"Cotton\",\"quantity\":100,\"unit\":\"kg\",\"supplier\":\"TestSupplier\"}"
[ "$CODE" = 200 ] && jqt '.remaining == 100'
check "create batch (100 kg, remaining 100)" $?

req POST /batches "{\"org\":\"org1\",\"id\":\"$BATCH\",\"material\":\"Cotton\",\"quantity\":100,\"unit\":\"kg\",\"supplier\":\"TestSupplier\"}"
[ "$CODE" = 400 ] && jqt '.error | test("already exists")'
check "duplicate batch id rejected" $?

req POST /products "{\"org\":\"org1\",\"id\":\"$PROD\",\"name\":\"Test Shirt\",\"quantity\":10,\"unit\":\"pcs\",\"sources\":[{\"batchId\":\"$BATCH\",\"used\":40}]}"
[ "$CODE" = 200 ] && jqt '.stage == "RAW_MATERIAL" and (.sources | length) == 1'
check "create product with sources (uses 40 kg)" $?

req GET /batches/$BATCH
[ "$CODE" = 200 ] && jqt '.remaining == 60 and .usedBy[0].productId == "'$PROD'"'
check "batch remaining reduced to 60 and records the product" $?

req POST /products "{\"org\":\"org1\",\"id\":\"$PROD-X\",\"name\":\"Greedy\",\"quantity\":1,\"unit\":\"pcs\",\"sources\":[{\"batchId\":\"$BATCH\",\"used\":70}]}"
[ "$CODE" = 400 ] && jqt '.error | test("only 60")'
check "over-use rejected (70 kg requested, 60 remain)" $?

req GET /batches/$BATCH
[ "$CODE" = 200 ] && jqt '.remaining == 60'
check "rejected over-use left the batch unchanged" $?

req POST /products/$PROD/stage '{"org":"org1","stage":"FINISHED_GOODS","note":"skip"}'
[ "$CODE" = 400 ] && jqt '.error | test("Cannot move")'
check "stage rule: skipping a stage rejected" $?

req POST /products/$PROD/stage '{"org":"org2","stage":"SEMI_FINISHED","note":"wrong org"}'
[ "$CODE" = 400 ] && jqt '.error | test("not allowed")'
check "stage rule: wrong org rejected" $?

req POST /products/$PROD/stage '{"org":"org1","stage":"SEMI_FINISHED","note":"valid move"}'
[ "$CODE" = 200 ] && jqt '.stage == "SEMI_FINISHED"'
check "stage rule: valid move accepted" $?

req GET /products/$PROD/history
[ "$CODE" = 200 ] && jqt 'length == 2 and .[0].stage == "SEMI_FINISHED"'
check "history shows only the 2 successful transactions" $?

req GET /products/$PROD/lineage
[ "$CODE" = 200 ] && jqt '.sources[0].batchId == "'$BATCH'" and .sources[0].supplier == "TestSupplier" and .sources[0].used == 40'
check "lineage shows batch, supplier and amount used" $?

# Org3 is not a channel member: reading supplychannel through its peer must fail.
OUT=$(source "$(dirname "$0")/../env.sh"
  export CORE_PEER_LOCALMSPID=Org3MSP
  export CORE_PEER_TLS_ROOTCERT_FILE=$TN/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$TN/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp
  export CORE_PEER_ADDRESS=localhost:11051
  peer chaincode query -C supplychannel -n supplychain -c '{"function":"GetProduct","Args":["PRD-101"]}' 2>&1)
RC=$?
CODE=$RC; BODY=$(echo "$OUT" | grep -E '^Error' | head -1)
[ $RC -ne 0 ] && echo "$OUT" | grep -q "not found"
check "Org3 cannot read supplychannel (channel not found)" $?

echo; echo "$((TOTAL-FAILS)) of $TOTAL checks passed"
[ $FAILS -eq 0 ] && echo "ALL PASS" || echo "$FAILS FAILED"
exit $FAILS
