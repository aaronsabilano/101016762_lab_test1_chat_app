// public/js/chat.js
// Purpose: Client-side logic for group chat + private chat using Socket.io

document.addEventListener("DOMContentLoaded", () => {
  // ------------------------------------------------------------
  // [R3] Login/Logout with localStorage session 
  // - chat page must not work unless user is logged in
  // - treat localStorage.username as the "session"
  // ------------------------------------------------------------
  const username = localStorage.getItem("username");
  if (!username) {
    window.location.href = "/login.html";
    return;
  }

  // ------------------------------------------------------------
  // Socket.io connection
  // ------------------------------------------------------------
  const socket = io();

  // ------------------------------------------------------------
  // [R6] + [Private Chat Support]
  // - register this socket under a personal room: "user:USERNAME"
  // - lets server route typing + private messages reliably
  // ------------------------------------------------------------
  socket.emit("registerUserSocket", { username });

  // ------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------
  const currentUserSpan = document.getElementById("currentUser");
  const messagesDiv = document.getElementById("messages");
  const roomInput = document.getElementById("roomInput");
  const joinBtn = document.getElementById("joinBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const chatForm = document.getElementById("chatForm");
  const messageInput = document.getElementById("messageInput");
  const logoutBtn = document.getElementById("logoutBtn");
  const currentRoomLabel = document.getElementById("currentRoomLabel");

  // Private chat
  const toUserInput = document.getElementById("toUserInput");
  const openDmBtn = document.getElementById("openDmBtn");
  const privateMessagesDiv = document.getElementById("privateMessages");
  const privateForm = document.getElementById("privateForm");
  const privateInput = document.getElementById("privateInput");
  const typingIndicator = document.getElementById("typingIndicator");

  currentUserSpan.textContent = username;

  // ------------------------------------------------------------
  // Client state
  // ------------------------------------------------------------
  let currentRoom = null;     // which room the user is currently viewing
  let currentDmUser = null;   // which user the DM panel is currently opened with
  let typingTimeout = null;

  // ------------------------------------------------------------
  // Helpers for UI rendering
  // ------------------------------------------------------------
  function formatTime(dateLike) {
    try {
      const d = new Date(dateLike);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function clearGroupMessages() {
    messagesDiv.innerHTML = "";
  }

  function addGroupMessage(fromUser, room, message, dateSent = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg";

    const meta = document.createElement("div");
    meta.className = "meta";
    const t = dateSent ? ` • ${formatTime(dateSent)}` : "";
    meta.textContent = `[${room}] ${fromUser}${t}`;

    const body = document.createElement("div");
    body.textContent = message;

    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function clearPrivateMessages() {
    privateMessagesDiv.innerHTML = "";
  }

  function addPrivateMessage(from, to, message, dateSent = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg";

    const meta = document.createElement("div");
    meta.className = "meta";
    const t = dateSent ? ` • ${formatTime(dateSent)}` : "";
    const direction = from === username ? `You → ${to}` : `${from} → You`;
    meta.textContent = `${direction}${t}`;

    const body = document.createElement("div");
    body.textContent = message;

    wrapper.appendChild(meta);
    wrapper.appendChild(body);
    privateMessagesDiv.appendChild(wrapper);
    privateMessagesDiv.scrollTop = privateMessagesDiv.scrollHeight;
  }

  function setCurrentRoom(roomOrNull) {
    currentRoom = roomOrNull;
    currentRoomLabel.textContent = currentRoom ? currentRoom : "None";
  }

  // ------------------------------------------------------------
  // [R5] Room Join/Leave
  // ------------------------------------------------------------
  function joinRoom(room) {
    if (!room) return;

    // If user switches rooms, leave the previous room first
    if (currentRoom && currentRoom !== room) {
      socket.emit("leaveRoom", { room: currentRoom, username }); // [R5]
    }

    // Update UI/state
    setCurrentRoom(room);
    clearGroupMessages();

    // Tell server to join the Socket.io room
    socket.emit("joinRoom", { room, username }); // [R5]

    addGroupMessage("SYSTEM", room, `You joined room: ${room}`);
  }

  function leaveRoom(room) {
    if (!room) return;

    socket.emit("leaveRoom", { room, username }); // [R5]

    // If leaving active room, clear state so user can’t send by accident
    if (currentRoom === room) {
      addGroupMessage("SYSTEM", room, `You left room: ${room}`);
      setCurrentRoom(null);
    } else {
      addGroupMessage("SYSTEM", room, `You left room: ${room}`);
    }
  }

  joinBtn.addEventListener("click", () => joinRoom(roomInput.value.trim()));
  leaveBtn.addEventListener("click", () => leaveRoom(roomInput.value.trim()));

  // ------------------------------------------------------------
  // [R7] Load previous room messages from MongoDB when joining (history)
  // - server emits: roomHistory { room, history }
  // - client renders messages into the UI
  // ------------------------------------------------------------
  socket.on("roomHistory", ({ room, history }) => {
    // Only show history for the room user is currently viewing
    if (!room || room !== currentRoom) return;

    clearGroupMessages();

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((m) => {
        addGroupMessage(m.from_user, m.room, m.message, m.date_sent); // [R7]
      });
    } else {
      addGroupMessage("SYSTEM", room, "No previous messages in this room yet."); // [R7]
    }
  });

  // ------------------------------------------------------------
  // [R7] Receive live room messages (broadcasted by server)
  // ------------------------------------------------------------
  socket.on("groupMessage", (data) => {
    if (!data?.room) return;
    if (data.room !== currentRoom) return; // only show current room messages

    addGroupMessage(data.username, data.room, data.message, data.date_sent); // [R7]
  });

  // ------------------------------------------------------------
  // [R7] Send room messages (server saves to MongoDB and broadcasts)
  // ------------------------------------------------------------
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (!message) return;

    if (!currentRoom) {
      alert("Join a room first.");
      return;
    }

    socket.emit("groupMessage", { room: currentRoom, username, message }); // [R7]
    messageInput.value = "";
  });

  // ------------------------------------------------------------
  // PRIVATE CHAT 
  // ------------------------------------------------------------

  // Open a DM thread
  openDmBtn.addEventListener("click", () => {
    const to = toUserInput.value.trim();
    if (!to) return;

    if (to === username) {
      alert("Pick a different username (not yourself).");
      return;
    }

    currentDmUser = to;
    typingIndicator.textContent = `DM with: ${currentDmUser}`;
    clearPrivateMessages();

    //  Ask server for DM history
    socket.emit("loadPrivateHistory", { from: username, to: currentDmUser });
  });

  // Receive DM history
  socket.on("privateHistory", ({ withUser, history }) => {
    if (!withUser || withUser !== currentDmUser) return;

    clearPrivateMessages();

    if (Array.isArray(history) && history.length > 0) {
      history.forEach((m) => {
        addPrivateMessage(m.from_user, m.to_user, m.message, m.date_sent);
      });
    } else {
      addPrivateMessage("SYSTEM", username, `No previous DM messages with ${withUser}.`);
    }
  });

  // Send a DM message
  privateForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const msg = privateInput.value.trim();
    if (!msg) return;

    if (!currentDmUser) {
      alert("Open a DM first (enter a username and click Open DM).");
      return;
    }

    socket.emit("privateMessage", { from: username, to: currentDmUser, message: msg });
    privateInput.value = "";
  });

  // Receive a DM message
  socket.on("privateMessage", (payload) => {
    if (!payload?.from || !payload?.to) return;
    if (!currentDmUser) return;

    const isForThisDm =
      (payload.from === username && payload.to === currentDmUser) ||
      (payload.from === currentDmUser && payload.to === username);

    if (!isForThisDm) return;

    addPrivateMessage(payload.from, payload.to, payload.message, payload.date_sent);
  });

  // ------------------------------------------------------------
  // [R6] Typing indicator 
  // - When user types in DM input, emit "privateTyping"
  // - Other user sees "X is typing..."
  // ------------------------------------------------------------
  privateInput.addEventListener("input", () => {
    if (!currentDmUser) return;

    // Start typing
    socket.emit("privateTyping", { from: username, to: currentDmUser, isTyping: true }); // [R6]

    // Stop typing after user pauses
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("privateTyping", { from: username, to: currentDmUser, isTyping: false }); // [R6]
    }, 800);
  });

  socket.on("privateTyping", ({ from, isTyping }) => {
    if (!currentDmUser || from !== currentDmUser) return;

    typingIndicator.textContent = isTyping
      ? `${currentDmUser} is typing...` // [R6]
      : `DM with: ${currentDmUser}`;
  });

  // ------------------------------------------------------------
  // [R3] Logout clears localStorage session and redirects
  // ------------------------------------------------------------
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("username"); // [R3]
    window.location.href = "/login.html"; // [R3]
  });

  // ------------------------------------------------------------
  // Auto-join default room 
  // ------------------------------------------------------------
  const defaultRoom = roomInput.value.trim() || "general";
  joinRoom(defaultRoom);
});