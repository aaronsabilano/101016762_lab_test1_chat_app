// models/GroupMessage.js
// Purpose: Defines the MongoDB collection used to store ROOM (group) chat messages.

const mongoose = require("mongoose");

/*
 * REQUIREMENT FULFILLED:
 *  Chat Functionality with MongoDB Storage 
 * - Every room message gets saved as a document in MongoDB.
 * - required: true ensures we never store incomplete messages.
*/
const GroupMessageSchema = new mongoose.Schema({
  from_user: { type: String, required: true }, // [R7]
  room: { type: String, required: true },      // [R7]
  message: { type: String, required: true },   // [R7]
  date_sent: { type: Date, default: Date.now } // [R7]
});

module.exports = mongoose.model("GroupMessage", GroupMessageSchema);