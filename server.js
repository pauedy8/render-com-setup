// Example server for the Cloud Rooms extension.
// Deploy this as a Node "Web Service" on Render (render-com-setup.onrender.com
// or whatever your service is named) and it will make the presence
// blocks work correctly, including reliably removing users who close
// the tab, lose network, or crash — because it tracks presence off the
// SOCKET CONNECTION itself, not off any message the client sends.
//
// Setup:
//   npm init -y
//   npm install ws
//   node server.js
// On Render: set the start command to "node server.js" and make sure
// your package.json has "ws" as a dependency.

const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

// room name -> Map(socket -> username)
const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function broadcastRoomState(roomName) {
  const room = rooms.get(roomName);
  if (!room) return;
  const users = Array.from(room.values());
  const payload = JSON.stringify({ type: "room_state", room: roomName, users });
  for (const socket of room.keys()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

function removeSocketFromRoom(socket, roomName) {
  const room = rooms.get(roomName);
  if (!room) return;
  if (room.delete(socket)) {
    broadcastRoomState(roomName);
  }
  if (room.size === 0) {
    rooms.delete(roomName);
  }
}

wss.on("connection", (socket) => {
  // Track which rooms this particular socket has joined, so we can
  // clean all of them up in one shot when it disconnects.
  socket.joinedRooms = new Set();

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return; // ignore malformed messages
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "room_join" && typeof msg.room === "string" && typeof msg.user === "string") {
      const room = getRoom(msg.room);
      room.set(socket, msg.user);
      socket.joinedRooms.add(msg.room);
      broadcastRoomState(msg.room);
    }

    if (msg.type === "room_leave" && typeof msg.room === "string") {
      socket.joinedRooms.delete(msg.room);
      removeSocketFromRoom(socket, msg.room);
    }

    // --- Cloud Lists protocol support (from the earlier extension) ---
    if (msg.type === "join" && typeof msg.list === "string") {
      const value = getList(msg.list);
      socket.send(JSON.stringify({ type: "state", list: msg.list, value }));
    }
    if (msg.type === "update" && typeof msg.list === "string" && Array.isArray(msg.value)) {
      lists.set(msg.list, msg.value);
      broadcastList(msg.list, socket);
    }
  });

  // THIS is the reliable part: the "close" event fires whenever the
  // underlying TCP/WebSocket connection goes away, for ANY reason —
  // clean tab close, browser crash, force-quit, lost wifi, phone
  // locked and OS killed the background tab, etc. No cooperation from
  // the client is required for this to fire.
  socket.on("close", () => {
    for (const room of socket.joinedRooms) {
      removeSocketFromRoom(socket, room);
    }
  });
});

// --- Cloud Lists support (matches the cloud-lists.js extension) ---
const lists = new Map(); // listName -> array
const listSubscribers = new Map(); // listName -> Set(socket)

function getList(name) {
  if (!lists.has(name)) lists.set(name, []);
  return lists.get(name);
}

function broadcastList(name, exceptSocket) {
  const value = getList(name);
  const payload = JSON.stringify({ type: "state", list: name, value });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

console.log(`Cloud server listening on port ${PORT}`);
