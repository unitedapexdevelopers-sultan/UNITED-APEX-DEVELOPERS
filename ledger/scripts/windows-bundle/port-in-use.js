const net = require("net");
const port = process.env.PORT || 47831;

const socket = net.createConnection(port, "127.0.0.1");
const timer = setTimeout(() => {
  socket.destroy();
  process.exit(1);
}, 1000);

socket.on("connect", () => {
  clearTimeout(timer);
  socket.destroy();
  process.exit(0);
});

socket.on("error", () => {
  clearTimeout(timer);
  process.exit(1);
});
