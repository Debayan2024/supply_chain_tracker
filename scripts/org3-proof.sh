#!/usr/bin/env bash
# Privacy proof: Org3 exists on the network but is NOT a member of supplychannel.
# Run from anywhere. Needs the network, Org3 peer (11051) and couchdb4 (9984) up.
source "$(dirname "$0")/../env.sh"

org3() {
  export CORE_PEER_LOCALMSPID=Org3MSP
  export CORE_PEER_TLS_ROOTCERT_FILE=$TN/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$TN/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp
  export CORE_PEER_ADDRESS=localhost:11051
}
ORDERER_CA=$TN/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem

run() {  # run <description> <command...>   (prints command, output and exit code)
  echo; echo "### $1"; shift
  echo "\$ $*"
  "$@" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^(Error|Channels|\{)|FORBIDDEN|readBlock' | cut -c1-200
  echo "(exit code: ${PIPESTATUS[0]})"
}

echo "=================== ORG3 (not a channel member) ==================="
org3; echo "Acting as Org3MSP via peer0.org3.example.com:11051"
run "1. Channels joined by the Org3 peer (expect none)" peer channel list
run "2. Org3 reads PRD-101 on supplychannel (expect FAILURE)" \
  peer chaincode query -C supplychannel -n supplychain -c '{"function":"GetProduct","Args":["PRD-101"]}'
run "3. Org3 asks the orderer for the channel's newest block (expect Forbidden/denied)" \
  peer channel fetch newest /tmp/org3-fetch.block -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
    -c supplychannel --tls --cafile "$ORDERER_CA"

echo; echo "=================== ORG1 and ORG2 (channel members) ==================="
org1 >/dev/null
run "4. Org1 reads PRD-101 (expect SUCCESS)" \
  peer chaincode query -C supplychannel -n supplychain -c '{"function":"GetProduct","Args":["PRD-101"]}'
org2 >/dev/null
run "5. Org2 reads PRD-101 (expect SUCCESS)" \
  peer chaincode query -C supplychannel -n supplychain -c '{"function":"GetProduct","Args":["PRD-101"]}'

echo; echo "=================== COUCHDB (what each org physically stores) ==================="
echo "Org1 couchdb0 :5984 -> $(curl -s -u admin:adminpw localhost:5984/_all_dbs | tr ',' '\n' | grep -c '^"supplychannel_') supplychannel_* databases (has supplychannel_supplychain: $(curl -s -u admin:adminpw localhost:5984/_all_dbs | grep -c 'supplychannel_supplychain"'))"
echo "Org2 couchdb1 :7984 -> $(curl -s -u admin:adminpw localhost:7984/_all_dbs | tr ',' '\n' | grep -c '^"supplychannel_') supplychannel_* databases"
echo "Org3 couchdb4 :9984 -> $(curl -s -u admin:adminpw localhost:9984/_all_dbs | tr ',' '\n' | grep -c '^"supplychannel_') supplychannel_* databases"
echo "Org3 database list: $(curl -s -u admin:adminpw localhost:9984/_all_dbs)"
