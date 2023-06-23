const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  // Set the response headers
  res.setHeader('Content-Type', 'text/html');
  
  // Handle different routes/endpoints
  if (req.url === '/') {
    // Serve the index.html file
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.statusCode = 200;
        res.end(data);
      }
    });
  } else {
    // Handle other endpoints
    res.statusCode = 404;
    res.end('Not Found');
  }
});

// Start the server
const port = 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
