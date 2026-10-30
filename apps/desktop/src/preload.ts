// The shop page gets nothing from the desktop app for now: this preload exposes no API.
// It stays (rather than being dropped from the window options) so the sandboxed preload wiring in
// main.ts and window.ts, and the bundling step that produces preload.js, stay valid for the day a
// bridge is needed again. Do not add an API here without an origin check in the main process.
export {}
