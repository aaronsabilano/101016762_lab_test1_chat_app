/*

I've marked what requirements are achieved in each block in each file so it is easier for me keep record of what has been completed. 

* Rubric Tags:
* [R2] Working Signup Page (Express API + MongoDB)
* [R3] Working Login/Logout with localStorage session (API side)
* [R4] MongoDB Validation (Mongoose schemas: required + unique username)
* [R5] Room Join/Leave (Socket.io)
* [R6] Typing Indicator for 1-to-1 chat (Socket.io)
* [R7] Chat Functionality with MongoDB Storage + load history 

*/

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");


require("dotenv").config();

// Mongoose models
const User = require("./models/User");                 // [R4]
const GroupMessage = require("./models/GroupMessage"); // [R7]
const PrivateMessage = require("./models/PrivateMessage"); // [R6] (DM storage) 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ------------------------ MIDDLEWARE ------------------------
app.use(cors());
app.use(bodyParser.json());

// -------------------- STATIC FILE SERVING -------------------------
// My HTML pages are in /view 
// My JS is in /public
app.use(express.static(path.join(__dirname, "view")));   // serves /signup.html, /login.html, /chat.html
app.use(express.static(path.join(__dirname, "public"))); // serves /js/chat.js

// ----------------------- MONGODB CONNECTION ---------------------
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://aaronsabi_db_user:496230@comp3123-cluster.g8lk1qf.mongodb.net/";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err.message));

// -------------------- AUTH ROUTES --------------------
/**
* [R2] Working Signup Page
* - POST /signup creates a user in MongoDB using Mongoose
* - Duplicate username errors handled via err.code === 11000 (unique index)

* [R4] MongoDB Validation
* - Schema enforces required fields + unique username (in User model)
*/
app.post("/signup", async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;

    const newUser = new User({ username, firstname, lastname, password });
    await newUser.save();

    return res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    // [R4] Unique username validation (duplicate key error)
    if (err.code === 11000) {
      return res.status(400).json({ error: "Username already exists" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

/*
* [R3] Working Login
* - POST /login validates credentials against MongoDB
* - Returns 200 for valid login, 401 for invalid
* - localStorage session is handled on the frontend, not here
*/
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    return res.status(200).json({ message: "Login successful" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// Quick Sanity check 
app.get("/health", (req, res) => res.json({ status: "OK" }));

// -------------------- SOCKET.IO EVENTS --------------------
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

/**
* [R6] Private chat routing setup
* - Client calls: registerUserSocket({ username })
* - Server joins socket to a personal room: "user:USERNAME"
* - Allows targeted emits to a specific user (DM + typing)
*/
  socket.on("registerUserSocket", ({ username }) => {
    if (!username) return;
    socket.join(`user:${username}`);
  });

/*
* [R5] Room Join
* - socket.join(room) puts the socket into that room

* [R7] Load previous room messages (history)
* - Query last 50 messages for that room from MongoDB
* - Emit roomHistory only to the joining user
*/
  socket.on("joinRoom", async ({ room, username }) => {
    try {
      if (!room || !username) return;

      // [R5] join the Socket.io room
      socket.join(room);

      // [R7] Load message history from MongoDB 
      // (last 50 messages)
      const newestFirst = await GroupMessage.find({ room })
        .sort({ date_sent: -1 })
        .limit(50);

      const history = newestFirst.reverse(); // oldest -> newest for UI

      // [R7] Send the history only to the user who joined
      socket.emit("roomHistory", { room, history });

      //  message broadcast
      socket.to(room).emit("groupMessage", {
        room,
        username: "SYSTEM",
        message: `${username} joined the room.`,
        date_sent: new Date(),
      });
    } catch (err) {
      console.log("joinRoom error:", err.message);
    }
  });

/*
* [R5] Room Leave
* - socket.leave(room) removes socket from that room
*/
  socket.on("leaveRoom", ({ room, username }) => {
    try {
      if (!room || !username) return;

      // [R5] leave the Socket.io room
      socket.leave(room);

      // another message broadcast
      socket.to(room).emit("groupMessage", {
        room,
        username: "SYSTEM",
        message: `${username} left the room.`,
        date_sent: new Date(),
      });
    } catch (err) {
      console.log("leaveRoom error:", err.message);
    }
  });

  /**
   * [R7] Group Chat + MongoDB Storage 
   * - Saves each message as a GroupMessage document in MongoDB
   * - Broadcasts message to everyone in that room
   */
  socket.on("groupMessage", async ({ room, username, message }) => {
    try {
      if (!room || !username || !message) return;

      // [R7] Save to MongoDB
      const msgDoc = await GroupMessage.create({
        from_user: username,
        room,
        message,
        date_sent: new Date(),
      });

      // [R7] Broadcast to entire room
      io.to(room).emit("groupMessage", {
        room,
        username,
        message,
        date_sent: msgDoc.date_sent,
      });
    } catch (err) {
      console.log("groupMessage save error:", err.message);
    }
  });

  
// Load Private History
  socket.on("loadPrivateHistory", async ({ from, to }) => {
    try {
      if (!from || !to) return;

      const newestFirst = await PrivateMessage.find({
        $or: [
          { from_user: from, to_user: to },
          { from_user: to, to_user: from },
        ],
      })
        .sort({ date_sent: -1 })
        .limit(50);

      const history = newestFirst.reverse();

      socket.emit("privateHistory", { withUser: to, history });
    } catch (err) {
      console.log("loadPrivateHistory error:", err.message);
    }
  });

/*
* [R6] Typing Indicator (1-to-1 chat)
* - Client emits: privateTyping({ from, to, isTyping })
* - Server forwards it ONLY to the recipient’s personal room
*/
  socket.on("privateTyping", ({ from, to, isTyping }) => {
    if (!from || !to) return;

    io.to(`user:${to}`).emit("privateTyping", {
      from,
      isTyping: !!isTyping,
    });
  });

/*
* Private Message + DB storage
* - Stores DM messages in MongoDB
* - Sends message to both sender and receiver via personal rooms
*/
  socket.on("privateMessage", async ({ from, to, message }) => {
    try {
      if (!from || !to || !message) return;

      const pm = await PrivateMessage.create({
        from_user: from,
        to_user: to,
        message,
        date_sent: new Date(),
      });

      const payload = {
        from,
        to,
        message,
        date_sent: pm.date_sent,
      };

      io.to(`user:${to}`).emit("privateMessage", payload);
      io.to(`user:${from}`).emit("privateMessage", payload);
    } catch (err) {
      console.log("privateMessage save error:", err.message);
    }
  });
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});