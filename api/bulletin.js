module.exports = async function handler(req, res) {
  req.query = { ...(req.query || {}), route: 'bulletin' };
  return require('./v7')(req, res);
};
