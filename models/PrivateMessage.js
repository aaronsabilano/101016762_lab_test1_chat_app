// models/PrivateMessage.js
// Purpose: Defines the MongoDB collection used for 1-to-1 (DM) messages.

const mongoose = require("mongoose");

/*
REQUIREMENT FULFILLED:
- Typing Indicator is NOT stored in DB (it’s live socket events)
- DB Storage applies to chat messages; for DMs we also store messages here.
*/
const PrivateMessageSchema = new mongoose.Schema({
  from_user: { type: String, required: true }, // supports 1-to-1 message storage
  to_user: { type: String, required: true },
  message: { type: String, required: true },
  date_sent: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PrivateMessage", PrivateMessageSchema);