// models/User.js
// Purpose: Defines the MongoDB "User" collection and enforces validation rules.

const mongoose = require("mongoose");

/*
 * REQUIREMENT FULFILLED:
 * MongoDB Validation 
 * - required: true ensures fields must exist
 * - unique: true ensures usernames are unique (creates a unique index)
 * - trim: true removes accidental spaces that cause duplicate-like usernames
*/
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true }, // [R4]
  firstname: { type: String, required: true, trim: true },              // [R4]
  lastname: { type: String, required: true, trim: true },               // [R4]
  password: { type: String, required: true },                           // [R4]
  createon: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);