// Bootstrap: temporarily import the legacy app.js to keep behavior, then progressively migrate
import '../app.js';

// Expose app global if legacy code relies on it
// Note: In the current app.js, it creates `const app = new SharePointManager();` at the end.
// If needed, we can attach to window here, but we'll keep the legacy behavior intact for now.
