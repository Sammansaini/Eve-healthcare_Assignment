const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  console.log(`Server listening samman saini on http://localhost:${config.port}`);
  console.log(`Samman Saini`);
});
