const express = require('express');
const path = require('path');
const app = express();

// Serve all static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: send index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
