const express = require('express')
const app = express()
app.use(express.static('public')) //serve our files in public statically
app.listen(3000, () => console.log('Server started on http://localhost:3000'))