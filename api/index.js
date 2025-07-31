// api/index.js
const express = require('express');
const app = express();

app.get('/api/test', (req, res) => {
  res.json({ msg: 'Vercel working!' });
});

module.exports = app;