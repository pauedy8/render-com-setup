const { Server } = require("ws");
const port = process.env.PORT || 3000;
const wss = new Server({ port }, () => console.log(`Server running on port ${port}`));
const rooms = {};

wss.on("connection", (ws) => {
  let currentRoom = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === "handshake") {
        currentRoom = msg.project_id;
        if (!rooms[currentRoom]) rooms[currentRoom] = new Set();
        rooms[currentRoom].add(ws);
      } else if (currentRoom && rooms[currentRoom]) {
        for (const client of rooms[currentRoom]) {
          if (client !== ws && client.readyState === 1) {
            client.send(data.toString());
          }
        }
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].delete(ws);
    }
  });
});
