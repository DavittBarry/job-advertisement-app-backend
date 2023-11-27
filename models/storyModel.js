const mongoose = require("mongoose");

const storySchema = new mongoose.Schema({
  Name: {
    type: String,
    required: true,
  },
  jobTitle: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  story: {
    type: String,
    required: true,
  },
  postedDate: {
    type: Date,
    default: Date.now,
  },
  imageUrl: {
    type: String,
    required: true,
  },
});

const Story = mongoose.model("Story", storySchema);

module.exports = Story;
