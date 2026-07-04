const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude parent project node_modules from file indexing on Windows
config.resolver.blockList = [
  /node_modules\/.*\/node_modules/,
  /dazzling-bose[\\/]node_modules/
];

module.exports = config;
