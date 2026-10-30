// The shell bundles all its code into dist/ and has no runtime dependencies. Answering false tells
// electron-builder that node_modules is handled elsewhere. Without this it falls back to the workspace
// root and packs every dependency of the web and the API (200 MB) into the app.
module.exports = async function beforeBuild() {
  return false
}
