const express = require('express');
const app = express();

app.use(express.static('public')); // serve static files from /public

// Export the app for Vercel
module.exports = app;

// For local development (npm start)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
}
