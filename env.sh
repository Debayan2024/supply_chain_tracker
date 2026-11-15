export TN=$HOME/fabric3/fabric-samples/test-network
export PATH=$TN/../bin:$PATH
export FABRIC_CFG_PATH=$TN/../config/
export CORE_PEER_TLS_ENABLED=true

org1() {
  export CORE_PEER_LOCALMSPID=Org1MSP
  export CORE_PEER_TLS_ROOTCERT_FILE=$TN/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$TN/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
  export CORE_PEER_ADDRESS=localhost:7051
  echo "Now acting as Org1"
}

org2() {
  export CORE_PEER_LOCALMSPID=Org2MSP
  export CORE_PEER_TLS_ROOTCERT_FILE=$TN/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$TN/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
  export CORE_PEER_ADDRESS=localhost:9051
  echo "Now acting as Org2"
}

invoke() {
  peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls \
    --cafile "$TN/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem" \
    -C supplychannel -n supplychain \
    --peerAddresses localhost:7051 --tlsRootCertFiles "$TN/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem" \
    --peerAddresses localhost:9051 --tlsRootCertFiles "$TN/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem" \
    -c "$1"
}

query() {
  peer chaincode query -C supplychannel -n supplychain -c "$1"
}
