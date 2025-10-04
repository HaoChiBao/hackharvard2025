// Shared storage for the application
const localStorage = require('./localStorage');

module.exports = {
  merchants: localStorage.merchants,
  apiKeys: localStorage.apiKeys,
  localStorage
};
