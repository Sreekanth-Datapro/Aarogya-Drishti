/**
 * Helmet Content-Security-Policy options.
 * Private patient images render via authenticated blob: object URLs, so img-src
 * must allow blob: — without loosening script/connect/default-src.
 */
module.exports = {
  useDefaults: true,
  directives: {
    imgSrc: ["'self'", "data:", "blob:"],
  },
};
