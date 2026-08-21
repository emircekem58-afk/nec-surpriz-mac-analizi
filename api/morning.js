module.exports = async function handler(req, res) {
  req.query = { ...(req.query || {}), route: 'morning' };
  return require('./v7')(req, res);
};
