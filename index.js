require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.VUE_APP_GOOGLE_CLIENT_ID);

const User = require("./models/userModel");
const Job = require("./models/jobModel");

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const verifyToken = (req, res, next) => {
  const token = req.header("auth-token");
  if (!token) return res.status(401).send("Access Denied");

  try {
    const verified = jwt.verify(token, process.env.SECRET_KEY);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).send("Invalid Token");
  }
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/register", async (req, res) => {
  const { username, password, email } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).send("Username or email already exists.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    const savedUser = await newUser.save();

    const token = jwt.sign(
      { _id: savedUser._id, username: savedUser.username },
      process.env.SECRET_KEY,
      { expiresIn: "1d" },
    );

    res.status(201).json({ token: token, username: savedUser.username });
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred during registration.");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      throw new Error("Invalid username or password");
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error("Invalid username or password");
    }

    const token = jwt.sign(
      { _id: user._id, username: user.username },
      process.env.SECRET_KEY,
    );
    res.json({ token: token, username: user.username });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/google-sign-in", async (req, res) => {
  try {
    const { idToken } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.VUE_APP_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const userid = payload["sub"];
    const username = payload["name"] || payload["email"].split("@")[0];

    let user = await User.findOne({ googleId: userid });
    if (!user) {
      user = new User({
        username: username,
        email: payload["email"],
        googleId: userid,
      });
      await user.save();
    }

    const token = jwt.sign(
      { _id: user._id, username: user.username },
      process.env.SECRET_KEY,
    );
    res.json({
      token: token,
      username: user.username,
    });
  } catch (error) {
    console.error("Error during Google sign-in:", error);
    res.status(500).send("An error occurred during Google sign-in.");
  }
});

app.post("/api/jobEntries", verifyToken, async (req, res) => {
  try {
    const jobData = {
      title: req.body.title,
      company: req.body.company,
      location: req.body.location,
      description: req.body.description,
      employmentType: req.body.employmentType,
      postedDate: req.body.postedDate,
      applyLink: req.body.applyLink,
      postedBy: req.user._id,
    };

    const newJob = new Job(jobData);
    await newJob.save();

    res.status(201).json(newJob);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("An error occurred while posting the job advertisement.");
  }
});

// Get posts from the logged-in user
app.get("/user/posts", verifyToken, async (req, res) => {
  try {
    const userJobEntries = await Job.find({ postedBy: req.user._id });
    res.json(userJobEntries);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("An error occurred while fetching the user's job posts.");
  }
});

app.get("/api/jobEntries", async (req, res) => {
  try {
    let query = {};
    if (req.query.employmentType && req.query.employmentType !== "All") {
      query.employmentType = req.query.employmentType;
    }

    const jobEntries = await Job.find(query);
    res.json(jobEntries);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/api/jobEntries/:id", async (req, res) => {
  try {
    const jobEntry = await Job.findById(req.params.id);
    if (jobEntry) {
      res.json(jobEntry);
    } else {
      res.status(404).send("Job not found");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while fetching the job details.");
  }
});

// Delete a job entry
app.delete("/api/jobEntries/:id", verifyToken, async (req, res) => {
  try {
    const jobEntry = await Job.findById(req.params.id);
    if (!jobEntry) {
      return res.status(404).send("Job not found");
    }

    if (jobEntry.postedBy.toString() !== req.user._id) {
      return res.status(401).send("Unauthorized");
    }

    await Job.findByIdAndDelete(req.params.id);
    res.send("Job entry deleted");
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while deleting the job entry.");
  }
});

// Updates a job entry
app.put("/api/jobEntries/:id", verifyToken, async (req, res) => {
  try {
    const jobUpdateData = {
      title: req.body.title,
      company: req.body.company,
      location: req.body.location,
      description: req.body.description,
      employmentType: req.body.employmentType,
      applyLink: req.body.applyLink,
    };

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      jobUpdateData,
      { new: true },
    );

    if (!updatedJob) {
      return res.status(404).send("Job not found");
    }

    res.json(updatedJob);
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred while updating the job entry.");
  }
});

app.get("/api/storyEntries", async (req, res) => {
  const hardcodedStories = [
    {
      name: "Alice Johnson",
      jobTitle: "Web Developer",
      location: "San Francisco, CA",
      story:
        "Alice found her dream job and has been making impactful contributions to her company's product.",
      postedDate: new Date(),
      imageUrl:
        "https://images.pexels.com/photos/762080/pexels-photo-762080.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    },
    {
      name: "Michael Smith",
      jobTitle: "Data Analyst",
      location: "New York, NY",
      story:
        "Michael's passion for data helped him secure a position where he now leads a team of analysts.",
      postedDate: new Date(),
      imageUrl:
        "https://images.pexels.com/photos/819530/pexels-photo-819530.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    },
    {
      name: "Anthony Bloom",
      jobTitle: "Graphic Designer",
      location: "Austin, TX",
      story:
        "Anthony's creativity caught the eye of an advertising agency. He now works internationally.",
      postedDate: new Date(),
      imageUrl:
        "https://images.pexels.com/photos/2102416/pexels-photo-2102416.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
    },
  ];

  res.json(hardcodedStories);
});

// const PORT = process.env.BACKEND_PORT || 4000;
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
