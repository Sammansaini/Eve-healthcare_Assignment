const express = require('express');
const authRoutes = require('./routes/auth');
const centreRoutes = require('./routes/centres');
const testRoutes = require('./routes/tests');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/centres', centreRoutes);
app.use('/tests', testRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Must be registered last. It only runs when a route calls next(err).
app.use(errorHandler);

module.exports = app;
