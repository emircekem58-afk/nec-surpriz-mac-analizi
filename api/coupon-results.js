module.exports = async function handler(req, res) {
  req.query = { ...(req.query || {}), route: 'coupon-results' };
  return require('./v7')(req, res);
};
