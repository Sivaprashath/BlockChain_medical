#!/bin/bash
# Starts Ganache with persistent database & fixed accounts so data is never lost
echo "🚀 Starting Persistent Ganache Blockchain on port 8545..."
echo "📁 Database: ./ganache_data (all records & contracts saved permanently)"
echo "🔑 Mnemonic: candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
echo "--------------------------------------------------------"
ganache --port 8545 --chain.chainId 1337 --database.dbPath ./ganache_data --wallet.mnemonic "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
